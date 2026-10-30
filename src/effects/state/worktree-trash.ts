import { createHash, randomUUID } from 'crypto';
import { lstatSync, mkdirSync, opendirSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync, type Stats } from 'fs';
import { basename, dirname, join } from 'path';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../atomic-append';
import type { ExactWorktreeCleanup } from './coordination-worktree-topology';
import { worktreeTrashPrefix } from '../git/repository-identity';
import { readWorktreeRecord } from '../git/worktree-record';

/** Windows has no POSIX uid proof, even if a runtime exposes a compatibility method. */
export function worktreeUid(platform: NodeJS.Platform = process.platform, probe: () => number | undefined = () => process.getuid?.()): number | undefined {
  return platform === 'win32' ? undefined : probe();
}

export type WorktreeRemovalStep = 'prune-intent' | 'pruned-registrations' | 'intent' | 'renamed' | 'unregistered' | 'branch-deleted' | 'trash-entry-deleted';
export interface WorktreeRemovalOptions {
  readonly deadlineMs?: number;
  readonly afterRemovalStep?: (step: WorktreeRemovalStep, path: string) => void;
}
export interface WorktreeTrashReceipt {
  readonly protocol: 1;
  readonly kind: 'repo-harness-worktree-trash';
  readonly common: string;
  readonly directory: string;
  readonly expected: ExactWorktreeCleanup;
  readonly uid: number;
  readonly container_dev: number;
  readonly container_ino: number;
  readonly worktree_dev: number;
  readonly worktree_ino: number;
  readonly git_directory: string;
  readonly git_directory_dev: number;
  readonly git_directory_ino: number;
  readonly worktree_record_id?: string;
}
const RECEIPT = 'receipt.json';
const TEMP = 'receipt.tmp';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function trashNamePattern(common: string): RegExp {
  return new RegExp(`^${worktreeTrashPrefix(common).replace(/\./g, '\\.')}(${UUID})$`);
}
export function worktreeTrashNames(common: string, managedRoot: string): string[] {
  const pattern = trashNamePattern(common);
  return readdirSync(managedRoot).filter(name => pattern.test(name)).sort().map(name => join(managedRoot, name));
}

