import { runProcess, type ProcessRunResult, type RunProcessOptions } from '../process-runner';
import { gitChildEnv, refuseProviderToken, resolveGitExecutable, resolveGitTimeout } from './runner';

/** `runProcess` entry for git. The binary and the omitted-timeout deadline come from the git runner. */
export function runGit(
  args: readonly string[],
  opts: RunProcessOptions & { gitBin?: string } = {},
): ProcessRunResult {
  const { gitBin, timeoutMs, env, inheritEnv, ...rest } = opts;
  const childEnv = gitChildEnv(args, inheritEnv === false ? env : { ...process.env, ...env });
  refuseProviderToken('runGit', args, childEnv);
  return runProcess(resolveGitExecutable(gitBin, env), [...args], {
    ...rest,
    env: childEnv,
    inheritEnv: false,
    timeoutMs: timeoutMs === undefined ? resolveGitTimeout(undefined) : timeoutMs,
  });
}
