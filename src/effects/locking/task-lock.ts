/** Serialize manual inbox and feedback writes in the Git common directory. */
import { TASK_DIGEST_PATTERN } from '../../core/state/coordination-identity';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { withExclusiveDirectoryLock } from './exclusive-directory-lock';

/** Keep the existing physical namespace so every task writer shares one mutex. */
export function taskLockRelativePath(taskId: string): string {
  if (!TASK_DIGEST_PATTERN.test(taskId)) {
    throw new Error(`unsafe coordination task id: ${JSON.stringify(taskId)}`);
  }
  return `repo-harness/coordination/v1/locks/tasks/${taskId}.lock`;
}

export function withTaskLock<T>(cwd: string, taskId: string, run: () => T): T {
  const commonDir = resolveGitCommonDirectory(cwd);
  return withExclusiveDirectoryLock(commonDir, taskLockRelativePath(taskId), run);
}
