import { afterEach, expect, test } from 'bun:test';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer, type Server } from 'node:net';
import { dirname, join } from 'node:path';
import { darwinTest } from './helpers/darwin-test';
import { tmpWorkspace } from './helpers/repo-fixture';
import {
  assertDocsHostPlatform, docsHostDeveloperDirectory, docsHostEnvironment, docsHostPolicy, prepareDocsHostScratch,
  proveDocsHostBoundary, writeDocsHostPolicy, type DocsHostAdmission,
} from '../src/effects/review/docs-host-isolation';
import { startModelApiProxy, type ModelApiProxy } from '../src/effects/review/docs-host-proxy';

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
  const server = createServer(socket => socket.end(reply));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  return { server, port: (server.address() as { port: number }).port };
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
  const proxy = await startModelApiProxy([{ host: '127.0.0.1', port: echoPort }]);
  closers.push(() => proxy.close());
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
const viaProxy=(request)=>new Promise(r=>{const s=net.connect(spec.proxyPort,'127.0.0.1');let out='';s.on('connect',()=>s.write(request));s.on('data',d=>{out+=d});s.on('end',()=>r(out));s.on('error',e=>r(e.code));setTimeout(()=>{s.destroy();r(out)},3000)});
(async()=>{
  const network={
    consoleV4:await connectTo(spec.consolePort,'127.0.0.1'),
    consoleV6:await connectTo(spec.consolePort,'::1'),
    external:await connectTo(443,'1.1.1.1'),
    dns:await new Promise(r=>dns.lookup('example.com',e=>r(e?e.code:'resolved'))),
    proxyAllowed:await viaProxy('CONNECT 127.0.0.1:'+spec.echoPort+' HTTP/1.1\r\nHost: x\r\n\r\n'),
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
  const proxy = await startModelApiProxy([{ host: '127.0.0.1', port: allowedPort }]); closers.push(() => proxy.close());
  const ask = (request: string) => new Promise<string>(resolve => {
    const socket = connect(proxy.port, '127.0.0.1'); let out = '';
    socket.on('connect', () => socket.write(request)); socket.on('data', data => { out += data; }); socket.on('end', () => resolve(out));
  });
  expect(await ask(`CONNECT 127.0.0.1:${allowedPort} HTTP/1.1\r\n\r\n`)).toBe('HTTP/1.1 200 Connection Established\r\n\r\nMODEL-API');
  expect(await ask(`CONNECT 127.0.0.1:${deniedPort} HTTP/1.1\r\n\r\n`)).toStartWith('HTTP/1.1 403 Forbidden');
  expect(await ask(`GET http://127.0.0.1:${allowedPort}/ HTTP/1.1\r\n\r\n`)).toStartWith('HTTP/1.1 403 Forbidden');
  await expect(startModelApiProxy([])).rejects.toThrow('docs_host_proxy_endpoint_invalid');
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
  linkSync(join(f.worktree, 'src', 'app.ts'), join(f.worktree, 'docs', 'source-alias.ts'));
  expect(() => docsHostPolicy(f.admission)).toThrow('docs_host_docs_hardlink_unsupported');
}, 60_000);
