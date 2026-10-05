import { afterEach, beforeEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildLeaseOwnerRecord, bindLeaseRecord, deriveTaskRevision, serializeLeaseOwnerRecord, type LeaseOwnerRecord } from '../../src/core/state/coordination-identity';
import { decodeOperatorTaskDiff, TASK_DIFF_MAX_BYTES } from '../../src/core/operator/task-diff';
import { readOperatorTaskDiff } from '../../src/effects/operator/task-diff';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { leaseDirectory, leaseOwnerPath } from '../../src/effects/state/coordination-lease-store';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const cleanup: string[] = [];
let originalGitGlobal: string | undefined;
let originalGitSystem: string | undefined;
beforeEach(() => {
  originalGitGlobal = process.env.GIT_CONFIG_GLOBAL;
  originalGitSystem = process.env.GIT_CONFIG_NOSYSTEM;
  const configHome = mkdtempSync(join(tmpdir(), 'operator-diff-config-')); cleanup.push(configHome);
  const config = join(configHome, 'gitconfig'); writeFileSync(config, '');
  process.env.GIT_CONFIG_GLOBAL = config;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
});
afterEach(() => {
  if (originalGitGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
  else process.env.GIT_CONFIG_GLOBAL = originalGitGlobal;
  if (originalGitSystem === undefined) delete process.env.GIT_CONFIG_NOSYSTEM;
  else process.env.GIT_CONFIG_NOSYSTEM = originalGitSystem;
});
afterEach(() => { for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true }); });
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// Reader fixtures use the canonical serialized bytes without invoking write durability.
function seedLease(root: string, taskId: string, owner: LeaseOwnerRecord): void {
  mkdirSync(leaseDirectory(root, taskId), { recursive: true });
  writeFileSync(leaseOwnerPath(root, taskId), serializeLeaseOwnerRecord(owner));
}
function fixture() {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), 'operator-diff-'))); cleanup.push(parent);
  const root = join(parent, 'repo'); const worktree = join(parent, 'worktree'); const home = join(parent, 'home');
  mkdirSync(root); mkdirSync(home);
  git(root, 'init', '-b', 'main'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid');
  const sprint = 'plans/sprints/diff.sprint.md'; const task = 'inspect task diff'; const taskId = fixtureTaskId(task);
  const taskRevision = deriveTaskRevision({ taskCell: task, taskId, modeCell: 'contract', acceptanceCell: 'read only' });
  mkdirSync(join(root, 'plans/sprints'), { recursive: true }); mkdirSync(join(root, '.ai/harness/sprint'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/sprint/active-sprint'), sprint+'\n');
  writeFileSync(join(root, sprint), `# Sprint\n\n> **Status**: Executing\n> **Backlog Schema**: 2\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---|----|--------|------|------|------------|------|\n| 1 | ${taskId} | [ ] | ${task} | contract | read only | (pending) |\n`);
  writeFileSync(join(root, 'file.txt'), 'base\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'worktree', 'add', '-b', 'codex/diff', worktree);
  const repositoryId = repoHarnessRepoIdFor(root); const now = new Date().toISOString();
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{ id: repositoryId, path: root, accessMode: 'read_only', source: 'adopt', registeredAt: now, lastSeenAt: now }] }));
  const claim = '123e4567-e89b-42d3-a456-426614174001';
  const owner = buildLeaseOwnerRecord({ claimId: claim, taskId, taskRevision, sprintPath: sprint, targetRef: 'main', generation: 1, sessionId: 'test', sourceWorktree: root });
  const bound = bindLeaseRecord(owner, { claimId: claim, executionWorktree: worktree, branch: 'codex/diff', unitRef: 'plans/plan-diff.md' });
  if (!bound.ok) throw new Error(bound.error);
  seedLease(root, taskId, bound.record);
  const input = { repository_id: repositoryId, task_id: taskId, task_revision: taskRevision, claim_id: claim, generation: 1, env: { REPO_HARNESS_HOME: home } };
  return { root, worktree, home, base, input, owner: bound.record };
}

test('read-only registry: explicit target/head, committed and dirty tracked changes, separate untracked paths', () => {
  const f = fixture();
  writeFileSync(join(f.worktree, 'committed.txt'), 'commit\n'); git(f.worktree, 'add', '.'); git(f.worktree, 'commit', '-m', 'work');
  writeFileSync(join(f.worktree, 'file.txt'), 'staged\n'); git(f.worktree, 'add', 'file.txt'); writeFileSync(join(f.worktree, 'file.txt'), '<script>dirty</script>\n');
  writeFileSync(join(f.worktree, 'untracked space.txt'), 'not loaded');
  const result = readOperatorTaskDiff(f.input);
  expect(result.base_sha).toBe(f.base); expect(result.head_sha).toBe(git(f.worktree, 'rev-parse', 'HEAD'));
  expect(result.patch).toContain('+commit'); expect(result.patch).toContain('+<script>dirty</script>');
  expect(result.untracked_paths).toEqual(['untracked space.txt']); expect(result.patch).not.toContain('not loaded');
  expect(JSON.stringify(result)).not.toContain(f.root); expect(decodeOperatorTaskDiff(result, f.input)).toEqual(result);
  expect(() => decodeOperatorTaskDiff({ ...result, task_id: '0'.repeat(64) }, f.input)).toThrow();
  expect(() => decodeOperatorTaskDiff({ ...result, worktree: f.worktree }, f.input)).toThrow();
});

