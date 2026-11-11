import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { runGit } from '../../effects/git/run-git';
import { gitToplevel } from '../../effects/git/runner';

export function resolveMcpRepoRoot(repo = '.'): string {
  const candidate = resolve(repo);
  return gitToplevel(candidate, 5000) ?? candidate;
}

export function isRepoHarnessAdopted(repoRoot: string): boolean {
  return existsSync(join(repoRoot, '.ai', 'harness', 'policy.json')) || existsSync(join(repoRoot, '.ai', 'harness', 'workflow-contract.json'));
}

export function currentGitBranch(repoRoot: string): string | null {
  const result = runGit(['-C', repoRoot, 'branch', '--show-current'], {
    timeoutMs: 5000,
    stdio: 'pipe',
  });
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null;
}
