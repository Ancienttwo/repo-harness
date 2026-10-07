import { execFileSync } from 'child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, readdirSync } from 'fs';
import { basename, dirname, join, resolve, sep } from 'path';
import { listLeaseReads } from './coordination-lease-store';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { taskWorktreeRuntimeClosed } from '../terminal/task-session';
import { parseWorktreeTopology } from '../git/worktree-topology';

/** Locate the owning package in source and in the shipped hook bundle. */
function mergeLibraryPath(): string {
  let directory = realpathSync(import.meta.dir);
  while (true) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      const stat = lstatSync(manifest);
      if (!stat.isFile() || stat.isSymbolicLink() || JSON.parse(readFileSync(manifest, 'utf8')).name !== 'repo-harness') throw new Error('worktree merge package is invalid');
      const library = join(directory, 'scripts/worktree-merge-lib.sh');
      let file;
      try { file = lstatSync(library); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('worktree merge library is unavailable'); throw error; }
      if (!file.isFile() || file.isSymbolicLink()) throw new Error('worktree merge library is invalid');
      return library;
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error('worktree merge package is unavailable');
    directory = parent;
  }
}
type Limits = { deadline?: number };
function timeout(limits: Limits): number {
  const remaining = (limits.deadline ?? Date.now() + 30_000) - Date.now();
  if (remaining <= 0) throw new Error('time budget reached');
  return remaining;
}
function git(root: string, args: string[], limits: Limits = {}): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: timeout(limits), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Bind and destructive cleanup serialize across every worktree of this clone. */
export function withWorktreeTopologyLock<T>(root: string, action: () => T, limits: Limits = {}): T {
  return withExclusiveDirectoryLock(resolveGitCommonDirectory(root, 'git', timeout(limits)), 'repo-harness/coordination/locks/worktree-topology.lock', action,
    { waitTimeoutMs: limits.deadline ? 1 : undefined });
}

/** Canonicalize a missing checkout through its existing parent. Never follow its leaf. */
function checkoutPath(path: string): string {
  try {
    const entry = lstatSync(path);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('worktree path is not a real directory');
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return join(realpathSync(dirname(path)), basename(path));
  }
}
function entries(root: string, limits: Limits = {}) {
  return parseWorktreeTopology(git(root, ['-c', 'core.quotePath=false', 'worktree', 'list', '--porcelain'], limits)).worktrees;
}

export function assertWorktreeBinding(root: string, worktree: string, branch: string, limits: Limits = {}): void {
  const canonical = checkoutPath(worktree);
  if (!entries(root, limits).some(entry => checkoutPath(entry.path) === canonical && entry.branch === `refs/heads/${branch}`)) throw new Error('execution worktree is not registered in this clone');
  if (resolveGitCommonDirectory(root, 'git', timeout(limits)) !== resolveGitCommonDirectory(worktree, 'git', timeout(limits))) throw new Error('execution worktree is not in this clone');
  if (git(worktree, ['symbolic-ref', '--quiet', 'HEAD'], limits) !== `refs/heads/${branch}`) throw new Error('execution branch changed before bind');
}

export interface ExactWorktreeCleanup {
  readonly worktree: string;
  readonly branch: string;
  readonly head_sha: string;
  readonly target_ref: string;
  readonly target_oid: string;
  readonly merge_commit_sha: string;
}

