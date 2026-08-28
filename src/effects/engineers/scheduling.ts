import { execFileSync } from 'child_process';
import { realpathSync } from 'fs';

import {
  COMPLETED_ROW_STATUS_PATTERN,
  projectCanonicalTasks,
} from '../../core/state/coordination-identity';
import {
  EngineerSchedulingError,
  buildEngineerOfferCandidate,
  buildEngineerOffersDocument,
  projectWorkGraph,
  schedulingCarrierPath,
  validateWorkGraph,
  validateWorkGraphTopology,
  type EngineerOffersV1,
  type ProjectedWorkGraphV1,
  type ProjectedWorkPackageV1,
  type WorkPackageDependencyObservationV1,
  type WorkPackageDependencyV1,
} from '../../core/engineers/scheduling';
import {
  EngineerProfileBindingError,
  canonicalEngineerJson,
  engineerSha256,
} from '../../core/engineers/profile-binding';
import type { EngineerPrincipalV1 } from '../../core/engineers/principal-claim';
import { collectFleetOffers, type FleetOffersOptions } from '../fleet/acquire';
import { readActiveSprintPath, readCanonicalTargetRef } from '../state/collect-board-inputs';
import { readCanonicalSprint, resolveRepoIdentity } from '../state/coordination-canonical-source';
import { readLease, type LeaseRead } from '../state/coordination-lease-store';
import { resolveGitCommonDirectory } from '../git/common-directory';
import {
  readRepoHarnessRegistrySnapshot,
  type RepoHarnessRegisteredRepo,
  type RepoHarnessRegistrySnapshot,
} from '../repo-registry';
import { readEngineerBindingStatus } from './binding-store';
import { listLiveClaimActorReceiptsForEngineer } from './claim-actor-store';
import { loadEngineerProfile, resolveCapabilityForEngineer } from './profile-store';

export interface ProjectedGraphRead {
  readonly repo: RepoHarnessRegisteredRepo;
  readonly commit: string | null;
  readonly lane: 'unclassified' | 'generic-v1' | 'engineering-v2';
  readonly graph: ProjectedWorkGraphV1 | null;
}

export interface TrackedWorkGraphProjectionRead {
  readonly commit: string;
  readonly lane: 'unclassified' | 'generic-v1' | 'engineering-v2';
  readonly graph: ProjectedWorkGraphV1 | null;
}

export type DependencyAuthorityResolver = (input: {
  readonly dependency: WorkPackageDependencyV1;
  readonly target: ProjectedWorkPackageV1;
  readonly graphs: readonly ProjectedWorkGraphV1[];
}) => WorkPackageDependencyObservationV1;

export interface EngineerSchedulingDependencies {
  readonly readRegistry: typeof readRepoHarnessRegistrySnapshot;
  readonly readActiveSprintPath: typeof readActiveSprintPath;
  readonly readCanonicalTargetRef: typeof readCanonicalTargetRef;
  readonly readCanonicalSprint: typeof readCanonicalSprint;
  readonly collectFleetOffers: typeof collectFleetOffers;
  readonly loadProfile: typeof loadEngineerProfile;
  readonly readBinding: typeof readEngineerBindingStatus;
  readonly resolveCapability: typeof resolveCapabilityForEngineer;
  readonly listLiveClaims: typeof listLiveClaimActorReceiptsForEngineer;
  readonly readLease: (cwd: string, taskId: string) => LeaseRead;
  readonly readFileAtCommit: typeof gitFileAtCommit;
  readonly repoIdentity: typeof resolveRepoIdentity;
  readonly dependencyAuthority: DependencyAuthorityResolver;
}

export interface CollectEngineerOffersOptions {
  readonly repo_root: string;
  readonly principal: EngineerPrincipalV1;
  readonly env?: NodeJS.ProcessEnv;
  readonly now_ms?: number;
  readonly registry_snapshot?: RepoHarnessRegistrySnapshot;
  readonly fleet_options?: Pick<FleetOffersOptions, 'board_reader' | 'plan_reader'>;
  readonly dependencies?: Partial<EngineerSchedulingDependencies>;
}

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

