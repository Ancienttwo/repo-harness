import { expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createCleanupPlan, cleanupPlanSelectionDigest, executeCleanupPlan } from '../../src/effects/operator/worktree-cleanup-plan';
import { removeCleanupWorktree, reconcileCleanupWorktree, type CleanupRemovalInput, type CleanupRemovalOptions } from '../../src/effects/operator/worktree-cleanup-removal';
import { stageCleanupArchive, type StagedCleanupArchive } from '../../src/effects/operator/worktree-cleanup-archive';
import { observeCleanupLoss } from '../../src/effects/operator/worktree-cleanup-observation';
import { worktreeId } from '../../src/effects/git/worktree-record';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { worktreeTrashPrefix } from '../../src/effects/git/repository-identity';
import { inspectWorktree } from '../../src/effects/state/coordination-worktree-topology';
import { worktreeTrashNames } from '../../src/effects/state/worktree-trash';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';
import type { WorktreeView } from '../../src/core/operator/worktrees';

const sid = 'a'.repeat(32), repoId = `repo_${'b'.repeat(16)}`;
function fixture(orphan = false, sharedParent = false) {
  const parent = tmpWorkspace('cleanup-removal'), repo = join(parent, 'repo'), treeParent = sharedParent ? realpathSync('/tmp') : parent;
  const tree = join(treeParent, sharedParent ? `repo-wt-cleanup-fixture-${randomUUID()}` : 'repo-wt-feature'), remote = join(parent, 'remote.git');
  const home = join(parent, 'home'), staging = join(parent, 'staging');
  for (const path of [repo, home, staging]) mkdirSync(path, { mode: 0o700 });
  initGitRepo(repo); writeFileSync(join(repo, 'tracked.txt'), 'base\n'); writeFileSync(join(repo, '.gitignore'), '.env\n'); commitAll(repo, 'base');
  const git = (cwd: string, ...args: string[]) => { const r = run('git', args, cwd); expect(r.status).toBe(0); return r.stdout.trim(); };
  git(parent, 'init', '--bare', remote); git(repo, 'remote', 'add', 'origin', remote); git(repo, 'push', '-u', 'origin', 'main');
  if (orphan) { mkdirSync(tree); writeFileSync(join(tree, 'leftover.txt'), 'orphan fixture\n'); }
  else git(repo, 'worktree', 'add', '-b', 'feature', tree);
  const env = { ...process.env, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: treeParent };
  const target = { repository: repo, worktree: tree, id: worktreeId(resolveGitCommonDirectory(repo), tree), kind: orphan ? 'orphan' as const : 'registered' as const };
  const archiveOptions = () => ({ env, deadline: Date.now() + 20_000, staging_root: staging });
  let preserved = 0, checked = 0;
  let stagedArchive: StagedCleanupArchive | null = null;
  const input = (archive = false, privatePaths = ['.env']): CleanupRemovalInput => {
    const worktree: WorktreeView = { id: target.id, repository_id: repoId, directory: 'repo-wt-feature', branch: orphan ? null : 'feature', source: 'manual',
      size_bytes: null, size_observed_at: null, record: null, ...inspectWorktree(repo, tree, repo, { env, processes: [] }) };
    const loss = observeCleanupLoss(target, archiveOptions());
    const item = createCleanupPlan(sid, [{ observation: { worktree, loss }, advice: { recommendation: archive ? 'archive_then_delete' : 'delete',
      reason: 'Fixture approval.', evidence: ['Fixture reviewed.'], archive: { git: null, private: archive ? { directory: repoId, paths: privatePaths } : null } } }]).items[0]!;
    const staged = archive ? stageCleanupArchive(sid, target, item, archiveOptions()) : null;
    stagedArchive = staged;
    return { session_id: sid, target, item, loss, archive: staged ? { manifest_sha256: staged.manifest_sha256, pr: null } : null };
  };
  const options = (): CleanupRemovalOptions => ({ ...archiveOptions(), caller_cwd: repo, processes: () => [], verify: async () => { checked++; },
    verifyPreservation: async value => {
      preserved++;
      const refs = git(repo, 'ls-remote', '--heads', 'origin');
      for (const ref of value.loss.remote_refs) expect(refs).toContain(ref.oid);
      if (value.archive) {
        expect(stagedArchive?.manifest_sha256).toBe(value.archive.manifest_sha256);
        if (stagedArchive?.manifest_sha256 !== value.archive.manifest_sha256) throw new Error('fixture archive preservation changed');
        for (const file of stagedArchive.artifacts) {
          const bytes = readFileSync(join(stagedArchive.private_directory!, file.path));
          if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error('fixture archive preservation changed');
        }
        expect(readFileSync(join(stagedArchive.private_directory!, '.env'), 'utf8')).toBe('SYNTHETIC=fixture\n');
      }
    } });
  const prefix = worktreeTrashPrefix(resolveGitCommonDirectory(repo)) + 'authorized-';
  const receiptDir = () => join(treeParent, readdirSync(treeParent).find(name => name.startsWith(prefix))!);
  return { parent, repo, tree, remote, home, env, target, input, options, git, receiptDir, archiveDir: () => stagedArchive!.private_directory!, counts: () => ({ preserved, checked }), cleanup: () => {
    if (sharedParent) {
      rmSync(tree, { recursive: true, force: true });
      for (const name of readdirSync(treeParent).filter(name => name.startsWith(prefix))) rmSync(join(treeParent, name), { recursive: true, force: true });
    }
    rmSync(parent, { recursive: true, force: true });
  } };
}

