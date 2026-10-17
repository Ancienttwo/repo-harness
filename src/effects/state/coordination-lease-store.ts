/** Read historical lease owners and lock manual inbox operations in the Git common directory. */
import { lstatSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { TASK_DIGEST_PATTERN, parseLeaseOwnerRecord, type LeaseOwnerRecord, type LeaseState } from '../../core/state/coordination-identity';
import { configuredGitBinary, resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

/** Relative to the git common directory. */
export const COORDINATION_ROOT_RELATIVE_PATH = 'repo-harness/coordination/v1';
export const LEASE_OWNER_FILE_NAME = 'owner.json';
/** Sibling of `leases/`, so no lease reader ever enumerates a removed lease. */

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
  readonly record: LeaseOwnerRecord | null;
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

export function coordinationRoot(cwd: string, gitTimeoutMs?: number, gitBin = configuredGitBinary()): string {
  return join(resolveGitCommonDirectory(cwd, gitBin, gitTimeoutMs), COORDINATION_ROOT_RELATIVE_PATH);
}

export function taskLockRelativePath(taskId: string): string {
  assertTaskId(taskId);
  return `${COORDINATION_ROOT_RELATIVE_PATH}/locks/tasks/${taskId}.lock`;
}

export function leaseDirectory(cwd: string, taskId: string): string {
  assertTaskId(taskId);
  return join(coordinationRoot(cwd), 'leases', taskId);
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

/** How a reclaimed backlog lock is reported; overridable for tests. */
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
  return readLeaseAt(leaseDirectory(cwd, taskId), taskId);
}

/**
 * `readLease` against an already resolved lease directory. Root discovery
 * spawns `git`, so a scan resolves it once per call instead of once per entry.
 */
function readLeaseAt(directory: string, taskId: string): LeaseRead {
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

/**
 * Enumerate every canonical task lease without inventing ownership for
 * unrelated filesystem residue. Valid task-id entries are returned even when
 * their owner record is unknown so safety callers can fail closed.
 */
export function listLeaseReads(cwd: string, gitTimeoutMs?: number, gitBin = configuredGitBinary()): readonly LeaseRead[] {
  const leasesRoot = join(coordinationRoot(cwd, gitTimeoutMs, gitBin), 'leases');
  let entries: string[];
  try {
    entries = readdirSync(leasesRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Object.freeze([]);
    throw error;
  }
  return Object.freeze(entries
    .filter((entry) => TASK_DIGEST_PATTERN.test(entry))
    .sort()
    .map((entry) => readLeaseAt(join(leasesRoot, entry), entry)));
}
