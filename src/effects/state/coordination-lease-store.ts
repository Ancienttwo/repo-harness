/**
 * The coordination plane's filesystem primitives, rooted at
 * `$(git rev-parse --git-common-dir)/repo-harness/coordination/v1/`:
 *
 * ```
 * leases/<task-id>/owner.json
 * locks/tasks/<task-id>.lock/
 * locks/backlog.lock/
 * ```
 *
 * The git common directory is the point: it is shared by every linked worktree
 * of one clone, which is exactly the scope `sprint-backlog.sh`'s per-worktree
 * `in_flight_dir()` and `.backlog-lock` lack.
 * `scripts/contract-worktree.sh:513-537` already proves this shape here, with
 * one atomic `mkdir` election plus an owner record under the same common dir.
 *
 * Mutual exclusion reuses `withExclusiveDirectoryLock`, the house primitive
 * `src/effects/state/git-state-version-store.ts` already runs against this same
 * common directory. It is the same atomic-`mkdir` election with stale reclaim
 * that `acquire_backlog_lock()` performs, hardened with a published owner
 * token, PID liveness, and ancestor-identity checks; hand-rolling a second,
 * weaker mutex beside it would be a duplicate authority for the same datum.
 *
 * Nothing here classifies by guessing. A lease directory with no owner record
 * (the crash window between `mkdir` and the durable write), a malformed or
 * empty record, and a symlinked lease directory or record are all `unknown`,
 * and `unknown` is never silently deleted -- `removeLease` refuses to touch it.
 */
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
} from 'fs';
import { dirname, join } from 'path';
import {
  TASK_DIGEST_PATTERN,
  parseLeaseOwnerRecord,
  serializeLeaseOwnerRecord,
  type LeaseOwnerRecordV1,
  type LeaseState,
} from '../../core/state/coordination-identity';
import { writeFileDurably } from '../evidence/atomic-append';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

/** Relative to the git common directory. */
export const COORDINATION_ROOT_RELATIVE_PATH = 'repo-harness/coordination/v1';
export const COORDINATION_BACKLOG_LOCK_RELATIVE_PATH = `${COORDINATION_ROOT_RELATIVE_PATH}/locks/backlog.lock`;
export const LEASE_OWNER_FILE_NAME = 'owner.json';

/** Why a lease could not be classified into a lifecycle state. */
export type LeaseUnknownReason =
  | 'lease_path_not_directory'
  | 'owner_record_missing'
  | 'owner_record_symlink'
  | 'owner_record_not_file'
  | 'owner_record_empty'
  | 'owner_record_malformed'
  | 'owner_record_task_id_mismatch'
  | 'owner_record_unreadable';

export type LeaseClassification = LeaseState | 'unknown';

export interface LeaseRead {
  readonly task_id: string;
  readonly classification: LeaseClassification;
  readonly record: LeaseOwnerRecordV1 | null;
  /** Non-null only when `classification` is `unknown`. */
  readonly unknown_reason: LeaseUnknownReason | null;
  /**
   * The owner record's bytes exactly as they were read, or null when there
   * were none to read (no lease directory, no record file, an unreadable
   * record, or a record that is not a regular file).
   *
   * Read-only and additive: nothing in the classification above consults it.
   * It exists because the board's coordination digest must hash bytes rather
   * than the parsed record -- two records that parse identically but were
   * written by different owners at different moments are exactly the torn read
   * the digest has to make visible, and parsing erases that difference.
   */
  readonly raw: string | null;
}

function assertTaskId(taskId: string): void {
  // `task_id` becomes a single path component. Anything that is not a bare
  // 64-character hex digest is rejected before it can reach `join()`.
  if (!TASK_DIGEST_PATTERN.test(taskId)) {
    throw new Error(`unsafe coordination task id: ${JSON.stringify(taskId)}`);
  }
}

export function coordinationRoot(cwd: string): string {
  return join(resolveGitCommonDirectory(cwd), COORDINATION_ROOT_RELATIVE_PATH);
}

export function taskLockRelativePath(taskId: string): string {
  assertTaskId(taskId);
  return `${COORDINATION_ROOT_RELATIVE_PATH}/locks/tasks/${taskId}.lock`;
}

export function leaseDirectory(cwd: string, taskId: string): string {
  assertTaskId(taskId);
  return join(coordinationRoot(cwd), 'leases', taskId);
}