function defaultDependencyAuthority(input: {
  readonly dependency: WorkPackageDependencyV1;
  readonly target: ProjectedWorkPackageV1;
}): WorkPackageDependencyObservationV1 {
  if (input.dependency.required_state !== 'canonical_done') {
    return Object.freeze({ ...input.dependency, status: 'authority_unavailable', authority_revision: null });
  }
  const satisfied = COMPLETED_ROW_STATUS_PATTERN.test(input.target.task_status);
  return Object.freeze({
    ...input.dependency,
    status: satisfied ? 'satisfied' : 'unsatisfied',
    authority_revision: engineerSha256(canonicalEngineerJson({
      task_id: input.target.task_id,
      task_revision: input.target.task_revision,
      task_status: input.target.task_status,
    })),
  });
}

function dependencies(overrides: Partial<EngineerSchedulingDependencies> = {}): EngineerSchedulingDependencies {
  return {
    readRegistry: readRepoHarnessRegistrySnapshot,
    readActiveSprintPath,
    readCanonicalTargetRef,
    readCanonicalSprint,
    collectFleetOffers,
    loadProfile: loadEngineerProfile,
    readBinding: readEngineerBindingStatus,
    resolveCapability: resolveCapabilityForEngineer,
    listLiveClaims: listLiveClaimActorReceiptsForEngineer,
    readLease,
    readFileAtCommit: gitFileAtCommit,
    repoIdentity: resolveRepoIdentity,
    dependencyAuthority: defaultDependencyAuthority,
    ...overrides,
  };
}

function gitFileAtCommit(repoRoot: string, commit: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${commit}:${path}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

function validateReferencedAuthorities(
  repoRoot: string,
  commit: string,
  graph: ReturnType<typeof validateWorkGraph>,
  readFileAtCommit: typeof gitFileAtCommit,
): void {
  const references = graph.work_packages.flatMap((item) => [
    ...item.required_acceptance.map((policy) => ({
      label: `acceptance policy ${policy.policy_id}`,
      path: policy.policy_ref,
      revision: policy.policy_revision,
    })),
    {
      label: `rollback boundary ${item.rollback_boundary.boundary_id}`,
      path: item.rollback_boundary.boundary_ref,
      revision: item.rollback_boundary.boundary_revision,
    },
  ]);
  for (const reference of references) {
    const bytes = readFileAtCommit(repoRoot, commit, reference.path);
    if (bytes === null || engineerSha256(bytes) !== reference.revision) {
      fail('work_graph_reference_mismatch', `${reference.label} is missing or stale at ${commit}`);
    }
  }
}

export function readProjectedWorkGraph(
  repo: RepoHarnessRegisteredRepo,
  deps: EngineerSchedulingDependencies = dependencies(),
): ProjectedGraphRead {
  const sprintPath = deps.readActiveSprintPath(repo.path);
  if (sprintPath === null) return Object.freeze({ repo, commit: null, lane: 'unclassified', graph: null });
  return readProjectedWorkGraphAt(repo, sprintPath, deps);
}

export function readProjectedWorkGraphAt(
  repo: RepoHarnessRegisteredRepo,
  sprintPath: string,
  deps: EngineerSchedulingDependencies = dependencies(),
): ProjectedGraphRead {
  const targetRef = deps.readCanonicalTargetRef(repo.path);
  return Object.freeze({
    repo,
    ...readTrackedWorkGraphProjectionAt(repo.path, repo.id, sprintPath, targetRef, deps),
  });
}

export function readTrackedWorkGraphProjectionAt(
  repoRoot: string,
  repositoryId: string,
  sprintPath: string,
  targetRef: string,
  deps: EngineerSchedulingDependencies = dependencies(),
): TrackedWorkGraphProjectionRead {
  const sprint = deps.readCanonicalSprint(repoRoot, { targetRef, sprintPath });
  if (!sprint.ok) fail('work_graph_unclassified', sprint.error);
  const carrierPath = schedulingCarrierPath(sprintPath);
  const raw = deps.readFileAtCommit(repoRoot, sprint.commit, carrierPath);
  if (raw === null) return Object.freeze({ commit: sprint.commit, lane: 'unclassified', graph: null });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return fail('work_graph_invalid', `cannot parse canonical work graph ${carrierPath}`, error);
  }
  const graph = validateWorkGraph(parsed);
  if (graph.repository_id !== repositoryId || graph.sprint_path !== sprintPath) {
    fail('work_graph_invalid', `work graph identity does not match ${repositoryId}:${sprintPath}`);
  }
  validateReferencedAuthorities(repoRoot, sprint.commit, graph, deps.readFileAtCommit);
  for (const item of graph.work_packages) {
    // A carrier naming a capability the authority cannot resolve is an invalid
    // work graph, not a Profile failure: the Profile domain error would
    // otherwise escape this projection and reach callers as an unclassified
    // failure.
    try {
      deps.resolveCapability(repoRoot, item.primary_capability);
    } catch (error) {
      if (!(error instanceof EngineerProfileBindingError)) throw error;
      fail(
        'work_graph_invalid',
        `work graph ${carrierPath} references an unresolvable capability: ${item.primary_capability}`,
        error,
      );
    }
  }
  const canonicalTasks = projectCanonicalTasks({
    repoIdentity: deps.repoIdentity(repoRoot),
    sprintPath,
    sprintText: sprint.text,
  }).map((task, index) => Object.freeze({
    task_id: task.task_id,
    task_revision: task.task_revision,
    task_ref: task.row.task,
    status: task.row.status,
    row_order: index + 1,
  }));
  const projected = projectWorkGraph(graph, canonicalTasks);
  return Object.freeze({ commit: sprint.commit, lane: projected.lane, graph: projected });
}

