import { afterEach, expect, test } from 'bun:test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, linkSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { dirname, join } from 'node:path';
import { darwinTest } from './helpers/darwin-test';
import { tmpWorkspace } from './helpers/repo-fixture';
import {
  assertDocsHostPlatform, docsHostDeveloperDirectory, docsHostEnvironment, docsHostPolicy, prepareDocsHostScratch,
  proveDocsHostBoundary, writeDocsHostPolicy, type DocsHostAdmission,
} from '../src/effects/review/docs-host-isolation';
import { admitClientHello, startModelApiProxy, type ModelApiProxy } from '../src/effects/review/docs-host-proxy';

const roots: string[] = [];
const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function resolveNode(): string {
  const executable = Bun.which('node', { PATH: process.env.PATH ?? '' });
  if (!executable) throw new Error('docs host fixture requires Node on PATH');
  return realpathSync(executable);
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.email=fixture@example.invalid', '-c', 'user.name=fixture', ...args], { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

async function listen(reply: string): Promise<{ server: Server; port: number }> {
  // Drain the input: a tunnel forwards the ClientHello here, and unread bytes keep the socket from closing.
  const server = createServer(socket => { socket.resume(); socket.end(reply); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  return { server, port: (server.address() as { port: number }).port };
}

const MODEL_HOST = 'model-api.test';
const ESTABLISHED = 'HTTP/1.1 200 Connection Established\r\n\r\n';

function uint(size: number, value: number): Buffer {
  const out = Buffer.alloc(size); out.writeUIntBE(value, 0, size); return out;
}
const vector = (size: number, body: Buffer) => Buffer.concat([uint(size, body.length), body]);

/**
 * One TLS record that holds a ClientHello, with a server_name extension when
 * `serverName` is given and an opaque extension of each `extraTypes` entry.
 */
function clientHello(serverName?: string, { recordType = 22, handshakeType = 1, extraTypes = [] as number[] } = {}): Buffer {
  const extension = (type: number, data: Buffer) => Buffer.concat([uint(2, type), vector(2, data)]);
  const extensions = [extension(43, vector(1, Buffer.from([3, 4]))), ...extraTypes.map(type => extension(type, Buffer.alloc(8, 1)))];
  if (serverName !== undefined) extensions.unshift(extension(0, vector(2, Buffer.concat([uint(1, 0), vector(2, Buffer.from(serverName, 'latin1'))]))));
  const hello = Buffer.concat([Buffer.from([3, 3]), Buffer.alloc(32, 7), vector(1, Buffer.alloc(32, 9)), vector(2, Buffer.from([0x13, 0x01])), vector(1, Buffer.from([0])), vector(2, Buffer.concat(extensions))]);
  return Buffer.concat([uint(1, recordType), Buffer.from([3, 1]), vector(2, Buffer.concat([uint(1, handshakeType), vector(3, hello)]))]);
}

/** A proxy that admits only MODEL_HOST at `upstreamPort` and dials every admitted tunnel at local 127.0.0.1. */
async function startLocalProxy(upstreamPort: number): Promise<{ proxy: ModelApiProxy; dials: string[] }> {
  const dials: string[] = [];
  const proxy = await startModelApiProxy([{ host: MODEL_HOST, port: upstreamPort }], (port, host) => { dials.push(`${host}:${port}`); return connect(port, '127.0.0.1'); });
  closers.push(() => proxy.close());
  return { proxy, dials };
}

/** Sends a CONNECT and resolves once the proxy reply header arrives or the proxy closes the socket. */
async function openTunnel(proxyPort: number, target: string): Promise<{ socket: Socket; output: () => string; closed: Promise<void> }> {
  const socket = connect(proxyPort, '127.0.0.1'); let out = '';
  const closed = new Promise<void>(resolve => socket.on('close', () => resolve()));
  socket.on('error', () => {});
  const replied = new Promise<void>(resolve => socket.on('data', data => { out += data; if (out.includes('\r\n\r\n')) resolve(); }));
  socket.write(`CONNECT ${target} HTTP/1.1\r\n\r\n`);
  await Promise.race([replied, closed]);
  return { socket, output: () => out, closed };
}

/** Fake credential material only: a fixture HOME, never the operator's. */
function fakeAccessToken(): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture`;
}

interface Fixture {
  root: string; primary: string; worktree: string; control: string; home: string; remote: string;
  admission: DocsHostAdmission; proxy: ModelApiProxy; consolePort: number; echoPort: number;
}

async function seedFixture(): Promise<Fixture> {
  const root = tmpWorkspace('docs-host'); roots.push(root);
  const home = join(root, 'operator-home'), primary = join(root, 'primary'), worktree = join(root, 'wt'), control = join(root, 'control'), remote = join(root, 'remote.git');
  write(join(home, '.codex', 'auth.json'), JSON.stringify({ tokens: { access_token: fakeAccessToken() } }));
  write(join(home, '.config', 'gh', 'hosts.yml'), 'github.com:\n  oauth_token: fixture-gh-token\n');
  write(join(home, '.repo-harness', 'mcp.tokens.json'), '{"fixture":"mcp-token"}');
  write(join(home, '.ssh', 'id_ed25519'), 'fixture-ssh-key');
  write(join(home, '.netrc'), 'machine github.com password fixture');
  mkdirSync(primary);
  git(primary, 'init', '-q', '-b', 'main');
  write(join(primary, 'src', 'app.ts'), 'export const source = 1;\n');
  write(join(primary, 'AGENTS.md'), 'KEEP');
  write(join(primary, 'CLAUDE.md'), 'KEEP');
  write(join(primary, '.env'), 'FIXTURE_SECRET=1');
  write(join(primary, 'docs', 'guide.md'), '# Guide\n');
  write(join(primary, 'docs', 'architecture', 'index.md'), 'GENERATED');
  write(join(primary, 'docs', 'architecture', '.projection-manifest.json'), JSON.stringify({ targets: { 'projection_target.architecture.index': { path: 'docs/architecture/index.md', ownership: 'mixed' } } }));
  git(primary, 'add', '-A'); git(primary, 'commit', '-q', '-m', 'seed');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote]);
  git(primary, 'remote', 'add', 'origin', remote);
  git(primary, 'push', '-q', 'origin', 'main');
  git(primary, 'worktree', 'add', '-q', '-b', 'docs/fixture', worktree);
  mkdirSync(control, { mode: 0o700 });
  const { port: consolePort } = await listen('CONSOLE');
  const { port: echoPort } = await listen('MODEL-API');
  const { proxy } = await startLocalProxy(echoPort);
  const node = resolveNode();
  const admission: DocsHostAdmission = {
    runtime: 'codex', worktree, control, operatorHome: home, node, executable: node,
    developerDirectory: docsHostDeveloperDirectory(), proxyPort: proxy.port,
  };
  return { root, primary, worktree, control, home, remote, admission, proxy, consolePort, echoPort };
}

const WORKER = String.raw`
const fs=require('node:fs'),net=require('node:net'),cp=require('node:child_process'),os=require('node:os'),dns=require('node:dns');
const spec=JSON.parse(process.argv[2]);
const code=fn=>{try{fn();return 'ok'}catch(e){return e.code||String(e.message)}};
const writes=Object.fromEntries(spec.writes.map(p=>[p,code(()=>{fs.mkdirSync(require('node:path').dirname(p),{recursive:true});fs.writeFileSync(p,'CHANGED')})]));
const reads=Object.fromEntries(spec.reads.map(p=>[p,code(()=>fs.readFileSync(p))]));
const ops={
  renameGenerated:code(()=>fs.renameSync(spec.docs+'/architecture',spec.docs+'/moved')),
  hardlinkGenerated:code(()=>fs.linkSync(spec.docs+'/architecture/index.md',spec.docs+'/linked.md')),
  hardlinkSource:code(()=>fs.linkSync(spec.source,spec.docs+'/source-link.ts')),
  symlinkEscapeWrite:code(()=>{fs.symlinkSync(spec.source,spec.docs+'/escape.ts');fs.writeFileSync(spec.docs+'/escape.ts','CHANGED')}),
  tmpdir:code(()=>{const d=fs.mkdtempSync(os.tmpdir()+'/probe-');fs.writeFileSync(d+'/f','x');if(!d.startsWith(spec.tmp+'/'))throw new Error('tmp_outside_scratch')}),
  signalHost:code(()=>process.kill(spec.hostPid,0)),
};
const run=(file,args,opts={})=>{const r=cp.spawnSync(file,args,{encoding:'utf8',cwd:spec.worktree,...opts});return {status:r.status,error:r.error&&r.error.code,stdout:(r.stdout||'').slice(0,300),stderr:(r.stderr||'').slice(0,300)}};
fs.copyFileSync('/usr/bin/true',spec.tmp+'/copied-true');fs.chmodSync(spec.tmp+'/copied-true',0o755);
const exec={
  sh:run('/bin/sh',['-c','echo ok']),
  curl:run('/usr/bin/curl',['--version']),
  open:run('/usr/bin/open',['-h']),
  security:run('/usr/bin/security',['help']),
  nestedSandbox:run('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)','/usr/bin/true']),
  copiedBinary:run(spec.tmp+'/copied-true',[]),
  childWriteSource:run(process.execPath,['-e',"try{require('node:fs').writeFileSync(process.argv[1],'CHANGED');process.exit(1)}catch(e){process.exit(e.code==='EPERM'?0:2)}",spec.source]),
  childWriteDocs:run(process.execPath,['-e',"require('node:fs').writeFileSync(process.argv[1],'CHILD')",spec.docs+'/child.md']),
  gitStatus:run('git',['status','--short']),
  gitCredentialHelper:run('git',['config','--get-all','credential.helper']),
  gitPushOrigin:run('git',['push','origin','HEAD:refs/heads/docs/fixture']),
  gitPushHttps:run('git',['push','https://github.com/example/none.git','HEAD']),
};
const env={GH_TOKEN:process.env.GH_TOKEN??null,GITHUB_TOKEN:process.env.GITHUB_TOKEN??null,HOME:process.env.HOME,CODEX_HOME:process.env.CODEX_HOME};
const connectTo=(port,host)=>new Promise(r=>{const s=net.connect(port,host);s.on('connect',()=>{s.destroy();r('connected')});s.on('error',e=>r(e.code))});
const viaProxy=(request,hello='')=>new Promise(r=>{const s=net.connect(spec.proxyPort,'127.0.0.1');let out='';s.on('connect',()=>s.write(Buffer.concat([Buffer.from(request),Buffer.from(hello,'hex')])));s.on('data',d=>{out+=d});s.on('end',()=>r(out));s.on('error',e=>r(e.code));setTimeout(()=>{s.destroy();r(out)},3000)});
(async()=>{
  const network={
    consoleV4:await connectTo(spec.consolePort,'127.0.0.1'),
    consoleV6:await connectTo(spec.consolePort,'::1'),
    external:await connectTo(443,'1.1.1.1'),
    dns:await new Promise(r=>dns.lookup('example.com',e=>r(e?e.code:'resolved'))),
    proxyAllowed:await viaProxy('CONNECT '+spec.modelHost+':'+spec.echoPort+' HTTP/1.1\r\nHost: x\r\n\r\n',spec.clientHello),
    proxyConsole:await viaProxy('CONNECT 127.0.0.1:'+spec.consolePort+' HTTP/1.1\r\nHost: x\r\n\r\n'),
    proxyPlainHttp:await viaProxy('GET http://127.0.0.1:'+spec.echoPort+'/ HTTP/1.1\r\nHost: x\r\n\r\n'),
  };
  console.log(JSON.stringify({writes,reads,ops,exec,env,net:network}));
})();
`;

test('docs host refuses Linux and Windows with platform_unsupported', () => {
  for (const platform of ['linux', 'win32'] as const) {
    expect(() => assertDocsHostPlatform(platform)).toThrow('platform_unsupported');
    expect(() => docsHostPolicy({} as DocsHostAdmission, platform)).toThrow('platform_unsupported');
  }
});

test('docs host proxy opens a tunnel only to an allowed endpoint and never forwards plain HTTP', async () => {
  const { port: allowedPort } = await listen('MODEL-API');
  const { port: deniedPort } = await listen('CONSOLE');
  const { proxy } = await startLocalProxy(allowedPort);
  const ask = (request: string, hello: Buffer = Buffer.alloc(0)) => new Promise<string>(resolve => {
    const socket = connect(proxy.port, '127.0.0.1'); let out = '';
    socket.on('connect', () => socket.write(Buffer.concat([Buffer.from(request), hello]))); socket.on('data', data => { out += data; }); socket.on('end', () => resolve(out));
  });
  expect(await ask(`CONNECT ${MODEL_HOST}:${allowedPort} HTTP/1.1\r\n\r\n`, clientHello(MODEL_HOST))).toBe(`${ESTABLISHED}MODEL-API`);
  expect(await ask(`CONNECT ${MODEL_HOST}:${deniedPort} HTTP/1.1\r\n\r\n`)).toStartWith('HTTP/1.1 403 Forbidden');
  expect(await ask(`GET http://${MODEL_HOST}:${allowedPort}/ HTTP/1.1\r\n\r\n`)).toStartWith('HTTP/1.1 403 Forbidden');
  await expect(startModelApiProxy([])).rejects.toThrow('docs_host_proxy_endpoint_invalid');
});

