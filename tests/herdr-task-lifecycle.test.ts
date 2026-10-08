import { expect, test } from 'bun:test';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { copyHelpers } from './helpers/helper-script-fixture';
import { herdrEnvironment } from '../src/effects/terminal/herdr';

// This file owns the feasibility boundary, not model judgment. Fixture peers
// expose explicit deterministic protocol/session IDs under recognizable names.
// No user HOME, default server, user agent or model endpoint is touched.
function requireFixtureSession(session: string) {
  if (!/^task-proof-[0-9a-f]{16}$/.test(session)) throw new Error('disposable_herdr_session_required');
}
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 10_000 });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args[0]}: ${result.error ?? result.stderr}`);
  return result.stdout.trim();
}
async function until(observe: () => boolean) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (observe()) return;
    await Bun.sleep(50);
  }
  throw new Error('fixture_observation_deadline');
}
async function exited(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('owned_server_exit_deadline')), 8_000); timer.unref(); }),
  ]);
}
function live(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

test('fixture control rejects default and non-disposable sessions before a CLI can run', () => {
  for (const session of ['default', '', 'review-owned', 'task-proof-invalid']) {
    expect(() => requireFixtureSession(session)).toThrow('disposable_herdr_session_required');
  }
  requireFixtureSession(`task-proof-${randomUUID().replaceAll("-", "").slice(0, 16)}`);
});

test('linked task peers survive owner exit, restore explicit context, and clean up without closing a sentinel', async () => {
  const fixture = realpathSync(mkdtempSync('/tmp/ht-'));
  const home = join(fixture, 'home');
  const repo = join(fixture, 'primary');
  const checkout = join(fixture, 'task-checkout');
  mkdirSync(home); mkdirSync(repo);
  const session = `task-proof-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const configPath = join(fixture, 'herdr.toml');
  requireFixtureSession(session);
  const env = { ...herdrEnvironment({ session, configPath }), HOME: home, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const herdr = Bun.which('herdr');
  if (!herdr) throw new Error('real_herdr_required_for_task_proof');
  writeFileSync(configPath, 'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n[session]\nresume_agents_on_restore = false\n');
  run('git', ['init', '-q', '-b', 'main'], repo, env);
  run('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--allow-empty', '-qm', 'fixture'], repo, env);
  run('git', ['worktree', 'add', '-qb', 'task-proof', checkout], repo, env);
  const execute = (args: string[]) => {
    requireFixtureSession(session); // Includes read, close and server stop.
    return run(herdr, ['--session', session, ...args], repo, env);
  };
  const call = (args: string[]) => {
    const response = JSON.parse(execute(args));
    if (response.error || !response.result) throw new Error('invalid_herdr_response');
    return response.result;
  };
  const peer = join(fixture, 'peer.ts');
  writeFileSync(peer, `
import {readFileSync, writeFileSync, renameSync} from 'fs';
import {randomUUID} from 'crypto';import {spawnSync} from 'child_process';
const role = process.argv[2]; const statePath = process.argv[3];
const state = { role, pid: process.pid, provider_session: randomUUID(), peer_history: '', requests: [] as {id:string,context:string}[] };
function save() { writeFileSync(statePath+'.tmp', JSON.stringify(state)); renameSync(statePath+'.tmp',statePath); }
process.stdin.setRawMode(true); process.stdout.write('\\x1b[?2004h'); save();
let input=''; process.stdin.on('data', chunk => {
  input += chunk.toString();
  if (!input.includes('\\r') && !input.includes('\\n')) return;
  const lines=input.split(/[\\r\\n]+/); input=lines.pop() ?? '';
  for (const line of lines) {
    const text=line.replaceAll('\\x1b[200~','').replaceAll('\\x1b[201~','');
    if (!text.trim()) continue;
    const request=JSON.parse(text);
    if(request.read_peer){
      const session=${JSON.stringify(session)};
      if(!/^task-proof-[0-9a-f]{16}$/.test(session))throw new Error('fixture only');
      const r=spawnSync(${JSON.stringify(herdr)},['--session',session,'agent','read',request.read_peer,'--source','recent-unwrapped','--lines','100','--format','text'],{env:process.env,encoding:'utf8'});
      if(r.status!==0)throw new Error(r.stderr);state.peer_history=r.stdout;save();continue;
    }
    state.requests.push(request); save();
    process.stdout.write('ACK '+request.id+' '+state.provider_session+'\\n');
  }
});
`);
  for (const kind of ['codex', 'claude']) symlinkSync(process.execPath, join(fixture, kind));
  const serverLog = join(fixture, 'server.log');
  const server = spawn(herdr, ['--session', session, 'server'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; server.stderr?.on('data', chunk => { stderr += chunk; writeFileSync(serverLog, stderr); });
  try {
    let startupError = '';
    try { await until(() => { try { call(['workspace', 'list']); return true; } catch (error) { startupError = String(error); return false; } }); }
    catch (error) { throw new Error(`${error}; server exit=${server.exitCode}; stderr=${stderr}; cli=${startupError}`); }
    const root = call(['workspace', 'create', '--cwd', repo, '--label', 'primary', '--no-focus']);
    const opened = call(['worktree', 'open', '--workspace', root.workspace.workspace_id, '--path', checkout, '--label', 'task', '--no-focus']);
    // APIs may nest the root pane with the opened workspace; discover opaque
    // IDs through authoritative workspace list + pane list, never sidebar order.
    const workspaces = call(['workspace', 'list']).workspaces as any[];
    const linked = workspaces.find(workspace => workspace.worktree?.checkout_path === checkout);
    const primary = workspaces.find(workspace => workspace.worktree?.checkout_path === repo);
    expect(linked?.worktree?.is_linked_worktree).toBe(true);
    expect(primary?.worktree?.is_linked_worktree).toBe(false);
    expect(linked.worktree.repo_key).toBe(primary.worktree.repo_key);
    expect(linked.worktree.repo_root).toBe(realpathSync(repo));
    expect(opened).toBeDefined();
    const taskPane = call(['pane', 'list', '--workspace', linked.workspace_id]).panes[0].pane_id;
    const gatePane = call(['pane', 'split', '--pane', taskPane, '--direction', 'right', '--cwd', checkout, '--no-focus']).pane.pane_id;
    const sentinelState = join(fixture, 'sentinel.json');
    const participants = [
      { role: 'advisor', kind: 'codex', pane: taskPane, state: join(fixture, 'advisor.json') },
      { role: 'gatekeeper', kind: 'claude', pane: gatePane, state: join(fixture, 'gatekeeper.json') },
      { role: 'sentinel', kind: 'codex', pane: root.root_pane.pane_id, state: sentinelState },
    ];
    for (const [index, participant] of participants.entries()) {
      execute(['pane', 'run', participant.pane, `exec ${quote(join(fixture, participant.kind))} ${quote(peer)} ${quote(participant.role)} ${quote(participant.state)}`]);
      await until(() => existsSync(participant.state));
      await until(() => { try { return call(['agent', 'get', participant.pane]).agent?.agent === participant.kind; } catch { return false; } });
      execute(['pane', 'report-agent', participant.pane, '--source', 'fixture', '--agent', participant.kind, '--state', 'working', '--seq', String(index + 1)]);
      execute(['agent', 'rename', participant.pane, participant.role]);
    }
    const initial = participants.map(item => JSON.parse(readFileSync(item.state, 'utf8')));
    const binding = join(fixture, 'binding.json');
    writeFileSync(binding, JSON.stringify({ session, herdr, configPath, participants: participants.slice(0, 2), task: 'fixture-task', repo_key: primary.worktree.repo_key }));
    const owner = join(fixture, 'owner.ts');
    writeFileSync(owner, `
import {readFileSync} from 'fs'; import {spawnSync} from 'child_process';
const binding=JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (!/^task-proof-[0-9a-f]{16}$/.test(binding.session)) throw new Error('disposable_herdr_session_required');
for (const participant of binding.participants) {
 const result=spawnSync(binding.herdr,['--session',binding.session,'agent','prompt',participant.role,JSON.stringify({id:process.argv[3],context:process.argv[4]})], {env:process.env,encoding:'utf8',timeout:10000});
 if (result.status!==0) throw new Error(result.stderr);
 const response=JSON.parse(result.stdout); if (response.result?.type!=='agent_prompted') throw new Error('prompt_not_accepted');
}
`);
    run(process.execPath, [owner, binding, 'req-1', 'open finding: scope'], repo, env);
    for (const participant of participants.slice(0, 2)) await until(() => JSON.parse(readFileSync(participant.state, 'utf8')).requests.length === 1);
    // A different owner process resumes the existing binding; it cannot spawn
    // a new peer. Provider/session identity and preceding context must survive.
    run(process.execPath, [owner, binding, 'req-2', 'resolve finding: scope'], repo, env);
    for (const participant of participants.slice(0, 2)) await until(() => JSON.parse(readFileSync(participant.state, 'utf8')).requests.length === 2);
    // The advisor process itself reads the gatekeeper history via Herdr.
    execute(['agent', 'prompt', 'advisor', JSON.stringify({read_peer:'gatekeeper'})]);
    await until(() => JSON.parse(readFileSync(participants[0].state, 'utf8')).peer_history.includes('ACK req-2'));
    expect(JSON.parse(readFileSync(participants[0].state,'utf8')).peer_history).toContain(initial[1].provider_session);
    for (const [index, participant] of participants.slice(0, 2).entries()) {
      await until(() => JSON.parse(readFileSync(participant.state, 'utf8')).requests.length === 2);
      const state = JSON.parse(readFileSync(participant.state, 'utf8'));
      expect(state.pid).toBe(initial[index].pid);
      expect(state.provider_session).toBe(initial[index].provider_session);
      expect(state.requests).toEqual([{ id: 'req-1', context: 'open finding: scope' }, { id: 'req-2', context: 'resolve finding: scope' }]);
      execute(['pane', 'close', participant.pane]);
      await until(() => !live(state.pid));
    }
    const remaining = call(['workspace', 'list']).workspaces as any[];
    if (remaining.some(workspace => workspace.workspace_id === linked.workspace_id)) execute(['workspace', 'close', linked.workspace_id]);
    expect(live(initial[2].pid)).toBe(true);
    expect(call(['agent', 'get', 'sentinel']).agent.pane_id).toBe(root.root_pane.pane_id);
    expect((call(['pane', 'list', '--workspace', root.workspace.workspace_id]).panes as any[]).map(item => item.pane_id)).toContain(root.root_pane.pane_id);
    run('git', ['worktree', 'remove', checkout], repo, env);
    expect(existsSync(checkout)).toBe(false);
  } finally {
    requireFixtureSession(session);
    try { execute(['server', 'stop']); } catch {
      // This ChildProcess is the exact process created above in this fixture,
      // not a discovered PID or any user server.
      if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
    }
    await exited(server);
    rmSync(fixture, { recursive: true, force: true });
  }
}, 60_000);