function graphUniverse(
  registry: RepoHarnessRegistrySnapshot,
  deps: EngineerSchedulingDependencies,
): readonly ProjectedGraphRead[] {
  const reads = registry.repos
    .filter((repo) => repo.accessMode === 'read_write')
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((repo) => readProjectedWorkGraph(repo, deps));
  validateWorkGraphTopology(reads.flatMap((entry) => entry.graph === null ? [] : [entry.graph]));
  return Object.freeze(reads);
}

function dependencyObservations(
  item: ProjectedWorkPackageV1,
  graphs: readonly ProjectedWorkGraphV1[],
  deps: EngineerSchedulingDependencies,
): readonly WorkPackageDependencyObservationV1[] {
  return Object.freeze(item.depends_on.map((dependency) => {
    const target = graphs
      .flatMap((graph) => graph.work_packages)
      .find((candidate) => candidate.repository_id === dependency.repository_id
        && candidate.work_package_id === dependency.work_package_id);
    if (!target) fail('work_graph_invalid', `dependency target disappeared: ${dependency.repository_id}:${dependency.work_package_id}`);
    return deps.dependencyAuthority({ dependency, target, graphs });
  }));
}

function concurrencyObservation(
  repoRoot: string,
  item: ProjectedWorkPackageV1,
  graph: ProjectedWorkGraphV1,
  deps: EngineerSchedulingDependencies,
): { readonly available: boolean; readonly revision: string } {
  const active = graph.work_packages
    .filter((candidate) => candidate.concurrency.key === item.concurrency.key)
    .map((candidate) => ({ candidate, lease: deps.readLease(repoRoot, candidate.task_id).record }))
    .filter((entry) => entry.lease !== null && entry.lease.state !== 'released')
    .map((entry) => ({
      work_package_id: entry.candidate.work_package_id,
      task_id: entry.candidate.task_id,
      claim_id: entry.lease!.claim_id,
      generation: entry.lease!.generation,
      state: entry.lease!.state,
    }))
    .sort((left, right) => left.work_package_id.localeCompare(right.work_package_id));
  return Object.freeze({
    available: active.length === 0,
    revision: engineerSha256(canonicalEngineerJson({
      repository_id: item.repository_id,
      scope: 'repo',
      key: item.concurrency.key,
      active,
    })),
  });
}

