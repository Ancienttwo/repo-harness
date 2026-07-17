import { resolveGitCommonDirectory } from './git/common-directory';
import {
  acquireExclusiveDirectoryLock,
  type ExclusiveDirectoryLockHandle,
} from './locking/exclusive-directory-lock';

export const EXPENSIVE_RUN_LOCK_RELATIVE_PATH = 'repo-harness/expensive-run.lock';

export function acquireExpensiveRunLock(
  cwd: string,
  gitBin = process.env.REPO_HARNESS_GIT_BIN || 'git',
): ExclusiveDirectoryLockHandle {
  const commonDir = resolveGitCommonDirectory(cwd, gitBin);
  // A supervisor can be killed while its detached target group survives. A
  // dead PID alone therefore cannot prove this lane is safe to reopen.
  return acquireExclusiveDirectoryLock(commonDir, EXPENSIVE_RUN_LOCK_RELATIVE_PATH, {
    reclaimStaleOwner: false,
  });
}
