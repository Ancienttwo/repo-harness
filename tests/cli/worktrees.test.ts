import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { controlledWorktreeProcessPreload } from '../helpers/controlled-worktree-processes';
import { decodeWorktreeCleanupRequest, worktreeDigestRow } from '../../src/core/operator/worktree-cleanup';
import type { WorktreeView, WorktreesSnapshot } from '../../src/core/operator/worktrees';
import { cleanCommand, greenCleanupBatches, worktreeListOutput } from '../../src/cli/commands/worktrees';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { worktreeId } from '../../src/effects/git/worktree-record';
import { selectionDigest } from '../../src/effects/operator/worktree-cleanup';
import { registeredWorktreePaths, repositoryWorktreeRow } from '../../src/effects/operator/worktree-collector-worker';
import { entries } from '../../src/effects/state/coordination-worktree-topology';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** A registered repository with one green and one yellow managed worktree, and the CLI bound to its homes. */
function fixture() {
  const parent = tmpWorkspace('worktrees-cli');
  roots.push(parent);
  const main = join(parent, 'repo'), root = join(parent, 'managed'), home = join(parent, 'home');
  for (const directory of [main, root, home]) mkdirSync(directory);
  initGitRepo(main);
  writeFileSync(join(main, '.gitignore'), '.env\n');
  commitAll(main, 'base');
  const git = (cwd: string, ...args: string[]) => { const result = run('git', args, cwd); if (result.status) throw new Error(result.stderr); return result.stdout.trim(); };
  const green = join(root, 'repo-wt-feature'), yellow = join(root, 'repo-wt-other');
  git(main, 'worktree', 'add', '-b', 'feature', green);
  writeFileSync(join(green, 'feature.txt'), 'feature'); commitAll(green, 'feature');
  git(main, 'worktree', 'add', '-b', 'other', yellow, 'feature');
  writeFileSync(join(yellow, 'other.txt'), 'other'); commitAll(yellow, 'other');
  git(main, 'update-ref', 'refs/remotes/origin/main', git(yellow, 'rev-parse', 'HEAD'));
  writeFileSync(join(yellow, '.env'), 'private');
  const repo = { id: repoHarnessRepoIdFor(main), path: main, accessMode: 'read_only' as const, source: 'adopt' as const, registeredAt: '2026-10-28T00:00:00.000Z', lastSeenAt: '2026-10-28T00:00:00.000Z' };
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [repo] }));
  const env = { ...process.env, HOME: parent, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: root };
  const entry = resolve(import.meta.dir, '../../src/cli/index.ts');
  const cli = (...args: string[]) => spawnSync(process.execPath, [entry, 'worktrees', ...args], { cwd: main, env, encoding: 'utf8', timeout: 90_000 });
  // The real process inventory is a separate input. The controlled preload (#1128) gives the CLI an empty, known inventory.
  const controlledCli = (...args: string[]) => spawnSync(process.execPath, ['--preload', controlledWorktreeProcessPreload, entry, 'worktrees', ...args], { cwd: main, env, encoding: 'utf8', timeout: 90_000 });
  // The row that `list` builds, with the same empty inventory.
  const controlledRow = (directory: string) => {
    const common = resolveGitCommonDirectory(main);
    const found = registeredWorktreePaths(entries(main)).find(item => basename(item.path) === directory)!;
    return repositoryWorktreeRow({ repo, common, managed_root: realpathSync(root), id: worktreeId(common, found.path), path: found.path, entry: found.entry,
      size_bytes: null, size_observed_at: null, caller_cwd: null, env, deadline: Date.now() + 10_000, processes: [] });
  };
  return { parent, main, home, green, yellow, git, cli, controlledCli, controlledRow };
}

function listed(f: ReturnType<typeof fixture>) {
  const list = f.cli('list', '--json');
  expect(list.status).toBe(0);
  expect(list.stdout).not.toContain(f.parent);
  const output = JSON.parse(list.stdout);
  expect(output).toMatchObject({ protocol: 1, kind: 'operator_worktree_list', snapshot: { version: 1, status: 'ready' } });
  const rows = output.snapshot.repositories[0].worktrees as { id: string; directory: string; judgment: string }[];
  const greenIds = rows.filter(row => row.judgment === 'green').map(row => row.id).sort();
  expect(output.green.flatMap((batch: { ids: string[] }) => batch.ids)).toEqual(greenIds);
  if (greenIds.length === 1) expect(output.green).toEqual([{ ids: greenIds, digest: output.digests[greenIds[0]!] }]);
  if (greenIds.length === 0) expect(output.green).toEqual([]);
  return { output, row: (directory: string) => rows.find(row => row.directory === directory)! };
}

