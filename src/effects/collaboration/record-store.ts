/**
 * The mechanics every collaboration record store shares.
 *
 * Store root, lock strategy and canonical JSON are frozen by D9 in
 * `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`:
 * `<git-common-dir>/repo-harness/collaboration/v1/`, an exclusive directory lock
 * taken per subject, immutable create plus fsync, an lstat ancestor walk that
 * refuses symlinks and non-directories, an explicit idempotency conflict on the
 * same identity with different bytes, and no healthy-empty fallback when a shard
 * cannot be read.
 *
 * C1 wrote these rules once, for signals. C3 adds two more record families, and
 * three copies of a crash-safety protocol drift independently — the staging-name
 * builder and its matcher were already one C1 review finding, and copying them
 * reopens it per copy. They live here instead, so a store is a schema plus a
 * shard name and nothing else.
 *
 * Zero delivery-plane write (D1). Nothing here opens a Task, Lease, Publication
 * or Acceptance store.
 */
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { createHash, randomUUID } from 'crypto';
import { basename, dirname, join, relative, sep } from 'path';

import { CollaborationError, validateCollaborationRecordId } from '../../core/collaboration/common';
import { resolveGitCommonDirectory } from '../git/common-directory';

export const COLLABORATION_STORE_RELATIVE_ROOT = 'repo-harness/collaboration/v1';

/** A persisted record is named for its 64-hex identity; nothing else belongs in a shard. */
export const COLLABORATION_RECORD_FILE = /^[0-9a-f]{64}\.json$/u;

/**
 * The variable segments of a staging name, in order. `collaborationStagingName()`
 * emits them and `COLLABORATION_TEMP_FILE` recognises them from this one list, so
 * the writer of the residue and the reader that tolerates it cannot drift apart.
 * A matcher looser than the builder is a hole: every file whose name merely
 * resembles staging residue would be skipped instead of failing the store closed,
 * which is exactly the guarantee the listing functions sell.
 */
const STAGING_SEGMENTS: readonly {
  readonly pattern: string;
  readonly emit: () => string;
}[] = [
  // The staging writer's pid. Real pids start at 1; 0 is never a process.
  { pattern: '[1-9][0-9]*', emit: () => String(process.pid) },
  // `randomUUID()` is v4: a literal version nibble and a variant nibble in [89ab].
  {
    pattern: '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',
    emit: () => randomUUID(),
  },
];

/**
 * The staging name `publishCollaborationRecordDurably()` links from. A crash
 * between staging and linking leaves one behind; it is residue of this store's
 * own publish protocol, so listing skips it instead of declaring the store
 * corrupt. Anything else in the directory still fails the store closed.
 */
export const COLLABORATION_TEMP_FILE = new RegExp(
  `^\\.[0-9a-f]{64}\\.json${STAGING_SEGMENTS.map((segment) => `\\.${segment.pattern}`).join('')}\\.tmp$`,
  'u',
);

/**
 * The only producer of a staging name. Exported so the skip rule can be proven
 * against the name these stores actually write rather than against a copy of its
 * shape kept somewhere else.
 */
export function collaborationStagingName(finalName: string): string {
  return `.${finalName}${STAGING_SEGMENTS.map((segment) => `.${segment.emit()}`).join('')}.tmp`;
}

export interface CollaborationStorePaths {
  readonly common: string;
  readonly root: string;
  /** The absolute directory of one record family, for example `.../v1/handoffs`. */
  readonly shard: string;
}

export function collaborationInvalidStore(message: string, cause?: unknown): never {
  throw new CollaborationError('collaboration_invalid', message, cause);
}

