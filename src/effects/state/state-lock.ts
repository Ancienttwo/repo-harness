import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

const LOCK_RELATIVE_PATH = '.ai/harness/state/effective.lock';

export function withStateLock<T>(cwd: string, run: () => T): T {
  return withExclusiveDirectoryLock(cwd, LOCK_RELATIVE_PATH, run);
}
