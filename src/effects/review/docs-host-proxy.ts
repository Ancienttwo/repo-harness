import { connect, createServer, type Server, type Socket } from 'node:net';

export interface ModelApiEndpoint {
  readonly host: string;
  readonly port: number;
}

export interface ModelApiProxy {
  readonly port: number;
  close(): Promise<void>;
}

/** Opens the upstream socket of an admitted tunnel. Tests pass one that reaches a local fake upstream. */
export type DialUpstream = (port: number, host: string) => Socket;

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_HEADER_BYTES = 8192;
const MAX_TLS_RECORD_BYTES = 16384 + 5;
const CLIENT_HELLO_TIMEOUT_MS = 5000;

function refuse(socket: Socket, status: string): void {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
}

function reader(buffer: Buffer) {
  let at = 0;
  const bytes = (size: number): Buffer => {
    if (at + size > buffer.length) throw new RangeError('tls_record_malformed');
    at += size;
    return buffer.subarray(at - size, at);
  };
  const uint = (size: 1 | 2 | 3) => bytes(size).readUIntBE(0, size);
  return { bytes, uint, vector: (size: 1 | 2 | 3) => bytes(uint(size)), done: () => at === buffer.length };
}

/**
 * The host_name of the one server_name extension in a ClientHello record, or
 * undefined for anything else: another record or message type, a missing,
 * repeated or multi-entry server_name, or any length that overruns its block.
 */
function clientHelloServerName(record: Buffer): string | undefined {
  try {
    const tls = reader(record);
    if (tls.uint(1) !== 22) return undefined;
    tls.bytes(2);
    const handshake = reader(tls.vector(2));
    if (!tls.done() || handshake.uint(1) !== 1) return undefined;
    const hello = reader(handshake.vector(3));
    if (!handshake.done()) return undefined;
    hello.bytes(2 + 32); hello.vector(1); hello.vector(2); hello.vector(1);
    const extensions = reader(hello.vector(2));
    if (!hello.done()) return undefined;
    let name: string | undefined;
    while (!extensions.done()) {
      const type = extensions.uint(2), data = reader(extensions.vector(2));
      // ECH (0xfe0d) and the obsolete ESNI (0xffce) hide the real site in an
      // encrypted inner ClientHello, so the outer SNI cannot pin the peer.
      if (type === 0xfe0d || type === 0xffce) return undefined;
      if (type !== 0) continue;
      if (name !== undefined) return undefined;
      const list = reader(data.vector(2));
      if (!data.done() || list.uint(1) !== 0) return undefined;
      name = list.vector(2).toString('latin1');
      if (!list.done()) return undefined;
    }
    return name;
  } catch {
    return undefined;
  }
}

/**
 * Buffers the first TLS record after the 200 reply and admits the tunnel only
 * when its SNI names the CONNECT host. A Cloudflare edge address serves every
 * site that the SNI names, so the CONNECT host alone does not pin the peer.
 * Bytes past the record stay buffered and reach the upstream after it.
 */
export function admitClientHello(client: Socket, initial: Buffer, host: string, admit: (buffered: Buffer) => void): void {
  let buffered = initial;
  const fail = () => { clearTimeout(timer); client.off('data', onData); client.destroy(); };
  const check = () => {
    if (buffered.length < 5) return;
    const size = 5 + buffered.readUInt16BE(3);
    if (size > MAX_TLS_RECORD_BYTES) { fail(); return; }
    if (buffered.length < size) return;
    if (clientHelloServerName(buffered.subarray(0, size))?.toLowerCase() !== host) { fail(); return; }
    clearTimeout(timer); client.off('data', onData);
    admit(buffered);
  };
  const onData = (chunk: Buffer) => { buffered = Buffer.concat([buffered, chunk]); check(); };
  const timer = setTimeout(fail, CLIENT_HELLO_TIMEOUT_MS);
  client.once('close', () => clearTimeout(timer));
  client.on('data', onData);
  check();
}

function tunnel(client: Socket, allowed: ReadonlySet<string>, dial: DialUpstream): void {
  if (!LOOPBACK.has(client.remoteAddress ?? '')) { client.destroy(); return; }
  let header = Buffer.alloc(0);
  const onData = (chunk: Buffer) => {
    header = Buffer.concat([header, chunk]);
    const end = header.indexOf('\r\n\r\n');
    if (end < 0) { if (header.length > MAX_HEADER_BYTES) refuse(client, '431 Request Header Fields Too Large'); return; }
    client.off('data', onData);
    const match = /^CONNECT ([A-Za-z0-9.-]+):(\d{1,5}) HTTP\/1\.[01]$/.exec(header.subarray(0, header.indexOf('\r\n')).toString('latin1'));
    const target = match ? `${match[1]!.toLowerCase()}:${Number(match[2])}` : '';
    if (!allowed.has(target)) { refuse(client, '403 Forbidden'); return; }
    const host = match![1]!.toLowerCase(), port = Number(match![2]);
    // The client sends its ClientHello only after this reply, so the upstream is opened later.
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    admitClientHello(client, header.subarray(end + 4), host, buffered => {
      const upstream = dial(port, host);
      upstream.on('error', () => client.destroy());
      client.on('close', () => upstream.destroy());
      upstream.write(buffered);
      client.pipe(upstream).pipe(client);
    });
  };
  client.on('data', onData);
  client.on('error', () => client.destroy());
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve((server.address() as { port: number }).port); });
  });
}

/**
 * Host-side CONNECT proxy. Seatbelt can allow only `localhost:<port>` or `*`,
 * never a host name, so the sandbox may reach this one port and the proxy
 * alone decides which model API host a tunnel may open. It never forwards
 * plain HTTP. It holds the port on both loopback families because Seatbelt
 * `localhost:<port>` matches every local address on that port.
 */
export async function startModelApiProxy(
  endpoints: readonly ModelApiEndpoint[],
  dial: DialUpstream = (port, host) => connect(port, host),
): Promise<ModelApiProxy> {
  const allowed = new Set(endpoints.map(endpoint => {
    if (!/^[a-z0-9.-]+$/.test(endpoint.host) || !Number.isSafeInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) throw new Error('docs_host_proxy_endpoint_invalid');
    return `${endpoint.host}:${endpoint.port}`;
  }));
  if (allowed.size === 0) throw new Error('docs_host_proxy_endpoint_invalid');
  const sockets = new Set<Socket>();
  const accept = (socket: Socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); tunnel(socket, allowed, dial); };
  const v4 = createServer(accept), v6 = createServer(accept);
  const close = async () => {
    const closed = [v4, v6].map(server => new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve()));
    for (const socket of sockets) socket.destroy();
    await Promise.all(closed);
  };
  try {
    const port = await listen(v4, 0, '127.0.0.1');
    await listen(v6, port, '::1');
    return { port, close };
  } catch {
    await close();
    throw new Error('docs_host_proxy_listen_failed');
  }
}
