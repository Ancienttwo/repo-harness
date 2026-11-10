import { DEFAULT_REDACTIONS, runProcess, type ProcessRunResult, type RunProcessOptions } from '../process-runner';
import { gitChildEnv, resolveGitExecutable, providerTokenRedactions, resolveGitTimeout } from './runner';

/** `runProcess` entry for git. The binary and the omitted-timeout deadline come from the git runner. */
export function runGit(
  args: readonly string[],
  opts: RunProcessOptions & { gitBin?: string } = {},
): ProcessRunResult {
  const { gitBin, timeoutMs, env, inheritEnv, redactions, stdio, ...rest } = opts;
  const childEnv = inheritEnv === false ? env : { ...process.env, ...env };
  const tokenRedactions = providerTokenRedactions(childEnv);
  // An inherited stream reaches the terminal before any replacement, so a call that holds a token captures it and forwards the replaced text.
  const captured = stdio === 'inherit' && tokenRedactions.length > 0;
  const result = runProcess(resolveGitExecutable(gitBin, env), [...args], {
    ...rest,
    env: gitChildEnv(args, childEnv),
    inheritEnv: false,
    stdio: captured ? 'pipe' : stdio,
    redactions: [...tokenRedactions, ...(redactions ?? DEFAULT_REDACTIONS)],
    timeoutMs: timeoutMs === undefined ? resolveGitTimeout(undefined) : timeoutMs,
  });
  if (captured) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  }
  return result;
}
