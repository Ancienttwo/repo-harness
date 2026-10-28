import { homedir, userInfo } from 'os';
import { realpathSync } from 'fs';
import { join } from 'path';
import { acquireExclusiveDirectoryLock, readExclusiveDirectoryLockOwner, type ExclusiveDirectoryLockHandle } from './exclusive-directory-lock';

/**
 * The state one runtime transaction protects. `global` is the account home,
 * where installer state lives; `project` is one repository root.
 */
export interface RuntimeTransactionScope {
  readonly kind: 'global' | 'project';
  readonly root: string;
}

/** Created only for a held lock, or after candidate capability validation. */
export interface RuntimeTransactionContext {
  readonly scope: RuntimeTransactionScope;
  assertOwned(): void;
}
export type RuntimeTransactionLock = ExclusiveDirectoryLockHandle & RuntimeTransactionContext;
const contexts = new WeakMap<RuntimeTransactionContext, { root: string; kind: RuntimeTransactionScope['kind']; assertOwned: () => void }>();

export function assertRuntimeTransactionContext(context: RuntimeTransactionContext, scope: RuntimeTransactionScope): void {
  const owned = contexts.get(context);
  if (!owned || owned.kind !== scope.kind || owned.root !== realpathSync(scope.root)) {
    throw new Error('runtime transaction context does not own this scope');
  }
  owned.assertOwned();
}

/** The caller first consumes the existing one-shot candidate capability. */
export function parentRuntimeTransactionContext(
  scope: RuntimeTransactionScope,
  parent: { readonly pid: number; readonly lockPath: string; readonly ownerToken: string },
): RuntimeTransactionContext {
  const root = realpathSync(scope.root);
  const assertOwned = () => {
    if (scope.kind !== 'global' || parent.pid !== process.ppid) throw new Error('candidate runtime context requires its parent owner');
    process.kill(parent.pid, 0);
    const owner = readExclusiveDirectoryLockOwner(root, runtimeTransactionLockRelativePath(scope));
    if (!owner || owner.pid !== parent.pid || owner.lockPath !== parent.lockPath || owner.token !== parent.ownerToken) {
      throw new Error('candidate parent no longer owns the global runtime lock');
    }
  };
  assertOwned();
  const context: RuntimeTransactionContext = { scope: { kind: scope.kind, root }, assertOwned };
  contexts.set(context, { root, kind: scope.kind, assertOwned });
  return context;
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
  run: (lock: RuntimeTransactionLock) => T,
  options: { readonly waitTimeoutMs?: number } = {},
): T {
  const lock = acquireRuntimeTransactionLock(scope, options);
  try { return run(lock); } finally { lock.release(); }
}

export function acquireRuntimeTransactionLock(
  scope: RuntimeTransactionScope,
  options: { readonly waitTimeoutMs?: number } = {},
): RuntimeTransactionLock {
  const root = realpathSync(scope.root);
  const lock = acquireExclusiveDirectoryLock(
    root,
    runtimeTransactionLockRelativePath(scope),
    { reclaimStaleOwner: true, waitTimeoutMs: options.waitTimeoutMs },
  );
  const context: RuntimeTransactionLock = { ...lock, scope: { kind: scope.kind, root } };
  contexts.set(context, { root, kind: scope.kind, assertOwned: () => lock.assertOwned() });
  try { lock.assertOwned(); return context; }
  catch (error) { lock.release(); throw error; }
}

export function withRuntimeTransactionContext<T>(
  scope: RuntimeTransactionScope,
  context: RuntimeTransactionContext | undefined,
  run: (context: RuntimeTransactionContext) => T,
  options: { readonly waitTimeoutMs?: number } = {},
): T {
  if (context) {
    assertRuntimeTransactionContext(context, scope);
    return run(context);
  }
  return withRuntimeTransactionLock(scope, run, options);
}

function realpathOrNull(path: string): string | null {
  try { return realpathSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