test('shared task sessions serialize real concurrent starts, reconcile a launched crash, and fence file delivery and cleanup', async () => {
  const fixture = realpathSync(mkdtempSync('/tmp/ta-'));
  const home = join(fixture, 'h'); mkdirSync(home);
  const session = `task-proof-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const configPath = join(fixture, 'herdr.toml');
  const endpoint = { session, configPath, home };
  const env = herdrEnvironment(endpoint);
  const herdr = Bun.which('herdr')!;
  run('git', ['init', '-q', '-b', 'main'], fixture, env);
  const modulePath = new URL('../src/effects/terminal/task-session.ts', import.meta.url).pathname;
  const api = await import('../src/effects/terminal/task-session');
  writeFileSync(configPath, 'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n[session]\nresume_agents_on_restore = false\n');
  const execute = (args: string[]) => {
    requireFixtureSession(session); return run(herdr, ['--session', session, ...args], fixture, env);
  };
  const call = (args: string[]) => JSON.parse(execute(args)).result;
  const server = spawn(herdr, ['--session', session, 'server'], { env, stdio: 'ignore' });
  const owners: ChildProcess[] = [];
  try {
    await until(() => { try { call(['workspace', 'list']); return true; } catch { return false; } });
    const root = call(['workspace', 'create', '--cwd', fixture, '--no-focus']);
    const parent = root.root_pane.pane_id;
    symlinkSync(process.execPath, join(fixture, 'codex'));
    const peer = join(fixture, 'peer.ts');
    writeFileSync(peer, `
import {readFileSync,writeFileSync} from 'fs'; import {join} from 'path'; import {spawn} from 'child_process';
import {writeSessionArtifact} from ${JSON.stringify(modulePath)};
process.stdin.setRawMode(true); process.stdout.write('\\x1b[?2004h');
if(process.argv[2].includes('stubborn'))process.on('SIGTERM',()=>writeFileSync(process.argv[2]+'.term','observed'));
writeFileSync(process.argv[2],JSON.stringify({pid:process.pid}));
let buffer=''; process.stdin.on('data',chunk=>{
 buffer+=chunk.toString(); if (!/[\\r\\n]/.test(buffer)) return;
 const lines=buffer.split(/[\\r\\n]+/); buffer=lines.pop() ?? '';
 for(const line of lines){
  const text=line.replaceAll('\\x1b[200~','').replaceAll('\\x1b[201~','');
  const match=/^Read task request (.+); write its result only to (.+)\\.$/.exec(text);
  if(!match)continue;
  const request=JSON.parse(readFileSync(match[1],'utf8'));
  const content=readFileSync(request.context_ref,'utf8');
  if(content==='hold-result'||content==='via-cli'){process.stdout.write('PASS is not a result artifact\\n');continue;}
  if(content==='spawn-group-child'){
   // Same process group as this leader; the child ignores TERM and terminal hangup.
   spawn(process.execPath,['-e',"const fs=require('fs');process.on('SIGTERM',()=>{});process.on('SIGHUP',()=>{});fs.writeFileSync(process.argv[1]+'.tmp',String(process.pid));fs.renameSync(process.argv[1]+'.tmp',process.argv[1]);setInterval(()=>{},1000)",process.argv[2]+'.child'],{stdio:'ignore'});
   continue;
  }
  writeSessionArtifact(request.result_ref,{request_id:request.request_id,context_sha256:request.context_sha256,value:'artifact-result'});
  process.stdout.write('PASS misleading terminal text is not the result artifact\\n');
 }
});
`);
    const driver = join(fixture, 'owner.ts');
    writeFileSync(driver, `
import {existsSync,writeFileSync,appendFileSync,readFileSync} from 'fs'; import {spawnSync} from 'child_process'; import {join} from 'path';
import {startTaskAgent} from ${JSON.stringify(modulePath)};
const spec=JSON.parse(readFileSync(process.argv[2],'utf8')); const mode=process.argv[3];
if(!/^task-proof-[0-9a-f]{16}$/.test(spec.endpoint.session)) throw new Error('fixture_session_required');
const cli=(args)=>{const result=spawnSync(${JSON.stringify(herdr)},['--session',spec.endpoint.session,...args],{env:process.env,encoding:'utf8',timeout:10000});if(result.status!==0)throw new Error(result.stderr);return result.stdout;};
const ready=join(process.cwd(),spec.role+'.ready');
const quote=s=>"'"+s.replaceAll("'", "'\\\\''")+"'";
const binding=await startTaskAgent(process.argv[4] ?? process.cwd(),spec,{
 contended:()=>writeFileSync('contended','observed'),
 boundary:async phase=>{
  if(mode==='hold'&&phase==='intent'){writeFileSync('barrier','intent durable');while(!existsSync('release'))await Bun.sleep(10);}
  if(mode==='crash'&&phase==='launched')process.exit(77);
  if(mode==='intent-crash'&&phase==='intent')process.exit(78);
  if(mode==='split-crash'&&phase==='split')process.exit(80);
  if(mode==='pane-crash'&&phase==='pane')process.exit(81);
 },
 start:async(endpoint,name,pane,kind,args)=>{
  appendFileSync('launches',spec.role+'\\n');
  cli(['pane','run',pane,quote(${JSON.stringify(join(fixture, 'codex'))})+' '+quote(${JSON.stringify(peer)})+' '+quote(ready)]);
  const end=Date.now()+5000;while(!existsSync(ready)){if(Date.now()>end)throw new Error('peer_deadline');await Bun.sleep(10);}
  cli(['pane','report-agent',pane,'--source','fixture','--agent',kind,'--state','working','--seq','1']);
  cli(['agent','rename',pane,name]);
  if(mode==='ambiguous')process.exit(79);
 }
});
writeFileSync(spec.role+'-'+mode+'.binding',JSON.stringify(binding));
`);
    const spec = { task: 'owned-task', role: 'advisor', harness_kind: 'codex', endpoint, parent_pane: parent, args: [], max_requests: 1 };
    const specPath = join(fixture, 'spec.json'); writeFileSync(specPath, JSON.stringify(spec));
    const owner = (mode: string, path = specPath, executionRoot = fixture) => {
      const child = spawn(process.execPath, [driver, path, mode, executionRoot], { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] });
      owners.push(child);
      let errors = ''; child.stderr?.on('data', data => { errors += data; });
      return { child, errors: () => errors };
    };
    const first = owner('hold');
    await until(() => existsSync(join(fixture, 'barrier')));
    const second = owner('second');
    await until(() => existsSync(join(fixture, 'contended')));
    expect(existsSync(join(fixture, 'launches'))).toBe(false);
    writeFileSync(join(fixture, 'release'), 'go');
    await exited(first.child); await exited(second.child);
    if (first.child.exitCode !== 0 || second.child.exitCode !== 0) throw new Error(first.errors() + second.errors());
    const firstBinding = JSON.parse(readFileSync(join(fixture, 'advisor-hold.binding'), 'utf8'));
    const secondBinding = JSON.parse(readFileSync(join(fixture, 'advisor-second.binding'), 'utf8'));
    expect(secondBinding).toEqual(firstBinding);
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\n');
    const binding = api.readTaskAgent(fixture, spec.task, spec.role).binding;
    expect(binding.capabilities.read_only.status).toBe('unverified');
    api.assertTaskBinding(binding);
    const reordered = { max_requests: spec.max_requests, args: spec.args, parent_pane: spec.parent_pane,
      endpoint: { home, configPath, session }, harness_kind: spec.harness_kind, role: spec.role, task: spec.task };
    expect(await api.startTaskAgent(fixture, reordered)).toEqual(binding);
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\n');

    const { dir } = api.readTaskAgent(fixture, spec.task, spec.role);
    writeFileSync(join(fixture, 'context.md'), 'owned context');
    const request = await api.sendTaskRequest(fixture, spec.task, spec.role, 'context.md');
    await until(() => existsSync(request.result_ref));
    expect(api.readTaskRequestResult(fixture, dir, request)?.value).toBe('artifact-result');
    const result = api.readSessionArtifact<Record<string, unknown>>(request.result_ref);
    api.writeSessionArtifact(request.result_ref, { ...result, request_id: 'another-request' }, false);
    expect(() => api.readTaskRequestResult(fixture, dir, request)).toThrow('result_identity_mismatch');
    api.writeSessionArtifact(request.result_ref, result, false);
    writeFileSync(join(fixture, 'context.md'), 'changed context');
    await expect(api.sendTaskRequest(fixture, spec.task, spec.role, 'context.md')).rejects.toThrow('round_budget_exhausted');
    const bindingPath = join(dir, 'binding.json');
    for (const attached of [
      { ...binding, ownership: { disposition: 'attached' } },
      { ...binding, provider: { ...binding.provider, ownership: { disposition: 'attached' } } },
    ]) {
      api.writeSessionArtifact(bindingPath, attached, false);
      await expect(api.closeTaskAgent(fixture, spec.task, spec.role)).rejects.toThrow('attached_object_not_closeable');
      expect(live(binding.provider.pid)).toBe(true);
    }
    api.writeSessionArtifact(bindingPath, { ...binding, provider: { ...binding.provider, identity: binding.provider.identity + ' replaced' } }, false);
    await expect(api.closeTaskAgent(fixture, spec.task, spec.role)).rejects.toThrow('process_identity_lost');
    expect(live(binding.provider.pid)).toBe(true);
    api.writeSessionArtifact(bindingPath, { ...binding, terminal_id: 'reused-pane-id' }, false);
    await expect(api.closeTaskAgent(fixture, spec.task, spec.role)).rejects.toThrow('pane_identity_lost');
    api.writeSessionArtifact(bindingPath, binding, false);
    execute(['agent', 'rename', binding.agent_name, 'replacement']);
    await expect(api.closeTaskAgent(fixture, spec.task, spec.role)).rejects.toThrow();
    expect(live(binding.provider.pid)).toBe(true);
    execute(['agent', 'rename', 'replacement', binding.agent_name]);

    const crashSpec = { ...spec, role: 'crash-role' };
    const crashPath = join(fixture, 'crash-spec.json'); writeFileSync(crashPath, JSON.stringify(crashSpec));
    const crashed = owner('crash', crashPath); await exited(crashed.child);
    expect(crashed.child.exitCode).toBe(77);
    const crashDir = api.taskSessionDirectory(fixture, crashSpec.task, crashSpec.role);
    expect(existsSync(join(crashDir, 'binding.json'))).toBe(false);
    const providerPid = JSON.parse(readFileSync(join(fixture, 'crash-role.ready'), 'utf8')).pid;
    const resumed = owner('resume', crashPath); await exited(resumed.child);
    if (resumed.child.exitCode !== 0) throw new Error(resumed.errors());
    expect(api.readTaskAgent(fixture, crashSpec.task, crashSpec.role).binding.provider.pid).toBe(providerPid);
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\ncrash-role\n');
    writeFileSync(join(fixture, 'context.md'), 'hold-result');
    const pendingRequest = await api.sendTaskRequest(fixture, crashSpec.task, crashSpec.role, 'context.md');
    expect(api.readTaskRequestResult(fixture, crashDir, pendingRequest)).toBeNull();
    expect(api.taskAgentStatus(fixture, crashSpec.task, crashSpec.role).status).toBe('pending');
    writeFileSync(join(fixture, 'context.md'), 'a replacement context must not replay');
    await expect(api.sendTaskRequest(fixture, crashSpec.task, crashSpec.role, 'context.md')).rejects.toThrow('ambiguous_round');
    expect(existsSync(join(crashDir, 'request-2.json'))).toBe(false);
    await expect(api.closeTaskAgent(fixture, crashSpec.task, crashSpec.role)).rejects.toThrow('pending_request');
    await api.cancelTaskAgent(fixture, crashSpec.task, crashSpec.role);
    await api.closeTaskAgent(fixture, spec.task, spec.role);
    expect(live(binding.provider.pid)).toBe(false);
    expect(call(['pane', 'get', parent]).pane.pane_id).toBe(parent);

    // One Git clone owns one task state, regardless of which checkout invokes.
    run('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--allow-empty', '-qm', 'base'], fixture, env);
    // Installed repos ignore runtime evidence; apply the same Git boundary to this minimal fixture.
    writeFileSync(join(fixture,'.git/info/exclude'), '.ai/harness/runs/\n');
    const checkout = join(fixture, 'linked-checkout');
    run('git', ['worktree', 'add', '-qb', 'codex/linked-test', checkout], fixture, env);
    const linkedSpec = { ...spec, role: 'linked-role', max_requests: 3 };
    const linkedPath = join(fixture, 'linked-spec.json'); writeFileSync(linkedPath, JSON.stringify(linkedSpec));
    const shim = join(fixture, 'shim'); mkdirSync(shim);
    const failed = join(fixture, 'open-failed');
    writeFileSync(join(shim, 'herdr'), `#!/bin/sh\ncase "$*" in *"worktree open"*linked-checkout*) if [ ! -f ${quote(failed)} ]; then touch ${quote(failed)}; echo injected-register-failure >&2; exit 1; fi ;; esac\nexec ${quote(herdr)} "$@"\n`);
    chmodSync(join(shim, 'herdr'), 0o755);
    const savedPath = process.env.PATH;
    try {
      process.env.PATH = shim + ':' + savedPath;
      await expect(api.startTaskAgent(checkout, linkedSpec)).rejects.toThrow('injected-register-failure');
      expect(existsSync(join(api.taskSessionDirectory(checkout, spec.task, linkedSpec.role), 'intent.json'))).toBe(false);
    } finally { process.env.PATH = savedPath; }
    const linkedOwner = owner('linked', linkedPath, checkout); await exited(linkedOwner.child);
    if (linkedOwner.child.exitCode !== 0) throw new Error(linkedOwner.errors());
    const fromPrimary = api.readTaskAgent(fixture, spec.task, linkedSpec.role);
    const fromLinked = api.readTaskAgent(checkout, spec.task, linkedSpec.role);
    expect(fromLinked.dir).toBe(fromPrimary.dir);
    expect(fromLinked.binding).toEqual(fromPrimary.binding);
    expect(fromPrimary.binding.execution_root).toBe(checkout);
    expect(fromPrimary.binding.workspace_id).not.toBe(root.workspace.workspace_id);
    const spaces = call(['workspace', 'list']).workspaces;
    const linkedSpace = spaces.find((item: any) => item.workspace_id === fromPrimary.binding.workspace_id);
    const primarySpace = spaces.find((item: any) => item.workspace_id === root.workspace.workspace_id);
    expect(linkedSpace.worktree.repo_key).toBe(primarySpace.worktree.repo_key);
    expect(linkedSpace.worktree.repo_root).toBe(fixture);
    writeFileSync(join(fixture, 'context.md'), 'via-cli');
    const linkedRequest = await api.sendTaskRequest(fixture, spec.task, linkedSpec.role, 'context.md');
    expect(linkedRequest.protocol).toBe(2);
    expect(linkedRequest.result_ref.startsWith(checkout + '/')).toBe(true);
    expect(readFileSync(linkedRequest.context_ref, 'utf8')).toBe('via-cli');
    writeFileSync(linkedRequest.result_ref, '{"request_id":');
    expect(api.readTaskRequestResult(fixture, fromPrimary.dir, linkedRequest)).toBeNull();
    const resultValue = {request_id:linkedRequest.request_id,context_sha256:linkedRequest.context_sha256,value:'artifact-result'};
    await expect(api.submitTaskResult(fixture,spec.task,linkedSpec.role,1,resultValue)).rejects.toThrow('submission_checkout_mismatch');
    writeFileSync(join(checkout,'result-input.json'),JSON.stringify(resultValue));
    const cliPath = new URL('../src/cli/index.ts', import.meta.url).pathname;
    // CLI submission has no write permission to canonical role state or its lock parent.
    chmodSync(fromPrimary.dir,0o500);chmodSync(dirname(fromPrimary.dir),0o500);
    try {
      const submit = spawnSync(process.execPath,[cliPath,'task-agent','result','--repo',checkout,'--task',spec.task,'--role',linkedSpec.role,'--round','1','--input','result-input.json'],{cwd:checkout,env,encoding:'utf8',timeout:10000});
      if(submit.status!==0)throw new Error(submit.stderr+submit.stdout);
    } finally { chmodSync(dirname(fromPrimary.dir),0o700);chmodSync(fromPrimary.dir,0o700); }
    expect(existsSync(join(fromPrimary.dir,'result-1.json'))).toBe(false);
    expect(existsSync(join(fromPrimary.dir,'collected-1.json'))).toBe(false);
    const collected=spawnSync(process.execPath,[cliPath,'task-agent','collect','--repo',fixture,'--task',spec.task,'--role',linkedSpec.role,'--round','1'],{cwd:fixture,env,encoding:'utf8',timeout:10000});
    if(collected.status!==0)throw new Error(collected.stderr+collected.stdout);
    expect(api.readSessionArtifact<typeof resultValue>(join(fromPrimary.dir,'collected-1.json'))).toEqual(resultValue);
    expect(await api.submitTaskResult(checkout,spec.task,linkedSpec.role,1,resultValue)).toEqual(resultValue);
    await expect(api.submitTaskResult(checkout,spec.task,linkedSpec.role,1,{...resultValue,value:'conflict'})).rejects.toThrow('result_conflict');
    rmSync(join(checkout,'result-input.json'));
    expect(api.readTaskRequestResult(checkout, fromLinked.dir, linkedRequest)?.value).toBe('artifact-result');
    await expect(api.sendTaskRequest(fixture,spec.task,linkedSpec.role,'context.md','changed_only')).rejects.toThrow('duplicate_subject');
    const repeated=await api.sendTaskRequest(fixture,spec.task,linkedSpec.role,'context.md');
    await api.submitTaskResult(checkout,spec.task,linkedSpec.role,repeated.round,{request_id:repeated.request_id,context_sha256:repeated.context_sha256,value:'artifact-result'});
    writeFileSync(join(fixture, 'context.md'), 'hold-result');
    await api.sendTaskRequest(fixture, spec.task, linkedSpec.role, 'context.md');
    copyHelpers(fixture);
    const helper = join(fixture, 'scripts/contract-worktree.sh');
    const helperEnv = { ...env, REPO_HARNESS_TARGET_REPO_ROOT: fixture };
    const blocked = spawnSync('bash', [helper, 'cleanup', '--slug', 'linked-test'], { cwd: fixture, env: helperEnv, encoding: 'utf8', timeout: 15000 });
    expect(blocked.status).toBe(1);
    expect(existsSync(checkout)).toBe(true);
    expect(live(fromPrimary.binding.provider.pid)).toBe(true);
    await api.cancelTaskAgent(checkout, spec.task, linkedSpec.role);
    const cleaned = spawnSync('bash', [helper, 'cleanup', '--slug', 'linked-test'], { cwd: fixture, env: helperEnv, encoding: 'utf8', timeout: 15000 });
    if (cleaned.status !== 0) throw new Error(cleaned.stderr + cleaned.stdout);
    expect(existsSync(checkout)).toBe(false);
    expect(call(['workspace', 'list']).workspaces.some((item: any) => item.workspace_id === fromPrimary.binding.workspace_id)).toBe(false);
    expect(call(['pane', 'get', parent]).pane.pane_id).toBe(parent);

    const attachedCheckout = join(fixture, 'attached-checkout');
    run('git', ['worktree', 'add', '-qb', 'codex/attached', attachedCheckout], fixture, env);
    const attachedView = call(['worktree', 'open', '--workspace', root.workspace.workspace_id, '--path', attachedCheckout, '--no-focus']);
    const attachedSpec = { ...spec, role: 'attached-view' };
    const attachedPath = join(fixture, 'attached-view.json'); writeFileSync(attachedPath, JSON.stringify(attachedSpec));
    const attachedOwner = owner('normal', attachedPath, attachedCheckout); await exited(attachedOwner.child);
    if (attachedOwner.child.exitCode !== 0) throw new Error(attachedOwner.errors());
    await api.closeTaskAgent(fixture, spec.task, attachedSpec.role);
    expect(await api.cleanupTaskWorktree(fixture, attachedCheckout)).toEqual({ status: 'cleanup_pending', pids: [], reason: 'workspace_attached' });
    const mcp = await import('../src/cli/mcp/coding-workspaces');
    const mcpEnv = {...env,REPO_HARNESS_HOME:join(home,'mcp-registry')};mkdirSync(mcpEnv.REPO_HARNESS_HOME);
    const mcpState = mcp.codingWorkspaceStatePath(mcpEnv);
    writeFileSync(mcpState,JSON.stringify({version:1,workspaces:[{id:'attached',repoId:'fixture',displayName:'attached',root:attachedCheckout,sourceRoot:fixture,mode:'worktree',branch:'codex/attached',baseRef:'main',baseSha:run('git',['rev-parse','HEAD'],fixture,env),integrationTargetRef:'refs/heads/main',dirtySource:false,openedAt:new Date().toISOString(),managed:true}]}));
    await expect(Promise.resolve().then(()=>mcp.cleanupManagedCodingWorkspace('attached',mcpEnv))).rejects.toThrow('runtime cleanup incomplete');
    expect(existsSync(attachedCheckout)).toBe(true);
    expect(mcp.listManagedCodingWorkspaces(mcpEnv)).toHaveLength(1);

    expect(call(['workspace', 'get', attachedView.workspace.workspace_id]).workspace.workspace_id).toBe(attachedView.workspace.workspace_id);
    // Test owns this simulated user workspace; production never closes attached.
    execute(['workspace', 'close', attachedView.workspace.workspace_id]);
    run('git', ['worktree', 'remove', attachedCheckout], fixture, env);

    const pendingSpec = { ...spec, role: 'intent-only' };
    const pendingPath = join(fixture, 'pending.json'); writeFileSync(pendingPath, JSON.stringify(pendingSpec));
    const pendingOwner = owner('intent-crash', pendingPath); await exited(pendingOwner.child);
    expect(pendingOwner.child.exitCode).toBe(78);
    await expect(api.startTaskAgent(fixture, pendingSpec)).rejects.toThrow('start_reconciliation_required');
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\ncrash-role\nlinked-role\nattached-view\n');
    expect(await api.closeTaskAgent(fixture, pendingSpec.task, pendingSpec.role)).toEqual({ status: 'closed', pids: [] });
    expect(api.taskAgentStatus(fixture, pendingSpec.task, pendingSpec.role).status).toBe('closed');
    expect(call(['pane', 'list', '--workspace', root.workspace.workspace_id]).panes).toHaveLength(1);
    const ambiguousSpec = { ...spec, role: 'ambiguous-role' };
    const ambiguousPath = join(fixture, 'ambiguous.json'); writeFileSync(ambiguousPath, JSON.stringify(ambiguousSpec));
    const ambiguousOwner = owner('ambiguous', ambiguousPath); await exited(ambiguousOwner.child);
    expect(ambiguousOwner.child.exitCode).toBe(79);
    await expect(api.startTaskAgent(fixture, ambiguousSpec)).rejects.toThrow('start_reconciliation_required');
    expect(api.taskAgentStatus(fixture, spec.task, ambiguousSpec.role).status).toBe('reconciliation_required');
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\ncrash-role\nlinked-role\nattached-view\nambiguous-role\n');
    const unboundPid = JSON.parse(readFileSync(join(fixture, 'ambiguous-role.ready'), 'utf8')).pid;
    expect(await api.closeTaskAgent(fixture, ambiguousSpec.task, ambiguousSpec.role)).toEqual({ status: 'closed', pids: [] });
    expect(live(unboundPid)).toBe(false);
    expect(api.taskAgentStatus(fixture, spec.task, ambiguousSpec.role).status).toBe('closed');
    expect(call(['pane', 'list', '--workspace', root.workspace.workspace_id]).panes).toHaveLength(1);
    const stubbornSpec = { ...spec, role: 'stubborn' };
    const stubbornPath = join(fixture, 'stubborn.json'); writeFileSync(stubbornPath, JSON.stringify(stubbornSpec));
    const stubbornOwner = owner('normal', stubbornPath); await exited(stubbornOwner.child);
    if (stubbornOwner.child.exitCode !== 0) throw new Error(stubbornOwner.errors());
    const stubbornBinding = api.readTaskAgent(fixture, spec.task, stubbornSpec.role).binding;
    expect(await api.closeTaskAgent(fixture, spec.task, stubbornSpec.role)).toEqual({ status: 'closed', pids: [] });
    expect(existsSync(join(fixture, 'stubborn.ready.term'))).toBe(true);
    expect(live(stubbornBinding.provider.pid)).toBe(false); // Ignored TERM; identity-proven KILL finished.
    // The leader exits on TERM; its same-group child ignores TERM and HUP.
    // Cleanup sends no group KILL after leader exit; the Herdr pane close removes the child.
    const groupedSpec = { ...spec, role: 'grouped' };
    const groupedPath = join(fixture, 'grouped.json'); writeFileSync(groupedPath, JSON.stringify(groupedSpec));
    const groupedOwner = owner('normal', groupedPath); await exited(groupedOwner.child);
    if (groupedOwner.child.exitCode !== 0) throw new Error(groupedOwner.errors());
    const leaderPid = JSON.parse(readFileSync(join(fixture, 'grouped.ready'), 'utf8')).pid;
    writeFileSync(join(fixture, 'context.md'), 'spawn-group-child');
    await api.sendTaskRequest(fixture, spec.task, groupedSpec.role, 'context.md');
    const groupedChild = join(fixture, 'grouped.ready.child');
    await until(() => existsSync(groupedChild));
    const childPid = Number(readFileSync(groupedChild, 'utf8'));
    expect(run('ps', ['-p', String(childPid), '-o', 'pgid='], fixture, env)).toBe(String(leaderPid));
    expect(await api.cancelTaskAgent(fixture, spec.task, groupedSpec.role)).toEqual({ status: 'closed', pids: [] });
    expect(live(leaderPid)).toBe(false);
    expect(live(childPid)).toBe(false);

    const splitSpec = { ...spec, role: 'split-gap' };
    const splitPath = join(fixture, 'split-gap.json'); writeFileSync(splitPath, JSON.stringify(splitSpec));
    const splitOwner = owner('split-crash', splitPath); await exited(splitOwner.child);
    expect(splitOwner.child.exitCode).toBe(80);
    expect(await api.cancelTaskAgent(fixture, spec.task, splitSpec.role)).toEqual({ status: 'cleanup_pending', pids: [], reason: 'split_outcome_unrecorded' });
    expect(existsSync(join(api.taskSessionDirectory(fixture,spec.task,splitSpec.role),'closed.json'))).toBe(false);
    // Fixture owns every pane; production deliberately cannot guess this one.
    const gapPane = call(['pane', 'list', '--workspace', root.workspace.workspace_id]).panes.find((item: any) => item.pane_id !== parent);
    execute(['pane','close',gapPane.pane_id]);

    const lostSpec = { ...spec, role: 'pane-gone' };
    const lostPath = join(fixture, 'pane-gone.json'); writeFileSync(lostPath, JSON.stringify(lostSpec));
    const lostOwner = owner('ambiguous', lostPath); await exited(lostOwner.child);
    expect(lostOwner.child.exitCode).toBe(79);
    const lostDir = api.taskSessionDirectory(fixture,spec.task,lostSpec.role);
    const lostPane = api.readSessionArtifact<{pane_id:string}>(join(lostDir,'pane-created.json'));
    execute(['pane','close',lostPane.pane_id]);
    expect(await api.cancelTaskAgent(fixture,spec.task,lostSpec.role)).toEqual({ status:'cleanup_pending',pids:[],reason:'pane_absent_pid_unobserved' });
    expect(existsSync(join(lostDir,'closed.json'))).toBe(false);

    // A recovered receipt may still list a PID after its pane disappeared.
    // That observation does not authorize a signal to an unidentified process.
    const survivor = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { cwd: fixture, env, detached: true, stdio: 'ignore' });
    try {
      const lingeringSpec = { ...spec, role: 'cleanup-pending' };
      const lingeringPath = join(fixture, 'lingering.json'); writeFileSync(lingeringPath, JSON.stringify(lingeringSpec));
      const ownerWithNoReceipt = owner('ambiguous', lingeringPath); await exited(ownerWithNoReceipt.child);
      expect(ownerWithNoReceipt.child.exitCode).toBe(79);
      const lingeringDir = api.taskSessionDirectory(fixture, spec.task, lingeringSpec.role);
      const intent = api.readSessionArtifact<{ intent_id: string }>(join(lingeringDir, 'intent.json'));
      const pane = api.readSessionArtifact<{ pane_id: string; terminal_id: string }>(join(lingeringDir, 'pane-created.json'));
      const actualPid = JSON.parse(readFileSync(join(fixture, 'cleanup-pending.ready'), 'utf8')).pid;
      api.writeSessionArtifact(join(lingeringDir, 'unbound-cleanup.json'), { intent_id: intent.intent_id, ...pane, pids: [actualPid, survivor.pid] });
      expect(await api.closeTaskAgent(fixture, spec.task, lingeringSpec.role)).toEqual({ status: 'cleanup_pending', pids: [survivor.pid!] });
      expect(live(survivor.pid!)).toBe(true);
      expect(api.taskAgentStatus(fixture, spec.task, lingeringSpec.role).status).toBe('cleanup_pending');
      expect(live(actualPid)).toBe(false);
      expect(existsSync(join(lingeringDir, 'closed.json'))).toBe(false);
      expect(call(['pane', 'list', '--workspace', root.workspace.workspace_id]).panes).toHaveLength(1);
      survivor.kill('SIGKILL'); await exited(survivor);
      expect(await api.closeTaskAgent(fixture, spec.task, lingeringSpec.role)).toEqual({ status: 'closed', pids: [] });
    } finally { if (survivor.exitCode === null && survivor.signalCode === null) survivor.kill('SIGKILL'); await exited(survivor); }

  } finally {
    requireFixtureSession(session);
    // All server/pane/provider resources in this private HOME belong to this
    // fixture. No name lookup or signal is issued against the user server.
    try { execute(['server', 'stop']); } catch { if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM'); }
    await exited(server);
    for (const owner of owners) {
      if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGTERM');
      await exited(owner);
    }
    // A failed group cleanup must not leave the TERM/HUP-resistant child on the host.
    const groupedChild = join(fixture, 'grouped.ready.child');
    if (existsSync(groupedChild)) { try { process.kill(Number(readFileSync(groupedChild, 'utf8')), 'SIGKILL'); } catch { /* Already absent. */ } }
    rmSync(fixture, { recursive: true, force: true });
  }
}, 60_000);

