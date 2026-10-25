import { runProcess, type ProcessRunResult, type RunProcessOptions } from '../process-runner';
import { resolveGitExecutable, resolveGitTimeout } from './runner';

/** `runProcess` entry for git. The binary and the omitted-timeout deadline come from the git runner. */
export function runGit(
  args: readonly string[],
  opts: RunProcessOptions & { gitBin?: string } = {},
): ProcessRunResult {
  const { gitBin, timeoutMs, env, ...rest } = opts;
  return runProcess(resolveGitExecutable(gitBin, env), [...args], {
    ...rest,
    env,
    timeoutMs: timeoutMs === undefined ? resolveGitTimeout(undefined) : timeoutMs,
  });
}