test('list --json gives a digest per row, and clean refuses a yellow row or bad arguments with exit 2', () => {
  const f = fixture();
  const { output, row } = listed(f);
  const yellow = row('repo-wt-other'), green = row('repo-wt-feature');
  expect(yellow.judgment).toBe('yellow');
  expect(output.digests[yellow.id]).toMatch(/^[a-f0-9]{64}$/u);
  const yellowClean = f.cli('clean', '--ids', yellow.id, '--expected-digest', output.digests[yellow.id], '--json');
  expect(yellowClean.status).toBe(2);
  expect(JSON.parse(yellowClean.stderr)).toMatchObject({ status: 422, error: { code: 'not_approved' } });
  expect(f.cli('clean', '--ids', '/tmp/repo-wt-feature', '--expected-digest', output.digests[green.id]).status).toBe(2);
  expect(f.cli('clean', '--ids', green.id, '--expected-digest', output.digests[green.id], '--request-id', 'NOT-A-UUID').status).toBe(2);
  expect(existsSync(f.green) && existsSync(f.yellow)).toBe(true);
  // Only the yellow request ran; bad arguments stop before the write run.
  const audit = readFileSync(join(f.home, 'operator/audit.jsonl'), 'utf8');
  expect(audit.split('\n').filter(Boolean).map(line => JSON.parse(line).phase)).toEqual(['intent', 'result']);
});

test('clean removes exactly the green selection, replays a reused request id and refuses a changed one', () => {
  const f = fixture();
  const green = f.controlledRow('repo-wt-feature');
  expect(green.judgment).toBe('green');
  const digest = selectionDigest([worktreeDigestRow(green)]);
  expect(f.controlledCli('clean', '--ids', green.id, '--expected-digest', 'f'.repeat(64)).status).toBe(2);
  const requestId = '123e4567-e89b-42d3-a456-426614174201';
  const clean = f.controlledCli('clean', '--ids', green.id, '--expected-digest', digest, '--request-id', requestId, '--json');
  expect(clean.status).toBe(0);
  const result = JSON.parse(clean.stdout);
  expect(result).toEqual({ request_id: requestId, protocol: 1, kind: 'operator_worktree_cleanup', items: [
    { id: green.id, repository_id: expect.stringMatching(/^repo_/u), directory: 'repo-wt-feature', outcome: 'removed', reason: null },
  ] });
  expect(existsSync(f.green)).toBe(false);
  expect(existsSync(f.yellow)).toBe(true);
  expect(f.git(f.main, 'for-each-ref', '--format=%(refname)', 'refs/heads/feature')).toBe('');
  // The same request_id replays the audited result; a new one sees that the row is gone.
  const replay = f.controlledCli('clean', '--ids', green.id, '--expected-digest', digest, '--request-id', requestId, '--json');
  expect([replay.status, JSON.parse(replay.stdout).items]).toEqual([0, result.items]);
  const again = f.controlledCli('clean', '--ids', green.id, '--expected-digest', digest, '--json');
  expect(again.status).toBe(2);
  expect(JSON.parse(again.stderr)).toMatchObject({ status: 409, error: { code: 'digest_changed' } });
  const audit = readFileSync(join(f.home, 'operator/audit.jsonl'), 'utf8');
  // Wrong digest, clean and the new request ran; the replay did not.
  expect(audit.split('\n').filter(Boolean).map(line => JSON.parse(line).phase)).toEqual(Array.from({ length: 3 }, () => ['intent', 'result']).flat());
});

test('17 green rows give JSON batches and human commands that each pass the request decoder', () => {
  const view = (index: number): WorktreeView => ({
    id: `wt_${index.toString(16).padStart(64, '0')}`, repository_id: 'repo_0123456789abcdef', directory: `repo-wt-${index}`, branch: `task-${index}`,
    source: 'manual', judgment: 'green', reasons: [], size_bytes: null, size_observed_at: null, process_count: 0, dirty_files: 0, ignored_entries: 0,
    unpushed_commits: 0, merge: 'ancestor', record: null,
  });
  const rows = Array.from({ length: 17 }, (_, index) => view(16 - index));
  const snapshot: WorktreesSnapshot = { version: 1, status: 'ready', collected_at: '2026-10-28T00:00:00.000Z', unassigned: [],
    repositories: [{ repository_id: 'repo_0123456789abcdef', display_name: 'repo', status: 'ready', worktrees: rows }] };
  const batches = greenCleanupBatches(snapshot);
  expect(batches.map(batch => batch.ids.length)).toEqual([16, 1]);
  const ids = rows.map(row => row.id).sort();
  expect(batches.flatMap(batch => batch.ids)).toEqual(ids);
  for (const batch of batches) {
    const command = cleanCommand(batch.ids, batch.digest).split(' ');
    const request = decodeWorktreeCleanupRequest({ ids: command[command.indexOf('--ids') + 1]!.split(','), expected_digest: command[command.indexOf('--expected-digest') + 1]! });
    expect(request.expected_digest).toBe(selectionDigest(rows.filter(row => batch.ids.includes(row.id)).map(worktreeDigestRow)));
  }
  // One builder: the JSON batches are the batches the human output prints.
  expect(worktreeListOutput(snapshot).green).toEqual(batches);
});