// A Cloudflare edge address serves every site that the SNI names, so the proxy
// must pin the TLS server name to the CONNECT host before it dials.
test('docs host proxy closes a tunnel whose TLS server name differs from the CONNECT host and never dials upstream', async () => {
  const { port } = await listen('MODEL-API');
  const { proxy, dials } = await startLocalProxy(port);
  const hellos: Record<string, Buffer> = Object.fromEntries(['attacker.workers.dev', 'cloudflare-ech.com', `${MODEL_HOST}.`, `x.${MODEL_HOST}`].map(name => [name, clientHello(name)]));
  // ECH and ESNI carry the real site in an encrypted inner ClientHello, so a matching outer SNI proves nothing.
  hellos.ech = clientHello(MODEL_HOST, { extraTypes: [0xfe0d] });
  hellos.esni = clientHello(MODEL_HOST, { extraTypes: [0xffce] });
  for (const [name, hello] of Object.entries(hellos)) {
    const tunnel = await openTunnel(proxy.port, `${MODEL_HOST}:${port}`);
    expect(tunnel.output(), name).toBe(ESTABLISHED);
    tunnel.socket.write(hello);
    await tunnel.closed;
    expect(tunnel.output(), name).toBe(ESTABLISHED);
  }
  expect(dials).toEqual([]);
});

