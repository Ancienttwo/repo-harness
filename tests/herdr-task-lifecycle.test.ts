import { expect, test } from 'bun:test';
import { darwinTest } from './helpers/darwin-test';
import { execFileSync, spawn, spawnSync, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { seedReviewAdmissionFixture } from './helpers/review-admission-fixture';
import { copyHelpers } from './helpers/helper-script-fixture';
import { taskRepository } from '../src/effects/git/task-repository';
import { taskReviewRunner } from '../src/effects/review-runner/task-review-runner';
import { processProofAlive } from '../src/effects/terminal/task-session';
import { processIdentity } from '../src/effects/terminal/task-session-io';
import type { HerdrTaskBinding } from '../src/effects/terminal/task-session-record';

// This file owns the feasibility boundary, not model judgment. Each test runs
// its own hc core under a private HOME, XDG tree and task-proof session.
// No default core, user agent or model endpoint is touched.
function requireFixtureSession(session: string) {
  if (!/^task-proof-[0-9a-f]{16}$/.test(session)) throw new Error('disposable_herdr_session_required');
}
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
interface FixtureCore {
  fixture: string; env: NodeJS.ProcessEnv; endpoint: { socket: string };
  hc: (args: string[]) => string; gone: (address: string) => boolean; parent: (cwd: string) => Promise<string>;
}
/** Runs body against a private hc core. Any hc call starts a core when none runs, so the stop is the last hc call. */
async function withCore(prefix: string, body: (core: FixtureCore) => Promise<void>, extraEnv: NodeJS.ProcessEnv = {}) {
  const fixture = realpathSync(mkdtempSync(`/tmp/${prefix}-`));
  const session = `task-proof-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  requireFixtureSession(session);
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv, HC_SESSION: session, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of ['HC_TERMINAL_ID', 'HC_TERMINAL_SOCKET', 'HC_SCOPE', 'HC_SOCKET']) delete env[key];
  for (const [key, name] of [['HOME', 'h'], ['XDG_CONFIG_HOME', 'c'], ['XDG_STATE_HOME', 's'], ['XDG_RUNTIME_DIR', 'r'], ['TMPDIR', 't']]) {
    env[key!] = join(fixture, name!); mkdirSync(env[key!]!);
  }
  const hc = (args: string[]) => { requireFixtureSession(session); return run('hc', args, fixture, env); };
  const gone = (address: string) => { requireFixtureSession(session); return spawnSync('hc', ['get', '--json', address], { env }).status === 3; };
  const parent = async (cwd: string) => {
    const address = JSON.parse(hc(['run', '--json', '--bg', '--cwd', cwd, '--', '/bin/sleep', '600'])).address as string;
    await until(() => !!JSON.parse(hc(['get', '--json', address])).foreground);
    return address;
  };
  let started = false;
  try {
    hc(['server', 'start', '--json']); started = true;
    const endpoint = { socket: join(env.XDG_RUNTIME_DIR!, 'herdr-core', `${session}.sock`) };
    if (!existsSync(endpoint.socket)) throw new Error('fixture_core_socket_missing');
    await body({ fixture, env, endpoint, hc, gone, parent });
  } finally {
    try { if (started) hc(['server', 'stop', '--json']); } // Ends the programs of this core.
    finally { rmSync(fixture, { recursive: true, force: true }); }
  }
}

test('fixture control rejects default and non-disposable sessions before a CLI can run', () => {
  for (const session of ['default', '', 'review-owned', 'task-proof-invalid']) {
    expect(() => requireFixtureSession(session)).toThrow('disposable_herdr_session_required');
  }
  requireFixtureSession(`task-proof-${randomUUID().replaceAll("-", "").slice(0, 16)}`);
});

test('hc task sessions serialize concurrent starts, reconcile crashes, deliver by hc send and end with their group', () => withCore('ta', async ({ fixture, env, endpoint, hc, gone, parent: parentTerminal }) => {
  run('git', ['init', '-q', '-b', 'main'], fixture, env);
  const modulePath = new URL('../src/effects/terminal/task-session.ts', import.meta.url).pathname;
  const ioModulePath = new URL('../src/effects/terminal/task-session-io.ts', import.meta.url).pathname;
  const api = { ...await import('../src/effects/terminal/task-session'), ...await import('../src/effects/terminal/task-session-record'), ...await import('../src/effects/terminal/task-session-io') };
  const parent = await parentTerminal(fixture);
  // These calls must return an existing binding or fail before any launch.
  const refuseLaunch = { argv: ['/usr/bin/false'] as [string], ready: async () => { throw new Error('fixture_must_not_launch'); } };
  // The fixture owns delivery: hc send types the request pointer into the bound terminal.
  const send = (task: string, role: string, context: string, policy: 'repeatable' | 'changed_only' = 'repeatable') =>
    api.sendTaskRequest(fixture, task, role, context, policy, async request => {
      const { dir, binding } = api.readTaskAgent(fixture, task, role);
      hc(['send', '--json', '--', (binding as HerdrTaskBinding).terminal_id, `Read task request ${join(dir, `request-${request.round}.json`)}; write its result only to ${request.result_ref}.`]);
    });
  const peer = join(fixture, 'peer.ts');
  writeFileSync(peer, `
import {appendFileSync,readFileSync,renameSync,writeFileSync} from 'fs'; import {spawn} from 'child_process';
import {writeSessionArtifact} from ${JSON.stringify(ioModulePath)};
const ready=process.argv[2];
process.stdin.setRawMode(true); process.stdout.write('\\x1b[?2004h');
appendFileSync(${JSON.stringify(join(fixture, 'launches'))},ready.split('/').pop().replace('.ready','')+'\\n');
// A child in the leader's process group before ready; it ignores TERM and terminal hangup.
if(ready.endsWith('/grouped.ready'))writeFileSync(ready+'.child',String(spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});process.on('SIGHUP',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'}).pid));
writeFileSync(ready+'.tmp',JSON.stringify({pid:process.pid})); renameSync(ready+'.tmp',ready);
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
  writeSessionArtifact(request.result_ref,{request_id:request.request_id,context_sha256:request.context_sha256,value:'artifact-result'});
  process.stdout.write('PASS misleading terminal text is not the result artifact\\n');
 }
});
`);
  const driver = join(fixture, 'owner.ts');
  writeFileSync(driver, `
