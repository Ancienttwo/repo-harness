import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpWorkspace, initGitRepo, commitAll, run } from '../helpers/repo-fixture';
import { inspectWorktree } from '../../src/effects/state/coordination-worktree-topology';
import { worktreeId, recordWorktree, readWorktreeRecord, endWorktreeRecord } from '../../src/effects/git/worktree-record';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { decodeWorktrees } from '../../src/core/operator/worktrees';
import { collectRepositoryWorktrees } from '../../src/effects/operator/worktree-collector-worker';
import { startWorktreeCollector } from '../../src/effects/operator/worktree-collector';
import { collectOrphanWorktrees } from '../../src/effects/operator/worktree-orphans-worker';
import { repoHarnessRepoIdFor, type RepoHarnessRegisteredRepo } from '../../src/effects/repo-registry';

function fixture() {
  const parent = tmpWorkspace('operator-worktrees');
  const main = join(parent, 'repo'), root = join(parent, 'managed'), home = join(parent, 'home');
  mkdirSync(main); mkdirSync(root); mkdirSync(home);
  initGitRepo(main);
  writeFileSync(join(main, '.gitignore'), 'node_modules/\n.env\n');
  commitAll(main, 'base');
  const tree = join(root, 'repo-wt-feature');
  const git = (cwd: string, ...args: string[]) => { const result = run('git', args, cwd); if (result.status) throw new Error(result.stderr); return result.stdout.trim(); };
  git(main, 'worktree', 'add', '-b', 'feature', tree);
  writeFileSync(join(tree, 'feature.txt'), 'feature'); commitAll(tree, 'feature');
  git(main, 'update-ref', 'refs/remotes/origin/main', git(tree, 'rev-parse', 'HEAD'));
  const env = { ...process.env, REPO_HARNESS_WORKTREE_ROOT: root, REPO_HARNESS_HOME: home };
  const repo: RepoHarnessRegisteredRepo = { id: repoHarnessRepoIdFor(main), path: main, accessMode: 'read_only', source: 'adopt', registeredAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
  const inspect = () => inspectWorktree(main, tree, main, { env, processes: [] });
  return { parent, main, root, home, tree, git, env, repo, inspect, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}

describe('read-only worktree judgment and lifecycle', () => {
  test('a process probe does not occupy the checkout that its observer inventories', () => {
    const f = fixture();
    try {
      const module = join(import.meta.dir, '../../src/effects/git/worktree-processes.ts');
      const script = `const { worktreeProcesses } = await import(${JSON.stringify(module)}); const rows = worktreeProcesses(Date.now() + 5000); console.log(JSON.stringify(rows?.filter(row => row.pid !== process.pid && row.cwd === process.cwd())));`;
      const output = execFileSync(process.execPath, ['-e', script], { cwd: f.tree, encoding: 'utf8', timeout: 6000 });
      expect(JSON.parse(output)).toEqual([]);
    } finally { f.cleanup(); }
  });

  test('uses merge, ownership, loss and occupancy predicates without removing anything', () => {
    const f = fixture();
    try {
      expect(f.inspect()).toMatchObject({ judgment: 'green', reasons: [], merge: 'ancestor', unpushed_commits: 0, dirty_files: 0 });
      mkdirSync(join(f.tree, 'node_modules')); writeFileSync(join(f.tree, 'node_modules/output'), 'rebuild');
      // The uncollapsed names exceed execFileSync's default 1 MiB buffer.
      for (let index = 0; index < 5000; index++) writeFileSync(join(f.tree, 'node_modules', `${index}-${'x'.repeat(220)}`), '');
      expect(f.inspect()).toMatchObject({ judgment: 'green', ignored_entries: 1 });
      writeFileSync(join(f.tree, '.env'), 'private');
      expect(f.inspect()).toMatchObject({ judgment: 'yellow', reasons: ['ignored_data'] });
      writeFileSync(join(f.tree, 'feature.txt'), 'changed');
      expect(f.inspect().reasons).toContain('dirty');
      expect(inspectWorktree(f.main, f.tree, f.main, { env: f.env, processes: [{ pid: 99, cwd: join(f.tree, 'subdir') }] })).toMatchObject({ judgment: 'red', process_count: 1 });
      expect(inspectWorktree(f.main, f.tree, f.main, { env: f.env, processes: null }).reasons).toContain('process_unknown');
      f.git(f.main, 'worktree', 'lock', f.tree);
      expect(f.inspect().reasons).toContain('locked');
      expect(f.git(f.main, 'worktree', 'list', '--porcelain')).toContain(f.tree);
    } finally { f.cleanup(); }
  });

  test('fresh branches and unpushed commits are not green', () => {
    const f = fixture();
    try {
      f.git(f.tree, 'checkout', '-b', 'fresh');
      expect(f.inspect().reasons).toContain('no_own_commits');
      writeFileSync(join(f.tree, 'new.txt'), 'new'); commitAll(f.tree, 'unpublished');
      const result = f.inspect();
      expect(result.judgment).toBe('yellow');
      expect(result.unpushed_commits).toBe(1);
      expect(result.merge).toBe('unmerged');
      expect(result.reasons).toContain('merge_unproven');
    } finally { f.cleanup(); }
  });

  test('records creator and end state outside the checkout with a stable incarnation id', () => {
    const f = fixture();
    try {
      const common = resolveGitCommonDirectory(f.main);
      const before = worktreeId(common, f.tree);
      const record = recordWorktree(f.main, f.tree, { creator: 'portal', purpose: 'worktree page', task_id: '1011', pull_request: 123 });
      expect(record.id).toBe(before);
      expect(recordWorktree(f.main, f.tree, { creator: 'task', purpose: 'attachment' })).toEqual(record);
      endWorktreeRecord(common, record, 'closed');
      expect(readWorktreeRecord(common, f.tree)).toMatchObject({ id: before, creator: 'portal', end_state: 'closed', ended_at: expect.any(String) });
      renameSync(f.tree, f.tree + '-old'); mkdirSync(f.tree);
      expect(worktreeId(common, f.tree)).not.toBe(before);
      expect(readWorktreeRecord(common, f.tree)).toBeNull();
    } finally { f.cleanup(); }
  });

  test('projects basenames, discovers orphan directories, caches du and rejects private egress', () => {
    const f = fixture();
    try {
      recordWorktree(f.main, f.tree, { creator: 'contract', purpose: `plan at ${f.main}/plans/secret.md`, task_id: `${f.main}/task` });
      mkdirSync(join(f.root, 'repo-wt-orphan'));
      const first = collectRepositoryWorktrees(f.repo, {}, f.env);
      const again = collectRepositoryWorktrees(f.repo, first.sizes, f.env);
      const rows = again.snapshot.repositories[0]!.worktrees;
      expect(rows.find(row => row.directory === 'repo')!.reasons).not.toContain('session_cwd');
      expect(rows).toHaveLength(2);
      const orphans = collectOrphanWorktrees([f.repo], {}, f.env, [{ path: f.root, source: 'manual', depth: 1, prefix: 'repo-wt-' }]);
      expect(orphans.snapshot.unassigned[0]!.directory).toBe('repo-wt-orphan');
      expect(orphans.snapshot.unassigned[0]!.reasons).toContain('unregistered');
      expect(again.sizes).toEqual(first.sizes);
      expect(JSON.stringify(again.snapshot)).not.toContain(f.parent);
      expect(decodeWorktrees(again.snapshot)).toEqual(again.snapshot);
      const tainted = structuredClone(again.snapshot);
      tainted.repositories[0]!.worktrees[0]!.directory = f.tree;
      expect(() => decodeWorktrees(tainted)).toThrow('worktrees_invalid');
      const extra = structuredClone(again.snapshot) as any;
      extra.repositories[0].worktrees[0].path = f.tree;
      expect(() => decodeWorktrees(extra)).toThrow('worktrees_invalid');
    } finally { f.cleanup(); }
  });

  test('orphan discovery uses retained Git pointers and leaves unknown directories unassigned', () => {
    const f = fixture();
    try {
      const legacy = join(f.parent, 'legacy');
      const pointed = join(legacy, 'generation', 'retained'), unknown = join(legacy, 'other', 'unknown');
      mkdirSync(pointed, { recursive: true }); mkdirSync(unknown, { recursive: true });
      const common = resolveGitCommonDirectory(f.main);
      writeFileSync(join(pointed, '.git'), `gitdir: ${join(common, 'worktrees/removed')}\n`);
      const other = join(f.parent, 'another', 'repo'); mkdirSync(other, { recursive: true }); initGitRepo(other);
      writeFileSync(join(other, 'base'), 'base'); commitAll(other, 'base');
      const second = { ...f.repo, id: repoHarnessRepoIdFor(other), path: other };
      expect(collectRepositoryWorktrees(second, {}, f.env).snapshot.repositories[0]!.worktrees.map(row => row.directory)).toEqual(['repo']);
      const result = collectOrphanWorktrees([f.repo, second], {}, f.env, [{ path: legacy, source: 'codex' }]);
      expect(result.snapshot.repositories[0]!.worktrees[0]).toMatchObject({ directory: 'retained', judgment: 'yellow', repository_id: f.repo.id });
      expect(result.snapshot.unassigned[0]).toMatchObject({ directory: 'unknown', repository_id: null, judgment: 'yellow' });
      expect(result.snapshot.repositories).toHaveLength(1);
      expect(JSON.stringify(result.snapshot)).not.toContain(f.parent);
    } finally { f.cleanup(); }
  });

  test('collector GET reads are inert and failed probes are unavailable', async () => {
    const f = fixture();
    let calls = 0;
    try {
      writeFileSync(join(f.home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [f.repo] }));
      const collector = startWorktreeCollector({ env: f.env, interval_ms: 60_000, run_process: async () => { calls++; return { ok: false, code: 'timeout' }; } });
      try {
        await collector.settled();
        for (let index = 0; index < 5; index++) expect(collector.read()).toMatchObject({ status: 'partial', repositories: [{ status: 'unavailable', worktrees: [] }] });
        expect(calls).toBe(2);
      } finally { await collector.close(); }
    } finally { f.cleanup(); }
  });
});
