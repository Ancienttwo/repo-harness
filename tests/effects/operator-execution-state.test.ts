import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import { buildTaskFollowUp, decodeTaskExecutionView, projectTaskExecutionView, type TaskExecutionViewV1, type UnverifiedExecutionReason } from '../../src/core/operator/execution-state';
import { collectTaskExecutionStates } from '../../src/effects/operator/execution-state';
import { executionChildEnvironment, startExecutionCollector, type ExecutionRepositoryCache } from '../../src/effects/operator/execution-collector';
import { startOperatorServer } from '../../src/effects/operator/server';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { runSetupProcess, type SetupProcessRunner } from '../../src/effects/setup/collector';
import { writeNotifyInstallRecord } from '../../src/effects/terminal/herdr-notify-install';
import { bindNativeTaskSession } from '../../src/effects/terminal/native-task-session';
import { bindTaskRuntimeFixture } from '../helpers/engineer-runtime-fixture';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(value)))).digest('hex')}`;
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

async function fixture(options: { native?: boolean } = {}) {
  const root = tmpWorkspace('operator-execution-state'); roots.push(root); initGitRepo(root);
  run('git', ['remote', 'add', 'origin', 'https://github.com/acme/widgets.git'], root);
  writeFileSync(join(root, 'README.md'), 'fixture'); commitAll(root, 'initial');
  const home = tmpWorkspace('operator-execution-state-authority'); roots.push(home);
  const bound = await bindTaskRuntimeFixture(root, { authorityHome: home, repositoryId: '123456', issueId: '987654' });
  if (options.native !== false) {
    const ready = join(root, 'controlled-ready.json');
    writeFileSync(ready, JSON.stringify({ pid: bound.binding.provider.pid, session_id: '0199a2b4-7c3e-7d10-9f00-3a5b6c7d8e9f', fixture: false }));
    bindNativeTaskSession({ repo_root: root, binding: bound.binding, ready_path: ready });
  }
  return { root, home, bound };
}

/** Rewrite every record that names the provider, so only the process check can refuse it. */
function replaceProvider(dir: string, provider: { pid: number; identity: string }) {
  const binding = readJson(join(dir, 'binding.json'));
  binding.provider = { ...binding.provider, ...provider };
  writeFileSync(join(dir, 'binding.json'), JSON.stringify(binding));
  const created = readJson(join(dir, 'provider-created.json'));
  writeFileSync(join(dir, 'provider-created.json'), JSON.stringify({ ...created, provider: binding.provider }));
  const native = readJson(join(dir, 'native-session.json'));
  writeFileSync(join(dir, 'native-session.json'), JSON.stringify({ ...native, provider, session_binding_sha256: digest(binding) }));
}

/** A generic runtime binding has no task admission: remove it from every record that holds it. */
function dropAdmission(dir: string) {
  const binding = readJson(join(dir, 'binding.json'));
  delete binding.task_admission;
  writeFileSync(join(dir, 'binding.json'), JSON.stringify(binding));
  const intent = readJson(join(dir, 'intent.json'));
  delete intent.task_admission;
  writeFileSync(join(dir, 'intent.json'), JSON.stringify(intent));
  const native = readJson(join(dir, 'native-session.json'));
  writeFileSync(join(dir, 'native-session.json'), JSON.stringify({ ...native, session_binding_sha256: digest(binding) }));
}

test('a fully consistent live session gives the agent, its pane and the follow-up commands', async () => {
  const f = await fixture();
  const snapshot = collectTaskExecutionStates(f.root);
  expect(snapshot).toMatchObject({ protocol: 1, kind: 'operator_task_execution' });
  expect(snapshot.executions).toEqual([{
    state: 'verified', task: f.bound.binding.task, role: f.bound.binding.role, issue_id: '987654', branch: 'main',
    agent: 'codex', runtime: 'herdr', native_session_id: '0199a2b4-7c3e-7d10-9f00-3a5b6c7d8e9f',
    herdr_pane: { session: 'fixture', workspace_id: 'fixture-primary-workspace', pane_id: 'fixture-deep-reasoner', agent_name: f.bound.binding.runtime === 'herdr' ? f.bound.binding.agent_name : '' },
  }]);
  const wire = JSON.stringify(snapshot);
  expect(wire).not.toContain(f.root);
  expect(wire).not.toContain(f.home);
  expect(wire).not.toContain('/tmp');
  expect(buildTaskFollowUp(snapshot.executions[0]!)).toEqual({
    task_id: f.bound.binding.task,
    resume: { host: 'codex', command: 'codex resume 0199a2b4-7c3e-7d10-9f00-3a5b6c7d8e9f' },
    herdr_pane: snapshot.executions[0]!.state === 'verified' ? snapshot.executions[0]!.herdr_pane : null,
  });
});

test('a forged binding has no verified session', async () => {
  const f = await fixture();
  const path = join(f.bound.dir, 'binding.json');
  writeFileSync(path, JSON.stringify({ ...readJson(path), agent_name: 'forged-agent' }));
  const [execution] = collectTaskExecutionStates(f.root).executions;
  expect(execution).toEqual({ state: 'unverified', task: f.bound.binding.task, role: f.bound.binding.role, reason: 'binding_mismatch' });
  expect(buildTaskFollowUp(execution!)).toEqual({ task_id: f.bound.binding.task, resume: null, herdr_pane: null });
});

test('a binding in a directory that its task and role do not select is not reported', async () => {
  const f = await fixture();
  const foreign = join(f.bound.dir, '..', 'f'.repeat(64));
  mkdirSync(foreign, { mode: 0o700 });
  for (const name of ['binding.json', 'native-session.json']) writeFileSync(join(foreign, name), readFileSync(join(f.bound.dir, name)));
  const executions = collectTaskExecutionStates(f.root).executions;
  expect(executions).toHaveLength(1);
  expect(executions[0]).toMatchObject({ state: 'verified' });
});

test('a dead provider process has no verified session', async () => {
  const f = await fixture();
  const exited = spawnSync('/bin/sh', ['-c', 'echo $$'], { encoding: 'utf8' });
  const pid = Number(exited.stdout.trim());
  replaceProvider(f.bound.dir, { pid, identity: `${pid} ${pid} Mon Oct 26 10:00:00 2026 sh` });
  expect(collectTaskExecutionStates(f.root).executions).toEqual([
    { state: 'unverified', task: f.bound.binding.task, role: f.bound.binding.role, reason: 'provider_exited' },
  ]);
});

test('a live PID with another start time is a reused PID and has no verified session', async () => {
  const f = await fixture();
  const recorded = f.bound.binding.provider.identity.split(/\s+/);
  const reused = [...recorded.slice(0, 2), 'Thu', 'Jan', '1', '00:00:00', '2015', ...recorded.slice(7)].join(' ');
  replaceProvider(f.bound.dir, { pid: f.bound.binding.provider.pid, identity: reused });
  expect(collectTaskExecutionStates(f.root).executions).toEqual([
    { state: 'unverified', task: f.bound.binding.task, role: f.bound.binding.role, reason: 'provider_identity_lost' },
  ]);
});

test('a closed session has no verified session', async () => {
  const f = await fixture();
  writeFileSync(join(f.bound.dir, 'closed.json'), '{}');
  expect(collectTaskExecutionStates(f.root).executions).toEqual([
    { state: 'unverified', task: f.bound.binding.task, role: f.bound.binding.role, reason: 'closed' },
  ]);
});

test('a session without a native session record, or with one for another binding, has no verified session', async () => {
  const f = await fixture({ native: false });
  const expectReason = (reason: UnverifiedExecutionReason) => expect(collectTaskExecutionStates(f.root).executions).toEqual([
    { state: 'unverified', task: f.bound.binding.task, role: f.bound.binding.role, reason },
  ]);
  expectReason('native_session_missing');
  const ready = join(f.root, 'controlled-ready.json');
  writeFileSync(ready, JSON.stringify({ pid: f.bound.binding.provider.pid, session_id: 'thread-1', fixture: false }));
  bindNativeTaskSession({ repo_root: f.root, binding: f.bound.binding, ready_path: ready });
  const path = join(f.bound.dir, 'native-session.json');
  writeFileSync(path, JSON.stringify({ ...readJson(path), role: 'another-role' }));
  expectReason('native_session_mismatch');
});

test('a verified session names its admitted branch, and a session without admission names none', async () => {
  const f = await fixture();
  expect(collectTaskExecutionStates(f.root).executions).toMatchObject([{ state: 'verified', issue_id: '987654', branch: 'main' }]);
  dropAdmission(f.bound.dir);
  expect(collectTaskExecutionStates(f.root).executions).toMatchObject([{ state: 'verified', issue_id: null, branch: null }]);
});

test('a repository without task sessions has an empty snapshot', () => {
  const root = tmpWorkspace('operator-execution-state-empty'); roots.push(root); initGitRepo(root);
  writeFileSync(join(root, 'README.md'), 'fixture'); commitAll(root, 'initial');
  expect(collectTaskExecutionStates(root).executions).toEqual([]);
});

test('follow-up gives each host its own resume command and refuses an id that is not one shell word', () => {
  const base = { state: 'verified' as const, task: 'a'.repeat(64), role: 'deep-reasoner', issue_id: null, branch: null, runtime: 'terminal' as const, herdr_pane: null };
  expect(buildTaskFollowUp({ ...base, agent: 'claude', native_session_id: '5f0c1e2a-0000-4000-8000-000000000001' }).resume)
    .toEqual({ host: 'claude', command: 'claude --resume 5f0c1e2a-0000-4000-8000-000000000001' });
  expect(buildTaskFollowUp({ ...base, agent: 'codex', native_session_id: 'thread; rm -rf ~' }))
    .toEqual({ task_id: 'a'.repeat(64), resume: null, herdr_pane: null });
});

/** A repo-harness home that registers the fixture repository, so the collector reads it. */
function collectorHome(root: string, session: string | null = 'fixture') {
  const home = tmpWorkspace('operator-execution-collector-home'); roots.push(home);
  const at = new Date().toISOString();
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{
    id: repoHarnessRepoIdFor(root), path: root, accessMode: 'read_only', source: 'manual', registeredAt: at, lastSeenAt: at,
  }] }));
  const env = { ...process.env, REPO_HARNESS_HOME: home };
  if (session !== null) writeNotifyInstallRecord(session, env);
  return { id: repoHarnessRepoIdFor(root), env };
}

async function served(env: NodeJS.ProcessEnv, id: string) {
  const server = await startOperatorServer({ port: 0, env, execution_collector: true });
  try {
    let response = await fetch(`${server.url}/api/v1/repositories/${id}/execution`);
    // The first cycle runs in a child process; until it ends the route is pending, never empty.
    for (let attempt = 0; attempt < 400 && response.status === 503; attempt++) {
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('execution_state_pending');
      await Bun.sleep(25);
      response = await fetch(`${server.url}/api/v1/repositories/${id}/execution`);
    }
    return { status: response.status, text: await response.text() };
  } finally { await server.close(); }
}

test('the route shows the agent of a verified session with its follow-up, and no path', async () => {
  const f = await fixture();
  const c = collectorHome(f.root);
  const { status, text } = await served(c.env, c.id);
  expect(status).toBe(200);
  const view = decodeTaskExecutionView(JSON.parse(text));
  expect(view).toMatchObject({ protocol: 1, kind: 'operator_task_execution', repository_id: c.id, unlisted_tasks: 0 });
  expect(view.tasks).toEqual([{ state: 'verified', task: f.bound.binding.task, role: f.bound.binding.role, issue_id: '987654', branch: 'main', agent: 'codex', runtime: 'herdr',
    follow_up: { task_id: f.bound.binding.task, resume: { host: 'codex', command: 'codex resume 0199a2b4-7c3e-7d10-9f00-3a5b6c7d8e9f' },
      herdr_pane: { session: 'fixture', workspace_id: 'fixture-primary-workspace', pane_id: 'fixture-deep-reasoner', agent_name: f.bound.binding.runtime === 'herdr' ? f.bound.binding.agent_name : '' } } }]);
  for (const hidden of [f.root, f.home, '/tmp', '/private']) expect(text).not.toContain(hidden);
});

test('through the route, a forged binding, a dead process or closed.json is "no verified session"', async () => {
  const cases: [string, (dir: string) => void, UnverifiedExecutionReason][] = [
    ['forged binding', dir => { const path = join(dir, 'binding.json'); writeFileSync(path, JSON.stringify({ ...readJson(path), agent_name: 'forged-agent' })); }, 'binding_mismatch'],
    ['dead process', dir => {
      const pid = Number(spawnSync('/bin/sh', ['-c', 'echo $$'], { encoding: 'utf8' }).stdout.trim());
      replaceProvider(dir, { pid, identity: `${pid} ${pid} Mon Oct 26 10:00:00 2026 sh` });
    }, 'provider_exited'],
    ['closed.json', dir => writeFileSync(join(dir, 'closed.json'), '{}'), 'closed'],
  ];
  for (const [, change, reason] of cases) {
    const f = await fixture();
    change(f.bound.dir);
    const c = collectorHome(f.root);
    const { status, text } = await served(c.env, c.id);
    expect(status).toBe(200);
    expect(decodeTaskExecutionView(JSON.parse(text)).tasks).toEqual([{ state: 'unverified', task: f.bound.binding.task, role: f.bound.binding.role, reason,
      follow_up: { task_id: f.bound.binding.task, resume: null, herdr_pane: null } }]);
    expect(text).not.toContain('codex resume');
  }
});

test('a Herdr pane location needs the session that the notify install record names', async () => {
  const f = await fixture();
  for (const session of [null, 'other-session']) {
    const c = collectorHome(f.root, session);
    const collector = startExecutionCollector({ env: { ...c.env, HERDR_SESSION: 'fixture' }, interval_ms: 60_000 });
    try {
      await collector.settled();
      const cache = collector.read(c.id);
      expect(cache.state === 'ready' && cache.view.tasks[0]?.follow_up).toEqual({ task_id: f.bound.binding.task,
        resume: { host: 'codex', command: 'codex resume 0199a2b4-7c3e-7d10-9f00-3a5b6c7d8e9f' }, herdr_pane: null });
    } finally { await collector.close(); }
  }
});

test('the collector is pending before its first cycle and unavailable when the registry or the child process fails', async () => {
  const f = await fixture();
  const c = collectorHome(f.root);
  const failing = startExecutionCollector({ env: c.env, interval_ms: 60_000, run_process: async () => ({ ok: false, code: 'failed' }) });
  try {
    expect(failing.read(c.id)).toEqual({ state: 'unavailable', reason: 'execution_state_pending' });
    await failing.settled();
    expect(failing.read(c.id)).toEqual({ state: 'unavailable', reason: 'execution_state_unavailable' });
    expect(failing.read('unregistered')).toEqual({ state: 'unavailable', reason: 'repository_not_found' });
  } finally { await failing.close(); }
  writeFileSync(join(c.env.REPO_HARNESS_HOME!, 'registered-repos.json'), '{"version":1}');
  let runs = 0;
  const broken = startExecutionCollector({ env: c.env, interval_ms: 60_000, run_process: async () => { runs++; return { ok: false, code: 'failed' }; } });
  try {
    await broken.settled();
    expect(broken.read(c.id)).toEqual({ state: 'unavailable', reason: 'registry_unavailable' });
    expect(runs).toBe(0);
  } finally { await broken.close(); }
});

async function until(condition: () => boolean, limit_ms: number) {
  const deadline = Date.now() + limit_ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not reached');
    await Bun.sleep(25);
  }
}

/** The real child for the first cycle; `later` replaces every later cycle. */
function firstRealThen(later: SetupProcessRunner): { readonly runner: SetupProcessRunner; readonly runs: () => number } {
  let runs = 0;
  return { runs: () => runs, runner: (argv, options) => (++runs === 1 ? runSetupProcess(argv, { ...options, timeout_ms: 60_000 }) : later(argv, options)) };
}

test('a collection that blocks past the deadline is killed, and a verified session becomes unavailable', async () => {
  const f = await fixture();
  const c = collectorHome(f.root);
  // A child blocked in a synchronous process, like `ps` or git that does not return.
  const blocked = firstRealThen((_argv, options) => runSetupProcess(['-e', 'require("child_process").spawnSync("sleep", ["30"])'], options));
  const collector = startExecutionCollector({ env: c.env, interval_ms: 10, timeout_ms: 300, run_process: blocked.runner });
  try {
    await until(() => collector.read(c.id).state === 'ready', 30_000);
    await until(() => blocked.runs() >= 2, 5_000);
    const blockedAt = Date.now();
    await until(() => collector.read(c.id).state !== 'ready', 5_000);
    expect(collector.read(c.id)).toEqual({ state: 'unavailable', reason: 'execution_state_unavailable' });
    expect(Date.now() - blockedAt).toBeLessThan(5_000);
    const closing = Date.now();
    await collector.close();
    expect(Date.now() - closing).toBeLessThan(5_000);
  } finally { await collector.close(); }
});

test('a cycle that throws makes every repository unavailable, before and after a good cycle', async () => {
  const f = await fixture();
  const c = collectorHome(f.root);
  const first = startExecutionCollector({ env: c.env, interval_ms: 60_000, run_process: async () => { throw new Error('spawn failed'); } });
  try {
    await first.settled();
    expect(first.read(c.id)).toEqual({ state: 'unavailable', reason: 'execution_state_unavailable' });
  } finally { await first.close(); }
  // The throwing cycle records the cache it replaces, so a short ready window is not missed.
  let before: ExecutionRepositoryCache['state'] | undefined;
  const later = firstRealThen(async () => { before ??= collector.read(c.id).state; throw new Error('spawn failed'); });
  const collector = startExecutionCollector({ env: c.env, interval_ms: 10, run_process: later.runner });
  try {
    await until(() => before !== undefined && collector.read(c.id).state !== 'ready', 30_000);
    expect(before).toBe('ready');
    expect(collector.read(c.id)).toEqual({ state: 'unavailable', reason: 'execution_state_unavailable' });
  } finally { await collector.close(); }
});

test('git variables of the server do not select the repository that the child reads', async () => {
  const f = await fixture();
  const other = tmpWorkspace('operator-execution-other-repo'); roots.push(other); initGitRepo(other);
  const c = collectorHome(f.root);
  const selecting = { GIT_DIR: join(other, '.git'), GIT_WORK_TREE: other, GIT_COMMON_DIR: join(other, '.git'), GIT_INDEX_FILE: join(other, '.git', 'index') };
  expect(executionChildEnvironment({ PATH: '/bin', ...selecting })).toEqual({ PATH: '/bin', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' });
  const { status, text } = await served({ ...c.env, ...selecting }, c.id);
  expect(status).toBe(200);
  expect(decodeTaskExecutionView(JSON.parse(text)).tasks).toMatchObject([{ state: 'verified', task: f.bound.binding.task, agent: 'codex' }]);
});

test('the route reads only the injected cache and maps each unavailable state to its code', async () => {
  const view: TaskExecutionViewV1 = { protocol: 1, kind: 'operator_task_execution', repository_id: 'repo-a', observed_at: '2026-10-27T00:00:00.000Z', tasks: [], unlisted_tasks: 0 };
  let cache: ExecutionRepositoryCache = { state: 'unavailable', reason: 'execution_state_pending' };
  const server = await startOperatorServer({ port: 0, read_execution_state: () => cache });
  const get = async (path = '/api/v1/repositories/repo-a/execution') => {
    const response = await fetch(`${server.url}${path}`);
    return { status: response.status, body: await response.json() as unknown };
  };
  try {
    for (const [next, status, code] of [
      [{ state: 'unavailable', reason: 'execution_state_pending' }, 503, 'execution_state_pending'],
      [{ state: 'unavailable', reason: 'registry_unavailable' }, 503, 'registry_unavailable'],
      [{ state: 'unavailable', reason: 'repository_not_found' }, 404, 'repository_not_found'],
      [{ state: 'unavailable', reason: 'execution_state_unavailable' }, 503, 'execution_state_unavailable'],
      // A cached view that fails the decoder is refused, not sent.
      [{ state: 'ready', view: { ...view, tasks: [{ state: 'unverified', task: '/Users/someone/task', role: 'deep-reasoner', reason: 'closed',
        follow_up: { task_id: '/Users/someone/task', resume: null, herdr_pane: null } }] } }, 503, 'execution_state_invalid'],
    ] as const) {
      cache = next as ExecutionRepositoryCache;
      const answer = await get();
      expect(answer.status).toBe(status);
      expect((answer.body as { error?: { code: string } }).error?.code).toBe(code);
      expect(JSON.stringify(answer.body)).not.toContain('/Users/');
    }
    cache = { state: 'ready', view };
    expect(await get()).toEqual({ status: 200, body: view });
    expect((await get('/api/v1/repositories/repo-a/execution?task=x')).status).toBe(400);
    expect((await fetch(`${server.url}/api/v1/repositories/repo-a/execution`, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(405);
    expect((await fetch(`${server.url}/api/v1/repositories/repo-a/execution`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403);
  } finally { await server.close(); }
});

test('the public view leaves out a session whose task is not public text, and the decoder refuses forged follow-ups', () => {
  const verified = { state: 'verified' as const, task: 'a'.repeat(64), role: 'deep-reasoner', issue_id: '42', branch: 'main', agent: 'codex' as const, runtime: 'herdr' as const,
    native_session_id: 'thread-1', herdr_pane: { session: 'main', workspace_id: 'w1', pane_id: 'w1:p1', agent_name: 'deep-reasoner' } };
  const snapshot = { protocol: 1 as const, kind: 'operator_task_execution' as const, observed_at: '2026-10-27T00:00:00.000Z',
    executions: [verified, { ...verified, task: '/Users/someone/private task' }, { ...verified, herdr_pane: { ...verified.herdr_pane, pane_id: '../x' } }] };
  const view = projectTaskExecutionView(snapshot, 'repo-a', 'main');
  expect(view.unlisted_tasks).toBe(2);
  expect(view.tasks).toHaveLength(1);
  expect(decodeTaskExecutionView(view)).toEqual(view);
  const entry = view.tasks[0]!;
  for (const forged of [
    { ...view, extra: true },
    { ...view, tasks: [{ ...entry, native_session_id: 'thread-1' }] },
    { ...view, tasks: [{ ...entry, follow_up: { ...entry.follow_up, resume: { host: 'codex', command: 'codex resume thread-1; rm -rf ~' } } }] },
    { ...view, tasks: [{ ...entry, follow_up: { ...entry.follow_up, resume: { host: 'claude', command: 'claude --resume thread-1' } } }] },
    { ...view, tasks: [{ ...entry, runtime: 'terminal' }] },
    { ...view, tasks: [{ ...entry, follow_up: { ...entry.follow_up, task_id: 'b'.repeat(64) } }] },
    { ...view, tasks: [{ state: 'unverified', task: entry.task, role: entry.role, reason: 'closed', follow_up: entry.follow_up }] },
    { ...view, unlisted_tasks: -1 },
  ]) expect(() => decodeTaskExecutionView(forged)).toThrow('execution view invalid');
});

test('the public view names the branch of a verified task, leaves out a branch that is not public text, and the decoder checks it', () => {
  const verified = { state: 'verified' as const, task: 'a'.repeat(64), role: 'deep-reasoner', issue_id: '42', branch: 'feat/1007-drawer', agent: 'codex' as const,
    runtime: 'terminal' as const, native_session_id: 'thread-1', herdr_pane: null };
  const snapshot = { protocol: 1 as const, kind: 'operator_task_execution' as const, observed_at: '2026-10-27T00:00:00.000Z',
    executions: [verified, { ...verified, task: 'b'.repeat(64), branch: null }, { ...verified, task: 'c'.repeat(64), branch: '/Users/someone/repo' }] };
  const view = projectTaskExecutionView(snapshot, 'repo-a', null);
  expect(view.unlisted_tasks).toBe(1);
  expect(view.tasks.map(task => task.state === 'verified' ? task.branch : task.state)).toEqual(['feat/1007-drawer', null]);
  expect(decodeTaskExecutionView(view)).toEqual(view);
  const entry = view.tasks[0]!;
  for (const forged of [
    { ...view, tasks: [Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'branch'))] },
    { ...view, tasks: [{ ...entry, branch: 'feat/x y' }] },
    { ...view, tasks: [{ ...entry, branch: '-x' }] },
    { ...view, tasks: [{ state: 'unverified', task: entry.task, role: entry.role, reason: 'closed', branch: 'main',
      follow_up: { task_id: entry.task, resume: null, herdr_pane: null } }] },
  ]) expect(() => decodeTaskExecutionView(forged)).toThrow('execution view invalid');
});
