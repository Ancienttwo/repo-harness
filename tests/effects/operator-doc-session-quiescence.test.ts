import { afterEach, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { acquireExclusiveDirectoryLock } from '../../src/effects/locking/exclusive-directory-lock';
import { DOC_SESSION_AGENT_LOCK } from '../../src/effects/operator/doc-session-agent';
import { withQuiescedDocSession, type DocSessionQuiescenceDependencies } from '../../src/effects/operator/doc-session-quiescence';
import { OperatorWriteRefusal } from '../../src/effects/operator/write-run';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function git(cwd: string, args: string[]): string {
  const result = run('git', args, cwd);
  if (result.status !== 0) throw new Error(`${args[0]}: ${result.stderr}`);
  return result.stdout.trim();
}

function fixture() {
  const root = tmpWorkspace('doc-quiescence'); roots.push(root);
  const repo = join(root, 'repo'); mkdirSync(repo); initGitRepo(repo);
  mkdirSync(join(repo, 'docs')); writeFileSync(join(repo, 'docs/guide.md'), 'before\n');
  commitAll(repo, 'base');
  const base = git(repo, ['rev-parse', 'HEAD']);
  const sid = randomUUID().replaceAll('-', ''); const branch = `docs/${sid.slice(0, 12)}`;
  const wtRoot = join(root, 'worktrees'); mkdirSync(wtRoot);
  const worktree = join(wtRoot, `${basename(repo)}-wt-docs-${sid.slice(0, 12)}`);
  git(repo, ['worktree', 'add', '-b', branch, worktree, base]);
  const home = join(root, 'home'); mkdirSync(home);
  const env = { ...process.env, HOME: home, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: wtRoot };
  const repoId = repoHarnessRepoIdFor(repo); const now = new Date().toISOString();
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{ id: repoId, path: repo, accessMode: 'read_only', source: 'manual', registeredAt: now, lastSeenAt: now }] }));
  const directory = join(home, 'operator/sessions', sid); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const citation = { path: 'docs/guide.md', start_line: 1, end_line: 1, range_sha256: 'a'.repeat(64), file_sha256: 'b'.repeat(64), commit: base };
  writeFileSync(join(directory, 'session.json'), JSON.stringify({ protocol: 1, kind: 'docs_session', session_id: sid, state: 'created', created_at: now, repository_id: repoId, runtime: 'codex', branch, worktree, base_commit: base, citations: [{ ...citation, resolved: citation, relocated: false }], instruction: 'Revise guide.' }));
  const agentRecord = (state: 'idle' | 'stopped' | 'running' | 'starting' | 'failed' = 'stopped'): void => {
    writeFileSync(join(directory, 'agent.json'), JSON.stringify({
      protocol: 1, kind: 'docs_session_agent', session_id: sid, epoch: 1, state,
      failure: null, reason: null, updated_at: '2099-01-01T00:00:00.000Z', actual_model: 'private-model',
      credential: 'removed', control: '/private/control/location', events_error: null,
    }), { mode: 0o600 });
  };
  /** Production leaves platform and processes unset; tests pin the darwin branch deterministically. */
  const gate = (overrides: Partial<DocSessionQuiescenceDependencies>, action: () => Promise<unknown>) =>
    withQuiescedDocSession(env, sid, action, { kind: 'commit', ...overrides });
  const auditRows = (): { phase: string; operation?: string; request_id?: string; body?: Record<string, unknown> }[] =>
    readFileSync(join(home, 'operator/audit.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  return { root, repo, worktree, home, env, sid, directory, agentRecord, gate, auditRows };
}

async function refusalOf(promise: Promise<unknown>): Promise<OperatorWriteRefusal> {
  try { await promise; } catch (error) { if (error instanceof OperatorWriteRefusal) return error; throw error; }
  throw new Error('expected a refusal');
}

test('the existing turn and state checks precede the platform gate', async () => {
  const s = fixture(); s.agentRecord('running');
  let ran = false;
  const refusal = await refusalOf(s.gate({ platform: 'darwin', processes: () => [] }, async () => { ran = true; }));
  expect(refusal.status).toBe(409); expect(refusal.code).toBe('turn_active'); expect(ran).toBe(false);
  s.agentRecord('starting');
  expect((await refusalOf(s.gate({ platform: 'darwin', processes: () => [] }, async () => {}))).code).toBe('busy');
});

test('discard refuses unconditionally and non-darwin commit refuses, even when every proof would pass', async () => {
  const s = fixture(); s.agentRecord('stopped');
  for (const deps of [
    { kind: 'discard' as const, platform: 'darwin' as const, processes: () => [] },
    { kind: 'discard' as const, platform: 'linux' as const, processes: () => [] },
    { kind: 'commit' as const, platform: 'linux' as const, processes: () => [] },
    { kind: 'commit' as const, platform: 'win32' as const, processes: () => [] },
  ]) {
    let ran = false;
    const refusal = await refusalOf(withQuiescedDocSession(s.env, s.sid, async () => { ran = true; }, deps));
    expect(refusal.status).toBe(503); expect(refusal.code).toBe('quiescence_unavailable'); expect(ran).toBe(false);
  }
});

test('a session without a host record and an unprovable inventory refuse fail-closed', async () => {
  const s = fixture(); s.agentRecord();
  rmSync(join(s.directory, 'agent.json'));
  let ran = false;
  expect((await refusalOf(s.gate({ platform: 'darwin', processes: () => [] }, async () => { ran = true; }))).code).toBe('quiescence_unavailable');
  expect(ran).toBe(false);
  s.agentRecord();
  expect((await refusalOf(s.gate({ platform: 'darwin', processes: () => null }, async () => { ran = true; }))).code).toBe('quiescence_unavailable');
  expect(ran).toBe(false);
});

test('occupied worktree cwd refuses with session_occupied; a prefix-sharing sibling stays outside', async () => {
  const s = fixture(); s.agentRecord();
  let ran = false;
  const action = async () => { ran = true; };
  const occupied = await refusalOf(s.gate({ platform: 'darwin', processes: () => [{ pid: 101, cwd: s.worktree }] }, action));
  expect(occupied.code).toBe('session_occupied'); expect(occupied.status).toBe(503); expect(ran).toBe(false);
  expect((await refusalOf(s.gate({ platform: 'darwin', processes: () => [{ pid: 102, cwd: join(s.worktree, 'docs') }] }, action))).code).toBe('session_occupied');
  expect(ran).toBe(false);
  await s.gate({ platform: 'darwin', processes: () => [{ pid: 103, cwd: `${s.worktree}-sibling/inner` }] }, action);
  expect(ran).toBe(true);
});

test('a held agent.lock refuses with session_host_active; release restores the path', async () => {
  const s = fixture(); s.agentRecord();
  const lock = acquireExclusiveDirectoryLock(s.directory, DOC_SESSION_AGENT_LOCK, { waitTimeoutMs: 1000 });
  try {
    lock.assertOwned();
    let ran = false;
    const refusal = await refusalOf(s.gate({ platform: 'darwin', processes: () => [] }, async () => { ran = true; }));
    expect(refusal.code).toBe('session_host_active'); expect(refusal.status).toBe(503); expect(ran).toBe(false);
  } finally { lock.release(); }
  await s.gate({ platform: 'darwin', processes: () => [] }, async () => {});
});

test.skipIf(process.platform !== 'darwin')('the darwin commit path invokes the action and records the proof in the audit trail without private paths', async () => {
  const s = fixture(); s.agentRecord('stopped');
  let ran = 0;
  // Real platform, real lock, real fail-closed OS inventory.
  await s.gate({}, async () => { ran++; });
  await s.gate({}, async () => { ran++; });
  expect(ran).toBe(2);
  const rows = s.auditRows();
  // Only intent rows carry the operation; the paired result rows are found by request_id.
  const ids = new Set(rows.filter(row => row.operation === 'docs_finalize_quiescence').map(row => row.request_id));
  const proofRows = rows.filter(row => ids.has(row.request_id));
  expect(proofRows.map(row => row.phase)).toEqual(['intent', 'result', 'intent', 'result']);
  for (const row of proofRows) {
    expect(JSON.stringify(row)).not.toContain(s.worktree);
    expect(JSON.stringify(row)).not.toContain(s.home);
  }
  for (const row of proofRows.filter(row => row.phase === 'intent')) expect(row.operation).toBe('docs_finalize_quiescence');
  const recorded = proofRows.filter(row => row.phase === 'result');
  for (const row of recorded) expect(row.body).toEqual({ step: 'quiescence', completed: true, value: { platform: 'darwin', agent_state: 'stopped', occupancy_processes: 0 } });
  // One fresh request_id per attempt, each carrying exactly its intent and result row.
  const requestIds = new Set(proofRows.map(row => row.request_id));
  expect(requestIds.size).toBe(2);
  for (const id of requestIds) expect(proofRows.filter(row => row.request_id === id)).toHaveLength(2);
});
