import { execFileSync } from 'child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, readdirSync } from 'fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'path';
import { listLeaseReads } from './coordination-lease-store';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { taskWorktreeRuntimeClosed } from '../terminal/task-session';
import { parseWorktreeTopology } from '../git/worktree-topology';
import { assertOwnedTrashDirectory, deleteUnpublishedTrash, deleteWorktreeTrash, prepareWorktreeTrash, readWorktreeTrash, renameWorktreeToTrash, trashPayload, worktreeTrashNames, type WorktreeRemovalOptions, type WorktreeTrashReceipt } from './worktree-trash';

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
function timeout(limits: Limits): number | undefined {
  if (limits.deadline === undefined) return undefined;
  const remaining = limits.deadline - Date.now();
  if (remaining <= 0) throw new Error('time budget reached');
  return remaining;
}
function git(root: string, args: string[], limits: Limits = {}): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: timeout(limits), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Bind and destructive cleanup serialize across every worktree of this clone. */
export function withWorktreeTopologyLock<T>(root: string, action: () => T, limits: Limits = {}): T {
  return withExclusiveDirectoryLock(resolveGitCommonDirectory(root, 'git', timeout(limits)), 'repo-harness/coordination/locks/worktree-topology.lock', action,
    { waitTimeoutMs: limits.deadline ? Math.max(1, Math.min(50, timeout(limits)!)) : undefined });
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
export function cleanupExactWorktree(root: string, expected: ExactWorktreeCleanup, actuator: () => unknown, limits: Limits = {}, renamedApproval?: WorktreeTrashReceipt) {
  return withWorktreeTopologyLock(root, () => {
    let renamed: WorktreeTrashReceipt | null = null;
    if (renamedApproval) {
      const common = resolveGitCommonDirectory(root, 'git', timeout(limits));
      renamed = readWorktreeTrash(common, dirname(renamedApproval.directory), renamedApproval.directory);
      if (!renamed || !existsSync(trashPayload(renamed)) || renamed.expected.branch !== expected.branch
        || renamed.expected.head_sha !== expected.head_sha || renamed.expected.target_ref !== expected.target_ref
        || renamed.expected.merge_commit_sha !== expected.merge_commit_sha
        || (expected.worktree !== '' && renamed.expected.worktree !== expected.worktree)) throw new Error('renamed cleanup approval does not match');
    }
    // A renamed receipt binds the original inode. Its old name may now belong
    // to another user; registration cleanup must never traverse that new data.
    const path = expected.worktree ? (renamed ? expected.worktree : checkoutPath(expected.worktree)) : '';
    assertNoOwner(root, path, expected.branch, limits);
    if (git(root, ['rev-parse', `${expected.target_ref}^{commit}`], limits) !== expected.target_oid) throw new Error('cleanup target moved');
    git(root, ['merge-base', '--is-ancestor', expected.merge_commit_sha, expected.target_oid], limits);
    if (git(root, ['rev-parse', `refs/heads/${expected.branch}`], limits) !== expected.head_sha) throw new Error('cleanup execution head moved');
    mergeMode(root, expected.head_sha, expected.target_oid, limits);
    const topology = entries(root, limits);
    const binding = topology.find(entry => entry.branch === `refs/heads/${expected.branch}`);
    if (binding && checkoutPath(binding.path) !== path) throw new Error('cleanup worktree target moved');
    if (binding?.locked) throw new Error('cleanup worktree is locked');
    if (renamed && topology.some(entry => protectsCwd(renamed!.directory, checkoutPath(entry.path)))) throw new Error('cleanup trash is still registered');
    if (!renamed && path && existsSync(path)) {
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
    if (!renamed && path && existsSync(path)) throw new Error('cleanup worktree removal is unproven');
    if (entries(root, limits).some(entry => entry.branch === `refs/heads/${expected.branch}`)) throw new Error('cleanup registration removal is unproven');
    if (git(root, ['for-each-ref', '--format=%(refname)', `refs/heads/${expected.branch}`], limits).split('\n').includes(`refs/heads/${expected.branch}`)) throw new Error('cleanup branch deletion is unproven');
    return result;
  }, limits);
}

function deleteCheckedBranch(root: string, expected: ExactWorktreeCleanup, limits: Limits): void {
  const ref = git(root, ['rev-parse', '--symbolic-full-name', expected.target_ref], limits);
  if (!ref.startsWith('refs/')) throw new Error('cleanup target must be a local ref');
  execFileSync('git', ['update-ref', '--stdin'], {
    cwd: root, encoding: 'utf8', timeout: timeout(limits), stdio: ['pipe', 'pipe', 'pipe'],
    input: `start\nverify ${ref} ${expected.target_oid}\ndelete refs/heads/${expected.branch} ${expected.head_sha}\nprepare\ncommit\n`,
  });
}

/** Closeout removes visible data without a deadline. Missing entries share its ref transaction. */
export function removeExactWorktree(root: string, expected: ExactWorktreeCleanup, limits: Limits = {}): void {
  cleanupExactWorktree(root, expected, () => {
    const binding = entries(root, limits).find(entry => entry.branch === `refs/heads/${expected.branch}`);
    if (binding) git(root, ['worktree', 'remove', binding.path], limits);
    deleteCheckedBranch(root, expected, limits);
  }, limits);
}

interface SweepContext {
  readonly main: string;
  readonly cwd: string;
  readonly common: string;
  readonly managedRoot: string;
  readonly managed: (path: string) => boolean;
  readonly limits: Limits & { deadline: number };
  readonly options: WorktreeRemovalOptions;
}
function protectsCwd(path: string, cwd: string): boolean {
  return cwd === path || cwd.startsWith(path + sep);
}

/** Git documents these backpointers. They are read only to fence whole prune,
 * never as a second worktree inventory or to reconstruct a missing value. */
function assertPruneMetadata(context: SweepContext, approval?: WorktreeTrashReceipt): void {
  const directory = join(context.common, 'worktrees');
  if (!existsSync(directory)) return;
  assertOwnedTrashDirectory(directory);
  const observed = entries(context.main, context.limits).slice(1);
  const paths = observed.map(entry => checkoutPath(entry.path));
  if (new Set(paths).size !== paths.length) throw new Error('prune has ambiguous Git registrations');
  for (const name of readdirSync(directory)) {
    timeout(context.limits);
    const path = join(directory, name);
    const stat = assertOwnedTrashDirectory(path);
    if (approval?.git_directory === path && stat.dev === approval.git_directory_dev && stat.ino === approval.git_directory_ino) continue;
    const backpointer = join(path, 'gitdir');
    let link;
    try { link = lstatSync(backpointer); }
    catch { throw new Error('prune has unknown Git registration metadata'); }
    if (!link.isFile() || link.isSymbolicLink()) throw new Error('prune has unsafe Git registration metadata');
    const value = readFileSync(backpointer, 'utf8').trim();
    if (!isAbsolute(value) || basename(value) !== '.git' || !paths.includes(checkoutPath(dirname(value)))) throw new Error('prune has unknown Git registration metadata');
  }
}

/** Git has no registration-only remove option. Prune cannot traverse an old path reoccupied by another user. */
function assertPruneScope(context: SweepContext, approval?: WorktreeTrashReceipt) {
  const { main, cwd, common, managed, limits } = context;
  assertPruneMetadata(context, approval);
  const missing = entries(main, limits).filter(item => item.prunable && !item.locked);
  for (const item of missing) {
    const path = checkoutPath(item.path);
    if (!managed(path) || protectsCwd(path, cwd)) throw new Error('prune would affect a protected path');
    const branch = item.branch?.replace(/^refs\/heads\//, '') ?? (approval?.expected.worktree === path ? approval.expected.branch : null);
    if (!branch) throw new Error('missing branch ownership');
    assertNoOwner(main, path, branch, limits);
    if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: path })) throw new Error('missing runtime is open');
  }
  return missing;
}
function pruneManagedWorktrees(context: SweepContext, approval?: WorktreeTrashReceipt): number {
  const missing = assertPruneScope(context, approval);
  git(context.main, ['worktree', 'prune', '--expire', 'now'], context.limits);
  return missing.length;
}
function assertTrashIsUnregistered(context: SweepContext, directory: string): void {
  if (protectsCwd(directory, context.cwd)) throw new Error('session cwd is in trash');
  if (entries(context.main, context.limits).some(entry => protectsCwd(directory, checkoutPath(entry.path)))) throw new Error('trash is still registered by this clone');
}
function branchExists(context: SweepContext, branch: string): boolean {
  const ref = `refs/heads/${branch}`;
  return git(context.main, ['for-each-ref', '--format=%(refname)', ref], context.limits).split('\n').includes(ref);
}