export function collaborationUnavailable(message: string, cause?: unknown): never {
  throw new CollaborationError('collaboration_unavailable', message, cause);
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function collaborationStorePaths(repoRoot: string, shard: string): CollaborationStorePaths {
  const common = realpathSync(resolveGitCommonDirectory(repoRoot));
  const root = join(common, COLLABORATION_STORE_RELATIVE_ROOT);
  return { common, root, shard: join(root, shard) };
}

/**
 * Walk every ancestor between the Git common directory and the target, creating
 * what is missing and refusing anything that is not a real directory. A
 * symlinked ancestor would let a record be written outside the store.
 */
export function ensureCollaborationDirectory(common: string, target: string): void {
  const scoped = relative(common, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`)) {
    collaborationInvalidStore(`collaboration path escapes the Git common directory: ${target}`);
  }
  let current = common;
  for (const part of scoped.split(sep)) {
    current = join(current, part);
    if (!existsSync(current)) {
      try {
        mkdirSync(current, { mode: 0o700 });
        fsyncDirectory(dirname(current));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      collaborationInvalidStore(`unsafe collaboration directory: ${current}`);
    }
  }
}

export function assertSafeCollaborationDirectory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    collaborationInvalidStore(`unsafe collaboration directory: ${path}`);
  }
}

/**
 * Every path into a shard is built from a validated record id. The 64-hex shape
 * is checked *before* the `join()`, so `../escape`, an absolute path or a
 * separator-bearing id is a typed `collaboration_invalid` and never reaches the
 * filesystem as a traversal.
 */
export function collaborationRecordPath(
  paths: CollaborationStorePaths,
  recordId: string,
  field: string,
): string {
  return join(paths.shard, `${validateCollaborationRecordId(recordId, field)}.json`);
}

/**
 * A lock is named for a (domain, subject) pair, one domain per record family, as
 * D9 freezes them: `('thread', thread_key)` for signal append,
 * `('handoff', handoff_id)` for handoff publish, `('handoff-adoption',
 * handoff_id)` for adoption, and `('contribution', worker_run_ref_sha256)` for
 * one delegated run's whole contribution transaction.
 *
 * C3 shipped handoff publish on the *signal* domain and a comment here claimed
 * that was D9 as frozen. It was not; C4 split it and this paragraph is the
 * correction. The split was safe because the sharing was never load-bearing:
 * records publish through a staged write plus `link`, so a concurrent write is
 * either fully visible or not visible at all and no reader observes a torn one,
 * and handoff publish reads the signal store inside its lock only to prove cited
 * signals resolve — a signal appearing mid-check can only turn a failing check
 * into a passing one, and a persisted signal is immutable so it can never turn a
 * passing check into a failing one. The split also fixed a real edge the shared
 * domain left open: handoff identity is keyed on the actor and the idempotency
 * key, not on the thread, so two publishes of *one* identity under two thread
 * keys took two locks, raced, and reconciled into a spurious byte conflict.
 * Keying the lock on the identity being written closes that.
 *
 * The separator is an escaped NUL rather than a literal one: a subject key may
 * contain any character a thread key may, and a printable separator would let
 * two different (domain, subject) pairs collapse onto one lock.
 */
export function collaborationLockRelativePath(domain: string, subjectKey: string): string {
  const key = createHash('sha256').update(`${domain}\u0000${subjectKey}`, 'utf8').digest('hex');
  return `${COLLABORATION_STORE_RELATIVE_ROOT}/locks/${key}.lock`;
}

/**
 * How one record family turns bytes on disk back into a validated record. The
 * identity check is the family's own: a signal carries its id as a field, an
 * adoption receipt derives it from the frozen triple, and both must agree with
 * the filename they were read from.
 */
export interface CollaborationRecordCodec<T> {
  /** Human-facing noun used in error messages, for example `handoff`. */
  readonly label: string;
  readonly validate: (value: unknown) => T;
  readonly identityOf: (record: T) => string;
  readonly canonicalBytes: (record: T) => string;
}

/**
 * Read one persisted record. An entry that exists but cannot be read, parsed,
 * validated, or that disagrees with the name it was filed under, is
 * `collaboration_unavailable` — never a silent `null`, which would make a
 * damaged store look like an empty one.
 */
export function readCollaborationRecord<T>(
  paths: CollaborationStorePaths,
  codec: CollaborationRecordCodec<T>,
  recordId: string,
  field: string,
): T | null {
  // The id is validated by `collaborationRecordPath()` before anything touches
  // the filesystem, and the shard itself is proven to be a real directory before
  // the record inside it is opened: a symlinked shard would otherwise let a read
  // follow out of the store.
  const file = collaborationRecordPath(paths, recordId, field);
  if (!existsSync(paths.shard)) return null;
  assertSafeCollaborationDirectory(paths.shard);
  if (!existsSync(file)) return null;
  let raw: string;
  try {
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      collaborationInvalidStore(`unsafe ${codec.label} path: ${file}`);
    }
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if (error instanceof CollaborationError) throw error;
    return collaborationUnavailable(`${codec.label} is unreadable: ${file}`, error);
  }
  let record: T;
  try {
    record = codec.validate(JSON.parse(raw));
  } catch (error) {
    return collaborationUnavailable(`${codec.label} is not a valid record: ${file}`, error);
  }
  if (codec.identityOf(record) !== recordId || codec.canonicalBytes(record) !== raw) {
    collaborationUnavailable(`${codec.label} path and content identity disagree: ${file}`);
  }
  return record;
}

/**
 * Every persisted record in one shard. An unreadable entry throws instead of
 * being skipped: a partially readable store is never served as a healthy
 * smaller one.
 */
export function listCollaborationRecords<T>(
  paths: CollaborationStorePaths,
  codec: CollaborationRecordCodec<T>,
  field: string,
): readonly T[] {
  if (!existsSync(paths.shard)) return Object.freeze([]);
  assertSafeCollaborationDirectory(paths.shard);
  let entries: string[];
  try {
    entries = readdirSync(paths.shard);
  } catch (error) {
    return collaborationUnavailable(`${codec.label} store is unreadable: ${paths.shard}`, error);
  }
  const unexpected = entries.filter(
    (entry) => !COLLABORATION_RECORD_FILE.test(entry) && !COLLABORATION_TEMP_FILE.test(entry),
  );
  if (unexpected.length > 0) {
    collaborationUnavailable(`unexpected entries in the ${codec.label} store: ${unexpected.sort().join(', ')}`);
  }
  return Object.freeze(
    entries
      .filter((entry) => COLLABORATION_RECORD_FILE.test(entry))
      .sort()
      .map((entry) => readCollaborationRecord(paths, codec, entry.slice(0, -'.json'.length), field)!),
  );
}

/**
 * Publish the record so no reader can ever observe a half-written one: the bytes
 * go into a same-directory temp file, are fsynced, and only then appear under
 * their final name. `O_CREAT|O_EXCL` on the target itself made the name visible
 * before the bytes landed, so a crash in between left a zero-length JSON that an
 * append-only store can never repair.
 *
 * `link` rather than `rename` — matching `publishImmutable()` in
 * `src/effects/publication/feedback-store.ts`, this store's create-once
 * precedent. A rename would silently overwrite whatever a competing writer had
 * already published; `link` fails `EEXIST` and preserves first-writer-wins, so
 * the loser still reconciles to identical bytes or `collaboration_conflict`.
 */
export function publishCollaborationRecordDurably(directory: string, file: string, bytes: string): void {
  const temporary = join(directory, collaborationStagingName(basename(file)));
  let fd: number | null = null;
  try {
    fd = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(fd, bytes, 'utf8');
    fsyncSync(fd);
  } catch (error) {
    // Wrapped so the caller's EEXIST branch can only ever mean "the final name
    // was taken", never "the temp name collided".
    if (fd !== null) { closeSync(fd); fd = null; }
    try { unlinkSync(temporary); } catch { /* it may never have been created */ }
    return collaborationUnavailable(`cannot stage collaboration record bytes: ${file}`, error);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  try {
    linkSync(temporary, file);
    fsyncDirectory(directory);
  } finally {
    try { unlinkSync(temporary); } catch { /* the publish error, if any, wins */ }
  }
}
