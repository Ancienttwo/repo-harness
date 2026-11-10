import { DEFAULT_REDACTIONS, runProcess, type ProcessRunResult, type RunProcessOptions } from '../process-runner';
import { gitChildEnv, resolveGitExecutable, providerTokenRedactions, resolveGitTimeout } from './runner';

/** `runProcess` entry for git. The binary and the omitted-timeout deadline come from the git runner. */
export function runGit(
  args: readonly string[],
  opts: RunProcessOptions & { gitBin?: string } = {},
): ProcessRunResult {
  const { gitBin, timeoutMs, env, inheritEnv, redactions, ...rest } = opts;
  const childEnv = inheritEnv === false ? env : { ...process.env, ...env };
  return runProcess(resolveGitExecutable(gitBin, env), [...args], {
    ...rest,
    env: gitChildEnv(args, childEnv),
    inheritEnv: false,
    redactions: [...providerTokenRedactions(childEnv), ...(redactions ?? DEFAULT_REDACTIONS)],
    timeoutMs: timeoutMs === undefined ? resolveGitTimeout(undefined) : timeoutMs,
  });
}
