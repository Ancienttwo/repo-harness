import { execFileSync } from 'child_process';
import { realpathSync } from 'fs';
import { isAbsolute, resolve } from 'path';

export function resolveGitCommonDirectory(cwd: string, gitBin = 'git'): string {
  const raw = execFileSync(gitBin, ['rev-parse', '--git-common-dir'], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  if (!raw) throw new Error(`Git common directory is empty for ${cwd}`);
  const commonDir = isAbsolute(raw) ? raw : resolve(cwd, raw);
  return realpathSync(commonDir);
}
