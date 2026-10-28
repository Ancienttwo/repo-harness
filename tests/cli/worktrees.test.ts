import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';

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
  const repo = { id: repoHarnessRepoIdFor(main), path: main, accessMode: 'read_only', source: 'adopt', registeredAt: '2026-10-28T00:00:00.000Z', lastSeenAt: '2026-10-28T00:00:00.000Z' };
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [repo] }));
  const env = { ...process.env, HOME: parent, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: root };
  const cli = (...args: string[]) => spawnSync(process.execPath, [resolve(import.meta.dir, '../../src/cli/index.ts'), 'worktrees', ...args], { cwd: main, env, encoding: 'utf8', timeout: 90_000 });
  return { parent, main, home, green, yellow, git, cli };
}

test('list --json gives the green selection digest and clean removes exactly that selection, with replay and refusals', () => {
  const f = fixture();
  const list = f.cli('list', '--json');
  expect(list.status).toBe(0);
  const output = JSON.parse(list.stdout);
  expect(output).toMatchObject({ protocol: 1, kind: 'operator_worktree_list', snapshot: { version: 1, status: 'ready' } });
  const rows = output.snapshot.repositories[0].worktrees as { id: string; directory: string; judgment: string }[];
  const green = rows.find(row => row.directory === 'repo-wt-feature')!, yellow = rows.find(row => row.directory === 'repo-wt-other')!;
  expect([green.judgment, yellow.judgment]).toEqual(['green', 'yellow']);
  expect(output.green).toEqual({ ids: [green.id], digest: output.digests[green.id] });
  expect(list.stdout).not.toContain(f.parent);

  const yellowClean = f.cli('clean', '--ids', yellow.id, '--expected-digest', output.digests[yellow.id], '--json');
  expect(yellowClean.status).toBe(2);
  expect(JSON.parse(yellowClean.stderr)).toMatchObject({ status: 422, error: { code: 'not_approved' } });
  expect(f.cli('clean', '--ids', green.id, '--expected-digest', 'f'.repeat(64)).status).toBe(2);
  expect(f.cli('clean', '--ids', '/tmp/repo-wt-feature', '--expected-digest', output.green.digest).status).toBe(2);
  expect(f.cli('clean', '--ids', green.id, '--expected-digest', output.green.digest, '--request-id', 'NOT-A-UUID').status).toBe(2);
  expect(existsSync(f.green) && existsSync(f.yellow)).toBe(true);

  const requestId = '123e4567-e89b-42d3-a456-426614174201';
  const clean = f.cli('clean', '--ids', output.green.ids.join(','), '--expected-digest', output.green.digest, '--request-id', requestId, '--json');
  expect(clean.status).toBe(0);
  const result = JSON.parse(clean.stdout);
  expect(result).toEqual({ request_id: requestId, protocol: 1, kind: 'operator_worktree_cleanup', items: [
    { id: green.id, repository_id: expect.stringMatching(/^repo_/u), directory: 'repo-wt-feature', outcome: 'removed', reason: null },
  ] });
  expect(existsSync(f.green)).toBe(false);
  expect(existsSync(f.yellow)).toBe(true);
  expect(f.git(f.main, 'for-each-ref', '--format=%(refname)', 'refs/heads/feature')).toBe('');
  // The same request_id replays the audited result; a new one sees that the row is gone.
  const replay = f.cli('clean', '--ids', green.id, '--expected-digest', output.green.digest, '--request-id', requestId, '--json');
  expect([replay.status, JSON.parse(replay.stdout).items]).toEqual([0, result.items]);
  const again = f.cli('clean', '--ids', green.id, '--expected-digest', output.green.digest, '--json');
  expect(again.status).toBe(2);
  expect(JSON.parse(again.stderr)).toMatchObject({ status: 409, error: { code: 'digest_changed' } });
  const audit = readFileSync(join(f.home, 'operator/audit.jsonl'), 'utf8');
  // Yellow, wrong digest, clean and the new request ran; bad arguments and the replay did not.
  expect(audit.split('\n').filter(Boolean).map(line => JSON.parse(line).phase)).toEqual(Array.from({ length: 4 }, () => ['intent', 'result']).flat());
});
