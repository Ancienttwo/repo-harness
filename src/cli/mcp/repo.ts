import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { runProcess } from '../../effects/process-runner';

export function resolveMcpRepoRoot(repo = '.'): string {
  const candidate = resolve(repo);
  const result = runProcess('git', ['-C', candidate, 'rev-parse', '--show-toplevel'], {
    timeoutMs: 5000,
    stdio: 'pipe',
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : candidate;
}

export function isRepoHarnessAdopted(repoRoot: string): boolean {
  return existsSync(join(repoRoot, '.ai', 'harness', 'policy.json')) || existsSync(join(repoRoot, 'tasks', 'current.md'));
}

export function currentGitBranch(repoRoot: string): string | null {
  const result = runProcess('git', ['-C', repoRoot, 'branch', '--show-current'], {
    timeoutMs: 5000,
    stdio: 'pipe',
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null;
}