import {existsSync,writeFileSync,readFileSync} from 'fs';
import {startTaskAgent} from ${JSON.stringify(modulePath)};
const spec=JSON.parse(readFileSync(process.argv[2],'utf8')); const mode=process.argv[3];
const ready=${JSON.stringify(fixture)}+'/'+spec.role+'.ready';
const binding=await startTaskAgent(process.argv[4],spec,{
 argv:[process.execPath,${JSON.stringify(peer)},ready],
 ready:async()=>{
  const end=Date.now()+8000;while(!existsSync(ready)){if(Date.now()>end)throw new Error('peer_deadline');await Bun.sleep(10);}
  if(mode==='ready-crash')process.exit(79);
 },
 contended:()=>writeFileSync('contended','observed'),
 boundary:async phase=>{
  if(mode==='hold'&&phase==='intent'){writeFileSync('barrier','intent durable');while(!existsSync('release'))await Bun.sleep(10);}
  if(mode==='crash'&&phase==='launched')process.exit(77);
  if(mode==='intent-crash'&&phase==='intent')process.exit(78);
 },
});
writeFileSync(spec.role+'-'+mode+'.binding',JSON.stringify(binding));
`);
  const spec = { task: 'owned-task', role: 'advisor', harness_kind: 'codex', endpoint, args: [], max_requests: 1 };
  const specPath = join(fixture, 'spec.json'); writeFileSync(specPath, JSON.stringify(spec));
  const owners: ChildProcess[] = [];
  const owner = (mode: string, path = specPath, executionRoot = fixture) => {
    const child = spawn(process.execPath, [driver, path, mode, executionRoot], { cwd: fixture, env, stdio: ['ignore', 'pipe', 'pipe'] });
    owners.push(child);
    let errors = ''; child.stderr?.on('data', data => { errors += data; });
    return { child, errors: () => errors };
  };
  const started = async (role: string, mode = 'normal') => {
    const path = join(fixture, `${role}.json`); writeFileSync(path, JSON.stringify({ ...spec, role }));
    const launched = owner(mode, path); await exited(launched.child);
    if (mode === 'normal' && launched.child.exitCode !== 0) throw new Error(launched.errors());
    return launched.child.exitCode;
  };
  try {
    const first = owner('hold');
    await until(() => existsSync(join(fixture, 'barrier')));
    const second = owner('second');
    await until(() => existsSync(join(fixture, 'contended')));
    expect(existsSync(join(fixture, 'launches'))).toBe(false);
    writeFileSync(join(fixture, 'release'), 'go');
    await exited(first.child); await exited(second.child);
    if (first.child.exitCode !== 0 || second.child.exitCode !== 0) throw new Error(first.errors() + second.errors());
    const firstBinding = JSON.parse(readFileSync(join(fixture, 'advisor-hold.binding'), 'utf8'));
    expect(JSON.parse(readFileSync(join(fixture, 'advisor-second.binding'), 'utf8'))).toEqual(firstBinding);
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\n');
    const binding = api.readTaskAgent(fixture, spec.task, spec.role).binding as HerdrTaskBinding;
    api.assertTaskBinding(binding);
    expect(binding).toEqual(firstBinding);
    expect(binding.provider.pid).toBe(JSON.parse(readFileSync(join(fixture, 'advisor.ready'), 'utf8')).pid);
    expect(JSON.parse(hc(['get', '--json', binding.terminal_id])).labels).toMatchObject({ 'repo-harness.role': 'task-session', 'repo-harness.harness': 'codex', 'repo-harness.notify': 'on' });
    // Review never reuses the owner's terminal as its reviewer.
    expect(() => taskReviewRunner.assertNotOwnerPane(binding, binding.terminal_id)).toThrow('review_must_not_reuse_owner_pane');
    taskReviewRunner.assertNotOwnerPane(binding, parent);
    const reordered = { max_requests: spec.max_requests, args: spec.args,
      endpoint: { socket: endpoint.socket }, harness_kind: spec.harness_kind, role: spec.role, task: spec.task };
    expect(await api.startTaskAgent(fixture, reordered, refuseLaunch)).toEqual(binding);
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\n');

    const { dir } = api.readTaskAgent(fixture, spec.task, spec.role);
    writeFileSync(join(fixture, 'context.md'), 'owned context');
    const request = await send(spec.task, spec.role, 'context.md');
    await until(() => existsSync(request.result_ref));
    expect(api.readTaskRequestResult(fixture, dir, request)?.value).toBe('artifact-result');
    await until(() => hc(['read', binding.terminal_id, '--lines', '200']).includes('PASS misleading terminal text is not the result artifact'));
    const result = api.readSessionArtifact<Record<string, unknown>>(request.result_ref);
    api.writeSessionArtifact(request.result_ref, { ...result, request_id: 'another-request' }, false);
    expect(() => api.readTaskRequestResult(fixture, dir, request)).toThrow('result_identity_mismatch');
    api.writeSessionArtifact(request.result_ref, result, false);
    writeFileSync(join(fixture, 'context.md'), 'changed context');
    await expect(send(spec.task, spec.role, 'context.md')).rejects.toThrow('round_budget_exhausted');
    const bindingPath = join(dir, 'binding.json');
    const records = ['binding.json', 'provider-created.json', 'terminal-created.json'].map(name => [join(dir, name), readFileSync(join(dir, name), 'utf8')] as const);
    for (const attached of [
      { ...binding, ownership: { disposition: 'attached' } },
      { ...binding, provider: { ...binding.provider, ownership: { disposition: 'attached' } } },
    ]) {
      api.writeSessionArtifact(bindingPath, attached, false);
      await expect(api.closeTaskAgent(fixture, spec.task, spec.role)).rejects.toThrow('attached_object_not_closeable');
      expect(live(binding.provider.pid)).toBe(true);
    }
    // A record that disagrees with hc on address, pid, name or labels closes nothing.
    const intentId = (binding.ownership as { intent_id: string }).intent_id;
    const parentPid = JSON.parse(hc(['get', '--json', parent])).pid as number;
    const otherProvider = { ...binding.provider, pid: parentPid, identity: processIdentity(parentPid) };
    const otherName = `task-${'0'.repeat(20)}`;
    for (const [tamper, refusal] of [
      [() => api.writeSessionArtifact(bindingPath, { ...binding, provider: { ...binding.provider, identity: binding.provider.identity + ' replaced' } }, false), 'process_identity_lost'],
      [() => api.writeSessionArtifact(bindingPath, { ...binding, terminal_id: parent }, false), 'terminal_identity_lost'],
      [() => { for (const name of ['binding.json', 'provider-created.json']) api.writeSessionArtifact(join(dir, name), { ...binding, provider: otherProvider }, false); }, 'terminal_identity_lost'],
      [() => { api.writeSessionArtifact(bindingPath, { ...binding, terminal_name: otherName }, false);
        api.writeSessionArtifact(join(dir, 'terminal-created.json'), { intent_id: intentId, terminal_id: binding.terminal_id, terminal_name: otherName }, false); }, 'terminal_identity_lost'],
      [() => hc(['label', '--json', '--', binding.terminal_id, 'repo-harness.request=replaced']), 'terminal_identity_lost'],
    ] as const) {
      tamper();
      await expect(api.closeTaskAgent(fixture, spec.task, spec.role)).rejects.toThrow(refusal);
      expect([live(binding.provider.pid), live(parentPid), existsSync(join(dir, 'close-intent.json'))]).toEqual([true, true, false]);
      for (const [path, text] of records) writeFileSync(path, text);
    }
    hc(['label', '--json', '--', binding.terminal_id, `repo-harness.request=${intentId}`]);
    // Herdr.app labels a terminal that it shows; identity reads only the repo-harness keys, so the close below succeeds.
    hc(['label', '--json', '--', binding.terminal_id, 'herdr.space=s1']);

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
    const pendingRequest = await send(crashSpec.task, crashSpec.role, 'context.md');
    expect(api.readTaskRequestResult(fixture, crashDir, pendingRequest)).toBeNull();
    expect(api.taskAgentStatus(fixture, crashSpec.task, crashSpec.role).status).toBe('pending');
    writeFileSync(join(fixture, 'context.md'), 'a replacement context must not replay');
    await expect(send(crashSpec.task, crashSpec.role, 'context.md')).rejects.toThrow('ambiguous_round');
    expect(existsSync(join(crashDir, 'request-2.json'))).toBe(false);
    await expect(api.closeTaskAgent(fixture, crashSpec.task, crashSpec.role)).rejects.toThrow('pending_request');
    await api.cancelTaskAgent(fixture, crashSpec.task, crashSpec.role);
    expect(await api.closeTaskAgent(fixture, spec.task, spec.role)).toEqual({ status: 'closed', pids: [] });
    expect(live(binding.provider.pid)).toBe(false);
    expect(gone(binding.terminal_id)).toBe(true);
    expect(JSON.parse(hc(['get', '--json', parent])).state).toBe('live');

    // One Git clone owns one task state, regardless of which checkout invokes.
    run('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--allow-empty', '-qm', 'base'], fixture, env);
    // Installed repos ignore runtime evidence; apply the same Git boundary to this minimal fixture.
    writeFileSync(join(fixture, '.git/info/exclude'), '.ai/harness/runs/\n');
    const checkout = join(fixture, 'linked-checkout');
    run('git', ['worktree', 'add', '-qb', 'codex/linked-test', checkout], fixture, env);
    mkdirSync(join(fixture, '.ai/harness/worktrees'), { recursive: true });
    writeFileSync(join(fixture, '.ai/harness/worktrees/linked-test.json'), `${JSON.stringify({ slug: 'linked-test', branch: 'codex/linked-test' })}\n`);
    const linkedSpec = { ...spec, role: 'linked-role', max_requests: 3 };
    const linkedPath = join(fixture, 'linked-spec.json'); writeFileSync(linkedPath, JSON.stringify(linkedSpec));
    const linkedOwner = owner('linked', linkedPath, checkout); await exited(linkedOwner.child);
    if (linkedOwner.child.exitCode !== 0) throw new Error(linkedOwner.errors());
    const fromPrimary = api.readTaskAgent(fixture, spec.task, linkedSpec.role) as { dir: string; binding: HerdrTaskBinding };
    const fromLinked = api.readTaskAgent(checkout, spec.task, linkedSpec.role) as { dir: string; binding: HerdrTaskBinding };
    expect(fromLinked.dir).toBe(fromPrimary.dir);
    expect(fromLinked.binding).toEqual(fromPrimary.binding);
    expect(fromPrimary.binding.execution_root).toBe(checkout);
    writeFileSync(join(fixture, 'context.md'), 'via-cli');
    const linkedRequest = await send(spec.task, linkedSpec.role, 'context.md');
    expect(linkedRequest.protocol).toBe(2);
    expect(linkedRequest.result_ref.startsWith(checkout + '/')).toBe(true);
    expect(readFileSync(linkedRequest.context_ref, 'utf8')).toBe('via-cli');
    writeFileSync(linkedRequest.result_ref, '{"request_id":');
    expect(api.readTaskRequestResult(fixture, fromPrimary.dir, linkedRequest)).toBeNull();
    const resultValue = {request_id:linkedRequest.request_id,context_sha256:linkedRequest.context_sha256,value:'artifact-result'};
    // The provider writes the result in its own checkout; the owner only collects it.
    api.writeSessionArtifact(linkedRequest.result_ref, resultValue, false);
    expect(existsSync(join(fromPrimary.dir,'result-1.json'))).toBe(false);
    expect(existsSync(join(fromPrimary.dir,'collected-1.json'))).toBe(false);
    expect(await api.collectTaskResult(fixture, spec.task, linkedSpec.role, 1)).toEqual(resultValue);
    expect(api.readSessionArtifact<typeof resultValue>(join(fromPrimary.dir,'collected-1.json'))).toEqual(resultValue);
    expect(api.readTaskRequestResult(checkout, fromLinked.dir, linkedRequest)?.value).toBe('artifact-result');
    await expect(send(spec.task, linkedSpec.role,'context.md','changed_only')).rejects.toThrow('duplicate_subject');
    const repeated=await send(spec.task, linkedSpec.role,'context.md');
    api.writeSessionArtifact(repeated.result_ref,{request_id:repeated.request_id,context_sha256:repeated.context_sha256,value:'artifact-result'},false);
    writeFileSync(join(fixture, 'context.md'), 'hold-result');
    await send(spec.task, linkedSpec.role, 'context.md');
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
    expect(gone(fromPrimary.binding.terminal_id)).toBe(true);

    // A fresh start request in the retired shape is refused before any directory, intent or terminal exists.
    const parentRequest = { ...spec, role: 'parent-request', parent_terminal: parent };
    await expect(api.startTaskAgent(fixture, parentRequest, refuseLaunch)).rejects.toThrow('task_agent_classic_herdr_record_retired');
    expect(existsSync(api.taskSessionDirectory(fixture, spec.task, 'parent-request'))).toBe(false);
    // A crash after intent created no terminal; the start reconciles and never launches.
    expect(await started('intent-only', 'intent-crash')).toBe(78);
    await expect(api.startTaskAgent(fixture, { ...spec, role: 'intent-only' }, refuseLaunch)).rejects.toThrow('start_reconciliation_required');
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\ncrash-role\nlinked-role\n');
    expect(await api.closeTaskAgent(fixture, spec.task, 'intent-only')).toEqual({ status: 'closed', pids: [] });
    expect(api.taskAgentStatus(fixture, spec.task, 'intent-only').status).toBe('closed');
    // A crash after the terminal started leaves no binding; cleanup finds the terminal by its labels.
    expect(await started('ambiguous-role', 'ready-crash')).toBe(79);
    await expect(api.startTaskAgent(fixture, { ...spec, role: 'ambiguous-role' }, refuseLaunch)).rejects.toThrow('start_reconciliation_required');
    expect(api.taskAgentStatus(fixture, spec.task, 'ambiguous-role').status).toBe('reconciliation_required');
    expect(readFileSync(join(fixture, 'launches'), 'utf8')).toBe('advisor\ncrash-role\nlinked-role\nambiguous-role\n');
    const unboundPid = JSON.parse(readFileSync(join(fixture, 'ambiguous-role.ready'), 'utf8')).pid;
    const unbound = api.readSessionArtifact<{ terminal_id: string }>(join(api.taskSessionDirectory(fixture, spec.task, 'ambiguous-role'), 'terminal-created.json'));
    // A recorded terminal that no longer has this start's labels is not removed.
    hc(['label', '--json', '--', unbound.terminal_id, 'repo-harness.request=another-start']);
    await expect(api.closeTaskAgent(fixture, spec.task, 'ambiguous-role')).rejects.toThrow('terminal_identity_lost');
    expect([gone(unbound.terminal_id), live(unboundPid)]).toEqual([false, true]);
    const unboundIntent = api.readSessionArtifact<{ intent_id: string }>(join(api.taskSessionDirectory(fixture, spec.task, 'ambiguous-role'), 'intent.json'));
    hc(['label', '--json', '--', unbound.terminal_id, `repo-harness.request=${unboundIntent.intent_id}`]);
    expect(await api.closeTaskAgent(fixture, spec.task, 'ambiguous-role')).toEqual({ status: 'closed', pids: [] });
    expect(live(unboundPid)).toBe(false);
    expect(gone(unbound.terminal_id)).toBe(true);
    expect(api.taskAgentStatus(fixture, spec.task, 'ambiguous-role').status).toBe('closed');

    // #754: the program leads its group and is the provider, not its child. hc kill
    // ends the child that ignores TERM and hangup with the leader; cleanup sends no signal.
    await started('grouped');
    const leaderPid = JSON.parse(readFileSync(join(fixture, 'grouped.ready'), 'utf8')).pid;
    const childPid = Number(readFileSync(join(fixture, 'grouped.ready.child'), 'utf8'));
    const grouped = api.readTaskAgent(fixture, spec.task, 'grouped').binding as HerdrTaskBinding;
    expect(grouped.provider.pid).toBe(leaderPid);
    expect(run('ps', ['-p', String(childPid), '-o', 'pgid='], fixture, env)).toBe(String(leaderPid));
    expect(await api.cancelTaskAgent(fixture, spec.task, 'grouped')).toEqual({ status: 'closed', pids: [] });
    expect([live(leaderPid), live(childPid), gone(grouped.terminal_id)]).toEqual([false, false, true]);
  } finally {
    for (const child of owners) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      await exited(child);
    }
    // A failed group cleanup must not leave the TERM/HUP-resistant child on the host.
    const childFile = join(fixture, 'grouped.ready.child');
    if (existsSync(childFile)) { try { process.kill(Number(readFileSync(childFile, 'utf8')), 'SIGKILL'); } catch { /* Already absent. */ } }
  }
}), 60_000);

test('workspace registration records the hc endpoint through the Bash consumer and refuses classic records', () => withCore('tr', async ({ fixture, env, endpoint }) => {
  const api = { ...await import('../src/effects/terminal/task-session'), ...await import('../src/effects/terminal/task-session-record'), ...await import('../src/effects/terminal/task-session-io') };
  run('git', ['init', '-q', '-b', 'main'], fixture, env);
  run('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@localhost', 'commit', '--allow-empty', '-qm', 'base'], fixture, env);
  const checkout = join(fixture, 'recover'); run('git', ['worktree', 'add', '-qb', 'codex/recover', checkout], fixture, env);
  expect(await api.cleanupTaskWorktree(fixture, checkout)).toEqual({ status: 'not_registered', pids: [] });
  const first = await api.registerTaskWorktree(checkout, endpoint);
  expect(first).toEqual({ protocol: 2, repository: taskRepository(checkout), endpoint });
  expect(await api.registerTaskWorktree(checkout, endpoint)).toEqual(first);
  await expect(api.registerTaskWorktree(checkout, { socket: join(fixture, 'other.sock') })).rejects.toThrow('task_agent_workspace_endpoint_changed');
  expect((await api.cleanupTaskWorktree(fixture, checkout)).status).toBe('closed');
  // A closed incarnation moves to history; the next registration writes a new one.
  expect(await api.registerTaskWorktree(checkout, endpoint)).toEqual(first);
  expect(readdirSync(join(api.workspaceDirectory(taskRepository(checkout)), 'history'))).toHaveLength(1);
  expect((await api.cleanupTaskWorktree(fixture, checkout)).status).toBe('closed');

  copyHelpers(fixture);
  const shim = join(fixture, 'shim'); mkdirSync(shim);
  writeFileSync(join(shim, 'gh'), `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify({ number: 123, title: 'Recover fixture', state: 'OPEN', url: 'https://github.com/example/repo/issues/123' })}'\n`); chmodSync(join(shim, 'gh'), 0o755);
  const endpointFile = join(fixture, 'endpoint.json'), target = join(fixture, 'bash-checkout');
  const start = (address: object) => {
    writeFileSync(endpointFile, JSON.stringify(address));
    return spawnSync('bash', [join(fixture, 'scripts/contract-worktree.sh'), 'start', '--issue', '123', '--path', target, '--herdr-endpoint', endpointFile],
      { cwd: fixture, env: { ...env, PATH: shim + ':' + env.PATH, REPO_HARNESS_TARGET_REPO_ROOT: fixture }, encoding: 'utf8', timeout: 20000 });
  };
  // A failed registration preserves the checkout; the same start then registers it.
  // An address file that still names a parent terminal is a retired classic shape.
  const failed = start({ endpoint, parent_terminal: 't99' });
  expect(failed.status).toBe(1); expect(existsSync(target)).toBe(true);
  expect(failed.stderr + failed.stdout).toContain('task_agent_classic_herdr_record_retired');
  expect(existsSync(join(api.workspaceDirectory(taskRepository(target)), 'binding.json'))).toBe(false);
  const retried = start({ endpoint });
  if (retried.status !== 0) throw new Error(retried.stderr + retried.stdout);
  expect(api.readSessionArtifact(join(api.workspaceDirectory(taskRepository(target)), 'binding.json'))).toEqual({ protocol: 2, repository: taskRepository(target), endpoint });
  expect(existsSync(join(fixture, '.ai/harness/worktrees/123-recover-fixture.json'))).toBe(true);
  expect((await api.cleanupTaskWorktree(fixture, target)).status).toBe('closed');

  // #1476: classic Herdr records fail closed. They come last: any classic intent stops worktree cleanup.
  const retired = /task_agent_classic_herdr_record_retired: .+ start the session again/;
  const classicCheckout = join(fixture, 'classic'); run('git', ['worktree', 'add', '-qb', 'codex/classic', classicCheckout], fixture, env);
  const classicWorkspace = api.workspaceDirectory(taskRepository(classicCheckout)); mkdirSync(classicWorkspace, { recursive: true });
  writeFileSync(join(classicWorkspace, 'binding.json'), JSON.stringify({ protocol: 1, workspace_id: 'w1', endpoint: { session: 'task-proof-0000000000000000' } }));
  await expect(api.registerTaskWorktree(classicCheckout, endpoint)).rejects.toThrow(retired);
  const classicSpec = { task: 'classic-task', role: 'advisor', harness_kind: 'codex', endpoint, args: [], max_requests: 1 };
  const sessionDir = api.taskSessionDirectory(fixture, classicSpec.task, classicSpec.role); mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, 'intent.json'), JSON.stringify({ protocol: 2, runtime: 'herdr', intent_id: randomUUID(), spec: classicSpec }));
  writeFileSync(join(sessionDir, 'binding.json'), JSON.stringify({ protocol: 2, runtime: 'herdr', repository_id: taskRepository(fixture).repository_id, execution_root: fixture,
    task: classicSpec.task, role: classicSpec.role, harness_kind: 'codex', endpoint: { session: 'task-proof-0000000000000000' }, workspace_id: 'w1', pane_id: 'w1:p2', agent_name: 'advisor', max_requests: 1 }));
  expect(() => api.readTaskAgent(fixture, classicSpec.task, classicSpec.role)).toThrow(retired);
  await expect(api.startTaskAgent(fixture, classicSpec, { argv: ['/usr/bin/false'], ready: async () => { throw new Error('fixture_must_not_launch'); } })).rejects.toThrow(retired);
  await expect(api.closeTaskAgent(fixture, classicSpec.task, classicSpec.role)).rejects.toThrow(retired);
}), 60_000);

