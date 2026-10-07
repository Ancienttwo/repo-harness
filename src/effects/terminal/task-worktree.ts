import { execFileSync } from 'child_process';
import { realpathSync } from 'fs';
import { resolve } from 'path';
import { configuredGitBinary, resolveGitCommonDirectory } from '../git/common-directory';
import { readWorktreeTopology } from '../git/worktree-topology';

export interface TaskRepository {
  repository_id: string;
  primary_root: string;
  execution_root: string;
}
/** Git, not a directory-name convention or the invoking cwd, owns identity. */
export function taskRepository(cwd: string, gitBin = configuredGitBinary()): TaskRepository {
  const execution_root = realpathSync(execFileSync(gitBin, ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim());
  const repository_id = resolveGitCommonDirectory(execution_root, gitBin);
  const roots = readWorktreeTopology(execution_root, gitBin).worktrees.flatMap(entry => {
    try {
      const path = realpathSync(entry.path);
      const raw = execFileSync(gitBin, ['rev-parse', '--git-dir'], { cwd: path, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return realpathSync(resolve(path, raw)) === repository_id ? [path] : [];
    } catch { return []; } // Prunable/unavailable Git entries cannot become authority.
  });
  if (roots.length !== 1) throw new Error('task_agent_primary_root_unavailable');
  return { repository_id, primary_root: roots[0]!, execution_root };
}