export function collectEngineerOffers(options: CollectEngineerOffersOptions): EngineerOffersV1 {
  const deps = dependencies(options.dependencies);
  const registry = options.registry_snapshot ?? deps.readRegistry({ env: options.env, adoptedOnly: true });
  const repo = registry.repos.find((entry) => entry.id === options.principal.repository_id && entry.accessMode === 'read_write');
  if (!repo || realpathSync(repo.path) !== realpathSync(options.repo_root)) {
    fail('engineer_offer_stale', 'Engineer principal repository is not the current registered read_write target');
  }
  const reads = graphUniverse(registry, deps);
  const current = reads.find((entry) => entry.repo.id === repo.id);
  if (!current || current.graph === null) {
    return buildEngineerOffersDocument({
      repository_id: options.principal.repository_id,
      engineer_id: options.principal.engineer_id,
      lane: current?.lane ?? 'unclassified',
      work_graph_revision: null,
      candidates: [],
    });
  }
  if (current.graph.lane === 'generic-v1') {
    return buildEngineerOffersDocument({
      repository_id: options.principal.repository_id,
      engineer_id: options.principal.engineer_id,
      lane: 'generic-v1',
      work_graph_revision: current.graph.work_graph_revision,
      candidates: [],
    });
  }
  const profile = deps.loadProfile(repo.path, options.principal.engineer_id);
  const binding = deps.readBinding(repo.path, options.principal.engineer_id, profile.engineer_contract_revision);
  if (profile.engineer_contract_revision !== options.principal.engineer_contract_revision
    || binding.current.current_binding_id !== options.principal.binding_id
    || binding.current.binding_generation !== options.principal.binding_generation
    || binding.current.state !== 'active') {
    fail('engineer_offer_stale', 'Engineer principal no longer matches the exact Profile and current Binding');
  }
  const fleet = deps.collectFleetOffers({
    env: options.env,
    repo_id: repo.id,
    now_ms: options.now_ms,
    registry_snapshot: registry,
    ...options.fleet_options,
  });
  const liveClaims = deps.listLiveClaims(repo.path, options.principal.engineer_id, deps.readLease).length;
  const graphs = reads.flatMap((entry) => entry.graph === null ? [] : [entry.graph]);
  const candidates = current.graph.work_packages.map((item) => {
    const fleetOffer = fleet.offers.find((offer) => offer.task_id === item.task_id) ?? null;
    const concurrency = concurrencyObservation(repo.path, item, current.graph!, deps);
    return buildEngineerOfferCandidate({
      graph: current.graph!,
      work_package: item,
      engineer: {
        engineer_id: profile.profile.engineer_id,
        capability_id: profile.profile.capability_id,
        engineer_contract_revision: profile.engineer_contract_revision,
        max_active_claims: profile.profile.max_active_claims,
      },
      binding: {
        state: binding.current.state,
        binding_id: binding.current.current_binding_id,
        binding_generation: binding.current.binding_generation,
      },
      fleet_offer: fleetOffer,
      dependencies: dependencyObservations(item, graphs, deps),
      concurrency_available: concurrency.available,
      concurrency_revision: concurrency.revision,
      active_claims: liveClaims,
    });
  });
  return buildEngineerOffersDocument({
    repository_id: options.principal.repository_id,
    engineer_id: options.principal.engineer_id,
    lane: 'engineering-v2',
    work_graph_revision: current.graph.work_graph_revision,
    candidates,
  });
}