test('untracked-only is distinct from empty and canonical target commit is resolved freshly', () => {
  const f = fixture();
  expect(readOperatorTaskDiff(f.input).patch).toBe('');
  writeFileSync(join(f.worktree, 'new.txt'), 'new');
  expect(readOperatorTaskDiff(f.input).untracked_paths).toEqual(['new.txt']);
  writeFileSync(join(f.root, 'target.txt'), 'target'); git(f.root, 'add', 'target.txt'); git(f.root, 'commit', '-m', 'target moved');
  const result = readOperatorTaskDiff(f.input);
  expect(result.base_sha).toBe(git(f.root, 'rev-parse', 'HEAD')); expect(result.base_sha).not.toBe(f.base);
});

test('stale fence, foreign worktree and missing binding fail closed', () => {
  const f = fixture();
  expect(() => readOperatorTaskDiff({ ...f.input, generation: 2 })).toThrow('stale');
  expect(() => readOperatorTaskDiff({ ...f.input, task_revision: '0'.repeat(64) })).toThrow('stale');
  const foreign = fixture();
  seedLease(f.root, f.input.task_id, { ...f.owner, execution_worktree: foreign.worktree });
  expect(() => readOperatorTaskDiff(f.input)).toThrow('unavailable');
  seedLease(f.root, f.input.task_id, { ...f.owner, execution_worktree: join(f.root, 'absent') });
  expect(() => readOperatorTaskDiff(f.input)).toThrow('unavailable');
});

test('external diff/textconv are disabled and oversized patches are refused', () => {
  const f = fixture();
  git(f.worktree, 'config', 'diff.external', 'false');
  git(f.worktree, 'config', 'diff.custom.textconv', 'false');
  writeFileSync(join(f.worktree, '.gitattributes'), 'file.txt diff=custom\n');
  writeFileSync(join(f.worktree, 'file.txt'), 'changed\n');
  expect(readOperatorTaskDiff(f.input).patch).toContain('+changed');
  writeFileSync(join(f.worktree, 'file.txt'), 'x'.repeat(TASK_DIFF_MAX_BYTES + 100));
  expect(() => readOperatorTaskDiff(f.input)).toThrow('too_large');
});

test('production HTTP worker returns the same fenced read without machine paths', async () => {
  const f = fixture();
  const { startOperatorServer } = await import('../../src/effects/operator/server');
  const server = await startOperatorServer({ port: 0, static_root: f.root, env: f.input.env });
  try {
    writeFileSync(join(f.worktree, 'file.txt'), 'via worker\n');
    const q = new URLSearchParams({ task_revision: f.input.task_revision, claim_id: f.input.claim_id, generation: '1' });
    const response = await fetch(`${server.url}/api/v1/fleet/tasks/${f.input.repository_id}/${f.input.task_id}/diff?${q}`);
    expect(response.status).toBe(200);
    const value = decodeOperatorTaskDiff(await response.json(), f.input);
    expect(value.patch).toContain('+via worker'); expect(JSON.stringify(value)).not.toContain(f.root);
  } finally { await server.close(); }
});

test('binary changes remain a Git summary and detached execution trees are refused', () => {
  const f = fixture();
  writeFileSync(join(f.worktree, 'file.txt'), Buffer.from([0, 1, 2, 3]));
  expect(readOperatorTaskDiff(f.input).patch).toContain('Binary files');
  git(f.worktree, 'checkout', '--detach');
  expect(() => readOperatorTaskDiff(f.input)).toThrow('unavailable');
});

test('decoder refuses malformed and oversized payloads instead of displaying partial output', () => {
  const f = fixture(); const value = readOperatorTaskDiff(f.input);
  for (const change of [
    { patch: 'x'.repeat(TASK_DIFF_MAX_BYTES + 1) },
    { untracked_paths: ['/Users/someone/private'] },
    { untracked_paths: ['../foreign'] },
    { base_sha: 'main' }, { generation: 0 }, { protocol: 2 },
  ]) expect(() => decodeOperatorTaskDiff({ ...value, ...change }, f.input)).toThrow();
});