test('docs host proxy decides a ClientHello only after its last fragment arrives and keeps the buffered bytes exact', () => {
  class FakeSocket extends EventEmitter {
    destroyed = false;
    destroy() { this.destroyed = true; this.emit('close'); return this; }
  }
  const appData = Buffer.from('PING');
  // Each emit is one read: the first ends inside the record header, the second inside the record body.
  const deliver = (hello: Buffer) => {
    const client = new FakeSocket(), admitted: Buffer[] = [];
    admitClientHello(client as unknown as Socket, Buffer.alloc(0), MODEL_HOST, buffered => admitted.push(buffered));
    for (const fragment of [hello.subarray(0, 3), hello.subarray(3, 40)]) {
      client.emit('data', fragment);
      expect(admitted).toEqual([]);
      expect(client.destroyed).toBe(false);
    }
    client.emit('data', Buffer.concat([hello.subarray(40), appData]));
    return { client, admitted };
  };
  const hello = clientHello(MODEL_HOST);
  const matched = deliver(hello);
  expect(matched.admitted.length).toBe(1);
  expect(matched.admitted[0]!.equals(Buffer.concat([hello, appData]))).toBe(true);
  expect(matched.client.destroyed).toBe(false);
  expect(matched.client.listenerCount('data')).toBe(0);
  const mismatched = deliver(clientHello('attacker.workers.dev'));
  expect(mismatched.admitted).toEqual([]);
  expect(mismatched.client.destroyed).toBe(true);
});