/** No ownership guess is permitted when the host does not expose a uid. */
export function assertOwnedTrashDirectory(path: string) {
  const uid = worktreeUid();
  if (uid === undefined) throw new Error('trash ownership is unavailable on this host');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('trash is not a real directory');
  if (stat.uid !== uid) throw new Error('trash is foreign-owned');
  return stat;
}
function present(path: string): Stats | null {
  try { return lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export function trashPayload(receipt: { readonly directory: string }): string {
  return join(receipt.directory, 'worktree');
}

/** Publish the immutable approval before the first visible mutation. */
export function prepareWorktreeTrash(common: string, managedRoot: string, expected: ExactWorktreeCleanup, gitDirectory: string): WorktreeTrashReceipt {
  const lifecycle = readWorktreeRecord(common, expected.worktree);
  const original = assertOwnedTrashDirectory(expected.worktree);
  const registration = assertOwnedTrashDirectory(gitDirectory);
  if (dirname(gitDirectory) !== join(common, 'worktrees')) throw new Error('worktree registration is outside the documented Git layout');
  const directory = join(managedRoot, worktreeTrashPrefix(common) + randomUUID());
  mkdirSync(directory, { mode: 0o700 });
  const container = assertOwnedTrashDirectory(directory);
  if (container.dev !== original.dev) throw new Error('trash is on another filesystem');
  if (![container.dev, container.ino, original.dev, original.ino, registration.dev, registration.ino].every(Number.isSafeInteger)) throw new Error('trash filesystem identity is unavailable');
  const receipt: WorktreeTrashReceipt = {
    protocol: 1, kind: 'repo-harness-worktree-trash', common, directory, expected,
    uid: original.uid, container_dev: container.dev, container_ino: container.ino,
    worktree_dev: original.dev, worktree_ino: original.ino,
    git_directory: gitDirectory, git_directory_dev: registration.dev, git_directory_ino: registration.ino,
    ...(lifecycle ? { worktree_record_id: lifecycle.id } : {}),
  };
  createFileExclusiveDurably(join(directory, TEMP), Buffer.from(JSON.stringify(receipt) + '\n'));
  renameSync(join(directory, TEMP), join(directory, RECEIPT));
  syncDirectoryDurably(directory);
  syncDirectoryDurably(managedRoot);
  return receipt;
}

/** An interrupted publisher has not moved the checkout yet. Only empty metadata can be removed. */
export function readWorktreeTrash(common: string, managedRoot: string, directory: string): WorktreeTrashReceipt | null {
  const container = assertOwnedTrashDirectory(directory);
  if (dirname(directory) !== managedRoot || !trashNamePattern(common).test(basename(directory))) throw new Error('trash name is not owned by this clone');
  const path = join(directory, RECEIPT);
  const stat = present(path);
  if (!stat) {
    const names = readdirSync(directory);
    if (names.length === 0) return null;
    const temp = present(join(directory, TEMP));
    if (names.length === 1 && names[0] === TEMP && temp?.isFile() && !temp.isSymbolicLink() && temp.uid === container.uid) return null;
    throw new Error('trash has no complete approval receipt');
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== container.uid) throw new Error('trash receipt is unsafe');
  const record = JSON.parse(readFileSync(path, 'utf8')) as WorktreeTrashReceipt;
  if (record.protocol !== 1 || record.kind !== 'repo-harness-worktree-trash' || record.common !== common || record.directory !== directory
    || record.uid !== container.uid || record.container_dev !== container.dev || record.container_ino !== container.ino
    || !Number.isSafeInteger(record.worktree_dev) || !Number.isSafeInteger(record.worktree_ino)
    || typeof record.git_directory !== 'string' || dirname(record.git_directory) !== join(common, 'worktrees')
    || !Number.isSafeInteger(record.git_directory_dev) || !Number.isSafeInteger(record.git_directory_ino)) throw new Error('trash receipt identity changed');
  const expected = record.expected;
  if (record.worktree_record_id !== undefined && !/^wt_[a-f0-9]{64}$/u.test(record.worktree_record_id)) throw new Error('trash lifecycle identity invalid');
  if (!expected || typeof expected.worktree !== 'string' || dirname(expected.worktree) !== managedRoot
    || typeof expected.branch !== 'string' || !expected.branch || typeof expected.target_ref !== 'string'
    || ![expected.head_sha, expected.target_oid, expected.merge_commit_sha].every(value => typeof value === 'string' && /^[a-f0-9]{40,64}$/.test(value))) throw new Error('trash receipt has an invalid cleanup identity');
  const payload = present(trashPayload(record));
  if (payload && (!payload.isDirectory() || payload.isSymbolicLink() || payload.uid !== record.uid
    || payload.dev !== record.worktree_dev || payload.ino !== record.worktree_ino)) throw new Error('trash worktree identity changed');
  return record;
}

export function renameWorktreeToTrash(receipt: Pick<WorktreeTrashReceipt, 'directory' | 'worktree_dev' | 'worktree_ino'> & { readonly expected: { readonly worktree: string } }): void {
  const stat = assertOwnedTrashDirectory(receipt.expected.worktree);
  if (stat.dev !== receipt.worktree_dev || stat.ino !== receipt.worktree_ino) throw new Error('worktree identity changed before rename');
  if (present(trashPayload(receipt))) throw new Error('trash payload already exists');
  // The destination is inside an exclusively claimed 0700 container.
  renameSync(receipt.expected.worktree, trashPayload(receipt));
  syncDirectoryDurably(dirname(receipt.expected.worktree));
  syncDirectoryDurably(receipt.directory);
}

function checkDeadline(deadline: number): void {
  if (Date.now() >= deadline) throw new Error('time budget reached; trash deletion will resume');
}

/** Only payload deletion, after recovery readback, may yield to live cleanup. */
export class WorktreeTrashBudgetReached extends Error {
  constructor() { super('time budget reached; trash deletion will resume'); }
}
function checkDeletionDeadline(deadline: number): void {
  if (Date.now() >= deadline) throw new WorktreeTrashBudgetReached();
}
function deletePayload(path: string, deadline: number, options: WorktreeRemovalOptions): void {
  const pending = [path];
  while (pending.length > 0) {
    checkDeletionDeadline(deadline);
    const current = pending[pending.length - 1]!;
    const stat = present(current);
    if (!stat) { pending.pop(); continue; }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      unlinkSync(current);
      pending.pop();
      options.afterRemovalStep?.('trash-entry-deleted', current);
      continue;
    }
    // Read one child and close before descending. Memory and open descriptors
    // do not grow with directory width, and a deep tree cannot exhaust fds.
    const directory = opendirSync(current);
    let entry;
    try { entry = directory.readSync(); } finally { directory.closeSync(); }
    checkDeletionDeadline(deadline);
    if (entry) pending.push(join(current, entry.name));
    else {
      rmdirSync(current);
      pending.pop();
      options.afterRemovalStep?.('trash-entry-deleted', current);
    }
  }
}

/** Partial deletion stays private, unregistered, approved and safe to repeat. */
export function deleteWorktreeTrash(receipt: WorktreeTrashReceipt, deadline: number, options: WorktreeRemovalOptions): void {
  deletePayload(trashPayload(receipt), deadline, options);
  checkDeletionDeadline(deadline);
  unlinkSync(join(receipt.directory, RECEIPT));
  checkDeletionDeadline(deadline);
  rmdirSync(receipt.directory);
}
export function deleteUnpublishedTrash(directory: string, deadline: number): void {
  checkDeadline(deadline);
  const temp = present(join(directory, TEMP));
  if (temp) unlinkSync(join(directory, TEMP));
  checkDeadline(deadline);
  rmdirSync(directory);
}

/**
 * A failed preflight or an interrupted publisher has not moved data. Its unused
 * approval must not block other work or authorize a later rename. An empty
 * container left by an interruption is unpublished trash.
 */
export function discardWorktreeTrashApproval(receipt: WorktreeTrashReceipt, deadline: number): void {
  if (present(trashPayload(receipt))) throw new Error('renamed approval cannot be discarded');
  if (readdirSync(receipt.directory).some(name => name !== RECEIPT)) throw new Error('approval container has unknown contents');
  checkDeadline(deadline);
  unlinkSync(join(receipt.directory, RECEIPT));
  syncDirectoryDurably(receipt.directory);
  checkDeadline(deadline);
  rmdirSync(receipt.directory);
  syncDirectoryDurably(dirname(receipt.directory));
}

/** Explicit authorization has its own receipt kind and namespace. Green sweep cannot consume it. */
export interface AuthorizedWorktreeCleanup {
  readonly key: string;
  readonly id: string;
  readonly plan_sha256: string;
  readonly loss_sha256: string;
  readonly worktree: string;
  readonly source_dev: number;
  readonly source_ino: number;
  readonly source_birthtime_ms: number;
  readonly branch: string | null;
  readonly head_sha: string | null;
  readonly archive_pr: string | null;
  readonly archive_manifest_sha256: string | null;
}
export interface AuthorizedWorktreeTrashReceipt {
  readonly protocol: 1;
  readonly kind: 'repo-harness-authorized-worktree-trash';
  readonly common: string;
  readonly directory: string;
  readonly expected: AuthorizedWorktreeCleanup;
  readonly uid: number;
  readonly container_dev: number;
  readonly container_ino: number;
  readonly worktree_dev: number;
  readonly worktree_ino: number;
  readonly git_directory: string | null;
  readonly git_directory_dev: number | null;
  readonly git_directory_ino: number | null;
  readonly registration_locked: boolean;
  readonly worktree_record_id: string | null;
}
function authorizedTrashDirectory(common: string, parent: string, key: string): string {
  return join(parent, worktreeTrashPrefix(common) + 'authorized-' + createHash('sha256').update(key).digest('hex'));
}
function assertAuthorizedTrashParent(parent: string): void {
  const stat = lstatSync(parent), uid = worktreeUid();
  // A shared sticky temp root is valid; the operation container itself must be owned and 0700.
  if (uid === undefined || !stat.isDirectory() || stat.isSymbolicLink()
    || !((stat.uid === uid && (stat.mode & 0o022) === 0) || (stat.mode & 0o1000) !== 0)) throw new Error('unsafe authorized trash parent');
}
function validAuthorization(expected: AuthorizedWorktreeCleanup, parent: string): boolean {
  const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
  return !!expected && Object.keys(expected).sort().join(',') === 'archive_manifest_sha256,archive_pr,branch,head_sha,id,key,loss_sha256,plan_sha256,source_birthtime_ms,source_dev,source_ino,worktree'
    && typeof expected.key === 'string' && /^[a-f0-9]{32}:wt_[a-f0-9]{64}:[a-f0-9]{64}$/u.test(expected.key)
    && typeof expected.id === 'string' && /^wt_[a-f0-9]{64}$/u.test(expected.id)
    && expected.key.split(':')[1] === expected.id && expected.key.split(':')[2] === expected.plan_sha256
    && digest(expected.plan_sha256) && digest(expected.loss_sha256)
    && typeof expected.worktree === 'string' && dirname(expected.worktree) === parent
    && Number.isSafeInteger(expected.source_dev) && Number.isSafeInteger(expected.source_ino) && Number.isFinite(expected.source_birthtime_ms)
    && (expected.head_sha === null || /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(expected.head_sha))
    && (expected.branch === null || (typeof expected.branch === 'string' && expected.branch.length > 0 && !/[\n\r\0]/u.test(expected.branch)))
    && (expected.archive_manifest_sha256 === null || digest(expected.archive_manifest_sha256))
    && (expected.archive_pr === null || /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/u.test(expected.archive_pr));
}
/** The caller holds the topology lock and has verified authorization, fresh content and archive readback. */
export function prepareAuthorizedWorktreeTrash(common: string, expected: AuthorizedWorktreeCleanup, gitDirectory: string | null, locked = false): AuthorizedWorktreeTrashReceipt {
  const parent = dirname(expected.worktree);
  if (!validAuthorization(expected, parent)) throw new Error('invalid authorized cleanup identity');
  assertAuthorizedTrashParent(parent);
  const source = assertOwnedTrashDirectory(expected.worktree);
  if (source.dev !== expected.source_dev || source.ino !== expected.source_ino || source.birthtimeMs !== expected.source_birthtime_ms) throw new Error('authorized source incarnation changed');
  const registration = gitDirectory === null ? null : assertOwnedTrashDirectory(gitDirectory);
  if (gitDirectory !== null && dirname(gitDirectory) !== join(common, 'worktrees')) throw new Error('invalid authorized registration');
  const directory = authorizedTrashDirectory(common, parent, expected.key);
  mkdirSync(directory, { mode: 0o700 }); // Exclusive operation key; an existing intent must reconcile.
  const container = assertOwnedTrashDirectory(directory);
  if (container.dev !== source.dev || (container.mode & 0o777) !== 0o700) throw new Error('unsafe authorized trash');
  const receipt: AuthorizedWorktreeTrashReceipt = { protocol: 1, kind: 'repo-harness-authorized-worktree-trash', common, directory, expected,
    uid: source.uid, container_dev: container.dev, container_ino: container.ino, worktree_dev: source.dev, worktree_ino: source.ino,
    git_directory: gitDirectory, git_directory_dev: registration?.dev ?? null, git_directory_ino: registration?.ino ?? null,
    registration_locked: locked,
    worktree_record_id: readWorktreeRecord(common, expected.worktree)?.id ?? null };
  createFileExclusiveDurably(join(directory, TEMP), Buffer.from(JSON.stringify(receipt) + '\n'));
  renameSync(join(directory, TEMP), join(directory, RECEIPT));
  syncDirectoryDurably(directory); syncDirectoryDurably(parent);
  return receipt;
}
/** Read only. Missing source is never proof of completion. An incomplete intent throws, not absent. */
export function readAuthorizedWorktreeTrash(common: string, expected: AuthorizedWorktreeCleanup): AuthorizedWorktreeTrashReceipt | null {
  const parent = dirname(expected.worktree);
  if (!validAuthorization(expected, parent)) throw new Error('invalid authorized cleanup identity');
  assertAuthorizedTrashParent(parent);
  const directory = authorizedTrashDirectory(common, parent, expected.key);
  if (!present(directory)) return null;
  const container = assertOwnedTrashDirectory(directory);
  if ((container.mode & 0o777) !== 0o700) throw new Error('unsafe authorized trash permissions');
  const file = present(join(directory, RECEIPT));
  if (!file?.isFile() || file.isSymbolicLink() || file.uid !== container.uid || (file.mode & 0o777) !== 0o600) throw new Error('authorized receipt is incomplete or unsafe');
  const receipt = JSON.parse(readFileSync(join(directory, RECEIPT), 'utf8')) as AuthorizedWorktreeTrashReceipt;
  if (receipt.protocol !== 1 || receipt.kind !== 'repo-harness-authorized-worktree-trash' || receipt.common !== common || receipt.directory !== directory
    || receipt.uid !== container.uid || receipt.container_dev !== container.dev || receipt.container_ino !== container.ino
    || !Number.isSafeInteger(receipt.worktree_dev) || !Number.isSafeInteger(receipt.worktree_ino)
    || receipt.worktree_dev !== expected.source_dev || receipt.worktree_ino !== expected.source_ino || typeof receipt.registration_locked !== 'boolean'
    || !validAuthorization(receipt.expected, parent) || JSON.stringify(receipt.expected) !== JSON.stringify(expected)
    || (receipt.git_directory === null ? receipt.git_directory_dev !== null || receipt.git_directory_ino !== null
      : typeof receipt.git_directory !== 'string' || dirname(receipt.git_directory) !== join(common, 'worktrees')
        || !Number.isSafeInteger(receipt.git_directory_dev) || !Number.isSafeInteger(receipt.git_directory_ino))
    || (receipt.worktree_record_id !== null && !/^wt_[a-f0-9]{64}$/u.test(receipt.worktree_record_id))) throw new Error('authorized receipt identity changed');
  const payload = present(trashPayload(receipt));
  if (payload && (!payload.isDirectory() || payload.isSymbolicLink() || payload.uid !== receipt.uid
    || payload.dev !== receipt.worktree_dev || payload.ino !== receipt.worktree_ino)) throw new Error('authorized payload identity changed');
  if (readdirSync(directory).some(name => ![RECEIPT, 'worktree', 'renamed.json', 'completed.json'].includes(name))) throw new Error('unknown authorized trash content');
  return receipt;
}
function completion(receipt: AuthorizedWorktreeTrashReceipt): string {
  return JSON.stringify({ protocol: 1, kind: 'authorized_cleanup_completed', key: receipt.expected.key,
    receipt_sha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex') }) + '\n';
}
export function authorizedWorktreeTrashWasRenamed(receipt: AuthorizedWorktreeTrashReceipt): boolean {
  const path = join(receipt.directory, 'renamed.json'), file = present(path);
  if (!file) return false;
  if (!file.isFile() || file.isSymbolicLink() || file.uid !== receipt.uid || (file.mode & 0o777) !== 0o600
    || readFileSync(path, 'utf8') !== completion(receipt)) throw new Error('authorized rename evidence invalid');
  return true;
}
export function recordAuthorizedWorktreeTrashRename(receipt: AuthorizedWorktreeTrashReceipt): void {
  if (authorizedWorktreeTrashWasRenamed(receipt)) return;
  const payload = assertOwnedTrashDirectory(trashPayload(receipt));
  if (payload.dev !== receipt.worktree_dev || payload.ino !== receipt.worktree_ino) throw new Error('authorized payload changed before rename record');
  createFileExclusiveDurably(join(receipt.directory, 'renamed.json'), Buffer.from(completion(receipt)));
  syncDirectoryDurably(receipt.directory);
}
export function authorizedWorktreeTrashCompleted(receipt: AuthorizedWorktreeTrashReceipt): boolean {
  const path = join(receipt.directory, 'completed.json'), file = present(path);
  if (!file) return false;
  if (!file.isFile() || file.isSymbolicLink() || file.uid !== receipt.uid || (file.mode & 0o777) !== 0o600
    || readFileSync(path, 'utf8') !== completion(receipt) || present(trashPayload(receipt)) || !authorizedWorktreeTrashWasRenamed(receipt)) throw new Error('authorized completion invalid');
  return true;
}
/** Keep the immutable receipt and completion tombstone for stable-key result recovery. */
export function completeAuthorizedWorktreeTrash(receipt: AuthorizedWorktreeTrashReceipt, deadline: number, options: WorktreeRemovalOptions): void {
  if (authorizedWorktreeTrashCompleted(receipt)) return;
  if (!authorizedWorktreeTrashWasRenamed(receipt)) throw new Error('authorized source rename is unproven');
  deletePayload(trashPayload(receipt), deadline, options);
  syncDirectoryDurably(receipt.directory);
  createFileExclusiveDurably(join(receipt.directory, 'completed.json'), Buffer.from(completion(receipt)));
  syncDirectoryDurably(receipt.directory);
}