test('GET diff refuses configured clean/process commands and never executes fsmonitor', () => {
  const f = fixture();
  const marker = join(f.worktree, 'filter-ran');
  git(f.worktree, 'config', 'filter.probe.clean', 'echo ran > filter-ran; cat');
  writeFileSync(join(f.worktree, '.gitattributes'), 'file.txt filter=probe\n');
  writeFileSync(join(f.worktree, 'file.txt'), 'new content\n');
  expect(() => readOperatorTaskDiff(f.input)).toThrow('filters_unsupported');
  expect(existsSync(marker)).toBe(false);
  git(f.worktree, 'config', '--unset', 'filter.probe.clean');
  git(f.worktree, 'config', 'filter.probe.process', 'echo ran > filter-ran');
  expect(() => readOperatorTaskDiff(f.input)).toThrow('filters_unsupported');
  expect(existsSync(marker)).toBe(false);
  git(f.worktree, 'config', '--unset', 'filter.probe.process');
  git(f.worktree, 'config', 'core.fsmonitor', 'echo ran > fsmonitor-ran; false');
  expect(readOperatorTaskDiff(f.input).patch).toContain('+new content');
  expect(existsSync(join(f.worktree, 'fsmonitor-ran'))).toBe(false);
});

test('a different prunable worktree does not hide a valid task binding', () => {
  const f = fixture();
  const missing = join(f.root, '..', 'aaa-prunable');
  git(f.root, 'worktree', 'add', '-b', 'obsolete', missing);
  rmSync(missing, { recursive: true, force: true });
  expect(git(f.root, 'worktree', 'list', '--porcelain')).toContain('prunable');
  expect(readOperatorTaskDiff(f.input).base_sha).toBe(f.base);
});


test('assume-unchanged tracked entries cannot produce an empty observation', () => {
  const f = fixture();
  git(f.worktree, 'update-index', '--assume-unchanged', 'file.txt');
  writeFileSync(join(f.worktree, 'file.txt'), 'hidden edit\n');
  expect(() => readOperatorTaskDiff(f.input)).toThrow('index_unsupported');
});

test('skip-worktree tracked entries cannot produce an empty observation and stay untouched', async () => {
  const f = fixture();
  git(f.worktree, 'update-index', '--skip-worktree', 'file.txt');
  writeFileSync(join(f.worktree, 'file.txt'), 'hidden edit\n');
  expect(git(f.worktree, 'diff', f.base, '--')).toBe('');
  expect(() => readOperatorTaskDiff(f.input)).toThrow('index_unsupported');
  const { startOperatorServer } = await import('../../src/effects/operator/server');
  const server = await startOperatorServer({ port: 0, static_root: f.root, env: f.input.env });
  try {
    const q = new URLSearchParams({ task_revision: f.input.task_revision, claim_id: f.input.claim_id, generation: '1' });
    const response = await fetch(`${server.url}/api/v1/fleet/tasks/${f.input.repository_id}/${f.input.task_id}/diff?${q}`);
    expect(response.status).not.toBe(200);
    expect(JSON.stringify(await response.json())).toContain('index_unsupported');
  } finally { await server.close(); }
  expect(git(f.worktree, 'ls-files', '-v', 'file.txt')).toBe('S file.txt');
  expect(readFileSync(join(f.worktree, 'file.txt'), 'utf8')).toBe('hidden edit\n');
});

test('missing promisor blobs fail without fetching or writing objects', () => {
  const f = fixture();
  const blob = git(f.root, 'rev-parse', 'HEAD:file.txt');
  const object = join(f.root, '.git', 'objects', blob.slice(0, 2), blob.slice(2));
  git(f.root, 'config', 'remote.origin.promisor', 'true');
  git(f.root, 'config', 'remote.origin.url', f.root);
  const marker = join(f.root, 'fetch-ran');
  git(f.root, 'config', 'remote.origin.uploadpack', 'echo ran > fetch-ran; false');
  rmSync(object);
  writeFileSync(join(f.worktree, 'file.txt'), 'needs base blob\n');
  expect(() => readOperatorTaskDiff(f.input)).toThrow('unavailable');
  expect(existsSync(marker)).toBe(false);
  expect(existsSync(join(f.worktree, 'fetch-ran'))).toBe(false);
  expect(existsSync(object)).toBe(false);
});


test('production worker refuses missing canonical sprint objects without fetching', async () => {
  const f = fixture();
  const blob = git(f.root, 'rev-parse', 'HEAD:plans/sprints/diff.sprint.md');
  const object = join(f.root, '.git', 'objects', blob.slice(0, 2), blob.slice(2));
  git(f.root, 'config', 'remote.origin.promisor', 'true');
  git(f.root, 'config', 'remote.origin.url', f.root);
  git(f.root, 'config', 'remote.origin.uploadpack', 'echo ran > fetch-ran; false');
  rmSync(object);
  const { startOperatorServer } = await import('../../src/effects/operator/server');
  const server = await startOperatorServer({ port: 0, static_root: f.root, env: f.input.env });
  try {
    const q = new URLSearchParams({ task_revision: f.input.task_revision, claim_id: f.input.claim_id, generation: '1' });
    const response = await fetch(`${server.url}/api/v1/fleet/tasks/${f.input.repository_id}/${f.input.task_id}/diff?${q}`);
    expect(response.status).not.toBe(200);
    expect(existsSync(join(f.root, 'fetch-ran'))).toBe(false);
    expect(existsSync(object)).toBe(false);
  } finally { await server.close(); }
});
