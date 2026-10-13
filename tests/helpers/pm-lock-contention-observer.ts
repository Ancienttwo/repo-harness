import { ExclusiveLockContentionError, type acquireExclusiveDirectoryLock } from '../../src/effects/locking/exclusive-directory-lock';

/** Observe the real acquisition without replacing its handle or error. */
export function observePmLockContention(
  acquire: typeof acquireExclusiveDirectoryLock,
  targetLockPath: string,
  onContention: () => void,
): typeof acquireExclusiveDirectoryLock {
  return (...args) => {
    try { return acquire(...args); }
    catch (error) {
      if (error instanceof ExclusiveLockContentionError && error.kind === 'timeout' && error.lockPath === targetLockPath) {
        try { onContention(); } finally { throw error; }
      }
      throw error;
    }
  };
}