/** Both the first attempt and recovery execute through the exact cleanup barrier. */
function commitSweepRemoval(context: SweepContext, expected: ExactWorktreeCleanup, pending?: WorktreeTrashReceipt): WorktreeTrashReceipt {
  let receipt = pending;
  const payloadExists = receipt && existsSync(trashPayload(receipt));
  const binding = entries(context.main, context.limits).find(entry => entry.branch === `refs/heads/${expected.branch}`);
  const snapshot = pending ? { ...expected, target_oid: git(context.main, ['rev-parse', `${expected.target_ref}^{commit}`], context.limits) } : expected;
  const identity = payloadExists && !binding ? { ...snapshot, worktree: '' } : snapshot;
  cleanupExactWorktree(context.main, identity, () => {
    if (receipt) assertTrashIsUnregistered(context, receipt.directory);
    // Refuse a whole-prune conflict before renaming any visible checkout.
    assertPruneScope(context, receipt);
    if (!receipt) {
      const gitDirectory = git(context.main, ['-C', expected.worktree, 'rev-parse', '--absolute-git-dir'], context.limits);
      receipt = prepareWorktreeTrash(context.common, context.managedRoot, expected, gitDirectory);
      context.options.afterRemovalStep?.('intent', receipt.directory);
    }
    if (!existsSync(trashPayload(receipt))) {
      timeout(context.limits);
      renameWorktreeToTrash(receipt);
      context.options.afterRemovalStep?.('renamed', receipt.directory);
    }
    pruneManagedWorktrees(context, receipt);
    if (entries(context.main, context.limits).some(entry => checkoutPath(entry.path) === expected.worktree)) throw new Error('cleanup registration removal is unproven');
    context.options.afterRemovalStep?.('unregistered', receipt.directory);
    deleteCheckedBranch(context.main, snapshot, context.limits);
    context.options.afterRemovalStep?.('branch-deleted', receipt.directory);
  }, context.limits, payloadExists ? pending : undefined);
  return receipt!;
}
function resumeSweepTrash(context: SweepContext, directory: string): void {
  let receipt: WorktreeTrashReceipt | null = null;
  withWorktreeTopologyLock(context.main, () => {
    assertTrashIsUnregistered(context, directory);
    receipt = readWorktreeTrash(context.common, context.managedRoot, directory);
    if (!receipt) deleteUnpublishedTrash(directory, context.limits.deadline);
    else if (!context.managed(receipt.expected.worktree)) throw new Error('trash source is outside the managed pattern');
  }, context.limits);
  if (!receipt) return;
  const approved: WorktreeTrashReceipt = receipt;
  if (branchExists(context, approved.expected.branch)) commitSweepRemoval(context, approved.expected, approved);
  withWorktreeTopologyLock(context.main, () => {
    assertTrashIsUnregistered(context, directory);
    assertNoOwner(context.main, approved.expected.worktree, approved.expected.branch, context.limits);
    if (branchExists(context, approved.expected.branch)) throw new Error('trash branch deletion is unproven');
    if (entries(context.main, context.limits).some(entry => checkoutPath(entry.path) === approved.expected.worktree)) throw new Error('trash source is still registered');
    // Re-read immutable identity after the lock boundary. Partly deleted data needs no new Git status check.
    const current = readWorktreeTrash(context.common, context.managedRoot, directory);
    if (!current) throw new Error('trash approval disappeared');
    deleteWorktreeTrash(current, context.limits.deadline, context.options);
  }, context.limits);
}

