import { realpathSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { configuredGitBinary, gitExecFileSync } from './runner';
export { configuredGitBinary } from './runner';

export function resolveGitCommonDirectory(cwd: string, gitBin = configuredGitBinary(), timeoutMs?: number, env?: NodeJS.ProcessEnv): string {
  const raw = gitExecFileSync(['rev-parse', '--git-common-dir'], {
    cwd,
    gitBin,
    timeout: timeoutMs,
    env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (!raw) throw new Error(`Git common directory is empty for ${cwd}`);
  const commonDir = isAbsolute(raw) ? raw : resolve(cwd, raw);
  return realpathSync(commonDir);
}