test('production agent-start waits beyond ten seconds and treats a readiness timeout as an unbound ambiguous launch', async () => {
  const fixture = realpathSync(mkdtempSync('/tmp/as-'));
  const home = join(fixture, 'h'); const bin = join(fixture, 'bin'); mkdirSync(home); mkdirSync(bin);
  const session = `task-proof-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const configPath = join(fixture, 'herdr.toml'); const endpoint = { session, configPath, home };
  const env = { ...herdrEnvironment(endpoint), PATH: `${bin}:${process.env.PATH}`, ENV: '', BASH_ENV: '' };
  const herdr = Bun.which('herdr')!;
  const api = await import('../src/effects/terminal/task-session');
  run('git', ['init', '-q', '-b', 'main'], fixture, env);
  // Herdr's server builds the canonical command from kind and resolves it in
  // this private shell PATH. There is no real Codex/model invocation.
  const fake = join(bin, 'codex');
  writeFileSync(fake, `#!${process.execPath}\nimport {writeFileSync} from 'fs';\nimport {join} from 'path';\nprocess.stdin.setRawMode(true); process.stdout.write('\\x1b[?2004h');\nwriteFileSync(join(${JSON.stringify(fixture)},'ready-'+process.env.HERDR_PANE_ID+'.json'),JSON.stringify({pid:process.pid,pane:process.env.HERDR_PANE_ID,argv:process.argv}));\nprocess.stdin.on('data',()=>{});\n`);
  chmodSync(fake, 0o700);
  writeFileSync(configPath, 'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n[session]\nresume_agents_on_restore = false\n');
  const execute = (args: string[]) => { requireFixtureSession(session); return run(herdr, ['--session', session, ...args], fixture, env); };
  const call = (args: string[]) => JSON.parse(execute(args)).result;
  const server = spawn(herdr, ['--session', session, 'server'], { env, stdio: 'ignore' });
  const controllers: ChildProcess[] = [];
  try {
    await until(() => { try { call(['workspace', 'list']); return true; } catch { return false; } });
    const root = call(['workspace', 'create', '--cwd', fixture, '--no-focus']); const parent = root.root_pane.pane_id;
    const spec = { task: 'production-start-fixture', role: 'cold', harness_kind: 'codex', endpoint, parent_pane: parent, args: [], max_requests: 1 };
    const reporter = join(fixture, 'reporter.ts');
    writeFileSync(reporter, `import {existsSync,readFileSync,writeFileSync} from 'fs';import {join} from 'path';import {spawnSync} from 'child_process';\nconst dir=process.argv[2];const delay=Number(process.argv[3]);\nconst end=Date.now()+20000;while(!existsSync(join(dir,'pane-created.json'))){if(Date.now()>end)throw new Error('pane deadline');await Bun.sleep(10); }\nconst pane=JSON.parse(readFileSync(join(dir,'pane-created.json'),'utf8')).pane_id;\nconst ready=join(${JSON.stringify(fixture)},'ready-'+pane+'.json');while(!existsSync(ready)){if(Date.now()>end)throw new Error('ready deadline');await Bun.sleep(10); }\nconst report=(state,seq)=>{const r=spawnSync(${JSON.stringify(herdr)},['--session',${JSON.stringify(session)},'pane','report-agent',pane,'--source','fixture','--agent','codex','--state',state,'--seq',String(seq)],{env:process.env,encoding:'utf8',timeout:10000});if(r.status!==0)throw new Error(r.stderr);};\nreport('working',1);writeFileSync(join(dir,'fixture-working'),'observed');\nif(delay>=0){const at=Date.now()+delay;while(Date.now()<at)await Bun.sleep(20);report('idle',2);writeFileSync(join(dir,'fixture-idle'),'observed');}\n`);
    const report = (role: string, delay: number) => {
      const dir = api.taskSessionDirectory(fixture, spec.task, role);
      const child = spawn(process.execPath, [reporter, dir, String(delay)], { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] });
      controllers.push(child); let errors = ''; child.stderr?.on('data', data => { errors += data; });
      return { child, errors: () => errors };
    };
    const cold = report('cold', 11_000);
    const began = Date.now();
    // No effects.start injection: runs the production herdr agent start branch.
    const binding = await api.startTaskAgent(fixture, spec);
    expect(Date.now() - began).toBeGreaterThan(10_000);
    await exited(cold.child); if (cold.child.exitCode !== 0) throw new Error(cold.errors());
    expect(binding.provider.pid).toBe(JSON.parse(readFileSync(join(fixture, 'ready-'+binding.pane_id+'.json'), 'utf8')).pid);
    expect(binding.capabilities.read_only.status).toBe('unverified');
    expect(await api.closeTaskAgent(fixture, spec.task, spec.role)).toEqual({ status: 'closed', pids: [] });
    expect(live(binding.provider.pid)).toBe(false);

    const timeoutSpec = { ...spec, role: 'timeout' }; const timeoutReporter = report('timeout', -1);
    const timeoutBegan = Date.now();
    await expect(api.startTaskAgent(fixture, timeoutSpec, { startTimeoutMs: 4000 })).rejects.toThrow('ambiguous_launch');
    expect(Date.now() - timeoutBegan).toBeLessThan(8500); // CLI deadline, not its +5s spawn kill margin.
    await exited(timeoutReporter.child); if (timeoutReporter.child.exitCode !== 0) throw new Error(timeoutReporter.errors());
    const dir = api.taskSessionDirectory(fixture, spec.task, timeoutSpec.role);
    const pane = api.readSessionArtifact<{ pane_id: string }>(join(dir, 'pane-created.json'));
    const pid = JSON.parse(readFileSync(join(fixture, 'ready-'+pane.pane_id+'.json'), 'utf8')).pid;
    expect(existsSync(join(dir, 'binding.json'))).toBe(false);
    expect(existsSync(join(dir, 'launch-unknown.json'))).toBe(true);
    expect(live(pid)).toBe(true);
    await expect(api.startTaskAgent(fixture, timeoutSpec)).rejects.toThrow('start_reconciliation_required');
    expect(await api.closeTaskAgent(fixture, spec.task, timeoutSpec.role)).toEqual({ status: 'closed', pids: [] });
    expect(live(pid)).toBe(false);
    expect(call(['pane', 'list', '--workspace', root.workspace.workspace_id]).panes).toHaveLength(1);
  } finally {
    requireFixtureSession(session);
    try { execute(['server', 'stop']); } catch { if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM'); }
    await exited(server);
    for (const child of controllers) { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await exited(child); }
    rmSync(fixture, { recursive: true, force: true });
  }
}, 60_000);


