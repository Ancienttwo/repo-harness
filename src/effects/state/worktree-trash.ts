import { createHash, randomUUID } from 'crypto';
import { lstatSync, mkdirSync, opendirSync, readFileSync, readdirSync, renameSync, rmdirSync, unlinkSync } from 'fs';
import { basename, dirname, join } from 'path';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../evidence/atomic-append';
import type { ExactWorktreeCleanup } from './coordination-worktree-topology';

export type WorktreeRemovalStep = 'intent' | 'renamed' | 'unregistered' | 'branch-deleted' | 'trash-entry-deleted';
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
}
const RECEIPT = 'receipt.json';
const TEMP = 'receipt.tmp';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function trashPrefix(common: string): string {
  return `.repo-harness-wt-trash-${createHash('sha256').update(common).digest('hex').slice(0, 32)}-`;
}
function trashNamePattern(common: string): RegExp {
  return new RegExp(`^${trashPrefix(common).replace(/\./g, '\\.')}(${UUID})$`);
}
export function worktreeTrashNames(common: string, managedRoot: string): string[] {
  const pattern = trashNamePattern(common);
  return readdirSync(managedRoot).filter(name => pattern.test(name)).sort().map(name => join(managedRoot, name));
}

/** No ownership guess is permitted when the host does not expose a uid. */
export function assertOwnedTrashDirectory(path: string) {
  if (!process.getuid) throw new Error('trash ownership is unavailable on this host');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('trash is not a real directory');
  if (stat.uid !== process.getuid()) throw new Error('trash is foreign-owned');
  return stat;
}
function present(path: string): ReturnType<typeof lstatSync> | null {
  try { return lstatSync(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export function trashPayload(receipt: WorktreeTrashReceipt): string {
  return join(receipt.directory, 'worktree');
}

/** Publish the immutable approval before the first visible mutation. */
export function prepareWorktreeTrash(common: string, managedRoot: string, expected: ExactWorktreeCleanup, gitDirectory: string): WorktreeTrashReceipt {
  const original = assertOwnedTrashDirectory(expected.worktree);
  const registration = assertOwnedTrashDirectory(gitDirectory);
  if (dirname(gitDirectory) !== join(common, 'worktrees')) throw new Error('worktree registration is outside the documented Git layout');
  const directory = join(managedRoot, trashPrefix(common) + randomUUID());
  mkdirSync(directory, { mode: 0o700 });
  const container = assertOwnedTrashDirectory(directory);
  if (container.dev !== original.dev) throw new Error('trash is on another filesystem');
  if (![container.dev, container.ino, original.dev, original.ino, registration.dev, registration.ino].every(Number.isSafeInteger)) throw new Error('trash filesystem identity is unavailable');
  const receipt: WorktreeTrashReceipt = {
    protocol: 1, kind: 'repo-harness-worktree-trash', common, directory, expected,
    uid: original.uid, container_dev: container.dev, container_ino: container.ino,
    worktree_dev: original.dev, worktree_ino: original.ino,
    git_directory: gitDirectory, git_directory_dev: registration.dev, git_directory_ino: registration.ino,
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
  if (!expected || typeof expected.worktree !== 'string' || dirname(expected.worktree) !== managedRoot
    || typeof expected.branch !== 'string' || !expected.branch || typeof expected.target_ref !== 'string'
    || ![expected.head_sha, expected.target_oid, expected.merge_commit_sha].every(value => typeof value === 'string' && /^[a-f0-9]{40,64}$/.test(value))) throw new Error('trash receipt has an invalid cleanup identity');
  const payload = present(trashPayload(record));
  if (payload && (!payload.isDirectory() || payload.isSymbolicLink() || payload.uid !== record.uid
    || payload.dev !== record.worktree_dev || payload.ino !== record.worktree_ino)) throw new Error('trash worktree identity changed');
  return record;
}

export function renameWorktreeToTrash(receipt: WorktreeTrashReceipt): void {
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
function deletePayload(path: string, deadline: number, options: WorktreeRemovalOptions): void {
  const pending = [path];
  while (pending.length > 0) {
    checkDeadline(deadline);
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
    checkDeadline(deadline);
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
  checkDeadline(deadline);
  unlinkSync(join(receipt.directory, RECEIPT));
  checkDeadline(deadline);
  rmdirSync(receipt.directory);
}
export function deleteUnpublishedTrash(directory: string, deadline: number): void {
  checkDeadline(deadline);
  const temp = present(join(directory, TEMP));
  if (temp) unlinkSync(join(directory, TEMP));
  checkDeadline(deadline);
  rmdirSync(directory);
}

/** A failed preflight has not moved data. Its unused approval must not block other work. */
export function discardWorktreeTrashApproval(receipt: WorktreeTrashReceipt, deadline: number): void {
  if (present(trashPayload(receipt))) throw new Error('renamed approval cannot be discarded');
  if (readdirSync(receipt.directory).some(name => name !== RECEIPT)) throw new Error('approval container has unknown contents');
  checkDeadline(deadline);
  unlinkSync(join(receipt.directory, RECEIPT));
  checkDeadline(deadline);
  rmdirSync(receipt.directory);
}
