import { realpathSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname } from 'path';
import { systemWorktreeRoot } from '../../core/worktree-location.mjs';

/** The directory that holds every managed task worktree. The sweep and the Bash guard share this root. */
export function managedWorktreeRoot(env: NodeJS.ProcessEnv = process.env): string {
  return realpathSync(env.REPO_HARNESS_WORKTREE_ROOT ?? systemWorktreeRoot(process.platform, tmpdir()));
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