test('workspace registration recovers vanished, closed and failed-open incarnations through the Bash consumer', async () => {
  const fixture = realpathSync(mkdtempSync('/tmp/tr-'));
  const home = join(fixture, 'h'); mkdirSync(home);
  const session = `task-proof-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  requireFixtureSession(session);
  const configPath = join(fixture, 'herdr.toml');
  writeFileSync(configPath, 'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n[session]\nresume_agents_on_restore = false\n');
  const endpoint = {session, home, configPath}; const env = herdrEnvironment(endpoint);
  const herdr = Bun.which('herdr')!;
  const call = (args: string[]) => { requireFixtureSession(session); return JSON.parse(run(herdr, ['--session',session,...args],fixture,env)).result; };
  const api = await import('../src/effects/terminal/task-session');
  const server = spawn(herdr,['--session',session,'server'],{env,stdio:'ignore'});
  const savedPath = process.env.PATH;
  try {
    run('git',['init','-q','-b','main'],fixture,env);
    run('git',['-c','user.name=fixture','-c','user.email=fixture@localhost','commit','--allow-empty','-qm','base'],fixture,env);
    await until(()=>{try{call(['workspace','list']);return true;}catch{return false;}});
    const root=call(['workspace','create','--cwd',fixture,'--no-focus']); const parent=root.root_pane.pane_id;
    const baseline=call(['workspace','list']).workspaces.length;
    const checkout=join(fixture,'recover'); run('git',['worktree','add','-qb','codex/recover',checkout],fixture,env);
    await expect(api.registerTaskWorktree(checkout,endpoint,'w99:p99')).rejects.toThrow();
    expect(await api.cleanupTaskWorktree(fixture,checkout)).toEqual({status:'not_registered',pids:[]});
    const first=await api.registerTaskWorktree(checkout,endpoint,parent);
    expect((await api.registerTaskWorktree(checkout,endpoint,parent)).workspace_id).toBe(first.workspace_id);
    call(['workspace','close',first.workspace_id]);
    const restored=await api.registerTaskWorktree(checkout,endpoint,parent);
    expect(restored.workspace_id).not.toBe(first.workspace_id);
    expect((await api.cleanupTaskWorktree(fixture,checkout)).status).toBe('closed');
    const reopened=await api.registerTaskWorktree(checkout,endpoint,parent);
    expect(reopened.ownership.disposition).toBe('created');
    expect((await api.cleanupTaskWorktree(fixture,checkout)).status).toBe('closed');
    expect(call(['workspace','list']).workspaces.length).toBe(baseline);
    const shim=join(fixture,'shim');mkdirSync(shim);
    const marker=join(fixture,'fail-next');
    writeFileSync(join(shim,'herdr'),`#!/bin/sh\ncase "$*" in *"worktree open"*) if [ -f ${quote(marker)} ]; then rm ${quote(marker)}; echo injected-register-failure >&2; exit 1; fi ;; esac\nexec ${quote(herdr)} "$@"\n`);chmodSync(join(shim,'herdr'),0o755);
    process.env.PATH=shim+':'+savedPath;
    writeFileSync(marker,'fail');
    await expect(api.registerTaskWorktree(checkout,endpoint,parent)).rejects.toThrow('injected-register-failure');
    expect((await api.cleanupTaskWorktree(fixture,checkout)).status).toBe('closed');
    writeFileSync(marker,'fail');
    await expect(api.registerTaskWorktree(checkout,endpoint,parent)).rejects.toThrow('injected-register-failure');
    expect((await api.registerTaskWorktree(checkout,endpoint,parent)).ownership.disposition).toBe('created');
    await api.cleanupTaskWorktree(fixture,checkout);
    // An ambiguous open that actually created a view is attached on readback.
    writeFileSync(marker,'fail');
    await expect(api.registerTaskWorktree(checkout,endpoint,parent)).rejects.toThrow('injected-register-failure');
    const unknown=call(['worktree','open','--workspace',root.workspace.workspace_id,'--path',checkout,'--no-focus']);
    expect((await api.registerTaskWorktree(checkout,endpoint,parent)).ownership.disposition).toBe('attached');
    expect(await api.cleanupTaskWorktree(fixture,checkout)).toEqual({status:'cleanup_pending',pids:[],reason:'workspace_attached'});
    call(['workspace','close',unknown.workspace.workspace_id]);
    await api.cleanupTaskWorktree(fixture,checkout);
    expect(call(['workspace','list']).workspaces.length).toBe(baseline);
    const history=join(fixture,'.ai/harness/runs/task-workspaces');
    expect(readdirSync(history).some(key=>existsSync(join(history,key,'history')))).toBe(true);
    copyHelpers(fixture); mkdirSync(join(fixture,'plans'));
    const plan=join(fixture,'plans/plan-20260930-0000-recover-bash.md');
    writeFileSync(plan,'# Recover fixture\n> **Status**: Approved\n');
    const endpointFile=join(fixture,'endpoint.json');writeFileSync(endpointFile,JSON.stringify({endpoint,parent_pane:parent}));
    const target=join(fixture,'bash-checkout');
    const helperEnv={...env,PATH:shim+':'+env.PATH,REPO_HARNESS_TARGET_REPO_ROOT:fixture};
    const args=[join(fixture,'scripts/contract-worktree.sh'),'start','--plan',plan,'--path',target,'--no-plan-to-todo','--herdr-endpoint',endpointFile];
    writeFileSync(marker,'fail');
    const failed=spawnSync('bash',args,{cwd:fixture,env:helperEnv,encoding:'utf8',timeout:15000});
    expect(failed.status).toBe(1);expect(existsSync(target)).toBe(true);
    const retried=spawnSync('bash',args,{cwd:fixture,env:helperEnv,encoding:'utf8',timeout:20000});
    if(retried.status!==0)throw new Error(retried.stderr+retried.stdout);
    const space=call(['workspace','list']).workspaces.find((item:any)=>item.worktree?.checkout_path===target);
    expect(space.worktree.repo_key).toBe(realpathSync(join(fixture,'.git')));
    expect(existsSync(join(target,'.ai/harness/worktrees/recover-bash.json'))).toBe(true);
    expect((await api.cleanupTaskWorktree(fixture,target)).status).toBe('closed');
    expect(call(['workspace','list']).workspaces.length).toBe(baseline);
    expect(call(['pane','list','--workspace',root.workspace.workspace_id]).panes).toHaveLength(1);
    const mcp = await import('../src/cli/mcp/coding-workspaces');
    const mcpCheckout=join(fixture,'mcp-checkout');run('git',['worktree','add','-qb','codex/mcp-proof',mcpCheckout],fixture,env);
    const mcpBinding=await api.registerTaskWorktree(mcpCheckout,endpoint,parent);
    const mcpEnv={...env,REPO_HARNESS_HOME:join(home,'mcp-registry')};mkdirSync(mcpEnv.REPO_HARNESS_HOME);
    writeFileSync(mcp.codingWorkspaceStatePath(mcpEnv),JSON.stringify({version:1,workspaces:[{id:'created',repoId:'fixture',displayName:'created',root:mcpCheckout,sourceRoot:fixture,mode:'worktree',branch:'codex/mcp-proof',baseRef:'main',baseSha:run('git',['rev-parse','HEAD'],fixture,env),integrationTargetRef:'refs/heads/main',dirtySource:false,openedAt:new Date().toISOString(),managed:true}]}));
    expect(await mcp.cleanupManagedCodingWorkspace('created',mcpEnv)).toMatchObject({workspace_id:'created',removed:true});
    expect(existsSync(mcpCheckout)).toBe(false);
    expect(call(['workspace','list']).workspaces.some((item:any)=>item.workspace_id===mcpBinding.workspace_id)).toBe(false);
    expect(call(['workspace','list']).workspaces.length).toBe(baseline);
    expect(mcp.listManagedCodingWorkspaces(mcpEnv)).toHaveLength(0);

  } finally {
    process.env.PATH=savedPath;
    try { requireFixtureSession(session);run(herdr,['--session',session,'server','stop'],fixture,env); } catch { server.kill('SIGTERM'); }
    await exited(server);rmSync(fixture,{recursive:true,force:true});
  }
},60000);