test('docs host proxy forwards a split ClientHello byte for byte when the server name matches', async () => {
  const hello = clientHello('Model-API.Test'), appData = Buffer.from('PING');
  const received: Buffer[] = [];
  const upstream = createServer(socket => socket.on('data', (data: Buffer) => {
    received.push(data);
    if (Buffer.concat(received).length >= hello.length + appData.length) socket.end('PONG');
  }));
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise<void>(resolve => upstream.close(() => resolve())));
  const port = (upstream.address() as { port: number }).port;
  const { proxy, dials } = await startLocalProxy(port);
  const tunnel = await openTunnel(proxy.port, `${MODEL_HOST}:${port}`);
  // End-to-end forwarding only: the pauses make separate reads likely, not certain.
  // The admitClientHello test proves the partial-read path deterministically.
  tunnel.socket.write(hello.subarray(0, 3)); await Bun.sleep(30);
  tunnel.socket.write(hello.subarray(3, 40)); await Bun.sleep(30);
  expect(dials).toEqual([]);
  tunnel.socket.write(Buffer.concat([hello.subarray(40), appData]));
  await tunnel.closed;
  expect(dials).toEqual([`${MODEL_HOST}:${port}`]);
  expect(Buffer.concat(received).equals(Buffer.concat([hello, appData]))).toBe(true);
  expect(tunnel.output()).toBe(`${ESTABLISHED}PONG`);
});

