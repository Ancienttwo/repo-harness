import { mkdirSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, isAbsolute } from 'path';
import { systemWorktreeRoot } from '../../core/worktree-location.mjs';

/** The directory that holds every managed task worktree. The sweep and the Bash guard share this root. */
export function managedWorktreeRoot(env: NodeJS.ProcessEnv = process.env): string {
  return realpathSync(configuredWorktreeRoot(env));
}

/** A creator makes a fresh configured root before it canonicalizes the root. */
export function ensureManagedWorktreeRoot(env: NodeJS.ProcessEnv = process.env): string {
  const root = configuredWorktreeRoot(env);
  if (!isAbsolute(root)) throw new Error('REPO_HARNESS_WORKTREE_ROOT must be an absolute path');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return managedWorktreeRoot(env);
}

function configuredWorktreeRoot(env: NodeJS.ProcessEnv): string {
  return env.REPO_HARNESS_WORKTREE_ROOT ?? systemWorktreeRoot(process.platform, tmpdir());
}

/**
 * A managed worktree is a direct child of the managed root. With `repoName`, its
 * directory name must also be `<repo>-wt-<slug>`; the sweep passes it, because
 * it owns only that naming.
 */
export function isManagedWorktreePath(path: string, managedRoot: string, repoName?: string): boolean {
  if (dirname(path) !== managedRoot) return false;
  if (repoName === undefined) return true;
  const prefix = `${repoName}-wt-`;
  return basename(path).startsWith(prefix) && basename(path).length > prefix.length;
}