test('authorized dirty worktree archives private bytes, removes only its local branch and retains a terminal receipt', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'tracked.txt'), 'approved change\n'); writeFileSync(join(f.tree, '.env'), 'SYNTHETIC=fixture\n');
    const input = f.input(true);
    expect(reconcileCleanupWorktree(input, Date.now() + 20_000)).toEqual({ state: 'absent' });
    await removeCleanupWorktree(input, f.options());
    expect(existsSync(f.tree)).toBe(false); expect(f.git(f.repo, 'branch', '--list', 'feature')).toBe('');
    expect(f.git(f.repo, 'ls-remote', '--heads', 'origin')).toContain('refs/heads/main');
    expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('completed');
    expect(existsSync(join(f.receiptDir(), 'completed.json'))).toBe(true);
    expect(worktreeTrashNames(resolveGitCommonDirectory(f.repo), f.parent)).toEqual([]);
    expect(f.counts()).toEqual({ preserved: 3, checked: 1 });
  } finally { f.cleanup(); }
});

test('orphan removal never follows its stale Git pointer and leaves an unrelated directory intact', async () => {
  const f = fixture(true);
  try {
    const outside = join(f.parent, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'keep'), 'keep');
    writeFileSync(join(f.tree, '.git'), `gitdir: ${outside}\n`); symlinkSync(outside, join(f.tree, 'link'));
    const input = f.input(); await removeCleanupWorktree(input, f.options());
    expect(readFileSync(join(outside, 'keep'), 'utf8')).toBe('keep'); expect(existsSync(f.tree)).toBe(false);
    expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('completed');
  } finally { f.cleanup(); }
});

for (const step of ['intent', 'renamed', 'unregistered', 'branch-deleted', 'trash-entry-deleted'] as const) test(`authorized recovery after ${step} uses the exact receipt`, async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'tracked.txt'), 'approved change\n'); const input = f.input();
    let interrupted = false;
    await expect(removeCleanupWorktree(input, { ...f.options(), afterRemovalStep(actual) { if (actual === step && !interrupted) { interrupted = true; throw new Error('fixture interruption'); } } })).rejects.toThrow('fixture interruption');
    expect(interrupted).toBe(true); expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('pending');
    await removeCleanupWorktree(input, f.options());
    expect(existsSync(f.tree)).toBe(false); expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('completed');
  } finally { f.cleanup(); }
});

test('core retry after a lost removal result reaches terminal receipt without observing the missing worktree', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'tracked.txt'), 'approved change\n'); const input = f.input();
    const plan = { protocol: 1 as const, kind: 'operator_worktree_cleanup_plan' as const, session_id: sid, items: [input.item] };
    const request = { session_id: sid, ids: [input.target.id], expected_digest: cleanupPlanSelectionDigest(plan, [input.target.id]),
      approvals: [{ id: input.target.id, plan_sha256: input.item.plan_sha256, loss_sha256: input.item.loss_sha256! }] };
    let observations = 0;
    const ports = { loadPlan: async () => plan, observe: async () => { observations++; return { worktree: input.item.worktree, loss: observeCleanupLoss(f.target, f.options()) }; },
      reconcile: async () => reconcileCleanupWorktree(input, Date.now() + 20_000), archiveCommit: async () => {}, archivePush: async () => {}, archivePr: async () => null,
      remove: async (_key: string, _item: unknown, verify: () => Promise<void>) => { await removeCleanupWorktree(input, { ...f.options(), verify }); throw new Error('lost response'); } };
    expect((await executeCleanupPlan(request, ports)).items[0]!.outcome).toBe('reconcile_required');
    const before = observations;
    expect((await executeCleanupPlan(request, ports)).items[0]!.outcome).toBe('removed');
    expect(observations).toBe(before);
  } finally { f.cleanup(); }
});

