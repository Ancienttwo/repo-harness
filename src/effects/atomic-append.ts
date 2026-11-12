/**
 * Low-level durable file primitives for evidence, state and inbox stores. Mirrors the
 * open/write-loop/fsync idiom already used by `src/effects/fs-transaction.ts`
 * (that file's own `writeFileDurably` is a private, unexported helper, so an
 * equivalent is implemented locally here rather than modifying it -- see
 * tasks/notes/20260722-1151-epc-01-evidence-event-store.notes.md).
 */
import { closeSync, constants, fsyncSync, mkdirSync, openSync, renameSync, unlinkSync, writeSync } from "fs";
import { dirname } from "path";

export function writeAllSync(fd: number, data: Buffer): void {
  let offset = 0;
  while (offset < data.length) {
    offset += writeSync(fd, data, offset, data.length - offset);
  }
}

function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

/** File flushes remain mandatory on Windows; directory fsync is POSIX-only. */
export function syncDirectoryDurably(path: string): void {
  if (process.platform === 'win32') return;
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/** Append one line plus a trailing newline; creates the file if missing. Whole-line append + fsync (D5). */
export function appendLineDurably(path: string, line: string, mode = 0o600): void {
  ensureParentDir(path);
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND, mode);
    writeAllSync(fd, Buffer.from(`${line}\n`, "utf-8"));
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/**
 * Create a brand-new file exclusively; throws with code EEXIST if it already exists (write-once).
 * `wrapError` maps a directory, open, write or fsync failure. A close failure escapes unmapped and
 * replaces an earlier failure, so callers that report close errors as raw filesystem errors keep that.
 */
export function createFileExclusiveDurably(
  path: string,
  content: Buffer,
  mode = 0o600,
  wrapError: (error: unknown) => unknown = (error) => error,
): void {
  let fd: number | null = null;
  try {
    ensureParentDir(path);
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
    writeAllSync(fd, content);
    fsyncSync(fd);
  } catch (error) {
    throw wrapError(error);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/**
 * Publish `content` at `target` by an exclusive durable create of `temporary`, a rename and a
 * directory fsync. The caller names `temporary` because some stores sweep orphans by that name.
 * A create or rename failure removes `temporary` and rethrows, except a create EEXIST: that file
 * belongs to someone else. A directory fsync failure reaches the caller unchanged.
 */
export function publishFileByRename(target: string, content: Buffer, temporary: string): void {
  try {
    createFileExclusiveDurably(temporary, content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") removeBestEffort(temporary);
    throw error;
  }
  try {
    retryWindowsSharingRace(() => renameSync(temporary, target));
  } catch (error) {
    removeBestEffort(temporary);
    throw error;
  }
  syncDirectoryDurably(dirname(target));
}

const WINDOWS_SHARING_RACE_WAITS_MS = [1, 2, 4, 8, 16, 32, 64] as const;
const SHARING_RACE_SLEEP_CELL = new Int32Array(new SharedArrayBuffer(4));

/**
 * Windows gives EPERM for a short time when another process holds the file
 * open (a rename over it) or has just deleted it (an open or readdir of the
 * delete-pending path) (#2615). The operation runs again after each wait, at
 * most 127 ms in total. A refusal that lasts longer throws the first error.
 * Other codes, and every error on other platforms, throw at once.
 */
export function retryWindowsSharingRace<T>(operation: () => T): T {
  if (process.platform !== 'win32') return operation();
  let first: unknown = null;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
      first ??= error;
      if (attempt === WINDOWS_SHARING_RACE_WAITS_MS.length) throw first;
      Atomics.wait(SHARING_RACE_SLEEP_CELL, 0, 0, WINDOWS_SHARING_RACE_WAITS_MS[attempt]);
    }
  }
}

/** A cleanup error on a failure path must not replace the original create or rename error. */
function removeBestEffort(path: string): void {
  try { unlinkSync(path); } catch { /* dropped */ }
}

/** Create or fully replace a file's content (used for quarantine dumps); fsync before returning. */
export function writeFileDurably(path: string, content: string | Buffer, mode = 0o600): void {
  ensureParentDir(path);
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC, mode);
    writeAllSync(fd, Buffer.isBuffer(content) ? content : Buffer.from(content, "utf-8"));
    fsyncSync(fd);
  } finally {
    if (fd !== null) closeSync(fd);
  }
}