function mergeMode(root: string, head: string, target: string, limits: Limits): string {
  const output = execFileSync('bash', [mergeLibraryPath(), '--target', target, head], {
    cwd: root, encoding: 'utf8', timeout: timeout(limits), stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const mode = output.split('\t')[1];
  if (mode !== 'ancestor' && mode !== 'absorbed') throw new Error('cleanup merge is unproven');
  return mode;
}

function assertNoOwner(root: string, worktree: string, branch: string, limits: Limits): void {
  for (const lease of listLeaseReads(root, timeout(limits))) {
    if (!lease.record) throw new Error('cleanup has unknown Lease ownership');
    if (lease.record.branch === branch || (lease.record.execution_worktree !== null && checkoutPath(lease.record.execution_worktree) === worktree)) throw new Error('cleanup has an active Lease reference');
  }
  for (const entry of entries(root, limits)) {
    const marker = join(entry.path, '.ai/harness/active-worktree');
    timeout(limits);
    let stat;
    try { stat = lstatSync(marker); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('cleanup has unknown active-worktree marker');
    const owner = readFileSync(marker, 'utf8').trim();
    if (!owner) throw new Error('cleanup has unknown active-worktree marker');
    if (checkoutPath(resolve(entry.path, owner)) === worktree) throw new Error('cleanup has an active-worktree marker reference');
  }
}

/** The actuator runs inside the same barrier as final bind, including readback. */
export function cleanupExactWorktree(root: string, expected: ExactWorktreeCleanup, actuator: () => unknown, limits: Limits = {}) {
  return withWorktreeTopologyLock(root, () => {
    const path = expected.worktree ? checkoutPath(expected.worktree) : '';
    assertNoOwner(root, path, expected.branch, limits);
    if (git(root, ['rev-parse', `${expected.target_ref}^{commit}`], limits) !== expected.target_oid) throw new Error('cleanup target moved');
    git(root, ['merge-base', '--is-ancestor', expected.merge_commit_sha, expected.target_oid], limits);
    if (git(root, ['rev-parse', `refs/heads/${expected.branch}`], limits) !== expected.head_sha) throw new Error('cleanup execution head moved');
    mergeMode(root, expected.head_sha, expected.target_oid, limits);
    const topology = entries(root, limits);
    const binding = topology.find(entry => entry.branch === `refs/heads/${expected.branch}`);
    if (binding && checkoutPath(binding.path) !== path) throw new Error('cleanup worktree target moved');
    if (binding?.locked) throw new Error('cleanup worktree is locked');
    if (path && existsSync(path)) {
      if (!binding) throw new Error('cleanup worktree is not registered in this clone');
      if (checkoutPath(root) === path) throw new Error('cleanup cannot remove its current worktree');
      assertWorktreeBinding(root, path, expected.branch, limits);
      if (git(path, ['rev-parse', 'HEAD'], limits) !== expected.head_sha) throw new Error('cleanup execution head moved');
      if (git(path, ['status', '--porcelain', '--untracked-files=all'], limits)) throw new Error('cleanup_blocked_dirty_worktree');
      if (existsSync(join(path, '.ai/harness/evidence/events/log.jsonl'))
        && lstatSync(join(path, '.ai/harness/evidence/events/log.jsonl')).size > 0) throw new Error('native verification evidence retention is unavailable');
      const runs = join(path, '.ai/harness/runs');
      if (existsSync(runs) && readdirSync(runs).some(name => /^verification-.*\.json$/.test(name))) throw new Error('native verification evidence retention is unavailable');
    }
    const result = actuator();
    if (path && existsSync(path)) throw new Error('cleanup worktree removal is unproven');
    if (entries(root, limits).some(entry => entry.branch === `refs/heads/${expected.branch}`)) throw new Error('cleanup registration removal is unproven');
    if (git(root, ['for-each-ref', '--format=%(refname)', `refs/heads/${expected.branch}`], limits).split('\n').includes(`refs/heads/${expected.branch}`)) throw new Error('cleanup branch deletion is unproven');
    return result;
  }, limits);
}

/** One Git actuator for closeout, MCP and the SessionStart sweep. */
export function removeExactWorktree(root: string, expected: ExactWorktreeCleanup, limits: Limits = {}): void {
  cleanupExactWorktree(root, expected, () => {
    const binding = entries(root, limits).find(entry => entry.branch === `refs/heads/${expected.branch}`);
    if (binding) git(root, ['worktree', 'remove', binding.path], limits);
    const ref = git(root, ['rev-parse', '--symbolic-full-name', expected.target_ref], limits);
    if (!ref.startsWith('refs/')) throw new Error('cleanup target must be a local ref');
    execFileSync('git', ['update-ref', '--stdin'], {
      cwd: root, encoding: 'utf8', timeout: timeout(limits), stdio: ['pipe', 'pipe', 'pipe'],
      input: `start\nverify ${ref} ${expected.target_oid}\ndelete refs/heads/${expected.branch} ${expected.head_sha}\nprepare\ncommit\n`,
    });
  }, limits);
}

/** Local refs and this clone's Git inventory are the only sweep inputs. */
export function sweepManagedWorktrees(root: string, sessionCwd: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const limits = { deadline: Date.now() + 2_000 };
  const notes: string[] = [];
  let removed = 0, pruned = 0;
  try {
    const topology = entries(root, limits);
    const primary = topology[0];
    if (!primary) return null;
    const main = checkoutPath(primary.path);
    const cwd = realpathSync(sessionCwd);
    const managedRoot = realpathSync(env.REPO_HARNESS_WORKTREE_ROOT ?? '/tmp');
    const prefix = `${basename(main)}-wt-`;
    const managed = (path: string) => dirname(path) === managedRoot && basename(path).startsWith(prefix) && basename(path).length > prefix.length;
    const candidates = topology.slice(1).filter(entry => managed(checkoutPath(entry.path)));
    if (!candidates.length) return null;
    let policy: { worktree_strategy?: { merge_back?: { target?: unknown } } } = {};
    const policyPath = join(main, '.ai/harness/policy.json');
    if (existsSync(policyPath)) policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    const configured = policy.worktree_strategy?.merge_back?.target ?? 'main';
    if (typeof configured !== 'string' || !configured || configured.startsWith('-')) throw new Error('integration target is invalid');
    // Prefer the local remote-tracking ref. Never fetch from SessionStart.
    const targetRef = configured.startsWith('refs/') || configured.includes('/') ? configured : `refs/remotes/origin/${configured}`;
    let target: string;
    try { target = git(main, ['rev-parse', '--verify', `${targetRef}^{commit}`], limits); }
    catch { throw new Error(`local integration target is unavailable: ${targetRef}`); }
    const common = resolveGitCommonDirectory(main, 'git', timeout(limits));
    for (const entry of candidates.slice(0, 8)) {
      const path = checkoutPath(entry.path);
      try {
        timeout(limits);
        if (path === main || cwd === path || cwd.startsWith(path + sep)) throw new Error('session cwd');
        if (entry.locked) throw new Error('locked');
        if (!entry.branch?.startsWith('refs/heads/') || !entry.head) throw new Error('no local branch');
        const branch = entry.branch.slice('refs/heads/'.length);
        assertNoOwner(main, path, branch, limits);
        if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: path })) throw new Error('runtime is open');
        if (!existsSync(path)) {
          // Git prune has no path filter. Refuse if its mutation could reach any
          // missing entry outside this sweep, or a protected current checkout.
          withWorktreeTopologyLock(main, () => {
            const missing = entries(main, limits).filter(item => item.prunable && !item.locked);
            if (missing.some(item => !managed(checkoutPath(item.path)) || cwd === checkoutPath(item.path) || cwd.startsWith(checkoutPath(item.path) + sep))) throw new Error('prune would affect a protected path');
            for (const item of missing) {
              if (!item.branch) throw new Error('missing branch ownership');
              assertNoOwner(main, checkoutPath(item.path), item.branch.replace(/^refs\/heads\//, ''), limits);
              if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: checkoutPath(item.path) })) throw new Error('missing runtime is open');
            }
            git(main, ['worktree', 'prune', '--expire', 'now'], limits);
            pruned += missing.length;
          }, limits);
          try { mergeMode(main, entry.head, target, limits); }
          catch { notes.push(`${path}: pruned; unmerged branch kept (${branch})`); continue; }
        }
        removeExactWorktree(main, {
          worktree: path, branch, head_sha: entry.head,
          target_ref: targetRef, target_oid: target, merge_commit_sha: target,
        }, limits);
        removed++;
        notes.push(`${path}: removed`);
      } catch (error) {
        const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
        notes.push(`${path}: kept; ${reason}`);
      }
    }
    return `[WorktreeSweep] removed=${removed} pruned=${pruned} kept=${candidates.length - removed} deferred=${Math.max(0, candidates.length - 8)}\n${notes.join('\n')}`;
  } catch (error) {
    return `worktree sweep skipped: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  }
}