test('stale content, provider failure, occupied targets and another missing registration refuse before mutation', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'tracked.txt'), 'approved change\n'); const input = f.input();
    await expect(removeCleanupWorktree(input, { ...f.options(), verifyPreservation: async () => { throw new Error('remote unavailable'); } })).rejects.toThrow('remote unavailable');
    expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('absent');
    await expect(removeCleanupWorktree(input, { ...f.options(), processes: () => [{ pid: 12345, cwd: f.tree }] })).rejects.toThrow('in use');
    writeFileSync(join(f.tree, 'tracked.txt'), 'changed after approval\n');
    await expect(removeCleanupWorktree(input, f.options())).rejects.toThrow('loss changed');
    writeFileSync(join(f.tree, 'tracked.txt'), 'approved change\n');
    const other = join(f.parent, 'repo-wt-other'); f.git(f.repo, 'worktree', 'add', '-b', 'other', other); rmSync(other, { recursive: true });
    await expect(removeCleanupWorktree(input, f.options())).rejects.toThrow('protected path');
    expect(readFileSync(join(f.tree, 'tracked.txt'), 'utf8')).toBe('approved change\n');
  } finally { f.cleanup(); }
});

test('recovery refuses changed branch, replacement source and corrupted completion without touching them', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, 'tracked.txt'), 'approved change\n'); const input = f.input();
    await expect(removeCleanupWorktree(input, { ...f.options(), afterRemovalStep(step) { if (step === 'renamed') throw new Error('fixture stop'); } })).rejects.toThrow('fixture stop');
    mkdirSync(f.tree); writeFileSync(join(f.tree, 'replacement'), 'keep');
    await expect(removeCleanupWorktree(input, f.options())).rejects.toThrow('reused');
    expect(readFileSync(join(f.tree, 'replacement'), 'utf8')).toBe('keep'); rmSync(f.tree, { recursive: true });
    const before = f.git(f.repo, 'rev-parse', 'HEAD');
    writeFileSync(join(f.repo, 'new.txt'), 'new\n'); commitAll(f.repo, 'new'); f.git(f.repo, 'update-ref', 'refs/heads/feature', 'HEAD');
    await expect(removeCleanupWorktree(input, f.options())).rejects.toThrow();
    expect(f.git(f.repo, 'rev-parse', 'feature')).toBe(f.git(f.repo, 'rev-parse', 'HEAD'));
    f.git(f.repo, 'update-ref', 'refs/heads/feature', before); await removeCleanupWorktree(input, f.options());
    writeFileSync(join(f.receiptDir(), 'completed.json'), '{}\n');
    expect(() => reconcileCleanupWorktree(input, Date.now() + 20_000)).toThrow('completion invalid');
  } finally { f.cleanup(); }
});

test('explicit approval removes a locked worktree with a marker after archive and occupancy checks', async () => {
  const f = fixture();
  try {
    mkdirSync(join(f.tree, '.ai/harness'), { recursive: true }); writeFileSync(join(f.tree, '.ai/harness/active-worktree'), f.tree);
    f.git(f.repo, 'worktree', 'lock', f.tree);
    const input = f.input(); expect(input.item.worktree.reasons).toContain('locked'); expect(input.item.worktree.reasons).toContain('owner');
    await removeCleanupWorktree(input, f.options());
    expect(existsSync(f.tree)).toBe(false); expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('completed');
  } finally { f.cleanup(); }
});

test('authorized receipt supports a direct child of the real shared sticky temporary root', async () => {
  const f = fixture(false, true);
  try {
    expect(statSync(dirname(f.tree)).mode & 0o1000).toBe(0o1000);
    writeFileSync(join(f.tree, 'tracked.txt'), 'approved change\n'); const input = f.input();
    await removeCleanupWorktree(input, f.options());
    expect(existsSync(f.tree)).toBe(false); expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('completed');
  } finally { f.cleanup(); }
});

