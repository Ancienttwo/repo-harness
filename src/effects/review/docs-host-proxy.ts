import { connect, createServer, type Server, type Socket } from 'node:net';

export interface ModelApiEndpoint {
  readonly host: string;
  readonly port: number;
}

export interface ModelApiProxy {
  readonly port: number;
  close(): Promise<void>;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_HEADER_BYTES = 8192;

function refuse(socket: Socket, status: string): void {
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
}

function tunnel(client: Socket, allowed: ReadonlySet<string>): void {
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
    const upstream = connect(Number(match![2]), match![1]!.toLowerCase(), () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      const rest = header.subarray(end + 4);
      if (rest.length) upstream.write(rest);
      client.pipe(upstream).pipe(client);
    });
    upstream.on('error', () => { if (!client.destroyed) refuse(client, '502 Bad Gateway'); });
    client.on('close', () => upstream.destroy());
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
export async function startModelApiProxy(endpoints: readonly ModelApiEndpoint[]): Promise<ModelApiProxy> {
  const allowed = new Set(endpoints.map(endpoint => {
    if (!/^[a-z0-9.-]+$/.test(endpoint.host) || !Number.isSafeInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535) throw new Error('docs_host_proxy_endpoint_invalid');
    return `${endpoint.host}:${endpoint.port}`;
  }));
  if (allowed.size === 0) throw new Error('docs_host_proxy_endpoint_invalid');
  const sockets = new Set<Socket>();
  const accept = (socket: Socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); tunnel(socket, allowed); };
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
