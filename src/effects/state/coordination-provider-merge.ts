/** Read live provider merge proof for a branch before its worktree is pruned. */
import { spawnSync } from 'child_process';
import { gitSpawnSync } from '../git/runner';
import { resolveProtectedGitRuntime } from '../review/acceptance-receipt';

export function observeProviderBranchMergeCommit(input: {
  readonly repoRoot: string;
  readonly ghBin: string;
  readonly gitBin: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly targetOid: string;
  readonly timeoutMs: number;
}): string | null {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(input.headSha)) return null;
  const deadline = Date.now() + input.timeoutMs;
  // The protected env is built fresh, so caller GH_REPO and GH_HOST never reach gh.
  // The repository and host come from this clone's remotes.
  let env: NodeJS.ProcessEnv;
  try { env = { ...resolveProtectedGitRuntime().env }; } catch { return null; }
  const result = spawnSync(input.ghBin, ['api', `repos/{owner}/{repo}/commits/${input.headSha}/pulls`], {
    cwd: input.repoRoot, env, encoding: 'utf-8', timeout: input.timeoutMs, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) return null;
  let pulls: unknown;
  try { pulls = JSON.parse(result.stdout); } catch { return null; }
  if (!Array.isArray(pulls)) return null;
  for (const pull of pulls) {
    if (!pull || typeof pull !== 'object' || Array.isArray(pull)) continue;
    const { merged_at: mergedAt, base, merge_commit_sha: merge } = pull as Record<string, unknown>;
    if (typeof mergedAt !== 'string' || !Number.isFinite(Date.parse(mergedAt))) continue;
    if (!base || typeof base !== 'object' || (base as Record<string, unknown>).ref !== input.baseRef) continue;
    if (typeof merge !== 'string' || !/^[a-f0-9]{40}$/u.test(merge)) continue;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const ancestor = gitSpawnSync(['merge-base', '--is-ancestor', merge, input.targetOid], {
      gitBin: input.gitBin,
      cwd: input.repoRoot, timeout: remaining, stdio: 'ignore',
    });
    if (!ancestor.error && ancestor.status === 0) return merge;
  }
  return null;
}
