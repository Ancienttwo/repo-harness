import { expect, test } from 'bun:test';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
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
import {randomUUID} from 'crypto';
const role = process.argv[2]; const statePath = process.argv[3];
const state = { role, pid: process.pid, provider_session: randomUUID(), requests: [] as {id:string,context:string}[] };
function save() { writeFileSync(statePath+'.tmp', JSON.stringify(state)); renameSync(statePath+'.tmp',statePath); }
process.stdin.setRawMode(true); process.stdout.write('\\x1b[?2004h'); save();
let input=''; process.stdin.on('data', chunk => {
  input += chunk.toString();
  if (!input.includes('\\r') && !input.includes('\\n')) return;
  const lines=input.split(/[\\r\\n]+/); input=lines.pop() ?? '';
  for (const line of lines) {
    const text=line.replaceAll('\\x1b[200~','').replaceAll('\\x1b[201~','');
    if (!text.trim()) continue;
    const request=JSON.parse(text); state.requests.push(request); save();
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
import {readFileSync,writeFileSync} from 'fs'; import {join} from 'path';
import {writeSessionArtifact} from ${JSON.stringify(modulePath)};
process.stdin.setRawMode(true); process.stdout.write('\\x1b[?2004h');
writeFileSync(process.argv[2],JSON.stringify({pid:process.pid}));
let buffer=''; process.stdin.on('data',chunk=>{
 buffer+=chunk.toString(); if (!/[\\r\\n]/.test(buffer)) return;
 const lines=buffer.split(/[\\r\\n]+/); buffer=lines.pop() ?? '';
 for(const line of lines){
  const text=line.replaceAll('\\x1b[200~','').replaceAll('\\x1b[201~','');
  const match=/^Read task request (.+); write its result only to (.+)\\.$/.exec(text);
  if(!match)continue;
  const request=JSON.parse(readFileSync(match[1],'utf8'));
  const content=JSON.parse(readFileSync(request.context_ref,'utf8')).content;
  if(content==='hold-result'){process.stdout.write('PASS is not a result artifact\\n');continue;}
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
const binding=await startTaskAgent(process.cwd(),spec,{
 contended:()=>writeFileSync('contended','observed'),
 boundary:async phase=>{
  if(mode==='hold'&&phase==='intent'){writeFileSync('barrier','intent durable');while(!existsSync('release'))await Bun.sleep(10);}
  if(mode==='crash'&&phase==='launched')process.exit(77);
  if(mode==='intent-crash'&&phase==='intent')process.exit(78);
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
    const owner = (mode: string, path = specPath) => {
      const child = spawn(process.execPath, [driver, path, mode], { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const { dir } = api.readTaskAgent(fixture, spec.task, spec.role);
    writeFileSync(join(fixture, 'context.md'), 'owned context');
    const request = await api.sendTaskRequest(fixture, spec.task, spec.role, 'context.md');
    await until(() => existsSync(join(dir, 'result-1.json')));
    expect(api.readTaskRequestResult(fixture, dir, request)?.value).toBe('artifact-result');
    const result = api.readSessionArtifact<Record<string, unknown>>(join(dir, 'result-1.json'));
    api.writeSessionArtifact(join(dir, 'result-1.json'), { ...result, request_id: 'another-request' }, false);
    expect(() => api.readTaskRequestResult(fixture, dir, request)).toThrow('result_identity_mismatch');
    api.writeSessionArtifact(join(dir, 'result-1.json'), result, false);
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
    await api.closeTaskAgent(fixture, crashSpec.task, crashSpec.role);
    await api.closeTaskAgent(fixture, spec.task, spec.role);
    expect(live(binding.provider.pid)).toBe(false);
    expect(call(['pane', 'get', parent]).pane.pane_id).toBe(parent);

    const pendingSpec = { ...spec, role: 'intent-only' };
    const pendingPath = join(fixture, 'pending.json'); writeFileSync(pendingPath, JSON.stringify(pendingSpec));
    const pendingOwner = owner('intent-crash', pendingPath); await exited(pendingOwner.child);
    expect(pendingOwner.child.exitCode).toBe(78);
    await expect(api.startTaskAgent(fixture, pendingSpec)).rejects.toThrow('start_reconciliation_required');
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\ncrash-role\n');
    expect(call(['pane', 'list', '--workspace', root.workspace.workspace_id]).panes).toHaveLength(1);
    const ambiguousSpec = { ...spec, role: 'ambiguous-role' };
    const ambiguousPath = join(fixture, 'ambiguous.json'); writeFileSync(ambiguousPath, JSON.stringify(ambiguousSpec));
    const ambiguousOwner = owner('ambiguous', ambiguousPath); await exited(ambiguousOwner.child);
    expect(ambiguousOwner.child.exitCode).toBe(79);
    await expect(api.startTaskAgent(fixture, ambiguousSpec)).rejects.toThrow('start_reconciliation_required');
    expect(api.taskAgentStatus(fixture, spec.task, ambiguousSpec.role).status).toBe('reconciliation_required');
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\ncrash-role\nambiguous-role\n');
    expect(call(['pane', 'list', '--workspace', root.workspace.workspace_id]).panes).toHaveLength(2);

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
    rmSync(fixture, { recursive: true, force: true });
  }
}, 60_000);