test('docs host proxy closes a tunnel whose ClientHello has no server name', async () => {
  const { port } = await listen('MODEL-API');
  const { proxy, dials } = await startLocalProxy(port);
  const tunnel = await openTunnel(proxy.port, `${MODEL_HOST}:${port}`);
  tunnel.socket.write(clientHello());
  await tunnel.closed;
  expect(tunnel.output()).toBe(ESTABLISHED);
  expect(dials).toEqual([]);
});

test('docs host proxy closes a tunnel on an oversize, non-handshake, non-ClientHello or malformed first record', async () => {
  const { port } = await listen('MODEL-API');
  const { proxy, dials } = await startLocalProxy(port);
  const overrun = clientHello(MODEL_HOST); overrun.writeUIntBE(overrun.readUIntBE(6, 3) + 1, 6, 3);
  const records: Record<string, Buffer> = {
    oversize: Buffer.from([22, 3, 1, 0x40, 0x01]),
    applicationData: clientHello(MODEL_HOST, { recordType: 23 }),
    serverHello: clientHello(MODEL_HOST, { handshakeType: 2 }),
    handshakeLengthOverrun: overrun,
  };
  for (const [name, record] of Object.entries(records)) {
    const tunnel = await openTunnel(proxy.port, `${MODEL_HOST}:${port}`);
    tunnel.socket.write(record);
    await tunnel.closed;
    expect(tunnel.output(), name).toBe(ESTABLISHED);
  }
  expect(dials).toEqual([]);
});

