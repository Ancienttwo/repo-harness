import { observationExecFileSync as execFileSync } from '../state/readonly-observation';
import { realpathSync } from 'fs';
import { isAbsolute, resolve } from 'path';

export function configuredGitBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.REPO_HARNESS_GIT_BIN ?? 'git';
}

export function resolveGitCommonDirectory(cwd: string, gitBin = configuredGitBinary(), timeoutMs?: number): string {
  const raw = execFileSync(gitBin, ['rev-parse', '--git-common-dir'], {
    cwd,
    timeout: timeoutMs,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (!raw) throw new Error(`Git common directory is empty for ${cwd}`);
  const commonDir = isAbsolute(raw) ? raw : resolve(cwd, raw);
  return realpathSync(commonDir);
}
