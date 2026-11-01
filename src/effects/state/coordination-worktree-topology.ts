import { isManagedWorktreePath, managedWorktreeRoot } from '../git/managed-worktree';
import type { WorktreeReason, WorktreeView } from '../../core/operator/worktrees';
import { worktreeProcesses, type WorktreeProcess } from '../git/worktree-processes';
import { readWorktreeRecord, readWorktreeRecordById, endWorktreeRecord } from '../git/worktree-record';
import { createHash, randomUUID } from 'crypto';
import { execFileSync } from 'child_process';
import { gitExecFileSync, withoutRepositorySelectingGitEnv } from '../git/runner';
import { existsSync, lstatSync, readFileSync, realpathSync, readdirSync, unlinkSync, mkdirSync, renameSync } from 'fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'path';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../atomic-append';
import { readPrunedWorktreeIntents, writePrunedWorktreeIntents, prunedIntentKey, type PrunedWorktreeIntent } from './pruned-worktree-intents';
import { configuredGitBinary, resolveGitCommonDirectory, resolveGitCommonDirectoryAsync } from '../git/common-directory';
import { acquireExclusiveDirectoryLock, withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { taskWorktreeRuntimeClosed } from '../terminal/task-session';
import { parseWorktreeTopology } from '../git/worktree-topology';
import { observeProviderBranchMergeCommit } from './coordination-provider-merge';
import { resolveTrustedGhExecutable } from '../runtime/protected-helper-platform';
import { worktreeUid, assertOwnedTrashDirectory, discardWorktreeTrashApproval, deleteUnpublishedTrash, deleteWorktreeTrash, prepareWorktreeTrash, readWorktreeTrash, renameWorktreeToTrash, trashPayload, worktreeTrashNames, WorktreeTrashBudgetReached, type WorktreeRemovalOptions, type WorktreeTrashReceipt } from './worktree-trash';
import { authorizedWorktreeTrashCompleted, completeAuthorizedWorktreeTrash, prepareAuthorizedWorktreeTrash, readAuthorizedWorktreeTrash, recordAuthorizedWorktreeTrashRename,
  type AuthorizedWorktreeCleanup, type AuthorizedWorktreeTrashReceipt } from './worktree-trash';

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
type Limits = { deadline?: number; gitBin?: string; closeout?: boolean; ghBin?: string };
function gitBinary(limits: Limits): string { return limits.gitBin ?? configuredGitBinary(); }
function timeout(limits: Limits): number | undefined {
  if (limits.deadline === undefined) return undefined;
  const remaining = limits.deadline - Date.now();
  if (remaining <= 0) throw new Error('time budget reached');
  return remaining;
}
function git(root: string, args: string[], limits: Limits = {}): string {
  return gitExecFileSync(args, { cwd: root, gitBin: gitBinary(limits), env: withoutRepositorySelectingGitEnv(), encoding: 'utf8', timeout: timeout(limits), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const WORKTREE_TOPOLOGY_LOCK = 'repo-harness/coordination/locks/worktree-topology.lock';
const topologyLockWait = (limits: Limits) => limits.deadline ? Math.max(1, Math.min(50, timeout(limits)!)) : undefined;

/** Bind and destructive cleanup serialize across every worktree of this clone. */
export function withWorktreeTopologyLock<T>(root: string, action: () => T, limits: Limits = {}): T {
  const common = resolveGitCommonDirectory(root, gitBinary(limits), timeout(limits), withoutRepositorySelectingGitEnv());
  return withExclusiveDirectoryLock(common, WORKTREE_TOPOLOGY_LOCK, () => {
    cleanIdentityTemporaryFiles(common, Date.now(), limits);
    return action();
  },
    { waitTimeoutMs: topologyLockWait(limits) });
}

/** The same lock held across an asynchronous action, so an event-loop caller does not block while it holds it. */
export async function withWorktreeTopologyLockAsync<T>(root: string, action: () => Promise<T>, limits: Limits = {}): Promise<T> {
  const common = await resolveGitCommonDirectoryAsync(root, gitBinary(limits), timeout(limits), withoutRepositorySelectingGitEnv());
  const handle = acquireExclusiveDirectoryLock(common, WORKTREE_TOPOLOGY_LOCK, { waitTimeoutMs: topologyLockWait(limits) });
  try {
    handle.assertOwned();
    cleanIdentityTemporaryFiles(common, Date.now(), limits);
    return await action();
  } finally {
    handle.release();
  }
}


/** Canonicalize a missing checkout through its existing parent. Never follow its leaf. */
export function checkoutPath(path: string): string {
  try {
    const entry = lstatSync(path);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('worktree path is not a real directory');
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return join(realpathSync(dirname(path)), basename(path));
  }
}
export function entries(root: string, limits: Limits = {}) {
  return parseWorktreeTopology(git(root, ['-c', 'core.quotePath=false', 'worktree', 'list', '--porcelain'], limits)).worktrees;
}

export function assertWorktreeBinding(root: string, worktree: string, branch: string, limits: Limits = {}): void {
  const canonical = checkoutPath(worktree);
  if (canonical !== worktree) throw new Error('execution worktree path is not canonical');
  if (!entries(root, limits).some(entry => checkoutPath(entry.path) === canonical && entry.branch === `refs/heads/${branch}`)) throw new Error('execution worktree is not registered in this clone');
  if (resolveGitCommonDirectory(root, gitBinary(limits), timeout(limits)) !== resolveGitCommonDirectory(worktree, gitBinary(limits), timeout(limits))) throw new Error('execution worktree is not in this clone');
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

type MergeProof = { readonly provider: boolean; readonly merge_commit_sha: string };

export type LocalMergeMode = 'ancestor' | 'absorbed' | 'unmerged';

/** The offline merge-library verdict for `head` against the target OID. Any other library output throws. */
export function localMergeMode(root: string, head: string, target: string, limits: Limits): LocalMergeMode {
  const output = execFileSync('bash', [mergeLibraryPath(), '--target', target, head], {
    cwd: root, encoding: 'utf8', timeout: timeout(limits), stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...withoutRepositorySelectingGitEnv(), REPO_HARNESS_GIT_BIN: gitBinary(limits) },
  }).trim();
  const mode = output.split('\t')[1];
  if (mode === 'ancestor' || mode === 'absorbed' || mode === 'unmerged') return mode;
  throw new Error('cleanup merge is unproven');
}

/** A local proof binds the target OID. The provider proof runs only for an own-commit branch that the local proof cannot prove. */
export function mergeProof(root: string, branch: string, head: string, targetRef: string, target: string, limits: Limits, providerCapMs = 10_000): MergeProof {
  if (localMergeMode(root, head, target, limits) !== 'unmerged') return { provider: false, merge_commit_sha: target };
  // A fresh branch at the target head is also linked to the PR that made that head. It must never reach the provider.
  assertBranchHasCommits(root, branch, limits);
  const base = /^refs\/(?:heads\/|remotes\/[^/]+\/)(.+)$/.exec(git(root, ['rev-parse', '--symbolic-full-name', targetRef], limits))?.[1];
  const ghBin = limits.ghBin ?? resolveTrustedGhExecutable();
  const merge = base && ghBin ? observeProviderBranchMergeCommit({
    repoRoot: checkoutPath(entries(root, limits)[0]!.path), ghBin, gitBin: gitBinary(limits),
    headSha: head, baseRef: base, targetOid: target, timeoutMs: Math.min(providerCapMs, timeout(limits) ?? providerCapMs),
  }) : null;
  if (!merge) throw new Error('cleanup merge is unproven');
  return { provider: true, merge_commit_sha: merge };
}

export function assertNoOwner(root: string, worktree: string, limits: Limits, allowSelfMarker = false): void {
  for (const entry of entries(root, limits)) {
    const marker = join(entry.path, '.ai/harness/active-worktree');
    timeout(limits);
    let stat;
    try { stat = lstatSync(marker); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('cleanup has unknown active-worktree marker');
    const owner = readFileSync(marker, 'utf8').trim();
    if (!owner) throw new Error('cleanup has unknown active-worktree marker');
    if (allowSelfMarker && owner === worktree && checkoutPath(entry.path) === worktree) continue;
    if (checkoutPath(resolve(entry.path, owner)) === worktree) throw new Error('cleanup has an active-worktree marker reference');
  }
}

function identityStore(common: string): string | null {
  const uid = worktreeUid();
  if (uid === undefined) return null;
  let directory = common;
  for (const part of ['repo-harness', 'coordination', 'worktree-identities']) {
    directory = join(directory, part);
    let stat;
    try { stat = lstatSync(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o002)) throw new Error('recovery identity store is unsafe');
  }
  return directory;
}

/** Only a later topology lock holder can remove an unpublished identity file. */
function cleanIdentityTemporaryFiles(common: string, acquiredAt: number, limits: Limits): void {
  const store = identityStore(common);
  if (!store) return;
  for (const name of readdirSync(store)) {
    if (!/^[a-f0-9]{64}\.json\.[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(name)) continue;
    timeout(limits);
    const path = join(store, name); const stat = lstatSync(path);
    if (stat.isFile() && !stat.isSymbolicLink() && stat.uid === worktreeUid() && !(stat.mode & 0o002) && stat.mtimeMs < acquiredAt) unlinkSync(path);
  }
}

/** Call only after Git registration and branch deletion readback succeeds. */
function retireWorktreeIdentity(common: string, worktree: string, limits: Limits): void {
  const store = identityStore(common);
  if (!store || !worktree) return;
  for (const name of readdirSync(store)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    timeout(limits);
    const path = join(store, name); const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== worktreeUid() || (stat.mode & 0o002)) continue;
    let saved;
    try { saved = JSON.parse(readFileSync(path, 'utf8')); } catch { continue; }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue;
    if (saved.worktree !== worktree || saved.uid !== worktreeUid() || typeof saved.admin !== 'string' || dirname(saved.admin) !== join(common, 'worktrees')) continue;
    if (name !== createHash('sha256').update(saved.admin).digest('hex') + '.json') continue;
    unlinkSync(path);
    syncDirectoryDurably(store);
  }
}

/** Recovery must bind the original directory, not only its reusable Git pointer. */
function recoveryIdentity(root: string, worktree: string) {
  const uid = worktreeUid();
  if (uid === undefined) throw new Error('recovery uid is unavailable: start can create a checkout, but this platform cannot verify recovery ownership');
  const directory = lstatSync(worktree);
  if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== uid || (directory.mode & 0o022)) throw new Error('recovery directory ownership is unsafe');
  const pointer = join(worktree, '.git');
  const file = lstatSync(pointer);
  if (!file.isFile() || file.isSymbolicLink() || file.uid !== uid || (file.mode & 0o002)) throw new Error('recovery Git pointer is unsafe');
  const text = readFileSync(pointer, 'utf8').trim();
  if (!text.startsWith('gitdir: ')) throw new Error('recovery Git pointer is invalid');
  const namedAdmin = resolve(worktree, text.slice(8));
  const admin = realpathSync(namedAdmin);
  const common = resolveGitCommonDirectory(root);
  if (dirname(admin) !== join(common, 'worktrees')) throw new Error('recovery Git admin entry is outside this clone');
  const adminStat = lstatSync(namedAdmin);
  const backpointer = lstatSync(join(admin, 'gitdir'));
  if (!adminStat.isDirectory() || adminStat.isSymbolicLink() || adminStat.uid !== uid || (adminStat.mode & 0o002) || !backpointer.isFile() || backpointer.isSymbolicLink() || backpointer.uid !== uid || (backpointer.mode & 0o002)) throw new Error('recovery Git admin ownership is unsafe');
  if (readFileSync(join(admin, 'gitdir'), 'utf8').trim() !== pointer) throw new Error('recovery Git backpointer changed');
  const record = join(common, 'repo-harness/coordination/worktree-identities', createHash('sha256').update(admin).digest('hex') + '.json');
  return { record, value: JSON.stringify({ worktree, admin, uid, dev: directory.dev, ino: directory.ino, birthtime: directory.birthtimeMs }) };
}

/** Record identity only after this invocation creates the checkout under the lock. */
export function recordCreatedWorktree(root: string, worktree: string): void {
  if (worktreeUid() === undefined) return;
  const identity = recoveryIdentity(root, realpathSync(worktree));
  const common = resolveGitCommonDirectory(root);
  let directory = common;
  for (const part of ['repo-harness', 'coordination', 'worktree-identities']) {
    directory = join(directory, part);
    try { mkdirSync(directory, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== worktreeUid() || (stat.mode & 0o002)) throw new Error('recovery identity store is unsafe');
  }
  // Git can reuse an admin name after an explicit removal. Only the create route replaces this record.
  const temporary = identity.record + '.' + randomUUID();
  createFileExclusiveDurably(temporary, Buffer.from(identity.value));
  renameSync(temporary, identity.record);
  syncDirectoryDurably(dirname(identity.record));
}

/** The caller holds the topology lock while it validates and re-marks recovery. */
export function assertReusableWorktree(root: string, worktree: string, branch: string): void {
  const identity = recoveryIdentity(root, worktree);
  let saved;
  try { saved = lstatSync(identity.record); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('no start identity record: this checkout was not created by contract-worktree start; finish or clean it up, or start with a new slug');
    throw error;
  }
  if (!saved.isFile() || saved.isSymbolicLink() || saved.uid !== worktreeUid() || (saved.mode & 0o002) || readFileSync(identity.record, 'utf8') !== identity.value) throw new Error('recovery directory identity changed');
  assertWorktreeBinding(root, worktree, branch);
  const entry = entries(root).find(item => checkoutPath(item.path) === worktree);
  if (entry?.locked) throw new Error('recovery worktree is locked');
  assertNoOwner(root, worktree, {}, true);
}

/** The actuator runs inside the same barrier as final bind, including readback. */
export function cleanupExactWorktree(root: string, expected: ExactWorktreeCleanup, actuator: () => unknown, limits?: Limits, renamedApproval?: WorktreeTrashReceipt): unknown;
export function cleanupExactWorktree(root: string, expected: AuthorizedWorktreeCleanup, options: AuthorizedCleanupOptions): Promise<void>;
export function cleanupExactWorktree(root: string, expected: ExactWorktreeCleanup | AuthorizedWorktreeCleanup, actuator: (() => unknown) | AuthorizedCleanupOptions, limits: Limits = {}, renamedApproval?: WorktreeTrashReceipt): unknown {
  if (typeof actuator !== 'function') {
    if (!('key' in expected)) throw new Error('authorized cleanup identity missing');
    return cleanupAuthorizedWorktree(root, expected, actuator);
  }
  if ('key' in expected) throw new Error('authorized cleanup requires authorized options');
  return withWorktreeTopologyLock(root, () => {
    const common = resolveGitCommonDirectory(root, gitBinary(limits), timeout(limits));
    let renamed: WorktreeTrashReceipt | null = null;
    if (renamedApproval) {
      const common = resolveGitCommonDirectory(root, gitBinary(limits), timeout(limits));
      renamed = readWorktreeTrash(common, dirname(renamedApproval.directory), renamedApproval.directory);
      if (!renamed || !existsSync(trashPayload(renamed)) || renamed.expected.branch !== expected.branch
        || renamed.expected.head_sha !== expected.head_sha || renamed.expected.target_ref !== expected.target_ref
        || renamed.expected.merge_commit_sha !== expected.merge_commit_sha
        || (expected.worktree !== '' && renamed.expected.worktree !== expected.worktree)) throw new Error('renamed cleanup approval does not match');
    }
    const lifecycle = renamed ? trashLifecycle(common, renamed)
      : expected.worktree && existsSync(expected.worktree) ? readWorktreeRecord(common, expected.worktree) : null;
    // A renamed receipt binds the original inode. Its old name may now belong
    // to another user; registration cleanup must never traverse that new data.
    const path = expected.worktree ? (renamed ? expected.worktree : checkoutPath(expected.worktree)) : '';
    assertNoOwner(root, path, limits, limits.closeout === true);
    if (git(root, ['rev-parse', `${expected.target_ref}^{commit}`], limits) !== expected.target_oid) throw new Error('cleanup target moved');
    git(root, ['merge-base', '--is-ancestor', expected.merge_commit_sha, expected.target_oid], limits);
    if (git(root, ['rev-parse', `refs/heads/${expected.branch}`], limits) !== expected.head_sha) throw new Error('cleanup execution head moved');
    // The topology lock is held here, and other lock users wait at most 5 s.
    const proof = mergeProof(root, expected.branch, expected.head_sha, expected.target_ref, expected.target_oid, limits, 3_000);
    if (proof.provider && proof.merge_commit_sha !== expected.merge_commit_sha) throw new Error('cleanup merge commit changed');
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
    }
    if (limits.closeout && path) {
      const marker = join(path, '.ai/harness/active-worktree');
      try {
        const stat = lstatSync(marker);
        if (stat.isFile() && !stat.isSymbolicLink() && readFileSync(marker, 'utf8').trim() === path) unlinkSync(marker);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      assertNoOwner(root, path, limits);
    }
    const result = actuator();
    if (!renamed && path && existsSync(path)) throw new Error('cleanup worktree removal is unproven');
    if (entries(root, limits).some(entry => entry.branch === `refs/heads/${expected.branch}`)) throw new Error('cleanup registration removal is unproven');
    if (git(root, ['for-each-ref', '--format=%(refname)', `refs/heads/${expected.branch}`], limits).split('\n').includes(`refs/heads/${expected.branch}`)) throw new Error('cleanup branch deletion is unproven');
    retireWorktreeIdentity(resolveGitCommonDirectory(root, gitBinary(limits), timeout(limits)), path, limits);
    endWorktreeRecord(common, lifecycle, 'removed');
    return result;
  }, limits);
}

function deleteCheckedBranch(root: string, expected: ExactWorktreeCleanup, limits: Limits): void {
  const ref = git(root, ['rev-parse', '--symbolic-full-name', expected.target_ref], limits);
  if (!ref.startsWith('refs/')) throw new Error('cleanup target must be a local ref');
  gitExecFileSync(['update-ref', '--stdin'], {
    cwd: root, gitBin: gitBinary(limits), encoding: 'utf8', timeout: timeout(limits), stdio: ['pipe', 'pipe', 'pipe'],
    input: `start\nverify ${ref} ${expected.target_oid}\ndelete refs/heads/${expected.branch} ${expected.head_sha}\nprepare\ncommit\n`,
  });
}

/**
 * Closeout removes visible data without a deadline. Missing entries share its ref transaction.
 * `precondition` runs inside the barrier before any removal; a throw keeps everything.
 */
export function removeExactWorktree(root: string, expected: ExactWorktreeCleanup, limits: Limits = {}, precondition?: () => void): void {
  cleanupExactWorktree(root, expected, () => {
    precondition?.();
    const binding = entries(root, limits).find(entry => entry.branch === `refs/heads/${expected.branch}`);
    if (binding) git(root, ['worktree', 'remove', binding.path], limits);
    deleteCheckedBranch(root, expected, limits);
  }, limits);
}

interface SweepContext {
  readonly main: string;
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly common: string;
  readonly managedRoot: string;
  readonly managed: (path: string) => boolean;
  readonly limits: Limits & { deadline: number };
  readonly trashDeadline: number;
  readonly options: WorktreeRemovalOptions;
  /** A fresh process inventory; null means occupancy is unknown. */
  readonly processes: (deadline: number) => WorktreeProcess[] | null;
}
export function protectsCwd(path: string, cwd: string): boolean {
  return cwd === path || cwd.startsWith(path + sep);
}

/** Git documents these backpointers. They are read only to fence whole prune,
 * never as a second worktree inventory or to reconstruct a missing value. */
type PruneApproval = Pick<WorktreeTrashReceipt, 'git_directory' | 'git_directory_dev' | 'git_directory_ino'> & { readonly expected: { readonly worktree: string; readonly branch: string } };
function assertPruneMetadata(context: SweepContext, approval?: PruneApproval): Map<string, Omit<PrunedWorktreeIntent, 'worktree' | 'branch' | 'head'>> {
  const proofs = new Map<string, Omit<PrunedWorktreeIntent, 'worktree' | 'branch' | 'head'>>();
  const pending = readPrunedWorktreeIntents(context.common);
  const directory = join(context.common, 'worktrees');
  if (!existsSync(directory)) return proofs;
  assertOwnedTrashDirectory(directory);
  const observed = entries(context.main, context.limits).slice(1);
  const paths = observed.map(entry => checkoutPath(entry.path));
  if (new Set(paths).size !== paths.length) throw new Error('prune has ambiguous Git registrations');
  for (const name of readdirSync(directory)) {
    timeout(context.limits);
    const path = join(directory, name);
    const stat = assertOwnedTrashDirectory(path);
    if (approval?.git_directory === path && stat.dev === approval.git_directory_dev && stat.ino === approval.git_directory_ino) continue;
    const known = pending.find(item => item.git_directory === path && item.git_directory_dev === stat.dev && item.git_directory_ino === stat.ino);
    if (known && !pathExists(known.worktree) && !pathExists(join(path, 'locked'))) {
      if (!context.managed(known.worktree) || protectsCwd(known.worktree, context.cwd)) throw new Error('prune would affect a protected path');
      for (const [name, allowed] of [['gitdir', [join(known.worktree, '.git')]], ['HEAD', [`ref: refs/heads/${known.branch}`, known.head]]] as const) {
        const field = join(path, name);
        if (!pathExists(field)) continue;
        const file = lstatSync(field);
        if (!file.isFile() || file.isSymbolicLink() || !(allowed as readonly string[]).includes(readFileSync(field, 'utf8').trim())) throw new Error('prune has changed Git registration metadata');
      }
      const commonFile = join(path, 'commondir');
      if (pathExists(commonFile)) {
        const file = lstatSync(commonFile);
        if (!file.isFile() || file.isSymbolicLink() || realpathSync(resolve(path, readFileSync(commonFile, 'utf8').trim())) !== context.common) throw new Error('prune has changed Git registration metadata');
      }
      assertNoOwner(context.main, known.worktree, context.limits);
      if (!taskWorktreeRuntimeClosed({ repository_id: context.common, primary_root: context.main, execution_root: known.worktree })) throw new Error('missing runtime is open');
      continue;
    }
    const backpointer = join(path, 'gitdir');
    let link;
    try { link = lstatSync(backpointer); }
    catch { throw new Error('prune has unknown Git registration metadata'); }
    if (!link.isFile() || link.isSymbolicLink()) throw new Error('prune has unsafe Git registration metadata');
    const value = readFileSync(backpointer, 'utf8').trim();
    if (!isAbsolute(value) || basename(value) !== '.git' || !paths.includes(checkoutPath(dirname(value)))) throw new Error('prune has unknown Git registration metadata');
    proofs.set(checkoutPath(dirname(value)), { git_directory: path, git_directory_dev: stat.dev, git_directory_ino: stat.ino });
  }
  return proofs;
}

/** Git has no registration-only remove option. Prune cannot traverse an old path reoccupied by another user. */
function assertPruneScope(context: SweepContext, approval?: PruneApproval) {
  const { main, cwd, common, managed, limits } = context;
  const proofs = assertPruneMetadata(context, approval);
  const missing = entries(main, limits).filter(item => item.prunable && !item.locked);
  for (const item of missing) {
    const path = checkoutPath(item.path);
    if (!managed(path) || protectsCwd(path, cwd)) throw new Error('prune would affect a protected path');
    const branch = item.branch?.replace(/^refs\/heads\//, '') ?? (approval?.expected.worktree === path ? approval.expected.branch : null);
    if (!branch) throw new Error('missing branch ownership');
    if (path !== approval?.expected.worktree) assertNoOwner(main, path, limits);
    if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: path })) throw new Error('missing runtime is open');
  }
  return { missing, proofs };
}
function pruneManagedWorktrees(context: SweepContext, approval?: PruneApproval): number {
  const { missing, proofs } = assertPruneScope(context, approval);
  const pending = readPrunedWorktreeIntents(context.common);
  for (const entry of missing) {
    const worktree = checkoutPath(entry.path);
    if (pathExists(worktree) || worktree === approval?.expected.worktree || !entry.branch?.startsWith('refs/heads/') || !entry.head) continue;
    const proof = proofs.get(worktree);
    if (!proof) { if (pending.some(item => item.worktree === worktree)) continue; throw new Error('missing registration identity is unavailable'); }
    const intent = { worktree, branch: entry.branch.slice('refs/heads/'.length), head: entry.head, ...proof };
    if (!pending.some(item => prunedIntentKey(item) === prunedIntentKey(intent))) pending.push(intent);
  }
  if (pending.length) {
    writePrunedWorktreeIntents(context.common, pending);
    context.options.afterRemovalStep?.('prune-intent', context.common);
  }
  git(context.main, ['worktree', 'prune', '--expire', 'now'], context.limits);
  context.options.afterRemovalStep?.('pruned-registrations', context.common);
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

export function assertBranchHasCommits(root: string, branch: string, limits: Limits): void {
  const ref = `refs/heads/${branch}`;
  let history;
  try {
    git(root, ['reflog', 'exists', ref], limits);
    history = git(root, ['reflog', 'show', '--format=%gs', ref], limits);
  } catch { throw new Error('branch reflog is unavailable'); }
  if (!history.split('\n').some(message => /^(?:commit(?: \(amend\)| \(merge\)| \(initial\))?|cherry-pick|revert|rebase(?: -i)? \(pick\))(?::|$)/.test(message))) throw new Error('branch has no commits of its own');
}
function pathExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export function assertNoSubmodules(context: { readonly main: string; readonly limits: Limits }, path: string): void {
  const directory = git(context.main, ['-C', path, 'rev-parse', '--absolute-git-dir'], context.limits);
  if (pathExists(join(path, '.gitmodules')) || pathExists(join(directory, 'modules'))) throw new Error('submodules present');
}

/**
 * Both the first attempt and recovery execute through the exact cleanup barrier.
 * A first attempt runs the full shared predicate with a fresh process inventory
 * inside the barrier, then the caller's `verify`, before any trash receipt
 * exists; a throw keeps everything.
 */
function commitSweepRemoval(context: SweepContext, expected: ExactWorktreeCleanup, pending?: WorktreeTrashReceipt, verify?: () => void): WorktreeTrashReceipt {
  let receipt = pending;
  const payloadExists = receipt && existsSync(trashPayload(receipt));
  const binding = entries(context.main, context.limits).find(entry => entry.branch === `refs/heads/${expected.branch}`);
  const snapshot = pending ? { ...expected, target_oid: git(context.main, ['rev-parse', `${expected.target_ref}^{commit}`], context.limits) } : expected;
  const identity = payloadExists && !binding ? { ...snapshot, worktree: '' } : snapshot;
  cleanupExactWorktree(context.main, identity, () => {
    if (!pending) {
      const inspection = inspectWorktree(context.main, expected.worktree, context.cwd, { env: context.env, deadline: context.limits.deadline,
        processes: context.processes(Math.min(context.limits.deadline, Date.now() + 5_000)), ghBin: context.limits.ghBin });
      if (inspection.judgment !== 'green') throw new WorktreeNotGreenError(inspection.reasons);
      verify?.();
    }
    if (receipt) assertTrashIsUnregistered(context, receipt.directory);
    // Refuse a whole-prune conflict before renaming any visible checkout.
    assertPruneScope(context, receipt);
    if (!receipt || !existsSync(trashPayload(receipt))) {
      assertBranchHasCommits(context.main, expected.branch, context.limits);
      assertNoSubmodules(context, expected.worktree);
    }
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
function trashLifecycle(common: string, receipt: WorktreeTrashReceipt) {
  if (!receipt.worktree_record_id) return null;
  const record = readWorktreeRecordById(common, receipt.worktree_record_id);
  if (!record || record.path !== receipt.expected.worktree) throw new Error('trash lifecycle record changed');
  return record;
}

function resumeSweepTrashAttempt(context: SweepContext, directory: string): 'resumed' | 'unused approval discarded' {
  let receipt: WorktreeTrashReceipt | null = null;
  let unused = false;
  withWorktreeTopologyLock(context.main, () => {
    assertTrashIsUnregistered(context, directory);
    receipt = readWorktreeTrash(context.common, context.managedRoot, directory);
    if (!receipt) deleteUnpublishedTrash(directory, context.limits.deadline);
    else if (!context.managed(receipt.expected.worktree)) throw new Error('trash source is outside the managed pattern');
    else if (!pathExists(trashPayload(receipt)) && pathExists(receipt.expected.worktree)) {
      // An approval that never renamed its source must not authorize a later
      // first rename: the live source re-enters fresh selection under the full green predicate.
      discardWorktreeTrashApproval(receipt, context.limits.deadline);
      unused = true;
    }
  }, context.limits);
  if (unused) return 'unused approval discarded';
  if (!receipt) return 'resumed';
  const approved: WorktreeTrashReceipt = receipt;
  if (branchExists(context, approved.expected.branch)) commitSweepRemoval(context, approved.expected, approved);
  withWorktreeTopologyLock(context.main, () => {
    assertTrashIsUnregistered(context, directory);
    assertNoOwner(context.main, approved.expected.worktree, context.limits);
    if (branchExists(context, approved.expected.branch)) throw new Error('trash branch deletion is unproven');
    if (entries(context.main, context.limits).some(entry => checkoutPath(entry.path) === approved.expected.worktree)) throw new Error('trash source is still registered');
    retireWorktreeIdentity(context.common, approved.expected.worktree, context.limits);
    // Re-read immutable identity after the lock boundary. Partly deleted data needs no new Git status check.
    const current = readWorktreeTrash(context.common, context.managedRoot, directory);
    if (!current) throw new Error('trash approval disappeared');
    endWorktreeRecord(context.common, trashLifecycle(context.common, current), 'removed');
    deleteWorktreeTrash(current, context.trashDeadline, context.options);
  }, context.limits);
  return 'resumed';
}

function resumeSweepTrash(context: SweepContext, directory: string): 'resumed' | 'unused approval discarded' | 'approval discarded' {
  try { return resumeSweepTrashAttempt(context, directory); }
  catch (error) {
    if (pathExists(join(directory, 'worktree'))) throw error;
    let discarded = false;
    withWorktreeTopologyLock(context.main, () => {
      const receipt = readWorktreeTrash(context.common, context.managedRoot, directory);
      if (receipt && !pathExists(trashPayload(receipt))) {
        discardWorktreeTrashApproval(receipt, context.limits.deadline);
        discarded = true;
      }
    }, context.limits);
    if (discarded) return 'approval discarded';
    throw error;
  }
}

/** The policy merge-back target that every worktree merge proof binds. */
export function mergeBackTarget(main: string, limits: Limits = {}): { readonly targetRef: string; readonly target: string } {
  let policy: { worktree_strategy?: { merge_back?: { target?: unknown } } } = {};
  const policyPath = join(main, '.ai/harness/policy.json');
  if (existsSync(policyPath)) policy = JSON.parse(readFileSync(policyPath, 'utf8'));
  const configured = policy.worktree_strategy?.merge_back?.target ?? 'main';
  if (typeof configured !== 'string' || !configured || configured.startsWith('-')) throw new Error('integration target is invalid');
  const targetRef = configured.startsWith('refs/') || configured.includes('/') ? configured : `refs/remotes/origin/${configured}`;
  try { return { targetRef, target: git(main, ['rev-parse', '--verify', `${targetRef}^{commit}`], limits) }; }
  catch { throw new Error(`local integration target is unavailable: ${targetRef}`); }
}

/** Shared, read-only selection predicate. The actuator still rechecks under the topology lock. */
export function inspectWorktree(root: string, path: string, callerCwd: string | null, options: {
  env?: NodeJS.ProcessEnv; deadline?: number; processes?: WorktreeProcess[] | null; ghBin?: string;
} = {}): Pick<WorktreeView, 'judgment' | 'reasons' | 'process_count' | 'dirty_files' | 'ignored_entries' | 'unpushed_commits' | 'merge'> {
  const limits: Limits = { deadline: options.deadline ?? Date.now() + 10_000, gitBin: configuredGitBinary(options.env), ghBin: options.ghBin };
  const reasons: WorktreeReason[] = [];
  const result: ReturnType<typeof inspectWorktree> = { judgment: 'yellow', reasons, process_count: null, dirty_files: null, ignored_entries: null, unpushed_commits: null, merge: 'unknown' };
  let inUse = false;
  const reject = (reason: WorktreeReason, action: () => void) => { try { action(); } catch { reasons.push(reason); } };
  try {
    const topology = entries(root, limits);
    const main = checkoutPath(topology[0]!.path);
    path = checkoutPath(path);
    const common = resolveGitCommonDirectory(main, gitBinary(limits), timeout(limits));
    const entry = topology.find(item => checkoutPath(item.path) === path);
    if (path === main) reasons.push('primary');
    if (callerCwd !== null && protectsCwd(path, callerCwd)) { reasons.push('session_cwd'); inUse = true; }
    const processes = options.processes === undefined ? worktreeProcesses(limits.deadline!) : options.processes;
    result.process_count = processes === null ? null : new Set(processes.filter(item => protectsCwd(path, item.cwd)).map(item => item.pid)).size;
    if (result.process_count === null) reasons.push('process_unknown');
    else if (result.process_count > 0) { reasons.push('process_in_use'); inUse = true; }
    try {
      if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: path })) { reasons.push('runtime_open'); inUse = true; }
    } catch { reasons.push('runtime_unknown'); }
    if (!isManagedWorktreePath(path, managedWorktreeRoot(options.env), basename(main))) reasons.push('outside_managed_root');
    if (!entry) reasons.push('unregistered');
    if (!existsSync(path)) reasons.push('missing');
    if (entry?.locked) reasons.push('locked');
    reject('owner', () => assertNoOwner(main, path, limits));
    if (entry && existsSync(path)) {
      reject('probe_failed', () => {
        const status = git(path, ['status', '--porcelain=v2', '-z', '--untracked-files=all'], limits);
        // Rename records have a second NUL field containing the old name.
        result.dirty_files = status.split('\0').filter(line => /^[12u?] /u.test(line)).length;
        if (result.dirty_files > 0) reasons.push('dirty');
        const ignored = git(path, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'], limits).split('\0').filter(Boolean);
        result.ignored_entries = ignored.length;
        // These top-level outputs are reproducible. Everything else needs owner approval.
        if (ignored.some(file => !/^(?:node_modules|dist|build|coverage|\.next)\//u.test(file))) reasons.push('ignored_data');
        result.unpushed_commits = Number(git(path, ['rev-list', '--count', 'HEAD', '--not', '--remotes'], limits));
        if (!Number.isSafeInteger(result.unpushed_commits)) throw new Error('invalid count');
        if (result.unpushed_commits > 0) reasons.push('unpushed');
      });
      reject('submodules', () => assertNoSubmodules({ main, limits }, path));
    }
    if (!entry?.branch?.startsWith('refs/heads/') || !entry.head) reasons.push('no_branch');
    else {
      const branch = entry.branch.slice('refs/heads/'.length);
      reject('no_own_commits', () => assertBranchHasCommits(main, branch, limits));
      reject('merge_unproven', () => {
        const { target } = mergeBackTarget(main, limits);
        const local = localMergeMode(main, entry.head!, target, limits);
        result.merge = local;
        if (local === 'unmerged') throw new Error('local merge proof unavailable');
      });
    }
  } catch { reasons.push('probe_failed'); }
  result.judgment = inUse ? 'red' : reasons.length ? 'yellow' : 'green';
  return result;
}

function createSweepContext(root: string, callerCwd: string, env: NodeJS.ProcessEnv, limits: SweepContext['limits'], trashDeadline: number, options: WorktreeRemovalOptions,
  processes: SweepContext['processes']): SweepContext | null {
  const primary = entries(root, limits)[0];
  if (!primary) return null;
  const main = checkoutPath(primary.path);
  const cwd = realpathSync(callerCwd);
  const managedRoot = managedWorktreeRoot(env);
  const managed = (path: string) => isManagedWorktreePath(path, managedRoot, basename(main));
  const common = resolveGitCommonDirectory(main, gitBinary(limits), timeout(limits));
  return { main, cwd, env, common, managedRoot, managed, limits, trashDeadline, options, processes };
}

/**
 * One planned sweep step. `path` is the checkout path, or the trash directory for
 * `resume` and `discard_approval`. `registration` is the Git admin directory and
 * its inode. `resume` finishes an earlier removal whose receipt is already on disk.
 * `prune` drops the registration of a missing checkout, and `cleanup_pruned`
 * finishes an earlier prune; both delete the branch only when its merge is proven.
 */
export interface WorktreeSweepPlanItem {
  readonly action: 'resume' | 'discard_approval' | 'cleanup_pruned' | 'prune' | 'remove' | 'keep';
  readonly path: string;
  readonly branch?: string;
  readonly head?: string;
  readonly registration?: string;
  readonly reason?: string;
}
export interface WorktreeSweepPlan {
  /** The merge-back target OID that the `remove`, `prune` and `cleanup_pruned` steps are judged against. */
  readonly target_oid: string | null;
  readonly items: readonly WorktreeSweepPlanItem[];
}

/** The part of a plan that binds a run: every step except `keep`, without reasons. */
export function boundSweepSteps(plan: WorktreeSweepPlan | null): { readonly target_oid: string | null; readonly steps: readonly WorktreeSweepPlanItem[] } {
  const steps = (plan?.items ?? []).filter(item => item.action !== 'keep')
    .map(({ action, path, branch, head, registration }) => ({ action, path, branch, head, registration }));
  return { target_oid: steps.length ? plan!.target_oid : null, steps };
}

const NOT_IN_PREVIEW = 'not in the preview';
type SweepApproval = { readonly target_oid: string | null; readonly allows: (step: WorktreeSweepPlanItem) => boolean };
const stepKey = (step: WorktreeSweepPlanItem) => JSON.stringify([step.action, step.path, step.branch ?? null, step.head ?? null, step.registration ?? null]);
function sweepApproval(plan: WorktreeSweepPlan): SweepApproval {
  const bound = boundSweepSteps(plan);
  const keys = new Set(bound.steps.map(stepKey));
  return { target_oid: bound.target_oid, allows: step => keys.has(stepKey(step)) };
}

const registrationId = (directory: string, stat: { readonly dev: number; readonly ino: number }) => `${directory}@${stat.dev}:${stat.ino}`;
/** Git admin directories keyed by the checkout path that their `gitdir` backpointer names. Read only. */
function registrations(common: string): Map<string, string> {
  const directory = join(common, 'worktrees');
  const found = new Map<string, string>();
  if (!pathExists(directory)) return found;
  for (const name of readdirSync(directory)) {
    const admin = join(directory, name), stat = lstatSync(admin), pointer = join(admin, 'gitdir');
    if (!stat.isDirectory() || stat.isSymbolicLink() || !pathExists(pointer) || !lstatSync(pointer).isFile()) continue;
    const value = readFileSync(pointer, 'utf8').trim();
    if (isAbsolute(value) && basename(value) === '.git') found.set(dirname(value), registrationId(admin, stat));
  }
  return found;
}
function trashStep(context: SweepContext, directory: string): WorktreeSweepPlanItem {
  const receipt = readWorktreeTrash(context.common, context.managedRoot, directory);
  if (!receipt) return { action: 'resume', path: directory };
  const unused = !pathExists(trashPayload(receipt)) && pathExists(receipt.expected.worktree);
  return { action: unused ? 'discard_approval' : 'resume', path: directory, branch: receipt.expected.branch, head: receipt.expected.head_sha,
    registration: registrationId(receipt.git_directory, { dev: receipt.git_directory_dev, ino: receipt.git_directory_ino }) };
}
function intentStep(intent: PrunedWorktreeIntent): WorktreeSweepPlanItem {
  return { action: 'cleanup_pruned', path: intent.worktree, branch: intent.branch, head: intent.head,
    registration: registrationId(intent.git_directory, { dev: intent.git_directory_dev, ino: intent.git_directory_ino }) };
}
/** A `prune` step approves the cleanup of the intent that its prune records. */
const intentApproved = (approval: SweepApproval, intent: PrunedWorktreeIntent) => {
  const step = intentStep(intent);
  return approval.allows(step) || approval.allows({ ...step, action: 'prune' });
};
function liveStep(action: 'prune' | 'remove', entry: ReturnType<typeof entries>[number], registered: Map<string, string>): WorktreeSweepPlanItem {
  return { action, path: checkoutPath(entry.path), branch: entry.branch?.replace(/^refs\/heads\//, ''), head: entry.head ?? undefined, registration: registered.get(entry.path) };
}
/** Git prune drops every missing registration of the clone. An approved run prunes only when each one is a planned step. */
function pruneScopeApproved(context: SweepContext, approval: SweepApproval): boolean {
  const registered = registrations(context.common);
  return entries(context.main, context.limits).filter(item => item.prunable && !item.locked).every(item => approval.allows(liveStep('prune', item, registered)))
    && readPrunedWorktreeIntents(context.common).filter(intent => pathExists(intent.git_directory)).every(intent => intentApproved(approval, intent));
}

/** Recovery precedes live selection, so an interrupted registration is not mistaken for reboot loss. */
function recoverSweepTrash(context: SweepContext, notes: string[], approval?: SweepApproval): { readonly resumed: number; readonly blocked: boolean; readonly ignored: boolean; readonly deferred: number } {
  const trash = worktreeTrashNames(context.common, context.managedRoot);
  let blocked = false, ignored = false, resumed = 0;
  for (const directory of trash.slice(0, 8)) {
    try { assertOwnedTrashDirectory(directory); }
    catch (error) { ignored = true; notes.push(`${directory}: ignored; ${error instanceof Error ? error.message : String(error)}`); continue; }
    try {
      timeout(context.limits);
      if (approval && !approval.allows(trashStep(context, directory))) throw new Error(NOT_IN_PREVIEW);
      const outcome = resumeSweepTrash(context, directory);
      if (outcome === 'resumed') resumed++;
      notes.push(`${directory}: ${outcome === 'unused approval discarded' ? 'unused approval discarded; source kept for fresh selection' : outcome}`);
    }
    catch (error) {
      if (error instanceof WorktreeTrashBudgetReached) notes.push(`${directory}: pending; ${error.message}`);
      else { blocked = true; notes.push(`${directory}: kept; ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`); }
    }
  }
  return { resumed, blocked: blocked || trash.length > 8, ignored, deferred: Math.max(0, trash.length - 8) };
}

/** The shared green predicate refused a removal. The message keeps the sweep's report wording. */
export class WorktreeNotGreenError extends Error {
  constructor(readonly reasons: readonly WorktreeReason[]) {
    const messages: Partial<Record<WorktreeReason, string>> = { dirty: 'cleanup_blocked_dirty_worktree', merge_unproven: 'cleanup merge is unproven', submodules: 'submodules present' };
    super(reasons.map(reason => messages[reason] ?? reason).join(', '));
    this.name = 'WorktreeNotGreenError';
  }
}

/** The one green removal path: the shared predicate, the merge proof, then the exact barrier, which runs the predicate again. */
function removeGreenWorktree(context: SweepContext, input: {
  readonly path: string; readonly branch: string; readonly head: string; readonly targetRef: string; readonly target: string;
  readonly processes: WorktreeProcess[] | null; readonly verify?: () => void;
}): WorktreeTrashReceipt {
  const { main, limits } = context;
  const inspection = inspectWorktree(main, input.path, context.cwd, { env: context.env, deadline: limits.deadline, processes: input.processes, ghBin: limits.ghBin });
  if (inspection.judgment !== 'green') throw new WorktreeNotGreenError(inspection.reasons);
  const merge = mergeProof(main, input.branch, input.head, input.targetRef, input.target, limits).merge_commit_sha;
  return commitSweepRemoval(context, { worktree: input.path, branch: input.branch, head_sha: input.head, target_ref: input.targetRef, target_oid: input.target, merge_commit_sha: merge }, undefined, input.verify);
}

export interface GreenWorktreeRemoval {
  /** Canonical checkout path of a registered linked worktree of this clone. */
  readonly path: string;
  /** Runs inside the topology barrier after the shared predicate and before the trash receipt. A throw keeps the worktree. */
  readonly verify: () => void;
}
export type GreenWorktreeRemovalResult =
  | { readonly removed: true }
  /** `started` is true when a removal step ran, so the trash receipt, not this call, finishes it. */
  | { readonly removed: false; readonly started: boolean; readonly error: unknown };

/**
 * Remove selected green worktrees of one clone through the sweep's recovery,
 * predicate and barrier. Recovery that the sweep would stop on stops this too.
 * Remote branches are never touched.
 */
export function removeGreenWorktrees(root: string, callerCwd: string, env: NodeJS.ProcessEnv, targets: readonly GreenWorktreeRemoval[],
  options: { readonly deadline: number; readonly ghBin?: string; readonly processes: (deadline: number) => WorktreeProcess[] | null }): { readonly recovery_blocked: boolean; readonly results: readonly GreenWorktreeRemovalResult[] } {
  const limits = { deadline: options.deadline, gitBin: configuredGitBinary(env), ghBin: options.ghBin };
  let started = false;
  const context = createSweepContext(root, callerCwd, env, limits, Date.now() + Math.floor(Math.max(0, options.deadline - Date.now()) / 2),
    { afterRemovalStep: () => { started = true; } }, options.processes);
  if (!context) throw new Error('worktree topology is empty');
  if (recoverSweepTrash(context, []).blocked) return { recovery_blocked: true, results: [] };
  const { targetRef, target } = mergeBackTarget(context.main, limits);
  const results: GreenWorktreeRemovalResult[] = [];
  for (const item of targets) {
    started = false;
    try {
      timeout(limits);
      const entry = entries(context.main, limits).find(row => checkoutPath(row.path) === item.path);
      if (!entry?.branch?.startsWith('refs/heads/') || !entry.head) throw new Error('worktree registration changed');
      const receipt = removeGreenWorktree(context, { path: item.path, branch: entry.branch.slice('refs/heads/'.length), head: entry.head, targetRef, target,
        processes: options.processes(Math.min(options.deadline, Date.now() + 5_000)), verify: item.verify });
      results.push({ removed: true });
      // A payload left after the half budget is resumed by the next sweep.
      try { resumeSweepTrash(context, receipt.directory); } catch { /* pending trash is not an item failure */ }
    } catch (error) { results.push({ removed: false, started, error }); }
  }
  return { recovery_blocked: false, results };
}

/** The sweep's checks before the shared green predicate. Read-only; a throw is the reason to keep the entry. */
function selectLiveWorktree(context: SweepContext, entry: ReturnType<typeof entries>[number], ignoredTrash: boolean) {
  const { main, cwd, common, limits } = context;
  const path = checkoutPath(entry.path);
  timeout(limits);
  if (path === main || protectsCwd(path, cwd)) throw new Error('session cwd');
  if (entry.locked) throw new Error('locked');
  if (!entry.branch?.startsWith('refs/heads/') || !entry.head) throw new Error('no local branch');
  const branch = entry.branch.slice('refs/heads/'.length);
  assertNoOwner(main, path, limits);
  assertBranchHasCommits(main, branch, limits);
  if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: path })) throw new Error('runtime is open');
  const missing = !existsSync(path);
  if (missing && ignoredTrash) throw new Error('missing entry retained while trash ownership is unknown');
  return { path, branch, head: entry.head, missing };
}

const reasonOf = (error: unknown) => error instanceof Error ? error.message.split('\n')[0]! : String(error);

/**
 * The read-only form of `sweepManagedWorktrees`: the same inputs, checks and
 * green predicate, without the topology lock, the provider merge query or any
 * write. Null means the sweep has nothing to inspect. The sweep's per-run budget
 * is not applied, so a run executes a subset of these steps.
 */
export function planManagedWorktreeSweep(root: string, callerCwd: string, env: NodeJS.ProcessEnv = process.env, options: { readonly deadlineMs?: number } = {}): WorktreeSweepPlan | null {
  const limits = { deadline: Date.now() + (options.deadlineMs ?? 2_000), gitBin: configuredGitBinary(env) };
  const context = createSweepContext(root, callerCwd, env, limits, limits.deadline, {}, deadline => worktreeProcesses(deadline));
  if (!context) return null;
  const { main, common, managed } = context;
  const items: WorktreeSweepPlanItem[] = [];
  let ignoredTrash = false;
  for (const directory of worktreeTrashNames(common, context.managedRoot)) {
    try {
      assertOwnedTrashDirectory(directory);
    } catch (error) {
      ignoredTrash = true;
      items.push({ action: 'keep', path: directory, reason: reasonOf(error) });
      continue;
    }
    try { items.push(trashStep(context, directory)); }
    catch (error) { items.push({ action: 'keep', path: directory, reason: reasonOf(error) }); }
  }
  const live = entries(main, limits).slice(1).filter(entry => managed(checkoutPath(entry.path)));
  const intents = readPrunedWorktreeIntents(common);
  if (!live.length && !intents.length) return items.length ? { target_oid: null, items } : null;
  const { target } = mergeBackTarget(main, limits);
  for (const intent of intents) {
    const step = intentStep(intent);
    if (ignoredTrash) items.push({ ...step, action: 'keep', reason: 'missing entry retained while trash ownership is unknown' });
    else if (!managed(intent.worktree) || protectsCwd(intent.worktree, context.cwd)) items.push({ ...step, action: 'keep', reason: 'pruned intent is outside the managed scope' });
    else if (pathExists(intent.worktree)) items.push({ ...step, action: 'keep', reason: 'pruned worktree path or registration reappeared' });
    else items.push(step);
  }
  const registered = registrations(common);
  const processes = worktreeProcesses(limits.deadline);
  for (const entry of live) {
    try {
      const selected = selectLiveWorktree(context, entry, ignoredTrash);
      if (selected.missing) { items.push(liveStep('prune', entry, registered)); continue; }
      const inspection = inspectWorktree(main, selected.path, context.cwd, { env, deadline: limits.deadline, processes });
      const step = liveStep('remove', entry, registered);
      items.push(inspection.judgment === 'green' ? step : { ...step, action: 'keep', reason: new WorktreeNotGreenError(inspection.reasons).message });
    } catch (error) {
      items.push({ ...liveStep('remove', entry, registered), action: 'keep', reason: reasonOf(error) });
    }
  }
  return { target_oid: target, items };
}

/**
 * Local refs and this clone's Git inventory are the only live worktree inputs.
 * `contract-worktree start` runs this before it creates a checkout. Every
 * destructive step takes the same topology lock as start. `callerCwd` and
 * everything below it are never removed. With `approved`, the sweep takes only
 * the bound steps of that plan and reports every other step as kept.
 */
export function sweepManagedWorktrees(root: string, callerCwd: string, env: NodeJS.ProcessEnv = process.env,
  options: WorktreeRemovalOptions & { readonly ghBin?: string; readonly approved?: WorktreeSweepPlan } = {}): string | null {
  const started = Date.now();
  const budget = options.deadlineMs ?? 2_000;
  const limits = { deadline: started + budget, gitBin: configuredGitBinary(env), ghBin: options.ghBin };
  // Old and new payloads share this half. Live selection keeps the rest.
  const trashDeadline = started + Math.floor(budget / 2);
  const notes: string[] = [];
  let removed = 0, pruned = 0, resumed = 0, deferred = 0;
  try {
    const context = createSweepContext(root, callerCwd, env, limits, trashDeadline, options, deadline => worktreeProcesses(deadline));
    if (!context) return null;
    const { main, cwd, common, managed } = context;
    const approval = options.approved && sweepApproval(options.approved);
    const recovery = recoverSweepTrash(context, notes, approval);
    resumed += recovery.resumed;
    const ignoredTrash = recovery.ignored;
    deferred += recovery.deferred;
    if (recovery.blocked) return `[WorktreeSweep] removed=0 pruned=0 resumed=${resumed} deferred=${deferred}\n${notes.join('\n')}`;
    const candidates = entries(main, limits).slice(1).filter(entry => managed(checkoutPath(entry.path)));
    if (!candidates.length && !readPrunedWorktreeIntents(common).length) return notes.length ? `[WorktreeSweep] removed=${removed} pruned=${pruned} resumed=${resumed} deferred=${deferred}\n${notes.join('\n')}` : null;
    const { targetRef, target } = mergeBackTarget(main, limits);
    const targetApproved = !approval || approval.target_oid === target;
    if (approval && approval.target_oid !== null && !targetApproved) notes.push(`merge target moved since the preview (${approval.target_oid} -> ${target})`);
    // Save every missing registration before global prune, including deferred refs.
    const beforePrune = readPrunedWorktreeIntents(common);
    if (!ignoredTrash && (candidates.some(entry => !pathExists(checkoutPath(entry.path))) || beforePrune.some(entry => pathExists(entry.git_directory)))) {
      if (approval && !pruneScopeApproved(context, approval)) notes.push(`prune: kept; ${NOT_IN_PREVIEW}`);
      else withWorktreeTopologyLock(main, () => { pruned += pruneManagedWorktrees(context); }, limits);
    }
    const pending = readPrunedWorktreeIntents(common);
    const liveAvailable = entries(main, limits).slice(1).filter(entry => managed(checkoutPath(entry.path))).length;
    const pendingBatch = pending.slice(0, 8 - Math.min(4, liveAvailable));
    for (const intent of pendingBatch) {
      if (approval && !(targetApproved && intentApproved(approval, intent))) { notes.push(`${intent.worktree}: kept; ${NOT_IN_PREVIEW}`); continue; }
      let complete = false;
      try {
        timeout(limits);
        if (ignoredTrash) throw new Error('missing entry retained while trash ownership is unknown');
        if (!managed(intent.worktree) || protectsCwd(intent.worktree, cwd)) throw new Error('pruned intent is outside the managed scope');
        if (pathExists(intent.worktree) || pathExists(intent.git_directory)) throw new Error('pruned worktree path or registration reappeared');
        if (branchExists(context, intent.branch)) {
          // Ownership precedes the merge proof, because that proof can query the provider.
          assertNoOwner(main, intent.worktree, limits);
          if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: intent.worktree })) throw new Error('runtime is open');
          let merge: string;
          try { merge = mergeProof(main, intent.branch, intent.head, targetRef, target, limits).merge_commit_sha; }
          catch {
            notes.push(`${intent.worktree}: pruned; unmerged branch kept (${intent.branch})`);
            continue;
          }
          const expected = { worktree: '', branch: intent.branch, head_sha: intent.head, target_ref: targetRef, target_oid: target, merge_commit_sha: merge };
          cleanupExactWorktree(main, expected, () => {
            if (pathExists(intent.worktree) || pathExists(intent.git_directory)) throw new Error('pruned worktree path or registration reappeared');
            assertNoOwner(main, intent.worktree, limits);
            assertBranchHasCommits(main, intent.branch, limits);
            if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: intent.worktree })) throw new Error('runtime is open');
            deleteCheckedBranch(main, expected, limits);
          }, limits);
        }
        withWorktreeTopologyLock(main, () => {
          if (branchExists(context, intent.branch) || entries(main, limits).some(entry => checkoutPath(entry.path) === intent.worktree || entry.branch === `refs/heads/${intent.branch}`)) throw new Error('pruned removal readback failed');
          retireWorktreeIdentity(common, intent.worktree, limits);
          writePrunedWorktreeIntents(common, readPrunedWorktreeIntents(common).filter(item => prunedIntentKey(item) !== prunedIntentKey(intent)));
        }, limits);
        complete = true; removed++; notes.push(`${intent.worktree}: removed`);
      } catch (error) { notes.push(`${intent.worktree}: kept; ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`); }
      finally {
        if (!complete) withWorktreeTopologyLock(main, () => {
          const current = readPrunedWorktreeIntents(common);
          writePrunedWorktreeIntents(common, [...current.filter(item => prunedIntentKey(item) !== prunedIntentKey(intent)), intent]);
        }, limits);
      }
    }
    const liveCandidates = entries(main, limits).slice(1).filter(entry => managed(checkoutPath(entry.path)));
    const processes = worktreeProcesses(limits.deadline!);
    const liveBudget = 8 - pendingBatch.length;
    const registered = approval ? registrations(common) : null;
    for (const entry of liveCandidates.slice(0, liveBudget)) {
      const path = checkoutPath(entry.path);
      try {
        const { branch, head, missing } = selectLiveWorktree(context, entry, ignoredTrash);
        // A removal also runs Git's whole prune, so both steps need the prune scope approved.
        if (approval && (!approval.allows(liveStep(missing ? 'prune' : 'remove', entry, registered!)) || (!missing && !targetApproved)
          || !pruneScopeApproved(context, approval))) throw new Error(NOT_IN_PREVIEW);
        if (missing) {
          withWorktreeTopologyLock(main, () => { pruned += pruneManagedWorktrees(context); }, limits);
          notes.push(`${path}: pruned; branch cleanup deferred (${branch})`);
          continue;
        }
        const receipt = removeGreenWorktree(context, { path, branch, head, targetRef, target, processes });
        removed++;
        notes.push(`${path}: removed`);
        // No detached child: each unlink checks the shared trash deadline.
        try { resumeSweepTrash(context, receipt.directory); }
        catch (error) { notes.push(`${receipt.directory}: pending; ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`); }
      } catch (error) {
        notes.push(`${path}: kept; ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      }
    }
    deferred += Math.max(0, pending.length - pendingBatch.length) + Math.max(0, liveCandidates.length - liveBudget);
    return `[WorktreeSweep] removed=${removed} pruned=${pruned} kept=${pendingBatch.length + Math.min(liveCandidates.length, liveBudget) - removed} resumed=${resumed} deferred=${deferred}\n${notes.join('\n')}`;
  } catch (error) {
    return `${notes.length ? notes.join('\n') + '\n' : ''}worktree sweep skipped: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  }
}

export interface AuthorizedCleanupOptions extends WorktreeRemovalOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly deadline: number;
  readonly caller_cwd: string;
  /** Fresh approval and loss check; only applicable while the original source exists. */
  readonly verify: () => Promise<void>;
  /** Read current archive/provider preservation without depending on the source checkout. Required on recovery too. */
  readonly verifyPreservation: () => Promise<void>;
  readonly processes?: (deadline: number) => WorktreeProcess[] | null;
}
function authorizedReadback(root: string, receipt: AuthorizedWorktreeTrashReceipt, limits: Limits): void {
  if (pathExists(receipt.expected.worktree) || entries(root, limits).some(row => checkoutPath(row.path) === receipt.expected.worktree
    || (receipt.expected.branch !== null && row.branch === `refs/heads/${receipt.expected.branch}`))) throw new Error('authorized cleanup registration removal is unproven');
  if (receipt.expected.branch !== null && git(root, ['for-each-ref', '--format=%(refname)', `refs/heads/${receipt.expected.branch}`], limits).split('\n').includes(`refs/heads/${receipt.expected.branch}`)) throw new Error('authorized cleanup branch remains');
}
/** Inode identity alone does not bind the Git registration's mutable contents. */
function assertAuthorizedRegistration(context: SweepContext, receipt: AuthorizedWorktreeTrashReceipt): void {
  const expected = receipt.expected;
  const topology = entries(context.main, context.limits);
  const binding = topology.find(row => checkoutPath(row.path) === expected.worktree);
  if (receipt.git_directory === null || !pathExists(receipt.git_directory)) {
    if (binding || (expected.branch !== null && topology.some(row => row.branch === `refs/heads/${expected.branch}`))) throw new Error('authorized registration changed');
    return;
  }
  const admin = assertOwnedTrashDirectory(receipt.git_directory);
  if (admin.dev !== receipt.git_directory_dev || admin.ino !== receipt.git_directory_ino || expected.branch === null
    || !binding || binding.path !== expected.worktree || binding.branch !== `refs/heads/${expected.branch}` || binding.head !== expected.head_sha) throw new Error('authorized registration changed');
  const field = (name: string) => {
    const path = join(receipt.git_directory!, name), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== receipt.uid) throw new Error('authorized registration metadata unsafe');
    return readFileSync(path, 'utf8').trim();
  };
  if (field('HEAD') !== `ref: refs/heads/${expected.branch}` || field('gitdir') !== join(expected.worktree, '.git')
    || realpathSync(resolve(receipt.git_directory, field('commondir'))) !== context.common) throw new Error('authorized registration metadata changed');
}
/** Read only. A tombstone is accepted only with exact receipt and current topology/ref readback. */
export function readAuthorizedCleanupState(root: string, expected: AuthorizedWorktreeCleanup, deadline: number): 'absent' | 'pending' | 'completed' {
  const limits = { deadline }, common = resolveGitCommonDirectory(root, configuredGitBinary(), timeout(limits));
  const receipt = readAuthorizedWorktreeTrash(common, expected);
  if (!receipt) return 'absent';
  if (!authorizedWorktreeTrashCompleted(receipt)) return 'pending';
  authorizedReadback(root, receipt, limits);
  return 'completed';
}
/** Authorized mode shares the topology barrier, registration fencing and trash deletion engine with sweep. */
async function cleanupAuthorizedWorktree(root: string, expected: AuthorizedWorktreeCleanup, options: AuthorizedCleanupOptions): Promise<void> {
  const limits = { deadline: options.deadline, gitBin: configuredGitBinary(options.env) };
  await withWorktreeTopologyLockAsync(root, async () => {
    const common = resolveGitCommonDirectory(root, limits.gitBin, timeout(limits));
    const main = checkoutPath(entries(root, limits)[0]!.path), cwd = realpathSync(options.caller_cwd);
    if (main === expected.worktree || protectsCwd(expected.worktree, cwd) || checkoutPath(expected.worktree) !== expected.worktree) throw new Error('authorized cleanup target protected');
    const managedRoot = dirname(expected.worktree);
    // The server inventory resolves known roots. Scope every prune to this exact target only.
    const context: SweepContext = { main, cwd, env: options.env, common, managedRoot,
      managed: path => path === expected.worktree, limits, trashDeadline: options.deadline, options,
      processes: options.processes ?? worktreeProcesses };
    const preservedReceipt = async () => {
      // This barrier applies even when the original checkout is gone. An earlier
      // archive check or immutable intent cannot prove that preservation still holds.
      await options.verifyPreservation();
      timeout(limits);
      const current = readAuthorizedWorktreeTrash(common, expected);
      if (!current) throw new Error('authorized cleanup receipt disappeared');
      assertTrashIsUnregistered(context, current.directory);
      assertAuthorizedRegistration(context, current);
      const active = context.processes(options.deadline);
      if (active === null || active.some(process => protectsCwd(expected.worktree, process.cwd) || protectsCwd(current.directory, process.cwd))
        || !taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: expected.worktree })) throw new Error('authorized cleanup became in use');
      return current;
    };
    const finish = async () => {
      const current = await preservedReceipt();
      authorizedReadback(main, current, limits);
      completeAuthorizedWorktreeTrash(current, options.deadline, options);
    };
    let receipt = readAuthorizedWorktreeTrash(common, expected);
    if (receipt && authorizedWorktreeTrashCompleted(receipt)) { authorizedReadback(main, receipt, limits); return; }
    const payload = receipt !== null && pathExists(trashPayload(receipt));
    const processes = context.processes(options.deadline);
    if (processes === null || processes.some(process => protectsCwd(expected.worktree, process.cwd)
      || (receipt !== null && protectsCwd(receipt.directory, process.cwd)))) throw new Error('authorized cleanup in use or occupancy unknown');
    if (!taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: expected.worktree })) throw new Error('authorized cleanup runtime open');
    if (!payload) {
      if (receipt) {
        // A partially deleted payload may already be gone. It may only finish registration/ref cleanup;
        // an intent that never moved the source requires the original fresh authorization again.
        if (!pathExists(expected.worktree)) {
          authorizedReadback(main, receipt, limits);
          await finish(); return;
        }
      }
      const inspection = inspectWorktree(main, expected.worktree, cwd, { env: options.env, deadline: options.deadline, processes });
      if (inspection.judgment === 'red' || inspection.process_count === null || inspection.reasons.some(reason => ['primary', 'probe_failed', 'runtime_unknown', 'process_unknown'].includes(reason))) throw new Error('authorized cleanup observation unavailable');
      const binding = entries(main, limits).find(row => checkoutPath(row.path) === expected.worktree);
      if (binding) {
        if (expected.branch === null || binding.branch !== `refs/heads/${expected.branch}` || binding.head !== expected.head_sha) throw new Error('authorized branch binding changed');
        assertWorktreeBinding(main, expected.worktree, expected.branch, limits);
        assertNoSubmodules({ main, limits }, expected.worktree);
      } else if (expected.branch !== null || expected.head_sha !== null) throw new Error('authorized orphan cannot delete a branch');
      // A whole prune is forbidden if any other registration would be affected.
      assertPruneScope(context);
      await options.verifyPreservation();
      await options.verify();
      timeout(limits);
      const finalProcesses = context.processes(options.deadline);
      if (finalProcesses === null || finalProcesses.some(process => protectsCwd(expected.worktree, process.cwd))
        || !taskWorktreeRuntimeClosed({ repository_id: common, primary_root: main, execution_root: expected.worktree })) throw new Error('authorized cleanup became in use');
      const finalBinding = entries(main, limits).find(row => checkoutPath(row.path) === expected.worktree);
      if (JSON.stringify(finalBinding) !== JSON.stringify(binding)) throw new Error('authorized registration changed');
      if (!receipt) {
        const admin = binding ? git(main, ['-C', expected.worktree, 'rev-parse', '--absolute-git-dir'], limits) : null;
        receipt = prepareAuthorizedWorktreeTrash(common, expected, admin, binding?.locked === true);
        options.afterRemovalStep?.('intent', receipt.directory);
      }
      renameWorktreeToTrash(receipt);
      options.afterRemovalStep?.('renamed', receipt.directory);
    } else if (pathExists(expected.worktree)) throw new Error('authorized source name was reused');
    if (!receipt) throw new Error('authorized cleanup receipt missing');
    // Prune also destroys index-only bytes. Preserve them before registration/ref
    // removal, then verify again immediately before deleting the remaining payload.
    receipt = await preservedReceipt();
    recordAuthorizedWorktreeTrashRename(receipt);
    if (receipt.git_directory !== null) {
      if (expected.branch === null || receipt.git_directory_dev === null || receipt.git_directory_ino === null) throw new Error('authorized registration identity missing');
      const admin = pathExists(receipt.git_directory) ? assertOwnedTrashDirectory(receipt.git_directory) : null;
      if (admin && (admin.dev !== receipt.git_directory_dev || admin.ino !== receipt.git_directory_ino)) throw new Error('authorized registration reused');
      const binding = entries(main, limits).find(row => checkoutPath(row.path) === expected.worktree);
      if (binding?.locked) {
        if (!receipt.registration_locked || !admin || binding.branch !== `refs/heads/${expected.branch}` || binding.head !== expected.head_sha) throw new Error('authorized registration lock changed');
        git(main, ['worktree', 'unlock', expected.worktree], limits);
      }
      const approval: PruneApproval = { git_directory: receipt.git_directory, git_directory_dev: receipt.git_directory_dev,
        git_directory_ino: receipt.git_directory_ino, expected: { worktree: expected.worktree, branch: expected.branch } };
      pruneManagedWorktrees(context, approval);
    }
    if (entries(main, limits).some(row => checkoutPath(row.path) === expected.worktree)) throw new Error('authorized registration remains');
    options.afterRemovalStep?.('unregistered', receipt.directory);
    if (expected.branch !== null) {
      if (entries(main, limits).some(row => row.branch === `refs/heads/${expected.branch}`)) throw new Error('authorized branch is now in use');
      const ref = `refs/heads/${expected.branch}`;
      if (git(main, ['for-each-ref', '--format=%(refname)', ref], limits).split('\n').includes(ref)) {
        if (expected.head_sha === null) throw new Error('authorized head missing');
        git(main, ['update-ref', '-d', ref, expected.head_sha], limits);
      }
    }
    options.afterRemovalStep?.('branch-deleted', receipt.directory);
    authorizedReadback(main, receipt, limits);
    if (receipt.worktree_record_id) {
      const record = readWorktreeRecordById(common, receipt.worktree_record_id);
      if (!record || record.path !== expected.worktree) throw new Error('authorized lifecycle changed');
      endWorktreeRecord(common, record, 'removed');
    }
    retireWorktreeIdentity(common, expected.worktree, limits);
    await finish();
  }, limits);
}