// Zero-model proof: plain Node children inside the real profile. No OAR or vendor Session.
darwinTest('docs host boundary denies .git, source, generated and credential access, loopback and push, and allows docs/', async () => {
  const f = await seedFixture();
  const scratch = prepareDocsHostScratch(f.admission, 60_000);
  const previousToken = process.env.GH_TOKEN; process.env.GH_TOKEN = 'fixture-gh-token';
  let env: Record<string, string>;
  try { env = docsHostEnvironment(scratch, f.proxy.port); } finally { if (previousToken === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = previousToken; }
  const policyFile = writeDocsHostPolicy(f.admission);
  proveDocsHostBoundary(f.admission, policyFile, scratch);

  const docs = join(f.worktree, 'docs'), gitCommon = join(f.primary, '.git');
  const deniedWrites = [
    join(f.worktree, '.git'), join(gitCommon, 'config'), join(gitCommon, 'HEAD'), join(gitCommon, 'refs', 'heads', 'docs', 'fixture'),
    join(f.worktree, 'src', 'app.ts'), join(f.worktree, 'src', 'new.ts'), join(f.worktree, 'AGENTS.md'), join(f.worktree, 'CLAUDE.md'), join(f.worktree, '.env'),
    join(docs, 'architecture', 'index.md'), join(docs, 'architecture', '.projection-manifest.json'),
    join(docs, 'AGENTS.md'), join(docs, 'CLAUDE.md'), join(docs, 'settings.json'), join(docs, '.env.local'),
    join(docs, 'hooks', 'h.sh'), join(docs, 'skills', 's.md'), join(docs, 'commands', 'c.md'), join(docs, 'prompts', 'p.md'), join(docs, '.git', 'x'),
    policyFile, join(f.home, '.codex', 'auth.json'), join(scratch.codexHome, 'auth.json'), join(scratch.codexHome, 'config.toml'),
  ];
  const allowedWrites = [join(docs, 'guide.md'), join(docs, 'new', 'page.md'), join(scratch.home, '.cache', 'state')];
  const deniedReads = [
    join(f.home, '.codex', 'auth.json'), join(f.home, '.config', 'gh', 'hosts.yml'), join(f.home, '.repo-harness', 'mcp.tokens.json'),
    join(f.home, '.ssh', 'id_ed25519'), join(f.home, '.netrc'), join(f.worktree, '.env'),
  ];
  const allowedReads = [join(scratch.codexHome, 'auth.json'), join(f.worktree, 'src', 'app.ts'), join(docs, 'guide.md')];
  const worker = join(f.root, 'worker.cjs'); writeFileSync(worker, WORKER);
  const spec = {
    writes: [...deniedWrites, ...allowedWrites], reads: [...deniedReads, ...allowedReads], docs, worktree: f.worktree, tmp: scratch.tmp,
    source: join(f.worktree, 'src', 'app.ts'), hostPid: process.pid, consolePort: f.consolePort, echoPort: f.echoPort, proxyPort: f.proxy.port,
    modelHost: MODEL_HOST, clientHello: clientHello(MODEL_HOST).toString('hex'),
  };
  const child = spawn('/usr/bin/sandbox-exec', ['-f', policyFile, f.admission.node, worker, JSON.stringify(spec)], { cwd: f.worktree, env });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
  const status = await new Promise<number | null>(resolve => child.on('close', resolve));
  console.log(JSON.stringify({ diagnostic: 'docs host zero-model Seatbelt fixture', status, stdout, stderr }));
  expect(status, stderr).toBe(0);
  const observed = JSON.parse(stdout);

  for (const path of deniedWrites) expect(observed.writes[path], path).toBe('EPERM');
  for (const path of allowedWrites) expect(observed.writes[path], path).toBe('ok');
  for (const path of deniedReads) expect(observed.reads[path], path).toBe('EPERM');
  for (const path of allowedReads) expect(observed.reads[path], path).toBe('ok');
  expect(observed.ops).toEqual({ renameGenerated: 'EPERM', hardlinkGenerated: 'EPERM', hardlinkSource: 'EPERM', symlinkEscapeWrite: 'EPERM', tmpdir: 'ok', signalHost: 'EPERM' });

  expect(observed.exec.sh.status).toBe(0);
  for (const name of ['curl', 'open', 'security', 'nestedSandbox', 'copiedBinary']) expect(observed.exec[name].error, name).toBe('EPERM');
  expect(observed.exec.childWriteSource.status).toBe(0);
  expect(observed.exec.childWriteDocs.status).toBe(0);
  expect(observed.exec.gitStatus.status).toBe(0);
  expect(observed.exec.gitCredentialHelper.stdout.trim()).toBe('');
  // Push cannot start: the receive-pack and remote-https helpers are not allowed programs.
  expect(observed.exec.gitPushOrigin.status).not.toBe(0);
  expect(observed.exec.gitPushOrigin.stderr).toContain('git-receive-pack: Operation not permitted');
  expect(observed.exec.gitPushHttps.status).not.toBe(0);
  expect(observed.exec.gitPushHttps.stderr).toContain("remote helper 'https' aborted");
  expect(observed.env).toEqual({ GH_TOKEN: null, GITHUB_TOKEN: null, HOME: scratch.home, CODEX_HOME: scratch.codexHome });

  expect(observed.net.consoleV4).toBe('EPERM');
  expect(observed.net.consoleV6).toBe('EPERM');
  expect(observed.net.external).toBe('EPERM');
  expect(observed.net.dns).not.toBe('resolved');
  expect(observed.net.proxyAllowed).toBe('HTTP/1.1 200 Connection Established\r\n\r\nMODEL-API');
  expect(observed.net.proxyConsole).toStartWith('HTTP/1.1 403 Forbidden');
  expect(observed.net.proxyPlainHttp).toStartWith('HTTP/1.1 403 Forbidden');

  // Host-side read back: protected bytes and the remote are unchanged.
  for (const path of [join(f.worktree, 'src', 'app.ts'), join(docs, 'architecture', 'index.md'), join(f.worktree, 'AGENTS.md')]) expect(readFileSync(path, 'utf8')).not.toBe('CHANGED');
  expect(existsSync(join(f.worktree, 'src', 'new.ts'))).toBe(false);
  expect(execFileSync('git', ['--git-dir', f.remote, 'branch', '--list', 'docs/fixture'], { encoding: 'utf8' })).toBe('');
  expect(readFileSync(join(docs, 'guide.md'), 'utf8')).toBe('CHANGED');
  expect(readFileSync(join(docs, 'child.md'), 'utf8')).toBe('CHILD');
}, 60_000);

darwinTest('docs host admission fails closed before any profile exists', async () => {
  const f = await seedFixture();
  expect(() => docsHostPolicy({ ...f.admission, runtime: 'claude' as 'codex' })).toThrow('docs_host_runtime_unverified');
  expect(() => docsHostPolicy({ ...f.admission, worktree: f.primary })).toThrow('docs_host_linked_worktree_required');
  const nested = join(f.worktree, 'control'); mkdirSync(nested, { mode: 0o700 });
  expect(() => docsHostPolicy({ ...f.admission, control: nested })).toThrow('docs_host_control_overlaps_worktree');
  const policyFile = writeDocsHostPolicy(f.admission);
  writeFileSync(policyFile, '(version 1)\n(allow default)\n');
  expect(() => writeDocsHostPolicy(f.admission)).toThrow('docs_host_profile_changed');
  expect(() => proveDocsHostBoundary(f.admission, policyFile, prepareDocsHostScratch(f.admission, 60_000))).toThrow('docs_host_profile_changed');
  // Seatbelt checks the resolved path, so a symlink on a protected path would
  // route a write to an open docs/ file. Each alias is restored after its check.
  const docs = join(f.worktree, 'docs'), target = join(docs, 'architecture', 'index.md'), manifest = join(docs, 'architecture', '.projection-manifest.json');
  rmSync(target); symlinkSync('../guide.md', target);
  expect(() => docsHostPolicy(f.admission)).toThrow('docs_host_projection_symlink_unsupported');
  rmSync(target); writeFileSync(target, 'GENERATED');
  renameSync(join(docs, 'architecture'), join(docs, 'real-architecture')); symlinkSync('real-architecture', join(docs, 'architecture'));
  expect(() => docsHostPolicy(f.admission)).toThrow('docs_host_projection_symlink_unsupported');
  rmSync(join(docs, 'architecture')); renameSync(join(docs, 'real-architecture'), join(docs, 'architecture'));
  renameSync(manifest, join(docs, 'manifest-source.json')); symlinkSync('../manifest-source.json', manifest);
  expect(() => docsHostPolicy(f.admission)).toThrow('docs_host_projection_symlink_unsupported');
  rmSync(manifest); renameSync(join(docs, 'manifest-source.json'), manifest);
  expect(() => docsHostPolicy(f.admission)).not.toThrow();
  linkSync(join(f.worktree, 'src', 'app.ts'), join(f.worktree, 'docs', 'source-alias.ts'));
  expect(() => docsHostPolicy(f.admission)).toThrow('docs_host_docs_hardlink_unsupported');
}, 60_000);

darwinTest('docs host keeps the projection manifest path and its directories protected when no manifest exists', async () => {
  const f = await seedFixture();
  rmSync(join(f.worktree, 'docs', 'architecture', '.projection-manifest.json'));
  const policyFile = writeDocsHostPolicy(f.admission);
  const probe = `const fs=require('node:fs'),docs=process.argv[1];const code=fn=>{try{fn();return 'ok'}catch(e){return e.code}};
console.log(JSON.stringify({manifest:code(()=>fs.writeFileSync(docs+'/architecture/.projection-manifest.json','{}')),rename:code(()=>fs.renameSync(docs+'/architecture',docs+'/moved')),guide:code(()=>fs.writeFileSync(docs+'/guide.md','CHANGED'))}))`;
  const result = spawnSync('/usr/bin/sandbox-exec', ['-f', policyFile, f.admission.node, '-e', probe, join(f.worktree, 'docs')], { encoding: 'utf8', timeout: 15_000, env: { PATH: '/usr/bin:/bin' } });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ manifest: 'EPERM', rename: 'EPERM', guide: 'ok' });
  expect(existsSync(join(f.worktree, 'docs', 'architecture', '.projection-manifest.json'))).toBe(false);
}, 60_000);
