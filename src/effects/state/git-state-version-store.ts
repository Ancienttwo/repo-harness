import { readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { isAbsolute, join, resolve } from 'path';
import { withExclusiveDirectoryLock } from './state-lock';

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

function gitCommonDirectory(cwd: string): string {
  const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const commonDir = isAbsolute(raw) ? raw : resolve(cwd, raw);
  return realpathSync(commonDir);
}

export function stateVersionOwnerPath(cwd: string): string {
  return join(gitCommonDirectory(cwd), VERSION_OWNER_RELATIVE_PATH);
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
    commonDir = gitCommonDirectory(cwd);
  } catch {
    return 0;
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
  const commonDir = gitCommonDirectory(cwd);
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
