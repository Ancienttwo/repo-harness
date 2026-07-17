import { lstatSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
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

export interface StateVersionPublication {
  rollback(): void;
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

export function currentStateVersion(cwd: string): number {
  let commonDir: string;
  try {
    commonDir = resolveGitCommonDirectory(cwd);
  } catch (error) {
    if (!hasGitDiscoveryMetadata(cwd)) return 0;
    throw error;
  }
  return withExclusiveDirectoryLock(commonDir, VERSION_LOCK_RELATIVE_PATH, () => {
    const current = readVersionRecord(join(commonDir, VERSION_OWNER_RELATIVE_PATH));
    return current?.version ?? 0;
  });
}

/**
 * Serialize one linked-worktree version decision and run the caller's cache
 * publication before the Git-common-dir owner is committed. The version owner
 * is the authoritative commit point; if cache publication fails, it is never
 * advanced. The cache remains a replaceable read model and is never read here.
 */
export function commitStateVersionAfter(
  cwd: string,
  revision: string,
  publishCache: (version: number) => StateVersionPublication,
  effects: StateVersionWriteEffects = DEFAULT_VERSION_WRITE_EFFECTS,
): number {
  const commonDir = resolveGitCommonDirectory(cwd);
  const target = join(commonDir, VERSION_OWNER_RELATIVE_PATH);
  return withExclusiveDirectoryLock(commonDir, VERSION_LOCK_RELATIVE_PATH, () => {
    const previous = readVersionRecord(target);
    const version = previous?.revision === revision
      ? previous.version
      : (previous?.version ?? 0) + 1;
    let cachePublication: StateVersionPublication | null = null;
    try {
      cachePublication = publishCache(version);
      if (previous?.revision !== revision) {
        writeVersionRecord(target, { version, revision }, effects);
      }
      return version;
    } catch (error) {
      if (cachePublication !== null) {
        try {
          cachePublication.rollback();
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            'effective-state publication and cache rollback both failed',
          );
        }
      }
      throw error;
    }
  });
}
