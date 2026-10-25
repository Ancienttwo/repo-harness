import { observationReadFileSync as readFileSync } from './readonly-observation';
import { lstatSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

const VERSION_OWNER_RELATIVE_PATH = 'repo-harness/effective-state-version.json';
const VERSION_LOCK_RELATIVE_PATH = `${VERSION_OWNER_RELATIVE_PATH}.lock`;

interface VersionRecord {
  readonly version: number;
  readonly revision: string;
}

export interface StateVersionWriteEffects {
  readonly writeTemp: (path: string, content: string) => void;
  readonly publish: (tempPath: string, ownerPath: string) => void;
  readonly removeTemp: (tempPath: string) => void;
}

/**
 * Thrown by `commitStateVersionAfter` when an optional `confirmSnapshot`
 * check reports a mismatch. Internal signal only: callers that pass
 * `confirmSnapshot` are expected to catch this by type and decide whether to
 * retry; it never reaches a public error surface on its own.
 */
export class StateVersionConfirmMismatchError extends Error {
  constructor() {
    super('effective-state confirm snapshot mismatch before version allocation');
    this.name = 'StateVersionConfirmMismatchError';
  }
}

const DEFAULT_VERSION_WRITE_EFFECTS: StateVersionWriteEffects = {
  writeTemp(path, content) {
    writeFileSync(path, content, { mode: 0o600 });
  },
  publish(tempPath, ownerPath) {
    renameSync(tempPath, ownerPath);
  },
  removeTemp(tempPath) {
    unlinkSync(tempPath);
  },
};

function hasGitDiscoveryMetadata(cwd: string): boolean {
  const start = resolve(cwd);
  if (!statSync(start).isDirectory()) {
    throw new Error(`effective-state repository root is not a directory: ${start}`);
  }
  if (process.env.GIT_DIR || process.env.GIT_WORK_TREE) return true;
  let current = start;
  while (true) {
    try {
      lstatSync(join(current, '.git'));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

export function stateVersionOwnerPath(cwd: string): string {
  return join(resolveGitCommonDirectory(cwd), VERSION_OWNER_RELATIVE_PATH);
}

function readVersionRecord(target: string): VersionRecord | null {
  try {
    const parsed = JSON.parse(readFileSync(target, 'utf-8')) as { version?: unknown; revision?: unknown };
    if (!Number.isInteger(parsed.version) || (parsed.version as number) < 1 || typeof parsed.revision !== 'string') {
      throw new Error(`invalid effective-state version owner: ${target}`);
    }
    return { version: parsed.version as number, revision: parsed.revision };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function writeVersionRecord(
  target: string,
  record: VersionRecord,
  effects: StateVersionWriteEffects,
): void {
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    effects.writeTemp(temp, `${JSON.stringify(record, null, 2)}\n`);
    effects.publish(temp, target);
  } catch (error) {
    try { effects.removeTemp(temp); } catch { /* temp may not have been created */ }
    throw error;
  }
}

/**
 * The last allocated version, read without the version lock: the writer
 * replaces the record by rename, so a read sees one whole record. The version
 * can belong to another revision of any linked worktree.
 */
export function currentStateVersion(cwd: string): number {
  let commonDir: string;
  try {
    commonDir = resolveGitCommonDirectory(cwd);
  } catch (error) {
    if (!hasGitDiscoveryMetadata(cwd)) return 0;
    throw error;
  }
  return readVersionRecord(join(commonDir, VERSION_OWNER_RELATIVE_PATH))?.version ?? 0;
}

/**
 * Serialize one linked-worktree version decision under the Git-common-dir
 * lock. A changed revision consumes the next version; an unchanged revision
 * keeps its version and writes nothing. A failed owner write consumes no
 * version.
 *
 * `confirmSnapshot`, when provided, is evaluated first inside the version
 * lock, before the candidate version is computed or consumed. A `false`
 * result throws `StateVersionConfirmMismatchError` without reading or writing
 * the owner file.
 */
export function commitStateVersionAfter(
  cwd: string,
  revision: string,
  effects: StateVersionWriteEffects = DEFAULT_VERSION_WRITE_EFFECTS,
  confirmSnapshot?: () => boolean,
): number {
  const commonDir = resolveGitCommonDirectory(cwd);
  const target = join(commonDir, VERSION_OWNER_RELATIVE_PATH);
  return withExclusiveDirectoryLock(commonDir, VERSION_LOCK_RELATIVE_PATH, () => {
    if (confirmSnapshot && !confirmSnapshot()) {
      throw new StateVersionConfirmMismatchError();
    }
    const previous = readVersionRecord(target);
    if (previous?.revision === revision) return previous.version;
    const version = (previous?.version ?? 0) + 1;
    writeVersionRecord(target, { version, revision }, effects);
    return version;
  });
}