darwinTest('OAR fixed host runs visibly in a private hc terminal and disposes before owned terminal cleanup', () => withCore('oh', async ({ fixture, env, endpoint, hc, parent: parentTerminal }) => {
  const api = { ...await import('../src/effects/terminal/task-session'), ...await import('../src/effects/terminal/task-session-record'), ...await import('../src/effects/terminal/task-session-io') };
  const { reviewIsolationPolicy, reviewHostCommand } = await import('../src/effects/review/review-isolation');
  const repo = join(fixture, 'p'), output = join(fixture, 'out');
  for (const path of [repo, output]) mkdirSync(path);
  run('git', ['init', '-qb', 'main'], repo, env);
  run('git', ['-c','user.name=fixture','-c','user.email=fixture@localhost','commit','--allow-empty','-qm','fixture'], repo, env);
  const closeRequest = join(output, 'close.request'), readyFile = join(output, 'ready.json'), disposedFile = join(output, 'disposed.json');
  const specFile = join(fixture, 'fixture.json'), profile = join(fixture, 'profile.sb');
  const paths = { subject: repo, primary: repo, ownerRecord: repo, journal: repo, gitCommonDir: join(repo,'.git'), output };
  writeFileSync(profile, reviewIsolationPolicy(paths));
  writeFileSync(specFile, JSON.stringify({ mode: 'scripted', cwd: repo, inputs: ['one','two','three'], closeRequest, readyFile, disposedFile, isolation: { paths, policyFile: profile } }));
  const priorFlag = process.env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE;
  process.env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE='1';
  let binding: Awaited<ReturnType<typeof api.startTaskApplicationHost>> | undefined;
  try {
    const parent = await parentTerminal(repo);
    const command = reviewHostCommand(realpathSync('/opt/homebrew/opt/node@24/bin/node'), realpathSync(join(import.meta.dir,'../dist/oar-review-host.js')), specFile);
    binding = await api.startTaskApplicationHost(repo, { task:'oar-fixture', role:'deep-reasoner', harness_kind:'codex', endpoint,
      args:[], max_requests:3 }, command, async () => { await until(() => existsSync(readyFile)); });
    expect(binding.provider.pid).toBe(JSON.parse(readFileSync(readyFile,'utf8')).pid);
    const screen = () => hc(['read', binding!.terminal_id, '--lines', '200']);
    expect(screen()).toContain('fixture-oar');
    await until(() => screen().includes('OAR_HOST_ROUNDS_DONE_FIXTURE'));
    writeFileSync(closeRequest, 'close');
    await until(() => existsSync(disposedFile));
    await until(() => !live(binding!.provider.pid));
    expect((await api.cancelTaskAgent(repo,'oar-fixture','deep-reasoner')).status).toBe('closed');
    expect(JSON.parse(hc(['get', '--json', parent])).state).toBe('live');
  } finally {
    writeFileSync(closeRequest,'close');
    if (binding && live(binding.provider.pid)) { await until(() => !live(binding!.provider.pid)); }
    if(priorFlag===undefined)delete process.env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE;else process.env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE=priorFlag;
  }
}, { REPO_HARNESS_OAR_SCRIPTED_FIXTURE: '1' }), 60000);

