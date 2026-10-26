import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '../../src/core/evidence/canonical-json';
import { buildTaskFollowUp, type UnverifiedExecutionReason } from '../../src/core/operator/execution-state';
import { collectTaskExecutionStates } from '../../src/effects/operator/execution-state';
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

test('a fully consistent live session gives the agent, its pane and the follow-up commands', async () => {
  const f = await fixture();
  const snapshot = collectTaskExecutionStates(f.root);
  expect(snapshot).toMatchObject({ protocol: 1, kind: 'operator_task_execution' });
  expect(snapshot.executions).toEqual([{
    state: 'verified', task: f.bound.binding.task, role: f.bound.binding.role, issue_id: '987654',
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

test('a repository without task sessions has an empty snapshot', () => {
  const root = tmpWorkspace('operator-execution-state-empty'); roots.push(root); initGitRepo(root);
  writeFileSync(join(root, 'README.md'), 'fixture'); commitAll(root, 'initial');
  expect(collectTaskExecutionStates(root).executions).toEqual([]);
});

test('follow-up gives each host its own resume command and refuses an id that is not one shell word', () => {
  const base = { state: 'verified' as const, task: 'a'.repeat(64), role: 'deep-reasoner', issue_id: null, runtime: 'terminal' as const, herdr_pane: null };
  expect(buildTaskFollowUp({ ...base, agent: 'claude', native_session_id: '5f0c1e2a-0000-4000-8000-000000000001' }).resume)
    .toEqual({ host: 'claude', command: 'claude --resume 5f0c1e2a-0000-4000-8000-000000000001' });
  expect(buildTaskFollowUp({ ...base, agent: 'codex', native_session_id: 'thread; rm -rf ~' }))
    .toEqual({ task_id: 'a'.repeat(64), resume: null, herdr_pane: null });
});
