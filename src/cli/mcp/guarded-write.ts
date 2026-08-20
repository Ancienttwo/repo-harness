/**
 * Guarded, durable single-file writer for the MCP workflow-artifact tools.
 *
 * Containment and policy stay in `paths.ts`: this module receives an already
 * resolved `absolutePath` and never re-derives a policy decision. It owns only
 * the commit contract:
 *
 *   1. lstat guards  - any symlink at the target is refused (an in-repo symlink
 *      passes `resolveMcpPath` but would clobber the link target); anything that
 *      is not a regular file is refused.
 *   2. revision precondition - absent `expectedSha256` means create-only; a
 *      supplied hash must match the current bytes. Conflict outcomes never echo
 *      the current hash, because echoing it turns a conflict into a blind
 *      write -> lift-hash -> rewrite loop that clobbers unread content.
 *   3. durable commit - temp file in the target directory, fsync, rename,
 *      parent-directory fsync (house idiom from
 *      `src/effects/evidence/atomic-append.ts` and
 *      `general-repo-access.ts#atomicWriteFile`).
 *
 * Outcomes are a discriminated union in the `McpPathDecision` style; no
 * exception crosses this module boundary.
 */
import { createHash, randomBytes } from 'crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'fs';
import { basename, dirname, resolve } from 'path';

export type GuardedWriteErrorCode =
  | 'WOULD_OVERWRITE'
  | 'REVISION_CONFLICT'
  | 'SYMLINK_ESCAPE'
  | 'NOT_A_REGULAR_FILE'
  | 'WRITE_FAILED';

export type GuardedWriteOutcome =
  | { ok: true; sha256: string; previousSha256: string | null }
  | { ok: false; code: GuardedWriteErrorCode; message: string; details?: Record<string, unknown> };

/** Bare hex, byte-comparable with `read_workflow_file`'s `sha256`. One hash shape per surface. */
function hashContent(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function writeAllSync(fd: number, data: Buffer): void {
  let offset = 0;
  while (offset < data.length) {
    offset += writeSync(fd, data, offset, data.length - offset);
  }
}

/** Some filesystems refuse a directory fsync; the same-directory rename stays atomic regardless. */
function fsyncDirectoryBestEffort(path: string): void {
  let fd: number | null = null;
  try {
    fd = openSync(path, constants.O_RDONLY);
    fsyncSync(fd);
  } catch (_error) {
    // Best effort only.
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch (_error) {
        // Ignore close failures on a best-effort directory fsync.
      }
    }
  }
}

export function guardedWriteFile(
  absolutePath: string,
  relativePath: string,
  content: string,
  expectedSha256: string | undefined,
): GuardedWriteOutcome {
  let previousSha256: string | null = null;
  let previousMode: number | undefined;

  let link;
  try {
    link = lstatSync(absolutePath);
  } catch (_error) {
    link = null;
  }

  if (link !== null) {
    if (link.isSymbolicLink()) {
      return {
        ok: false,
        code: 'SYMLINK_ESCAPE',
        message: `write target is a symlink and is not followed: ${relativePath}`,
        details: { path: relativePath },
      };
    }
    if (!link.isFile()) {
      return {
        ok: false,
        code: 'NOT_A_REGULAR_FILE',
        message: `write target is not a regular file: ${relativePath}`,
        details: { path: relativePath },
      };
    }
    try {
      previousSha256 = hashContent(readFileSync(absolutePath, 'utf-8'));
      previousMode = statSync(absolutePath).mode & 0o777;
    } catch (error) {
      return {
        ok: false,
        code: 'WRITE_FAILED',
        message: `could not read the current revision of ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
        details: { path: relativePath },
      };
    }
  }

  if (expectedSha256 === undefined) {
    if (link !== null) {
      return {
        ok: false,
        code: 'WOULD_OVERWRITE',
        message: `target already exists: ${relativePath}. Read it first and pass its sha256 as expected_sha256 to replace it.`,
        details: { path: relativePath },
      };
    }
  } else if (link === null) {
    return {
      ok: false,
      code: 'REVISION_CONFLICT',
      message: `expected_sha256 was supplied but ${relativePath} does not exist. Omit expected_sha256 to create it.`,
      details: { path: relativePath, reason: 'target_absent' },
    };
  } else if (expectedSha256 !== previousSha256) {
    return {
      ok: false,
      code: 'REVISION_CONFLICT',
      message: `expected_sha256 does not match the current revision of ${relativePath}. Read it again and retry with the current sha256.`,
      details: { path: relativePath },
    };
  }

  const directory = dirname(absolutePath);
  const tempPath = resolve(directory, `.${basename(absolutePath)}.repo-harness-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}.tmp`);
  const raw = Buffer.from(content, 'utf-8');
  let committed = false;

  try {
    mkdirSync(directory, { recursive: true });
    const fd = openSync(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o666);
    try {
      writeAllSync(fd, raw);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    // Replacing a file must not silently change its permissions.
    if (previousMode !== undefined) chmodSync(tempPath, previousMode);
    renameSync(tempPath, absolutePath);
    committed = true;
    fsyncDirectoryBestEffort(directory);
  } catch (error) {
    return {
      ok: false,
      code: 'WRITE_FAILED',
      message: `could not write ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      details: { path: relativePath },
    };
  } finally {
    // The rename consumes the temp file on success; anything else must leave no residue.
    if (!committed && existsSync(tempPath)) {
      try {
        rmSync(tempPath, { force: true });
      } catch (_error) {
        // Nothing further can be done about a temp file that resists removal.
      }
    }
  }

  return { ok: true, sha256: hashContent(content), previousSha256 };
}