/** Local refs and this clone's Git inventory are the only live worktree inputs. */
export function sweepManagedWorktrees(root: string, sessionCwd: string, env: NodeJS.ProcessEnv = process.env, options: WorktreeRemovalOptions = {}): string | null {
  const limits = { deadline: Date.now() + 2_000 };
  const notes: string[] = [];
  let removed = 0, pruned = 0, resumed = 0, deferred = 0;
  try {
    const topology = entries(root, limits);
    const primary = topology[0];
    if (!primary) return null;
    const main = checkoutPath(primary.path);
    const cwd = realpathSync(sessionCwd);
    const managedRoot = realpathSync(env.REPO_HARNESS_WORKTREE_ROOT ?? '/tmp');
    const prefix = `${basename(main)}-wt-`;
    const managed = (path: string) => dirname(path) === managedRoot && basename(path).startsWith(prefix) && basename(path).length > prefix.length;
    const common = resolveGitCommonDirectory(main, 'git', timeout(limits));
    const context: SweepContext = { main, cwd, common, managedRoot, managed, limits, options };
    // Recovery precedes live selection, so an interrupted registration is not mistaken for reboot loss.
    const trash = worktreeTrashNames(common, managedRoot);
    let trashBlocked = false;
    for (const directory of trash.slice(0, 8)) {
      try { timeout(limits); resumeSweepTrash(context, directory); resumed++; notes.push(`${directory}: resumed`); }
      catch (error) { trashBlocked = true; notes.push(`${directory}: kept; ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`); }
    }
    deferred += Math.max(0, trash.length - 8);
    if (trashBlocked || trash.length > 8) return `[WorktreeSweep] removed=0 pruned=0 resumed=${resumed} deferred=${deferred}\n${notes.join('\n')}`;
    const candidates = entries(main, limits).slice(1).filter(entry => managed(checkoutPath(entry.path)));
    if (!candidates.length) return notes.length ? `[WorktreeSweep] removed=${removed} pruned=${pruned} resumed=${resumed} deferred=${deferred}\n${notes.join('\n')}` : null;
    let policy: { worktree_strategy?: { merge_back?: { target?: unknown } } } = {};
    const policyPath = join(main, '.ai/harness/policy.json');
    if (existsSync(policyPath)) policy = JSON.parse(readFileSync(policyPath, 'utf8'));
    const configured = policy.worktree_strategy?.merge_back?.target ?? 'main';
    if (typeof configured !== 'string' || !configured || configured.startsWith('-')) throw new Error('integration target is invalid');
    const targetRef = configured.startsWith('refs/') || configured.includes('/') ? configured : `refs/remotes/origin/${configured}`;
    let target: string;
    try { target = git(main, ['rev-parse', '--verify', `${targetRef}^{commit}`], limits); }
    catch { throw new Error(`local integration target is unavailable: ${targetRef}`); }
    for (const entry of candidates.slice(0, 8)) {
      const path = checkoutPath(entry.path);
      try {
        timeout(limits);
        if (path === main || protectsCwd(path, cwd)) throw new Error('session cwd');
        if (entry.locked) throw new Error('locked');
        if (!entry.branch?.startsWith('refs/heads/') || !entry.head) throw new Error('no local branch');
        const branch = entry.branch.slice('refs/heads/'.length);
        assertNoOwner(main, path, branch, limits);
        if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: path })) throw new Error('runtime is open');
        if (!existsSync(path)) {
          withWorktreeTopologyLock(main, () => { pruned += pruneManagedWorktrees(context); }, limits);
          try { mergeMode(main, entry.head, target, limits); }
          catch { notes.push(`${path}: pruned; unmerged branch kept (${branch})`); continue; }
          removeExactWorktree(main, { worktree: path, branch, head_sha: entry.head, target_ref: targetRef, target_oid: target, merge_commit_sha: target }, limits);
        } else {
          const receipt = commitSweepRemoval(context, { worktree: path, branch, head_sha: entry.head, target_ref: targetRef, target_oid: target, merge_commit_sha: target });
          removed++;
          notes.push(`${path}: removed`);
          // No detached child: each unlink is resumable and checks the same deadline.
          try { resumeSweepTrash(context, receipt.directory); }
          catch (error) { notes.push(`${receipt.directory}: pending; ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`); }
          continue;
        }
        removed++;
        notes.push(`${path}: removed`);
      } catch (error) {
        notes.push(`${path}: kept; ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      }
    }
    deferred += Math.max(0, candidates.length - 8);
    return `[WorktreeSweep] removed=${removed} pruned=${pruned} kept=${candidates.length - removed} resumed=${resumed} deferred=${deferred}\n${notes.join('\n')}`;
  } catch (error) {
    return `${notes.length ? notes.join('\n') + '\n' : ''}worktree sweep skipped: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  }
}
