import { execFileSync } from 'child_process';
import { realpathSync } from 'fs';

import { projectCanonicalTasks } from '../../core/state/coordination-identity';
import {
  EngineerSchedulingError,
  projectWorkGraph,
  schedulingCarrierPath,
  validateWorkGraph,
  type ProjectedWorkGraphV1,
} from '../../core/engineers/scheduling';
import { EngineerProfileBindingError, engineerSha256 } from '../../core/engineers/profile-binding';

import { readActiveSprintPath, readCanonicalTargetRef } from '../state/collect-board-inputs';
import { readCanonicalSprint } from '../state/coordination-canonical-source';
import { resolveRepoIdentity } from '../git/repository-identity';

import { resolveGitCommonDirectory } from '../git/common-directory';
import { type RepoHarnessRegisteredRepo, type RepoHarnessRegistrySnapshot } from '../repo-registry';

import { resolveCapabilityForEngineer } from './profile-store';

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

export interface EngineerSchedulingDependencies {
  readonly readActiveSprintPath: typeof readActiveSprintPath;
  readonly readCanonicalTargetRef: typeof readCanonicalTargetRef;
  readonly readCanonicalSprint: typeof readCanonicalSprint;
  readonly resolveCapability: typeof resolveCapabilityForEngineer;
  readonly readFileAtCommit: typeof gitFileAtCommit;
  readonly repoIdentity: typeof resolveRepoIdentity;
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

function dependencies(overrides: Partial<EngineerSchedulingDependencies> = {}): EngineerSchedulingDependencies {
  return {
    readActiveSprintPath,
    readCanonicalTargetRef,
    readCanonicalSprint,
    resolveCapability: resolveCapabilityForEngineer,
    readFileAtCommit: gitFileAtCommit,
    repoIdentity: resolveRepoIdentity,
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
