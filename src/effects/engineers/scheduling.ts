import { realpathSync } from 'fs';
import { EngineerSchedulingError, projectProviderEngineerScheduling, projectProviderWorkGraph, validateProviderWorkGraph, type ProjectedProviderWorkGraph } from '../../core/engineers/scheduling';
import { engineerSha256 } from '../../core/engineers/profile-binding';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { gitExecFileSync } from '../git/runner';
import { readCanonicalTargetRef } from '../state/collect-board-inputs';
import { readOperatorTaskSessions } from '../operator/task-sessions';
import { listExternalSourceProjection } from '../external-sources/refresh';
import { listEngineerProfiles, resolveCapabilityForEngineer } from './profile-store';
import type { RepoHarnessRegisteredRepo, RepoHarnessRegistrySnapshot } from '../repo-registry';

export const PROVIDER_WORK_GRAPH_PATH = '.ai/harness/work-graph.v2.json';
export interface ProviderWorkGraphSource { readonly graph_path: string; readonly commit: string }
export interface ProviderWorkGraphRead { readonly repo: RepoHarnessRegisteredRepo; readonly commit: string; readonly graph: ProjectedProviderWorkGraph }
export function resolveRegisteredRepoForWorktree(
  repoRoot: string,
  registry: RepoHarnessRegistrySnapshot,
): RepoHarnessRegisteredRepo {
  const common = realpathSync(resolveGitCommonDirectory(repoRoot));
  const matches = registry.repos.filter((repo) => {
    try { return realpathSync(resolveGitCommonDirectory(repo.path)) === common; } catch { return false; }
  });
  if (matches.length !== 1) {
    fail('engineer_offer_stale', 'current worktree must resolve to exactly one registered repository');
  }
  return matches[0];
}

function fail(code: EngineerSchedulingError['code'], message: string, cause?: unknown): never {
  throw new EngineerSchedulingError(code, message, cause);
}


export function readPlanningFileAtCommit(repoRoot: string, commit: string, path: string): string | null {
  try { return gitExecFileSync(['show', `${commit}:${path}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 2 * 1024 * 1024, timeout: 5000 }); }
  catch { return null; }
}
export function defaultProviderWorkGraphSource(repoRoot: string): ProviderWorkGraphSource {
  const target = readCanonicalTargetRef(repoRoot);
  const commit = gitExecFileSync(['rev-parse', '--verify', '--end-of-options', `${target}^{commit}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { graph_path: PROVIDER_WORK_GRAPH_PATH, commit };
}
/** V2 explicitly maps provider issue IDs. V1 carriers are never inferred or read. */
export function readProviderWorkGraph(repo: RepoHarnessRegisteredRepo, source: ProviderWorkGraphSource = defaultProviderWorkGraphSource(repo.path)): ProviderWorkGraphRead {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(source.commit) || source.graph_path.startsWith('/') || source.graph_path.startsWith('-')
    || source.graph_path.includes('\\') || source.graph_path.split('/').some(part => !part || part === '.' || part === '..') || !source.graph_path.endsWith('.json')) fail('provider_scheduling_invalid', 'explicit immutable commit and repository-relative JSON graph path required');
  const raw = readPlanningFileAtCommit(repo.path, source.commit, source.graph_path);
  if (raw === null) fail('provider_work_graph_missing', 'author a V2 work graph with canonical GitHub repository and issue IDs at the selected commit');
  const definition = validateProviderWorkGraph(JSON.parse(raw));
  if (definition.repository_id !== repo.id) fail('provider_scheduling_invalid', 'provider work graph repository mismatch');
  for (const item of definition.work_packages) {
    resolveCapabilityForEngineer(repo.path, item.primary_capability);
    const references = [...item.required_acceptance.map(policy => ({ path: policy.policy_ref, revision: policy.policy_revision })),
      { path: item.rollback_boundary.boundary_ref, revision: item.rollback_boundary.boundary_revision },
      ...item.depends_on.filter(dep => dep.repository_id === repo.id && dep.acceptance_authority !== null).map(dep => ({ path: dep.acceptance_authority!.subject_ref, revision: dep.acceptance_authority!.subject_revision }))];
    for (const reference of references) {
      const bytes = readPlanningFileAtCommit(repo.path, source.commit, reference.path);
      if (bytes === null || engineerSha256(bytes) !== reference.revision) fail('work_graph_reference_mismatch', `graph reference missing or changed at selected commit: ${reference.path}`);
    }
  }
  return { repo, commit: source.commit, graph: projectProviderWorkGraph(definition, listExternalSourceProjection(repo.path, repo.id), source) };
}
/** Read the shared admission discovery and provider cache; never consult Sprint or leases. */
export function readProviderEngineerScheduling(repo: RepoHarnessRegisteredRepo, env?: NodeJS.ProcessEnv) {
  return projectProviderEngineerScheduling({
    repository_id: repo.id,
    issues: listExternalSourceProjection(repo.path, repo.id),
    sessions: readOperatorTaskSessions({ repository_id: repo.id, env }),
    profiles: listEngineerProfiles(repo.path).map(profile => ({ engineer_id: profile.profile.engineer_id,
      capability_id: profile.profile.capability_id, engineer_contract_revision: profile.engineer_contract_revision })),
  });
}