for (const failure of ['deleted archive', 'corrupt archive', 'provider refusal'] as const) test(`recovery preserves the pending payload after ${failure}`, async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, '.env'), 'SYNTHETIC=fixture\n');
    writeFileSync(join(f.tree, 'tracked.txt'), 'index-only fixture\n'); f.git(f.tree, 'add', 'tracked.txt');
    writeFileSync(join(f.tree, 'tracked.txt'), 'working fixture\n');
    const admin = f.git(f.tree, 'rev-parse', '--absolute-git-dir');
    const input = f.input(true, ['.env', 'tracked.txt']);
    await expect(removeCleanupWorktree(input, { ...f.options(), afterRemovalStep(step) { if (step === 'renamed') throw new Error('fixture interruption'); } })).rejects.toThrow('fixture interruption');
    const payload = join(f.receiptDir(), 'worktree');
    const archiveFile = join(f.archiveDir(), '.env');
    if (failure === 'deleted archive') rmSync(archiveFile);
    if (failure === 'corrupt archive') writeFileSync(archiveFile, 'corrupt fixture\n');
    const retry = f.options();
    await expect(removeCleanupWorktree(input, { ...retry,
      verify: async () => { throw new Error('live source verification must not run during recovery'); },
      ...(failure === 'provider refusal' ? { verifyPreservation: async () => { throw new Error('fixture provider refused'); } } : {}),
    })).rejects.toThrow();
    expect(readFileSync(join(payload, '.env'), 'utf8')).toBe('SYNTHETIC=fixture\n');
    expect(existsSync(join(admin, 'index'))).toBe(true);
    expect(f.git(f.repo, 'branch', '--list', 'feature')).toContain('feature');
    expect(existsSync(join(f.receiptDir(), 'completed.json'))).toBe(false);
    expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('pending');
    if (failure !== 'provider refusal') writeFileSync(archiveFile, 'SYNTHETIC=fixture\n', { mode: 0o600 });
    await removeCleanupWorktree(input, { ...f.options(), verify: async () => { throw new Error('source is absent'); } });
    expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('completed');
  } finally { f.cleanup(); }
});

test('recovery refuses an unlocked registration rebound to another branch in the same admin directory', async () => {
  const f = fixture();
  try {
    f.git(f.repo, 'branch', 'other', 'main');
    const admin = f.git(f.tree, 'rev-parse', '--absolute-git-dir'), inode = statSync(admin).ino;
    writeFileSync(join(f.tree, 'tracked.txt'), 'approved change\n'); const input = f.input();
    await expect(removeCleanupWorktree(input, { ...f.options(), afterRemovalStep(step) { if (step === 'renamed') throw new Error('fixture interruption'); } })).rejects.toThrow('fixture interruption');
    writeFileSync(join(admin, 'HEAD'), 'ref: refs/heads/other\n'); expect(statSync(admin).ino).toBe(inode);
    await expect(removeCleanupWorktree(input, f.options())).rejects.toThrow();
    expect(readFileSync(join(f.receiptDir(), 'worktree/tracked.txt'), 'utf8')).toBe('approved change\n');
    expect(readFileSync(join(admin, 'HEAD'), 'utf8')).toBe('ref: refs/heads/other\n');
    expect(f.git(f.repo, 'branch', '--list', 'feature')).toContain('feature');
    expect(f.git(f.repo, 'branch', '--list', 'other')).toContain('other');
    expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('pending');
  } finally { f.cleanup(); }
});

for (const field of ['HEAD', 'gitdir', 'commondir'] as const) test(`recovery rejects changed ${field} metadata before pruning a pending registration`, async () => {
  const f = fixture();
  try {
    const other = f.git(f.repo, 'commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'other fixture commit');
    f.git(f.repo, 'update-ref', 'refs/heads/other', other);
    const admin = f.git(f.tree, 'rev-parse', '--absolute-git-dir'); const input = f.input();
    const approved = f.git(f.repo, 'rev-parse', 'feature');
    await expect(removeCleanupWorktree(input, { ...f.options(), afterRemovalStep(step) { if (step === 'renamed') throw new Error('fixture interruption'); } })).rejects.toThrow('fixture interruption');
    const changed = field === 'HEAD' ? other + '\n' : field === 'gitdir' ? join(f.parent, 'rebound/.git') + '\n' : f.remote + '\n';
    writeFileSync(join(admin, field), changed);
    await expect(removeCleanupWorktree(input, f.options())).rejects.toThrow();
    expect(readFileSync(join(admin, field), 'utf8')).toBe(changed);
    expect(readFileSync(join(f.receiptDir(), 'worktree/tracked.txt'), 'utf8')).toBe('base\n');
    expect(f.git(f.repo, 'rev-parse', 'refs/heads/feature')).toBe(approved);
    expect(f.git(f.repo, 'rev-parse', 'refs/heads/other')).toBe(other);
    expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('pending');
  } finally { f.cleanup(); }
});

test('the final deletion barrier rechecks preservation after the same attempt has renamed the source', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.tree, '.env'), 'SYNTHETIC=fixture\n'); const input = f.input(true);
    await expect(removeCleanupWorktree(input, { ...f.options(), afterRemovalStep(step) {
      if (step === 'branch-deleted') writeFileSync(join(f.archiveDir(), '.env'), 'corrupt fixture\n');
    } })).rejects.toThrow('preservation changed');
    expect(readFileSync(join(f.receiptDir(), 'worktree/.env'), 'utf8')).toBe('SYNTHETIC=fixture\n');
    expect(reconcileCleanupWorktree(input, Date.now() + 20_000).state).toBe('pending');
  } finally { f.cleanup(); }
});
