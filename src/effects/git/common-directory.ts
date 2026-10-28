import { realpathSync } from 'fs';
import { isAbsolute, resolve } from 'path';
import { configuredGitBinary, gitExecFile, gitExecFileSync } from './runner';
export { configuredGitBinary } from './runner';

function canonicalCommonDirectory(cwd: string, output: string): string {
  const raw = output.trim();
  if (!raw) throw new Error(`Git common directory is empty for ${cwd}`);
  const commonDir = isAbsolute(raw) ? raw : resolve(cwd, raw);
  return realpathSync(commonDir);
}

export function resolveGitCommonDirectory(cwd: string, gitBin = configuredGitBinary(), timeoutMs?: number, env?: NodeJS.ProcessEnv): string {
  return canonicalCommonDirectory(cwd, gitExecFileSync(['rev-parse', '--git-common-dir'], {
    cwd,
    gitBin,
    timeout: timeoutMs,
    env,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }));
}

/** `resolveGitCommonDirectory` for an event-loop caller; git runs through `gitExecFile`. */
export async function resolveGitCommonDirectoryAsync(cwd: string, gitBin = configuredGitBinary(), timeoutMs?: number, env?: NodeJS.ProcessEnv): Promise<string> {
  return canonicalCommonDirectory(cwd, await gitExecFile(['rev-parse', '--git-common-dir'], { cwd, gitBin, timeout: timeoutMs, env }));
}
