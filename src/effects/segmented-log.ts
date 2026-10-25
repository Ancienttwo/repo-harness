/**
 * Append-only JSONL logs inside a repository, rotated by the writer: an active
 * file at or above the segment size moves into `<file>.archive/` before the
 * next append, and the oldest archived segments leave past the archive budget.
 */
import { randomUUID } from 'crypto';
import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import { StringDecoder } from 'string_decoder';
import { acquireExclusiveDirectoryLock, ExclusiveLockContentionError } from './locking/exclusive-directory-lock';
import { canonicalRepoRelativePath, repoPath } from './state/collect-state-inputs';

export const SEGMENTED_LOG_SEGMENT_BYTES = 8 * 1024 * 1024;
export const SEGMENTED_LOG_ARCHIVE_BYTES = 256 * 1024 * 1024;
export const SEGMENTED_LOG_ARCHIVE_SEGMENTS = 32;
const SEGMENT_NAME = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jsonl$/;

function regularFile(path: string) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) throw new Error(`segmented log requires a regular file: ${path}`);
    return stat;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function archives(path: string) {
  const directory = `${path}.archive`;
  if (!existsSync(directory)) return [];
  if (!lstatSync(directory).isDirectory()) throw new Error(`unsafe segmented log archive: ${directory}`);
  return readdirSync(directory).filter(name => SEGMENT_NAME.test(name)).sort().map(name => {
    const file = join(directory, name);
    const stat = regularFile(file);
    if (!stat) throw new Error(`segmented log archive disappeared: ${file}`);
    return { path: file, size: stat.size };
  });
}

function confinedPath(root: string, path: string): string {
  const original = resolve(root, path);
  // Validate the caller's leaf before resolving ancestors: resolving the leaf
  // would erase an in-repository symlink and authorize retention of its target.
  regularFile(original);
  const parent = dirname(original);
  const rel = parent === root ? null : canonicalRepoRelativePath(root, parent);
  if (parent !== root && !rel) throw new Error(`segmented log path escapes repository: ${path}`);
  return join(parent === root ? root : repoPath(root, rel!), basename(original));
}

function locked<T>(root: string, path: string, operation: (assertOwned: () => void) => T, waitTimeoutMs: number): T {
  const handle = acquireExclusiveDirectoryLock(root, relative(root, join(dirname(path), `.${basename(path)}.lock`)), {
    waitTimeoutMs,
    reclaimStaleEmptyDirectory: true,
  });
  try {
    handle.assertOwned();
    return operation(() => handle.assertOwned());
  } finally { handle.release(); }
}

function rotate(root: string, path: string): void {
  locked(root, path, assertOwned => {
    if ((regularFile(path)?.size ?? 0) < SEGMENTED_LOG_SEGMENT_BYTES) return;
    const directory = `${path}.archive`;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const identity = lstatSync(directory);
    const assertArchiveOwned = () => {
      assertOwned();
      const current = lstatSync(directory);
      if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino) {
        throw new Error(`unsafe segmented log archive: ${directory}`);
      }
    };
    // Rename never truncates an inode: concurrent O_APPEND writers that already
    // opened the old active file finish in the archive, rather than losing rows.
    assertArchiveOwned();
    renameSync(path, join(directory, `${Date.now()}-${randomUUID()}.jsonl`));
    const files = archives(path);
    let bytes = files.reduce((sum, file) => sum + file.size, 0);
    while (files.length > SEGMENTED_LOG_ARCHIVE_SEGMENTS || bytes > SEGMENTED_LOG_ARCHIVE_BYTES) {
      const oldest = files.shift()!;
      assertArchiveOwned();
      unlinkSync(oldest.path);
      bytes -= oldest.size;
    }
  }, 1);
}

/** The caller owns the fail-open policy; storage never invents a record. */
export function appendSegmentedLog(file: string, line: string, repoRoot: string): void {
  if (Buffer.byteLength(line) > SEGMENTED_LOG_SEGMENT_BYTES) throw new Error('segmented log record exceeds segment budget');
  const root = realpathSync(repoRoot);
  const path = confinedPath(root, file);
  mkdirSync(dirname(path), { recursive: true });
  if ((regularFile(path)?.size ?? 0) >= SEGMENTED_LOG_SEGMENT_BYTES) {
    try { rotate(root, path); } catch (error) {
      // A competing rotator/reader owns maintenance; this append still has a
      // safe destination because retention only renames the active inode.
      if (!(error instanceof ExclusiveLockContentionError)) throw error;
    }
  }
  const fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try { writeFileSync(fd, line); } finally { closeSync(fd); }
}

/** Open a retained-history snapshot under the rotation lock, then read unlocked. */
export function readSegmentedLog(file: string, repoRoot: string): Iterable<string> | null {
  const root = realpathSync(repoRoot);
  const path = confinedPath(root, file);
  if (!existsSync(path) && !existsSync(`${path}.archive`)) return null;
  const fds: number[] = [];
  try {
    locked(root, path, assertOwned => {
      const directory = `${path}.archive`;
      const identity = existsSync(directory) ? lstatSync(directory) : null;
      const files = archives(path).map(file => file.path);
      if (regularFile(path)) files.push(path);
      for (const file of files) {
        assertOwned();
        if (identity) {
          const current = lstatSync(directory);
          if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino) {
            throw new Error(`unsafe segmented log archive: ${directory}`);
          }
        }
        fds.push(openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW));
      }
    }, 1000);
  } catch (error) {
    for (const fd of fds) closeSync(fd);
    throw error;
  }
  return (function* () {
    try {
      for (const fd of fds) {
        const decoder = new StringDecoder('utf8');
        const buffer = Buffer.alloc(64 * 1024);
        let pending = '';
        let size: number;
        while ((size = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
          pending += decoder.write(buffer.subarray(0, size));
          let end: number;
          while ((end = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, end).replace(/\r$/, '');
            pending = pending.slice(end + 1);
            if (line.trim()) yield line;
          }
        }
        pending += decoder.end();
        if (pending.trim()) yield pending;
      }
    } finally { for (const fd of fds) closeSync(fd); }
  })();
}