export function leaseOwnerPath(cwd: string, taskId: string): string {
  return join(leaseDirectory(cwd, taskId), LEASE_OWNER_FILE_NAME);
}

/**
 * Serialize every ownership mutation for one task. Each verb -- claim, bind,
 * release, steal, reconcile -- runs its read, compare, and write inside this
 * critical section, which is what makes fencing-token comparison safe: a bare
 * compare-and-mutate is still a TOCTOU when a concurrent steal lands between
 * the read and the write.
 */
export function withTaskLock<T>(cwd: string, taskId: string, run: () => T): T {
  const commonDir = resolveGitCommonDirectory(cwd);
  return withExclusiveDirectoryLock(commonDir, taskLockRelativePath(taskId), run);
}

/**
 * The backlog-wide lock, relocated from `sprint-backlog.sh`'s per-worktree
 * `.backlog-lock` onto the shared plane so back-fill serializes across
 * worktrees. Wiring the shell caller to it is the start-task integration.
 */
export function withBacklogLock<T>(cwd: string, run: () => T): T {
  const commonDir = resolveGitCommonDirectory(cwd);
  return withExclusiveDirectoryLock(commonDir, COORDINATION_BACKLOG_LOCK_RELATIVE_PATH, run);
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Atomic `mkdir` election of the lease directory. `false` means another caller
 * already elected it; the caller must then read the owner record under the
 * lock rather than assume anything about who won.
 */
export function createLeaseDirectory(cwd: string, taskId: string): boolean {
  const target = leaseDirectory(cwd, taskId);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  try {
    mkdirSync(target, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
  fsyncDirectory(dirname(target));
  return true;
}

/**
 * Publish an owner record durably: temp file, fsync, atomic rename, then fsync
 * the containing directory so the rename itself survives a crash. A reader
 * therefore observes either the previous record or the new one, never a
 * partial write.
 */
export function writeLeaseOwnerDurably(
  cwd: string,
  taskId: string,
  record: LeaseOwnerRecordV1,
): void {
  if (record.task_id !== taskId) {
    throw new Error(
      `refusing to write owner record for task ${record.task_id} into lease ${taskId}`,
    );
  }
  const directory = leaseDirectory(cwd, taskId);
  const target = join(directory, LEASE_OWNER_FILE_NAME);
  const temp = join(directory, `.${LEASE_OWNER_FILE_NAME}.tmp-${process.pid}-${Date.now()}`);
  try {
    writeFileDurably(temp, serializeLeaseOwnerRecord(record));
    renameSync(temp, target);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      // The temp file may never have been created; the original error wins.
    }
    throw error;
  }
  fsyncDirectory(directory);
}

function classifyUnknown(
  taskId: string,
  reason: LeaseUnknownReason,
  raw: string | null = null,
): LeaseRead {
  return { task_id: taskId, classification: 'unknown', record: null, unknown_reason: reason, raw };
}

/**
 * Classify one lease. Read-only and total: every shape that is not a valid
 * owner record for this task lands in `unknown` with a named reason, and
 * nothing is repaired, defaulted, or deleted along the way.
 */
export function readLease(cwd: string, taskId: string): LeaseRead {
  const directory = leaseDirectory(cwd, taskId);
  let directoryStat;
  try {
    directoryStat = lstatSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        task_id: taskId,
        classification: 'available',
        record: null,
        unknown_reason: null,
        raw: null,
      };
    }
    throw error;
  }
  // `lstat`, so a symlink pointing at a real directory is still not one.
  if (!directoryStat.isDirectory()) return classifyUnknown(taskId, 'lease_path_not_directory');

  const ownerPath = join(directory, LEASE_OWNER_FILE_NAME);
  let ownerStat;
  try {
    ownerStat = lstatSync(ownerPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // The crash window between the lease mkdir and the durable write.
      return classifyUnknown(taskId, 'owner_record_missing');
    }
    throw error;
  }
  if (ownerStat.isSymbolicLink()) return classifyUnknown(taskId, 'owner_record_symlink');
  if (!ownerStat.isFile()) return classifyUnknown(taskId, 'owner_record_not_file');

  let raw: string;
  try {
    raw = readFileSync(ownerPath, 'utf-8');
  } catch {
    return classifyUnknown(taskId, 'owner_record_unreadable');
  }
  if (raw.trim().length === 0) return classifyUnknown(taskId, 'owner_record_empty', raw);

  const record = parseLeaseOwnerRecord(raw);
  if (record === null) return classifyUnknown(taskId, 'owner_record_malformed', raw);
  if (record.task_id !== taskId) {
    return classifyUnknown(taskId, 'owner_record_task_id_mismatch', raw);
  }

  return { task_id: taskId, classification: record.state, record, unknown_reason: null, raw };
}

