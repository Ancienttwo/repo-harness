import { homedir, userInfo } from 'os';
import { realpathSync } from 'fs';
import { join } from 'path';
import { acquireExclusiveDirectoryLock, type ExclusiveDirectoryLockHandle } from '../../effects/locking/exclusive-directory-lock';

/**
 * The state one runtime transaction protects. `global` is the account home,
 * where installer state lives; `project` is one repository root.
 */
export interface RuntimeTransactionScope {
  readonly kind: 'global' | 'project';
  readonly root: string;
}

/**
 * The account scope stays at HOME, not REPO_HARNESS_HOME: installer state
 * describes the account. The lock, the install transaction root and
 * candidate reconciliation all resolve the root here, so they share one lock.
 */
export function globalRuntimeScope(env?: NodeJS.ProcessEnv): RuntimeTransactionScope {
  // A partial injected env must not make the lock fall back to a different HOME.
  const root = process.platform === 'win32'
    ? userInfo().homedir
    : env?.HOME ?? process.env.HOME ?? homedir();
  return { kind: 'global', root };
}

/** A repository at the account home protects the account files, so it takes the global lock. */
export function projectRuntimeScope(repoRoot: string, env?: NodeJS.ProcessEnv): RuntimeTransactionScope {
  const global = globalRuntimeScope(env);
  if (realpathSync(repoRoot) === realpathOrNull(global.root)) return global;
  return { kind: 'project', root: repoRoot };
}

export function runtimeTransactionRoot(scope: RuntimeTransactionScope): string {
  return join(scope.root, '.repo-harness', 'transactions');
}

/** Relative to the canonical scope root. The file name carries the scope. */
export function runtimeTransactionLockRelativePath(scope: RuntimeTransactionScope): string {
  return `.repo-harness/transactions/${scope.kind}-runtime.lock`;
}

export function withRuntimeTransactionLock<T>(
  scope: RuntimeTransactionScope,
  run: (lock: ExclusiveDirectoryLockHandle) => T,
): T {
  const lock = acquireExclusiveDirectoryLock(
    realpathSync(scope.root),
    runtimeTransactionLockRelativePath(scope),
    { reclaimStaleOwner: true },
  );
  try {
    lock.assertOwned();
    return run(lock);
  } finally {
    lock.release();
  }
}

function realpathOrNull(path: string): string | null {
  try { return realpathSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
