import { PLANNING_MAX_TASKS, PLANNING_MAX_REPOSITORIES, PLANNING_MAX_EDGES, type OperatorPlanningGraph } from '../../core/operator/planning-snapshot';
import { resolveDependencyObservation } from './dependency-authority';
import { isRepoHarnessAdoptedPath, readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { validateProviderWorkGraphTopology, buildProviderEngineerOffers, type ProviderEngineerOfferBlocker } from '../../core/engineers/scheduling';
import { realpathSync } from 'fs';
import { EngineerSchedulingError, projectProviderEngineerScheduling, projectProviderWorkGraph, validateProviderWorkGraph, type ProjectedProviderWorkGraph } from '../../core/engineers/scheduling';
import { canonicalEngineerJson, engineerSha256 } from '../../core/engineers/profile-binding';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { gitExecFileSync } from '../git/runner';
import { readCanonicalTargetRef } from '../state/canonical-target';
import { readOperatorTaskSessions } from '../operator/task-sessions';
import { listExternalSourceProjection } from '../external-sources/refresh';
import { listEngineerProfiles, resolveCapabilityForEngineer } from '../profiles/profile-store';
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
export interface ProviderSchedulingReaders {
  readonly readSessions: typeof readOperatorTaskSessions;
  readonly readIssues: typeof listExternalSourceProjection;
  readonly listProfiles: typeof listEngineerProfiles;
}
export function readProviderEngineerScheduling(repo: RepoHarnessRegisteredRepo, env?: NodeJS.ProcessEnv, readers: Partial<ProviderSchedulingReaders> = {}) {
  return projectProviderEngineerScheduling({
    repository_id: repo.id,
    issues: (readers.readIssues ?? listExternalSourceProjection)(repo.path, repo.id),
    sessions: (readers.readSessions ?? readOperatorTaskSessions)({ repository_id: repo.id, env }),
    profiles: (readers.listProfiles ?? listEngineerProfiles)(repo.path).map(profile => ({ engineer_id: profile.profile.engineer_id,
      capability_id: profile.profile.capability_id, engineer_contract_revision: profile.engineer_contract_revision })),
  });
}

export function readProviderPlanningGraph(repo: RepoHarnessRegisteredRepo, registry: RepoHarnessRegistrySnapshot, source?: ProviderWorkGraphSource): OperatorPlanningGraph {
  const selected = readProviderWorkGraph(repo, source);
  const reads: ProviderWorkGraphRead[] = [selected];
  let edgeCount = 0;
  for (let index = 0; index < reads.length; index++) {
    const read = reads[index]!;
    if (read.graph.work_packages.length > PLANNING_MAX_TASKS) throw new Error('Planning graph task limit');
    const edges = read.graph.work_packages.flatMap(item => item.depends_on);
    edgeCount += edges.length;
    if (edgeCount > PLANNING_MAX_EDGES) throw new Error('Planning graph edge limit');
    for (const edge of edges) {
      if (reads.some(item => item.repo.id === edge.repository_id)) continue;
      if (reads.length >= PLANNING_MAX_REPOSITORIES) throw new Error('Planning graph repository limit');
      const target = registry.repos.find(item => item.id === edge.repository_id);
      if (!target) throw new Error('Planning graph repository unavailable');
      reads.push(readProviderWorkGraph(target));
    }
  }
  validateProviderWorkGraphTopology(reads.map(read => read.graph));
  const authorityRegistry = { ...registry, repos: registry.repos.filter(item => isRepoHarnessAdoptedPath(item.path)) };
  const packages = selected.graph.work_packages.map(item => ({ ...item, dependencies: item.depends_on.map(dependency => {
    const target = reads.flatMap(read => read.graph.work_packages).find(item => item.repository_id === dependency.repository_id && item.work_package_id === dependency.work_package_id);
    if (!target) throw new Error('Planning dependency disappeared');
    return resolveDependencyObservation({ dependency, target, reads, registry: authorityRegistry, readFileAtCommit: readPlanningFileAtCommit });
  }) }));
  return { packages, sources: reads.map(read => ({ repository_id: read.repo.id, commit: read.commit,
    graph_path: read.graph.graph_path, work_graph_revision: read.graph.work_graph_revision })).sort((a, b) => a.repository_id.localeCompare(b.repository_id)) };
}

/** Eligibility is an observed hint. Starting a session or effect rechecks its admission. */
export function readProviderEngineerOffers(input: {
  repo_root: string; engineer_id: string; engineer_contract_revision: string;
  session_binding_sha256: string; env?: NodeJS.ProcessEnv; graph_source?: ProviderWorkGraphSource;
}) {
  const registry = readRepoHarnessRegistryStrictSnapshot({ env: input.env });
  const repo = resolveRegisteredRepoForWorktree(input.repo_root, registry);
  const scheduling = readProviderEngineerScheduling(repo, input.env);
  const matches = scheduling.tasks.flatMap(task => task.sessions).filter(item => item.session.selector.session_binding_sha256 === input.session_binding_sha256);
  if (matches.length !== 1) fail('engineer_offer_stale', 'exact admitted session selection is unavailable');
  const selected = matches[0]!.selection;
  if (selected.state !== 'selected' || selected.engineer_id !== input.engineer_id || selected.engineer_contract_revision !== input.engineer_contract_revision) fail('engineer_offer_stale', 'explicit profile selection changed or is unassigned');
  const profile = scheduling.profiles.find(item => item.engineer_id === input.engineer_id)!;
  const graph = readProviderPlanningGraph(repo, registry, input.graph_source);
  const offers = [...graph.packages].sort((a, b) => b.priority - a.priority || a.work_package_id.localeCompare(b.work_package_id)).map(item => {
    const blockers: ProviderEngineerOfferBlocker[] = [];
    const task = scheduling.tasks.find(row => row.provider_repository_id === item.task.provider_repository_id && row.issue_id === item.task.issue_id);
    const issue = task?.issue ?? null;
    if (!issue) blockers.push('provider_unavailable');
    else if (issue.state === 'closed') blockers.push('provider_closed');
    else if (!issue.eligible) blockers.push('provider_ineligible');
    if (item.primary_capability !== profile.capability_id) blockers.push('capability_mismatch');
    if (item.dependencies.some(edge => edge.status === 'authority_unavailable')) blockers.push('dependency_authority_unavailable');
    if (item.dependencies.some(edge => edge.status === 'unsatisfied')) blockers.push('dependency_not_ready');
    const conflicting = graph.packages.filter(other => other.concurrency.key === item.concurrency.key).some(other =>
      scheduling.tasks.find(row => row.provider_repository_id === other.task.provider_repository_id && row.issue_id === other.task.issue_id)?.sessions.some(execution =>
        execution.selection.state === 'selected' && execution.session.selector.session_binding_sha256 !== input.session_binding_sha256));
    if (conflicting) blockers.push('session_conflict');
    return { provider_repository_id: item.task.provider_repository_id, issue_id: item.task.issue_id,
      source_revision: issue?.source_revision ?? null, eligible: blockers.length === 0, blockers };
  });
  const after = readProviderEngineerScheduling(repo, input.env);
  if (scheduling.source_revision !== after.source_revision
    || canonicalEngineerJson(graph) !== canonicalEngineerJson(readProviderPlanningGraph(repo, registry, input.graph_source))
    || readRepoHarnessRegistryStrictSnapshot({ env: input.env }).authorizationRevision !== registry.authorizationRevision) fail('engineer_offer_stale', 'offer inputs changed during observation');
  return buildProviderEngineerOffers({ repository_id: repo.id, engineer_id: input.engineer_id,
    engineer_contract_revision: input.engineer_contract_revision, session_binding_sha256: input.session_binding_sha256,
    authorization_revision: registry.authorizationRevision, planning_revision: engineerSha256(canonicalEngineerJson(graph)), offers });
}