export interface LeaseByClaimId {
  readonly task_id: string;
  readonly record: LeaseOwnerRecordV1;
}

export type LeaseClaimLookup =
  | { readonly ok: true; readonly lease: LeaseByClaimId }
  | { readonly ok: false; readonly error: string };

/**
 * Locate the lease a fencing token owns. The scan is a lookup only: the caller
 * still re-reads and re-compares the record under that task's lock, so a lease
 * that moves between the scan and the lock is caught there rather than here.
 *
 * Unknown leases are skipped, never repaired. Two leases carrying one claim id
 * is an impossible state, so it fails closed instead of picking one.
 */
export function findLeaseByClaimId(cwd: string, claimId: string): LeaseClaimLookup {
  const leasesRoot = join(coordinationRoot(cwd), 'leases');
  let entries: string[];
  try {
    entries = readdirSync(leasesRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, error: `no lease holds claim id ${claimId}` };
    }
    throw error;
  }

  const matches: LeaseByClaimId[] = [];
  for (const entry of entries.sort()) {
    if (!TASK_DIGEST_PATTERN.test(entry)) continue;
    const read = readLease(cwd, entry);
    if (read.record !== null && read.record.claim_id === claimId) {
      matches.push({ task_id: entry, record: read.record });
    }
  }
  if (matches.length === 0) return { ok: false, error: `no lease holds claim id ${claimId}` };
  if (matches.length > 1) {
    return {
      ok: false,
      error: `claim id ${claimId} is held by ${matches.length} leases: ${matches.map((match) => match.task_id).join(', ')}`,
    };
  }
  return { ok: true, lease: matches[0] };
}

/**
 * Remove a lease whose owner record this caller has already validated under
 * the task lock. It refuses to remove anything it cannot see a matching owner
 * record for, so an `unknown` lease -- an empty directory, a malformed record,
 * a symlink -- always survives to explicit reconcile.
 */
export function removeLease(cwd: string, taskId: string, expectedClaimId: string): void {
  const read = readLease(cwd, taskId);
  if (read.record === null) {
    throw new Error(
      `refusing to remove lease ${taskId}: classified ${read.classification}`
      + `${read.unknown_reason ? ` (${read.unknown_reason})` : ''}`,
    );
  }
  if (read.record.claim_id !== expectedClaimId) {
    throw new Error(
      `refusing to remove lease ${taskId}: owned by ${read.record.claim_id}, not ${expectedClaimId}`,
    );
  }
  const directory = leaseDirectory(cwd, taskId);
  unlinkSync(join(directory, LEASE_OWNER_FILE_NAME));
  rmdirSync(directory);
  fsyncDirectory(dirname(directory));
}

/**
 * Roll back the lease directory this call created after its own re-read of
 * canonical authority failed. Deliberately narrower than `removeLease`: it
 * accepts the `owner_record_missing` crash-window shape too, because a claim
 * that fails between `mkdir` and the durable write must still be able to undo
 * exactly the directory it just created -- and only while holding the task
 * lock, with the directory still empty.
 */
export function removeOwnLeaseAfterFailedClaim(
  cwd: string,
  taskId: string,
  claimId: string,
): void {
  const read = readLease(cwd, taskId);
  if (read.record !== null) {
    removeLease(cwd, taskId, claimId);
    return;
  }
  if (read.unknown_reason !== 'owner_record_missing') {
    throw new Error(
      `refusing to roll back lease ${taskId}: classified ${read.classification}`
      + `${read.unknown_reason ? ` (${read.unknown_reason})` : ''}`,
    );
  }
  const directory = leaseDirectory(cwd, taskId);
  if (readdirSync(directory).length !== 0) {
    throw new Error(`refusing to roll back non-empty lease directory ${taskId}`);
  }
  rmdirSync(directory);
  fsyncDirectory(dirname(directory));
}