test('MCP goals use visible persistent Herdr peers, redact history and clean success and timeout panes', async () => {
  const fixture = realpathSync(mkdtempSync('/tmp/mg-'));
  const home = join(fixture, 'h'), bin = join(fixture, 'bin'); mkdirSync(home); mkdirSync(bin);
  const session = `task-proof-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const configPath = join(fixture, 'herdr.toml'), endpoint = { session, configPath, home };
  requireFixtureSession(session);
  const env = { ...herdrEnvironment(endpoint), PATH: `${bin}:${process.env.PATH}`, ENV: '', BASH_ENV: '' };
  const herdr = Bun.which('herdr')!;
  writeFileSync(configPath, 'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n[session]\nresume_agents_on_restore = false\n');
  run('git', ['init', '-q', '-b', 'main'], fixture, env);
  run('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--allow-empty', '-qm', 'fixture'], fixture, env);
  mkdirSync(join(fixture, '.ai/harness/handoff'), {recursive:true});
  const goalPath = join(fixture, '.ai/harness/handoff/task-goal.md');
  const missedWorking = join(fixture, 'missed-working-observation');
  // Both kinds resolve only to this deterministic persistent TTY process.
  for (const kind of ['codex', 'claude']) {
    const fake = join(bin, kind);
    writeFileSync(fake, `#!${process.execPath}
import {existsSync,readFileSync,writeFileSync,renameSync} from 'fs';import {spawnSync} from 'child_process';
const session=${JSON.stringify(session)};if(!/^task-proof-[0-9a-f]{16}$/.test(session))throw new Error('fixture only');
const pane=process.env.HERDR_PANE_ID;let seq=0;
const report=state=>{const r=spawnSync(${JSON.stringify(herdr)},['--session',session,'pane','report-agent',pane,'--source','fixture','--agent',${JSON.stringify(kind)},'--state',state,'--seq',String(++seq)],{env:process.env,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);};
process.stdin.setRawMode(true);process.stdout.write('\\x1b[?2004h');
writeFileSync(${JSON.stringify(join(fixture, kind + '.pid'))},String(process.pid));
setTimeout(()=>report('idle'),100);let input='';
process.stdin.on('data',chunk=>{input+=chunk.toString();if(!/[\\r\\n]/.test(input))return;
 const lines=input.split(/[\\r\\n]+/);input=lines.pop()??'';
 for(const line of lines){const text=line.replaceAll('\\x1b[200~','').replaceAll('\\x1b[201~','');if(!text.trim())continue;
 const ref=/^Read task request (.*); write its result only to /.exec(text)?.[1];if(!ref)throw new Error('unexpected prompt');
 const request=JSON.parse(readFileSync(ref,'utf8'));const context=readFileSync(request.context_ref,'utf8');
 const ack=${JSON.stringify(join(fixture,'working-observation'))};
 const missed=${JSON.stringify(missedWorking)};
 const executeGoal=()=>{if(context.includes('Finish fixture goal'))writeFileSync(ack+'.armed',JSON.stringify({request_id:request.request_id,pid:process.pid,pane}));report('working');
 process.stdout.write('GOAL VISIBLE '+${JSON.stringify(kind)}+' Authorization: Bearer fixture-secret-token\\n');
 const finish=()=>{if(context.includes('WRITE_RESULT')){writeFileSync(request.result_ref+'.tmp',JSON.stringify({request_id:request.request_id,context_sha256:request.context_sha256,value:'fixture result'}));renameSync(request.result_ref+'.tmp',request.result_ref);}process.stdout.write('GOAL COMPLETE\\n');report('idle');};
 if(context.includes('MISSED_WORKING')){finish();writeFileSync(missed+'.complete','complete');}
 else if(context.includes('Finish fixture goal')){const timer=setInterval(()=>{if(existsSync(ack)){const observed=JSON.parse(readFileSync(ack,'utf8'));if(observed.request_id===request.request_id&&observed.pid===process.pid){clearInterval(timer);finish();}}},10);}
 else if(!context.includes('WAIT_FOREVER'))setTimeout(finish,200);};
 if(context.includes('STARTUP_WORKING')){setTimeout(()=>report('idle'),500);setTimeout(executeGoal,1500);}
 else if(context.includes('EARLY_IDLE')){report('unknown');report('idle');if(!context.includes('IDLE_ONLY'))setTimeout(executeGoal,1000);}
 else if(context.includes('Finish fixture goal')){const timer=setInterval(()=>{if(existsSync(ack+'.baseline')){clearInterval(timer);executeGoal();}},10);}
 else if(context.includes('MISSED_WORKING')){const timer=setInterval(()=>{if(existsSync(missed+'.baseline')){clearInterval(timer);executeGoal();}},10);}
 else if(context.includes('WAIT_FOREVER'))executeGoal();
 else setTimeout(executeGoal,500);
 }});
`);
    chmodSync(fake,0o700);
  }
  const wrappedHerdr = join(bin, 'herdr');
  writeFileSync(wrappedHerdr, `#!${process.execPath}
import {existsSync,readFileSync,writeFileSync,renameSync} from 'fs';import {spawnSync} from 'child_process';
const args=process.argv.slice(2);
// Polling uses agent get only. History and cleanup first validate pane identity.
if(readFileSync(${JSON.stringify(goalPath)},'utf8').includes('MISSED_WORKING')&&args[2]==='pane'&&args[3]==='get'){
 const prefix=${JSON.stringify(missedWorking)};
 if(existsSync(prefix+'.baseline')&&!existsSync(prefix+'.polling-ended'))writeFileSync(prefix+'.polling-ended',String(Date.now()));
}
if(args[2]==='agent' && args[3]==='prompt' && readFileSync(${JSON.stringify(goalPath)},'utf8').includes('STARTUP_WORKING')){
 const queried=spawnSync(${JSON.stringify(herdr)},[...args.slice(0,2),'agent','get',args[4]],{env:process.env,encoding:'utf8'});
 const agent=JSON.parse(queried.stdout).result.agent;
 const reported=spawnSync(${JSON.stringify(herdr)},[...args.slice(0,2),'pane','report-agent',agent.pane_id,'--source','fixture-delivery','--agent',agent.agent,'--state','working','--seq','1'],{env:process.env,encoding:'utf8'});
 if(reported.status!==0)throw new Error(reported.stderr);
}
const result=spawnSync(${JSON.stringify(herdr)},args,{env:process.env,encoding:'utf8'});if(readFileSync(${JSON.stringify(goalPath)},'utf8').includes('Finish fixture goal')){
 const prefix=${JSON.stringify(join(fixture,'working-observation'))};
 if(args[2]==='agent'&&args[3]==='prompt'&&result.status===0){const ref=/^Read task request (.*); write its result only to /.exec(args[5])?.[1];writeFileSync(prefix+'.delivered',JSON.stringify(JSON.parse(readFileSync(ref,'utf8'))));}
 if(args[2]==='agent'&&args[3]==='get'&&result.status===0&&existsSync(prefix+'.delivered')){
  const current=JSON.parse(result.stdout).result.agent;
  if(!existsSync(prefix+'.baseline'))writeFileSync(prefix+'.baseline',JSON.stringify(current));
  else {const baseline=JSON.parse(readFileSync(prefix+'.baseline','utf8'));if(current.agent_status==='working'&&current.state_change_seq>baseline.state_change_seq&&existsSync(prefix+'.armed')){const armed=JSON.parse(readFileSync(prefix+'.armed','utf8'));const request=JSON.parse(readFileSync(prefix+'.delivered','utf8'));if(armed.request_id===request.request_id&&armed.pane===current.pane_id&&armed.pid===Number(readFileSync(${JSON.stringify(join(fixture,'codex.pid'))},'utf8'))){writeFileSync(prefix+'.tmp',JSON.stringify({...current,...armed}));renameSync(prefix+'.tmp',prefix);}}}
 }
}
if(readFileSync(${JSON.stringify(goalPath)},'utf8').includes('MISSED_WORKING')){
 const prefix=${JSON.stringify(missedWorking)};
 if(args[2]==='agent'&&args[3]==='prompt'&&result.status===0)writeFileSync(prefix+'.delivered','accepted');
 if(args[2]==='agent'&&args[3]==='get'&&result.status===0&&existsSync(prefix+'.delivered')){
  const current=JSON.parse(result.stdout).result.agent;
  if(!existsSync(prefix+'.baseline')){
   if(current.agent_status!=='idle')throw new Error('fixture idle baseline required');
   writeFileSync(prefix+'.baseline',JSON.stringify(current));
   const deadline=Date.now()+8000;
   while(!existsSync(prefix+'.complete')){if(Date.now()>=deadline)throw new Error('fixture missed working deadline');await Bun.sleep(10);}
  }else if(!existsSync(prefix+'.polling-ended')&&current.agent_status==='idle'&&current.state_change_seq>JSON.parse(readFileSync(prefix+'.baseline','utf8')).state_change_seq)writeFileSync(prefix+'.settled',JSON.stringify({...current,observed_at_ms:Date.now()}));
 }
}
process.stdout.write(result.stdout??'');process.stderr.write(result.stderr??'');process.exit(result.status??1);
`); chmodSync(wrappedHerdr,0o700);
  const savedPath = process.env.PATH;
  process.env.PATH = `${bin}:${savedPath}`;
  const execute = (args:string[]) => { requireFixtureSession(session); return run(herdr,['--session',session,...args],fixture,env); };
  const call = (args:string[]) => JSON.parse(execute(args)).result;
  const server=spawn(herdr,['--session',session,'server'],{env,stdio:'ignore'});
  const {callMcpTool}=await import('../src/cli/mcp/tools');
  const {getMcpPolicy}=await import('../src/cli/mcp/policy');
  const api=await import('../src/effects/terminal/task-session');
  try {
    await until(()=>{try{call(['workspace','list']);return true;}catch{return false;}});
    const root=call(['workspace','create','--cwd',fixture,'--no-focus']);
    const parent=root.root_pane.pane_id;
    const ctx={repoRoot:fixture,policy:getMcpPolicy('orchestrator',{devAgentRunner:true,allowedAgents:['codex','claude'],runnerTimeoutMs:10000})};
    for(const [kind,mode] of [['codex','startup-working-result'],['codex','early-idle-result'],['codex','idle-only'],['codex','idle'],['codex','missed-working'],['codex','result'],['claude','timeout']] as const){
      const hang=mode==='timeout'||mode==='idle-only'||mode==='missed-working', hasResult=mode==='result'||mode==='early-idle-result'||mode==='startup-working-result';
      writeFileSync(goalPath,mode==='startup-working-result'?'STARTUP_WORKING WRITE_RESULT':mode==='early-idle-result'?'EARLY_IDLE WRITE_RESULT':mode==='idle-only'?'EARLY_IDLE IDLE_ONLY':mode==='missed-working'?'MISSED_WORKING':hang?'WAIT_FOREVER':hasResult?'WRITE_RESULT':'Finish fixture goal');
      const result=await callMcpTool(ctx,'run_agent_goal',{agent:kind,herdr:{endpoint,parent_pane:parent},timeout_ms:mode==='missed-working'?10000:hang?5000:10000});
      const value=JSON.parse((result.content[0] as {text:string}).text);
      expect(value.stderr).toBe('');
      expect(value.status).toBe(hang?'timeout':hasResult?'completed':'observed_idle');
      expect(value.timedOut).toBe(hang);
      if(mode==='missed-working'){
        expect(readFileSync(missedWorking+'.complete','utf8')).toBe('complete');
        const baseline=JSON.parse(readFileSync(missedWorking+'.baseline','utf8'));
        const settled=JSON.parse(readFileSync(missedWorking+'.settled','utf8'));
        expect(baseline.agent_status).toBe('idle');
        expect(settled.agent_status).toBe('idle');
        expect(settled.pane_id).toBe(baseline.pane_id);
        expect(settled.state_change_seq).toBeGreaterThan(baseline.state_change_seq);
        expect(settled.observed_at_ms).toBeLessThan(Number(readFileSync(missedWorking+'.polling-ended','utf8')));
      }
      if(mode!=='idle-only')expect(value.stdout).toContain('GOAL VISIBLE');
      expect(value.stdout).not.toContain('fixture-secret-token');
      expect(Buffer.byteLength(value.stdout)).toBeLessThanOrEqual(128*1024);
      const binding=api.readTaskAgent(fixture,value.task,value.role).binding;
      expect(binding.provider.pid).toBe(Number(readFileSync(join(fixture,kind+'.pid'),'utf8')));
      expect(live(binding.provider.pid)).toBe(false);
      expect(api.taskAgentStatus(fixture,value.task,value.role).status).toBe('closed');
      const dir=api.taskSessionDirectory(fixture,value.task,value.role);
      const request=api.readSessionArtifact<import('../src/effects/terminal/task-session').TaskRequest>(join(dir,'request-1.json'));
      expect(existsSync(request.result_ref)).toBe(hasResult);
      expect(existsSync(join(dir,'collected-1.json'))).toBe(false);
      expect(api.readSessionArtifact<{disposition:string}>(join(dir,'closed.json')).disposition).toBe(hasResult?'completed':'cancelled');
      expect(call(['pane','list','--workspace',root.workspace.workspace_id]).panes).toHaveLength(1);
      expect(call(['pane','get',parent]).pane.pane_id).toBe(parent);
    }
    const audit=readFileSync(join(fixture,'.ai/harness/mcp/audit.log'),'utf8');
    expect(audit).not.toContain(configPath);expect(audit).not.toContain(home);expect(audit).not.toContain(session);
  }finally{
    process.env.PATH = savedPath;
    requireFixtureSession(session);
    try{execute(['server','stop']);}catch{if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM');}
    await exited(server);rmSync(fixture,{recursive:true,force:true});
  }
},90000); // Seven real Herdr launches need headroom after the 10 s missed-working budget.

test.skipIf(process.platform !== 'darwin')('OAR fixed host runs visibly in a private Herdr pane and disposes before owned pane cleanup', async () => {
  const api = await import('../src/effects/terminal/task-session');
  const { reviewIsolationPolicy, reviewHostCommand } = await import('../src/effects/review/review-isolation');
  const fixture = realpathSync(mkdtempSync('/tmp/oh-'));
  const home = join(fixture, 'h'), repo = join(fixture, 'p'), output = join(fixture, 'out');
  for (const path of [home, repo, output]) mkdirSync(path);
  const session = `task-proof-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const configPath = join(fixture, 'herdr.toml'), endpoint = { session, configPath, home };
  requireFixtureSession(session);
  const env = { ...herdrEnvironment(endpoint), REPO_HARNESS_OAR_SCRIPTED_FIXTURE: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const herdr = Bun.which('herdr'); if (!herdr) throw new Error('fixture_herdr_required');
  writeFileSync(configPath, 'onboarding=false\n[terminal]\ndefault_shell="/bin/sh"\nshell_mode="non_login"\n[update]\nversion_check=false\nmanifest_check=false\n');
  run('git', ['init', '-qb', 'main'], repo, env);
  run('git', ['-c','user.name=fixture','-c','user.email=fixture@localhost','commit','--allow-empty','-qm','fixture'], repo, env);
  const execute = (args: string[]) => { requireFixtureSession(session); return run(herdr, ['--session', session, ...args], repo, env); };
  const call = (args: string[]) => JSON.parse(execute(args)).result;
  const server = spawn(herdr, ['--session', session, 'server'], { env, stdio: 'ignore' }); server.on('error', () => {});
  const closeRequest = join(output, 'close.request'), readyFile = join(output, 'ready.json'), disposedFile = join(output, 'disposed.json');
  const specFile = join(fixture, 'fixture.json'), profile = join(fixture, 'profile.sb');
  const paths = { subject: repo, primary: repo, ownerRecord: repo, journal: repo, gitCommonDir: join(repo,'.git'), output };
  writeFileSync(profile, reviewIsolationPolicy(paths));
  writeFileSync(specFile, JSON.stringify({ mode: 'scripted', cwd: repo, inputs: ['one','two','three'], closeRequest, readyFile, disposedFile, isolation: { paths, policyFile: profile } }));
  const priorPath = process.env.PATH, priorFlag = process.env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE;
  process.env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE='1';
  let binding: Awaited<ReturnType<typeof api.startTaskApplicationHost>> | undefined;
  try {
    await until(() => { try { return call(['workspace','list']).type==='workspace_list'; } catch { return false; } });
    const workspace = call(['workspace','create','--cwd',repo,'--label','OAR fixture','--no-focus']);
    const command = reviewHostCommand(realpathSync('/opt/homebrew/opt/node@24/bin/node'), realpathSync(join(import.meta.dir,'../dist/oar-review-host.js')), specFile);
    binding = await api.startTaskApplicationHost(repo, { task:'oar-fixture', role:'deep-reasoner', harness_kind:'codex', endpoint,
      parent_pane:workspace.root_pane.pane_id, args:[], max_requests:3 }, command, async () => { await until(() => existsSync(readyFile)); });
    expect(binding.host).toBeNull(); // No privileged protected-result host fence is bypassed.
    expect(binding.provider.pid).toBe(JSON.parse(readFileSync(readyFile,'utf8')).pid);
    const screen = execute(['pane','read',binding.pane_id,'--source','recent','--lines','120','--format','text','--raw']);
    expect(screen).toContain('fixture-oar');
    await until(() => execute(['pane','read',binding!.pane_id,'--source','recent','--lines','120','--format','text','--raw']).includes('OAR_HOST_ROUNDS_DONE_FIXTURE'));
    writeFileSync(closeRequest, 'close');
    await until(() => existsSync(disposedFile));
    await until(() => !live(binding!.provider.pid));
    expect((await api.cancelTaskAgent(repo,'oar-fixture','deep-reasoner')).status).toBe('closed');
    expect(call(['pane','get',workspace.root_pane.pane_id]).pane.pane_id).toBe(workspace.root_pane.pane_id);
  } finally {
    writeFileSync(closeRequest,'close');
    if (binding && live(binding.provider.pid)) { await until(() => !live(binding!.provider.pid)); }
    try { execute(['server','stop']); } catch { if (server.exitCode===null && server.signalCode===null) server.kill('SIGTERM'); }
    await exited(server);
    process.env.PATH=priorPath;
    if(priorFlag===undefined)delete process.env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE;else process.env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE=priorFlag;
    rmSync(fixture,{recursive:true,force:true});
  }
}, 60000);

test('pipeline observer recovers a real Herdr request after post-send registration is lost', async () => {
  const { preparePipelineSQLite } = await import('./helpers/pipeline-sqlite-fixture');
  preparePipelineSQLite();
  const { PipelineStore } = await import('../src/effects/pipeline/store');
  const { newPipeline, mutatePipeline } = await import('../src/effects/pipeline/ledger');
  const { ingestEvent, observations, projectedRuns } = await import('../src/effects/pipeline/ingest');
  const { hostname } = await import('node:os');
  const api = await import('../src/effects/terminal/task-session');
  const modulePath = new URL('../src/effects/terminal/task-session.ts', import.meta.url).pathname;
  const fixture = realpathSync(mkdtempSync('/tmp/po-'));
  const home = join(fixture, 'h'); mkdirSync(home);
  const session = `task-proof-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const configPath = join(fixture, 'herdr.toml');
  const endpoint = { session, configPath, home };
  const env = { ...herdrEnvironment(endpoint), TMPDIR: '/tmp', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const herdr = Bun.which('herdr');
  if (!herdr) throw new Error('real_herdr_required_for_task_proof');
  run('git', ['init', '-q', '-b', 'main'], fixture, env);
  writeFileSync(configPath, 'onboarding = false\n[terminal]\ndefault_shell = "/bin/sh"\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n[session]\nresume_agents_on_restore = false\n');
  const execute = (args: string[]) => {
    requireFixtureSession(session);
    return run(herdr, ['--session', session, ...args], fixture, env);
  };
  const call = (args: string[]) => JSON.parse(execute(args)).result;
  const ready = join(fixture, 'peer.ready');
  const peer = join(fixture, 'peer.ts');
  symlinkSync(process.execPath, join(fixture, 'codex'));
  writeFileSync(peer, `
import {readFileSync,writeFileSync} from 'fs';
import {writeSessionArtifact} from ${JSON.stringify(modulePath)};
process.stdin.setRawMode(true); process.stdout.write('\\x1b[?2004h');
writeFileSync(${JSON.stringify(ready)}, 'ready');
let buffer=''; process.stdin.on('data',chunk=>{
 buffer+=chunk.toString(); if (!/[\\r\\n]/.test(buffer)) return;
 const lines=buffer.split(/[\\r\\n]+/); buffer=lines.pop() ?? '';
 for(const line of lines){
  const text=line.replaceAll('\\x1b[200~','').replaceAll('\\x1b[201~','');
  const match=/^Read task request (.+); write its result only to (.+)\\.$/.exec(text);
  if(!match)continue;
  const request=JSON.parse(readFileSync(match[1],'utf8'));
  readFileSync(request.context_ref,'utf8');
  writeSessionArtifact(request.result_ref,{request_id:request.request_id,context_sha256:request.context_sha256,value:'artifact-result'});
 }
});
`);
  const server = spawn(herdr, ['--session', session, 'server'], { env, stdio: 'ignore' });
  try {
    await until(() => { try { call(['workspace', 'list']); return true; } catch { return false; } });
    const root = call(['workspace', 'create', '--cwd', fixture, '--no-focus']);
    const spec = { task: 'observer-task', role: 'advisor', harness_kind: 'codex', endpoint, parent_pane: root.root_pane.pane_id, args: [], max_requests: 1 };
    const binding = await api.startTaskAgent(fixture, spec, {
      start: async (_endpoint, name, pane, kind) => {
        execute(['pane', 'run', pane, `exec ${quote(join(fixture, 'codex'))} ${quote(peer)}`]);
        await until(() => existsSync(ready));
        execute(['pane', 'report-agent', pane, '--source', 'fixture', '--agent', kind, '--state', 'working', '--seq', '1']);
        execute(['agent', 'rename', pane, name]);
      },
    });
    const { dir } = api.readTaskAgent(fixture, spec.task, spec.role);
    writeFileSync(join(fixture, 'context.md'), 'owned observer context');
    const observerEnv = { ...env, REPO_HARNESS_PIPELINES_AUTHORITY_HOST: hostname(), REPO_HARNESS_PIPELINES_DB: join(fixture, '.ai/harness/pipeline/observer.db') };
    const key = { source_host: hostname(), repository_id: binding.repository_id, task: spec.task };
    const enrolled = new PipelineStore({ env: observerEnv });
    try {
      newPipeline(enrolled, { ...key, adopt_task: spec.task, root: fixture });
      mutatePipeline(enrolled, key, { op: 'record', kind: 'request', payload: { role: spec.role }, state_version: 1, reconcile: true });
      expect(enrolled.read(key).runs).toHaveLength(0);
    } finally { enrolled.close(); }
    // Send through the original API. Do not register the request in the ledger.
    const request = await api.sendTaskRequest(fixture, spec.task, spec.role, 'context.md');
    await until(() => existsSync(request.result_ref));
    const requestBytes = readFileSync(join(dir, 'request-1.json'));
    const resultBytes = readFileSync(request.result_ref);
    const recovered = new PipelineStore({ env: observerEnv });
    try {
      expect(recovered.read(key).runs).toHaveLength(0);
      ingestEvent(recovered, { host: hostname(), herdr_session: session, result: call(['pane', 'list']) }, { snapshot: true });
      const runs = projectedRuns(recovered.read(key), observations(recovered));
      expect(runs).toHaveLength(1);
      expect(runs[0].request_id).toBe(request.request_id);
      expect(runs[0].result_state).toBe('validated');
      expect(existsSync(join(dir, 'collected-1.json'))).toBe(false);
      expect(readFileSync(join(dir, 'request-1.json'))).toEqual(requestBytes);
      expect(readFileSync(request.result_ref)).toEqual(resultBytes);
      expect(api.readTaskRequestResult(fixture, dir, request)?.value).toBe('artifact-result');
    } finally { recovered.close(); }
  } finally {
    requireFixtureSession(session);
    try { execute(['server', 'stop']); } catch {
      if (server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
    }
    await exited(server);
    rmSync(fixture, { recursive: true, force: true });
  }
}, 60_000);

test.skipIf(process.platform !== 'darwin')('coding admission fails closed and real OS policy denies primary, metadata and escaped writes', async () => {
  const isolation = await import('../src/effects/terminal/coding-isolation');
  const { startCodingTaskAgent } = await import('../src/effects/terminal/coding-session');
  const fixture = realpathSync(mkdtempSync('/tmp/cb-'));
  const primary = join(fixture, 'primary'), checkout = join(fixture, 'worktree'), control = join(fixture, 'control');
  mkdirSync(primary); mkdirSync(control);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  run('git', ['init', '-qb', 'main'], primary, env);
  run('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--allow-empty', '-qm', 'fixture'], primary, env);
  run('git', ['worktree', 'add', '-qb', 'coding-boundary', checkout], primary, env);
  const admission: import('../src/effects/terminal/coding-isolation').CodingHostAdmission = {
    version: 1, runtime: 'codex', execution_root: checkout, node: realpathSync('/opt/homebrew/opt/node@24/bin/node'), executable: '/usr/bin/true',
    model: 'fixture', effort: 'medium', approval_policy: 'never', filesystem: 'worktree-only', authorization_ref: 'fixture-exact-operator-admission',
  };
  try {
    expect(() => isolation.assertCodingHostAdmission(checkout, undefined as any)).toThrow('OPERATOR_ADMISSION_REQUIRED');
    for (const change of [{ approval_policy: 'on-request' }, { filesystem: 'danger-full-access' }, { authorization_ref: '' }, { extra: true }]) {
      expect(() => isolation.assertCodingHostAdmission(checkout, { ...admission, ...change } as any)).toThrow('OPERATOR_ADMISSION_REQUIRED');
    }
    expect(() => isolation.assertCodingHostAdmission(checkout, { ...admission, runtime: 'claude' } as any)).toThrow('BOUNDARY_UNSUPPORTED');
    expect(() => isolation.assertCodingHostAdmission(checkout, admission, 'linux')).toThrow('BOUNDARY_UNSUPPORTED');
    expect(() => isolation.assertCodingHostAdmission(primary, { ...admission, execution_root: primary })).toThrow('LINKED_WORKTREE_REQUIRED');
    const spec = { task: 'denied', role: 'deep-worker', harness_kind: 'codex', endpoint: { session: 'task-proof-0123456789abcdef' }, parent_pane: 'absent', args: [], max_requests: 2 };
    await expect(startCodingTaskAgent(checkout, spec, undefined as any)).rejects.toThrow('OPERATOR_ADMISSION_REQUIRED');
    expect(existsSync(join(primary, '.ai'))).toBe(false);
    await expect(startCodingTaskAgent(checkout, { ...spec, args: ['--dangerously-bypass-approvals-and-sandbox'] }, admission)).rejects.toThrow('NATIVE_ARGUMENTS_REFUSED');
    expect(existsSync(join(primary, '.ai'))).toBe(false);
    const policy = join(control, 'policy.sb');
    const launcher = isolation.prepareCodingLauncher(control, policy, admission);
    isolation.proveCodingIsolation(admission, policy);
    expect(readFileSync(launcher, 'utf8')).toContain('/usr/bin/sandbox-exec');
    expect(readFileSync(launcher, 'utf8')).not.toContain('approval');
    const protectedFile = join(primary, 'authority'); writeFileSync(protectedFile, 'owner');
    const instruction = join(checkout, 'AGENTS.md'); writeFileSync(instruction, 'operator');
    symlinkSync(primary, join(checkout, 'escape'));
    const denied = spawnSync('/usr/bin/sandbox-exec', ['-f', policy, admission.node, '-e', `
const fs=require('node:fs');
for(const path of process.argv.slice(1)){try{fs.writeFileSync(path,'bad');process.exit(1)}catch(e){if(e.code!=='EPERM')throw e}}
`, protectedFile, instruction, join(checkout, '.git'), join(checkout, 'escape', 'authority')], { encoding: 'utf8', timeout: 5000 });
    expect(denied.status, denied.stderr).toBe(0);
    expect(readFileSync(protectedFile, 'utf8')).toBe('owner');
    expect(readFileSync(instruction, 'utf8')).toBe('operator');
    const fs = await import('node:fs');
    const alias = join(checkout,'hardlink-alias');
    fs.linkSync(protectedFile,alias);
    expect(() => isolation.assertCodingHostAdmission(checkout,admission)).toThrow(`OAR_CODING_HARDLINK_UNSUPPORTED: ${alias}`);
    await expect(startCodingTaskAgent(checkout,spec,admission)).rejects.toThrow('HARDLINK_UNSUPPORTED');
    expect(existsSync(join(primary,'.ai'))).toBe(false);
    fs.unlinkSync(alias);
    // After startup the sandboxed process cannot introduce an outside alias.
    const linkAttempt = spawnSync('/usr/bin/sandbox-exec',['-f',policy,admission.node,'-e',`
const fs=require('node:fs');try{fs.linkSync(process.argv[1],process.argv[2]);fs.writeFileSync(process.argv[2],'bad');process.exit(1)}catch(e){if(e.code!=='EPERM')throw e}
`,protectedFile,alias],{encoding:'utf8',timeout:5000});
    expect(linkAttempt.status,linkAttempt.stderr).toBe(0);
    expect(existsSync(alias)).toBe(false);
    expect(readFileSync(protectedFile,'utf8')).toBe('owner');
    writeFileSync(policy, '(version 1)(allow default)');
    expect(() => isolation.proveCodingIsolation(admission, policy)).toThrow('PROFILE_CHANGED');
    expect(() => isolation.prepareCodingLauncher(control, policy, admission)).toThrow('PROFILE_CHANGED');
  } finally { rmSync(fixture, { recursive: true, force: true }); }
});

test.skipIf(process.platform !== 'darwin')('OAR scripted coding session keeps task result authority and disposes before real Herdr cleanup', async () => {
  const api = await import('../src/effects/terminal/task-session');
  const coding = await import('../src/effects/terminal/coding-session');
  const fixture = realpathSync(mkdtempSync('/tmp/cs-'));
  const home = join(fixture, 'home'), repo = join(fixture, 'primary'), checkout = join(fixture, 'worktree');
  mkdirSync(home); mkdirSync(repo);
  const session = `task-proof-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  const configPath = join(fixture, 'herdr.toml'), endpoint = { session, configPath, home };
  requireFixtureSession(session);
  const env = { ...herdrEnvironment(endpoint), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const node = realpathSync('/opt/homebrew/opt/node@24/bin/node');
  const herdr = Bun.which('herdr'); if (!herdr) throw new Error('real_herdr_required_for_coding_proof');
  writeFileSync(configPath, 'onboarding=false\n[terminal]\ndefault_shell="/bin/sh"\nshell_mode="non_login"\n[update]\nversion_check=false\nmanifest_check=false\n');
  run('git', ['init', '-qb', 'main'], repo, env);
  run('git', ['-c','user.name=fixture','-c','user.email=fixture@localhost','commit','--allow-empty','-qm','fixture'], repo, env);
  run('git', ['worktree','add','-qb','coding-proof',checkout], repo, env);
  const execute = (args: string[]) => { requireFixtureSession(session); return run(herdr, ['--session', session, ...args], repo, env); };
  const call = (args: string[]) => JSON.parse(execute(args)).result;
  const server = spawn(herdr, ['--session', session, 'server'], { env, stdio: 'ignore' }); server.on('error', () => {});
  let binding: import('../src/effects/terminal/task-session').TaskPaneBinding | undefined;
  let control = '';
  const driver = join(fixture, 'scripted-host.mjs');
  writeFileSync(driver, `
import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {openScriptedCodingHost,serveCodingHostRequests} from ${JSON.stringify(new URL('../dist/oar-coding-host.js', import.meta.url).href)};
const spec=JSON.parse(readFileSync(process.argv[2],'utf8'));
const host=await openScriptedCodingHost(spec.admission.execution_root,async ({input,say})=>{
 const request=JSON.parse(input.split('\\n')[0].slice('TASK REQUEST: '.length));
 say('fixture-oar coding observation; completion is not a result');
 if(request.round===2){const value={request_id:request.request_id,context_sha256:request.context_sha256,value:'worker-authored result'};
 writeFileSync(request.result_ref+'.tmp',JSON.stringify(value));renameSync(request.result_ref+'.tmp',request.result_ref);}
 if(request.round===3)await new Promise(()=>{});
},event=>console.log(JSON.stringify(event)));
let closing;const close=()=>closing??=host.dispose();
writeFileSync(join(spec.control_directory,'ready.json'),JSON.stringify({pid:process.pid,session_id:host.sessionId}));
try{await serveCodingHostRequests(host,spec,close,()=>closing!==undefined)}finally{await close();writeFileSync(join(spec.control_directory,'disposed.json'),JSON.stringify({disposed:true,session_id:host.sessionId}));}
`);
  try {
    await until(() => { try { return call(['workspace','list']).type==='workspace_list'; } catch { return false; } });
    const workspace = call(['workspace','create','--cwd',repo,'--no-focus']);
    const spec = { task:'coding-fixture', role:'deep-worker', harness_kind:'codex', endpoint, parent_pane:workspace.root_pane.pane_id, args:[], max_requests:3 };
    const dir = api.taskSessionDirectory(repo, spec.task, spec.role); control = join(dir,'coding-host');
    api.ensureSessionDirectory(repo, control);
    const admission: import('../src/effects/terminal/coding-isolation').CodingHostAdmission = {
      version:1, runtime:'codex', execution_root:checkout, node, executable:'/usr/bin/true', model:'fixture', effort:'medium',
      approval_policy:'never', filesystem:'worktree-only', authorization_ref:'fixture-exact-admission',
    };
    const hostSpec = { admission, task:spec.task, role:spec.role, primary_root:repo, request_directory:dir, control_directory:control,
      max_requests:3, installation:{kind:'available',via:'bundled'}, launcher:'fixture-not-used',policy_file:'fixture-not-used' };
    const specFile = join(control,'spec.json'); api.writeSessionArtifact(specFile,hostSpec);
    // Internal test seam runs OAR's real scriptedRuntime. It does not claim
    // production-entrypoint or live-provider acceptance.
    binding = await api.startTaskAgent(checkout,spec,{start:async (_endpoint,name,pane,kind)=>{
      execute(['pane','run',pane,`${quote(node)} ${quote(driver)} ${quote(specFile)}`]);
      await until(()=>existsSync(join(control,'ready.json')));
      execute(['pane','report-agent',pane,'--source','coding-fixture','--agent',kind,'--state','working','--seq','1']);
      execute(['pane','report-agent',pane,'--source','coding-fixture','--agent',kind,'--state','idle','--seq','2']);
      execute(['agent','rename',pane,name]);
    }});
    expect(binding.host).toBeNull();
    // A launch without durable provider proof must not close the pane.
    const bindingFile = join(dir,'binding.json'), providerFile = join(dir,'provider-created.json');
    const bindingBytes = readFileSync(bindingFile), providerBytes = readFileSync(providerFile);
    const fs = await import('node:fs');
    fs.unlinkSync(bindingFile); fs.unlinkSync(providerFile);
    try {
      expect(await api.cancelTaskAgent(repo,spec.task,spec.role)).toEqual({ status:'cleanup_pending',pids:[],reason:'oar_unbound_disposal_unproven' });
      expect(live(binding.provider.pid)).toBe(true);
      expect(call(['pane','get',binding.pane_id]).pane.pane_id).toBe(binding.pane_id);
    } finally { writeFileSync(providerFile,providerBytes);writeFileSync(bindingFile,bindingBytes); }
    writeFileSync(join(checkout,'context.md'),'first coding context');
    const first = await coding.sendCodingTaskRequest(checkout,spec.task,spec.role,'context.md');
    await until(()=>existsSync(join(control,'observed-1.json')));
    expect(await api.collectTaskResult(checkout,spec.task,spec.role,1)).toBeNull();
    expect(api.taskAgentStatus(repo,spec.task,spec.role).status).toBe('pending');
    await expect(coding.sendCodingTaskRequest(checkout,spec.task,spec.role,'context.md')).rejects.toThrow('ambiguous_round');
    await expect(coding.closeCodingTaskAgent(repo,spec.task,spec.role)).rejects.toThrow('pending_request');
    expect(existsSync(join(control,'close.request'))).toBe(false);
    expect(existsSync(join(dir,'request-2.json'))).toBe(false);
    api.writeSessionArtifact(first.result_ref,{request_id:'forged',context_sha256:first.context_sha256,value:'forged'});
    await expect(api.collectTaskResult(repo,spec.task,spec.role,1)).rejects.toThrow('identity_mismatch');
    api.writeSessionArtifact(first.result_ref,{request_id:first.request_id,context_sha256:first.context_sha256,value:'explicit fixture result'},false);
    expect((await api.collectTaskResult(repo,spec.task,spec.role,1))?.value).toBe('explicit fixture result');
    writeFileSync(join(checkout,'context.md'),'second coding context');
    const second=await coding.sendCodingTaskRequest(checkout,spec.task,spec.role,'context.md');
    await until(()=>existsSync(second.result_ref));
    expect((await api.collectTaskResult(repo,spec.task,spec.role,2))?.value).toBe('worker-authored result');
    // Replaying a committed host attempt is refused before another OAR prompt.
    const replay=spawnSync(node,['--input-type=module','-e',`import {readFileSync} from 'node:fs';import {openScriptedCodingHost,runCodingHostRequest} from ${JSON.stringify(new URL('../dist/oar-coding-host.js', import.meta.url).href)};
const spec=JSON.parse(readFileSync(process.argv[1],'utf8')),request=JSON.parse(readFileSync(process.argv[2],'utf8'));const host=await openScriptedCodingHost(spec.admission.execution_root,()=>{throw new Error('REPLAY_OCCURRED')},()=>{});try{await runCodingHostRequest(host,spec,request)}finally{await host.dispose()}`,specFile,join(dir,'request-2.json')],{encoding:'utf8',timeout:5000});
    expect(replay.status).toBe(1); expect(replay.stderr).toContain('EEXIST'); expect(replay.stderr).not.toContain('REPLAY_OCCURRED');
    writeFileSync(join(checkout,'context.md'),'pending coding context');
    await coding.sendCodingTaskRequest(checkout,spec.task,spec.role,'context.md');
    expect((await api.cancelTaskAgent(repo,spec.task,spec.role)).status).toBe('closed');
    expect((await coding.cancelCodingTaskAgent(repo,spec.task,spec.role)).status).toBe('closed');
    expect(existsSync(join(control,'disposed.json'))).toBe(true);
    expect(live(binding.provider.pid)).toBe(false);
    expect(call(['pane','get',workspace.root_pane.pane_id]).pane.pane_id).toBe(workspace.root_pane.pane_id);
  } finally {
    if(control && existsSync(control) && !existsSync(join(control,'close.request')))writeFileSync(join(control,'close.request'),'close');
    if(binding && live(binding.provider.pid))await until(()=>!live(binding!.provider.pid));
    try{execute(['server','stop'])}catch{if(server.exitCode===null&&server.signalCode===null)server.kill('SIGTERM')}
    await exited(server);rmSync(fixture,{recursive:true,force:true});
  }
}, 60000);