for (const admitted of [false, true]) darwinTest(`operator-terminal OAR host binds by exact command and process identity without Herdr (${admitted ? 'approved task' : 'generic runtime'})`, async () => {
  const api = { ...await import('../src/effects/terminal/task-session'), ...await import('../src/effects/terminal/task-session-record'), ...await import('../src/effects/terminal/task-session-io') };
  const { reviewIsolationPolicy, reviewHostCommand } = await import('../src/effects/review/review-isolation');
  const fixture = realpathSync(mkdtempSync('/tmp/ot-'));
  const repo = join(fixture, 'p'), output = join(fixture, 'out');
  for (const path of [repo, output]) mkdirSync(path);
  const env = { ...process.env, REPO_HARNESS_OAR_SCRIPTED_FIXTURE: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  run('git', ['init', '-qb', 'main'], repo, env);
  run('git', ['-c','user.name=fixture','-c','user.email=fixture@localhost','commit','--allow-empty','-qm','fixture'], repo, env);
  const home = join(fixture, 'authority');
  mkdirSync(home, { mode: 0o700 });
  const claim = { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-1', revision: `sha256:${'c'.repeat(64)}` };
  let taskAuthority = admitted ? { source: seedReviewAdmissionFixture(repo, home).source, claim } : undefined;
  const closeRequest = join(output, 'close.request'), readyFile = join(output, 'ready.json'), disposedFile = join(output, 'disposed.json');
  const specFile = join(fixture, 'fixture.json'), profile = join(fixture, 'profile.sb');
  const paths = { subject: repo, primary: repo, ownerRecord: repo, journal: repo, gitCommonDir: join(repo,'.git'), output };
  writeFileSync(profile, reviewIsolationPolicy(paths));
  writeFileSync(specFile, JSON.stringify({ mode: 'scripted', cwd: repo, inputs: [], closeRequest, readyFile, disposedFile, isolation: { paths, policyFile: profile } }));
  const command = reviewHostCommand(realpathSync(Bun.which('node')!), realpathSync(join(import.meta.dir,'../dist/oar-review-host.js')), specFile);
  const spec = { task: 'oar-terminal', role: 'deep-reasoner', harness_kind: 'codex', max_requests: 3 };
  const proof = (pid: number) => ({ pid, identity: api.processIdentity(pid) });
  const readyPid = async () => { await until(() => existsSync(readyFile)); return proof(JSON.parse(readFileSync(readyFile, 'utf8')).pid); };
  let host: ChildProcess | undefined;
  try {
    // Nothing launched: the owner returns without a binding and never starts a process.
    expect(await api.bindTerminalApplicationHost(repo, spec, command, async () => null, taskAuthority)).toBeNull();
    expect(api.taskAgentStatus(repo, spec.task, spec.role).status).toBe('launch_pending');
    await expect(api.bindTerminalApplicationHost(repo, spec, [...command.slice(0, 3), join(fixture, 'other.json')], async () => null, taskAuthority)).rejects.toThrow('task_agent_spec_changed');
    // A process with other argv is refused even when it is live and owned by this user.
    await expect(api.bindTerminalApplicationHost(repo, { ...spec, task: 'oar-terminal-other' }, command, async () => proof(process.pid), taskAuthority)).rejects.toThrow('task_agent_terminal_host_command_mismatch');

    host = spawn(command[0]!, command.slice(1), { env, stdio: 'ignore' });
    const binding = await api.bindTerminalApplicationHost(repo, spec, command, readyPid, taskAuthority);
    if (binding?.runtime !== 'terminal') throw new Error('fixture_terminal_binding_missing');
    expect(binding.provider.pid).toBe(host.pid!);
    expect(binding.command).toEqual([...command]);
    expect(await api.bindTerminalApplicationHost(repo, spec, command, async () => { throw new Error('must not observe again'); }, taskAuthority)).toEqual(binding);
    expect(api.readTaskAgent(repo, spec.task, spec.role).binding).toEqual(binding);
    expect(api.taskAgentStatus(repo, spec.task, spec.role).status).toBe('idle');
    if (taskAuthority) {
      // The native host supplies real argv/process ownership. Deterministic
      // application delivery supplies only result bytes, never bindings or requests.
      writeFileSync(join(repo, 'context.txt'), 'offline admitted context\n');
      const delivered: number[] = [];
      const deliver = async (request: import('../src/core/review/runner-port').TaskRequest) => {
        expect(readFileSync(request.context_ref, 'utf8')).toBe('offline admitted context\n');
        delivered.push(request.round);
        api.writeSessionArtifact(request.result_ref, { request_id: request.request_id,
          context_sha256: request.context_sha256, value: { fixture: 'offline-application-delivery', round: request.round } });
      };
      const send = () => api.sendTaskRequest(repo, spec.task, spec.role, 'context.txt', 'repeatable', deliver, undefined, undefined, taskAuthority);
      const first = await send();
      expect(first.round).toBe(1);
      expect((await api.collectTaskResult(repo, spec.task, spec.role, first.round, undefined, taskAuthority))?.value)
        .toEqual({ fixture: 'offline-application-delivery', round: 1 });
      const pending = await send();
      expect(pending.round).toBe(2);
      const previous = taskAuthority;
      taskAuthority = { source: seedReviewAdmissionFixture(repo, home).source, claim };
      expect(taskAuthority.source.expectedGrantSha256).not.toBe(previous.source.expectedGrantSha256);
      await expect(api.collectTaskResult(repo, spec.task, spec.role, pending.round, undefined, previous)).rejects.toThrow('revoked_or_replaced');
      await expect(api.collectTaskResult(repo, spec.task, spec.role, pending.round, undefined, taskAuthority)).rejects.toThrow('request_context_changed');
      await expect(api.sendTaskRequest(repo, spec.task, spec.role, 'context.txt', 'repeatable', deliver, undefined, undefined, previous)).rejects.toThrow('revoked_or_replaced');
      expect(await api.bindTerminalApplicationHost(repo, spec, command, async () => { throw new Error('must not relaunch'); }, taskAuthority)).toEqual(binding);
      const next = await send();
      expect(next.round).toBe(3);
      expect(next.task_admission!.identity).toEqual(first.task_admission!.identity);
      expect(next.session_binding_sha256).toBe(first.session_binding_sha256);
      expect(next.task_admission!.approval.admission_sha256).toBe(first.task_admission!.approval.admission_sha256);
      expect(next.task_admission!.approval.grant_sha256).not.toBe(first.task_admission!.approval.grant_sha256);
      expect((await api.collectTaskResult(repo, spec.task, spec.role, next.round, undefined, taskAuthority))?.value)
        .toEqual({ fixture: 'offline-application-delivery', round: 3 });
      await expect(send()).rejects.toThrow('round_budget_exhausted');
      expect(delivered).toEqual([1, 2, 3]);
      expect(api.readTaskAgent(repo, spec.task, spec.role).binding).toEqual(binding);
    }
    // Cleanup never signals the operator's process; it waits for the host's own disposal and exit.
    expect(await api.cancelTaskAgent(repo, spec.task, spec.role)).toEqual({ status: 'cleanup_pending', pids: [host.pid!], reason: 'terminal_host_alive' });
    // Closing the operator's tab sends SIGHUP; the host still disposes before it exits.
    process.kill(host.pid!, 'SIGHUP');
    await until(() => existsSync(disposedFile));
    await until(() => !live(host!.pid!));
    expect((await api.cancelTaskAgent(repo, spec.task, spec.role)).status).toBe('closed');
    await expect(api.bindTerminalApplicationHost(repo, spec, command, readyPid, taskAuthority)).rejects.toThrow('task_agent_session_closed');
  } finally {
    writeFileSync(closeRequest, 'close');
    if (host?.pid && live(host.pid)) await until(() => !live(host!.pid!));
    rmSync(fixture, { recursive: true, force: true });
  }
}, 60000);

// A real parent retains its dead child until the caller explicitly asks it to reap.
// No Herdr/provider/model is involved; Python's Popen only waits after stdin.
test.skipIf(process.platform === 'win32' || !Bun.which('python3'))('unreaped owned child is exited while forged PID and birth identities still fail closed', async () => {
  const parent = spawn(Bun.which('python3')!, ['-u', '-c', `
import json, subprocess, sys
child = subprocess.Popen([sys.argv[1], '60'], start_new_session=True)
print(json.dumps({'pid':child.pid}), flush=True)
try:
    sys.stdin.readline()
finally:
    if child.poll() is None:
        child.kill()
    child.wait(timeout=10)
`, Bun.which('sleep')!], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  try {
    const pid = await new Promise<number>((resolve, reject) => {
      parent.once('error', reject);
      parent.stdout!.on('data', chunk => { output += chunk; if (output.includes('\n')) resolve(JSON.parse(output.split('\n')[0]!).pid); });
    });
    const proof = { pid, identity: processIdentity(pid) };
    expect(processProofAlive(proof)).toBe(true);
    expect(() => processProofAlive({ ...proof, identity: proof.identity + '-changed' })).toThrow('identity_lost');
    process.kill(pid, 'SIGTERM');
    const deadline = Date.now() + 5000;
    let stat = '';
    while (Date.now() < deadline) {
      stat = execFileSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim();
      if (stat.startsWith('Z')) break;
      await Bun.sleep(10);
    }
    expect(stat.startsWith('Z')).toBe(true);
    expect(() => process.kill(pid, 0)).not.toThrow(); // Not yet reaped, independent OS oracle.
    expect(processProofAlive(proof)).toBe(false);
    const pieces = proof.identity.split(/\s+/);
    const differentBirth = [...pieces]; differentBirth[6] = '1900';
    expect(() => processProofAlive({ pid, identity: differentBirth.join(' ') })).toThrow('identity_lost');
    expect(() => processProofAlive({ pid: process.pid, identity: proof.identity })).toThrow('identity_lost');
  } finally {
    parent.stdin!.end('reap\n');
    await new Promise<void>(resolve => { if (parent.exitCode !== null || parent.signalCode !== null) resolve(); else parent.once('exit', () => resolve()); });
  }
}, 15_000);

test.skipIf(process.platform === 'win32')('process proof rejects birth changes between identity and live-state snapshots', () => {
  const proof = { pid: process.pid, identity: processIdentity(process.pid) };
  const root = mkdtempSync('/tmp/ps-'); const savedPath = process.env.PATH;
  try {
    const columns = proof.identity.split(/\s+/).slice(0, 7); columns[6] = '1900';
    const altered = columns.join(' ') + ' S';
    const reply = (identity: string, state: string) => {
      writeFileSync(join(root, 'ps'), `#!${process.execPath}\nprocess.stdout.write(process.argv.at(-1).endsWith('stat=') ? ${JSON.stringify(state + '\n')} : ${JSON.stringify(identity + '\n')});\n`);
      chmodSync(join(root, 'ps'), 0o700);
    };
    reply(proof.identity, altered); process.env.PATH = root + ':' + savedPath;
    expect(() => processProofAlive(proof)).toThrow('identity_lost');
    if (process.platform === 'darwin') {
      const prefix = proof.identity.split(/\s+/).slice(0, 7).join(' ');
      const codexProof = { pid: proof.pid, identity: prefix + ' codex' };
      reply(prefix + ' (codex)', prefix + ' ?E+');
      expect(processProofAlive(codexProof)).toBe(false);
      reply(prefix + ' (codex)', prefix + ' S+');
      expect(() => processProofAlive(codexProof)).toThrow('identity_lost');
    }
  } finally { process.env.PATH = savedPath; rmSync(root, { recursive: true, force: true }); }
});
