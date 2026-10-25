import { realpathSync } from 'node:fs';
import { decodeOperatorPlanningSnapshot, PLANNING_MAX_TASKS, PLANNING_MAX_REPOSITORIES, PLANNING_MAX_EDGES, type OperatorPlanningSnapshot, type OperatorPlanningGraph } from '../../core/operator/planning-snapshot';
import { EngineerSchedulingError, validateProviderWorkGraphTopology } from '../../core/engineers/scheduling';
import { readProviderEngineerScheduling, readProviderWorkGraph, readPlanningFileAtCommit, type ProviderWorkGraphRead, type ProviderWorkGraphSource } from '../engineers/scheduling';
import { resolveDependencyObservation } from '../engineers/dependency-authority';
import { isRepoHarnessAdoptedPath, type RepoHarnessRegisteredRepo, type RepoHarnessRegistrySnapshot } from '../repo-registry';
import { decodeOperatorOrganizationSnapshot, projectOperatorOrganizationSnapshot } from '../../core/operator/organization-snapshot';
import { collectEngineeringBoard } from '../engineers/engineering-overlay';
import {
  OPERATOR_REPOSITORY_PROTOCOL,
  OPERATOR_REPOSITORY_SNAPSHOT_KIND,
  type OperatorRepositorySnapshotV1,
} from '../../core/operator/repository-snapshot';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';

/** Resolve only registered repository IDs. Planning and Organization are
 * independent stored observations; one unavailable source cannot become an
 * empty result or hide the other. Registry/identity failures refuse the whole
 * response. No reader acquires, binds, delivers, acknowledges or runs a provider.
 */
export type OperatorRepositoryErrorCode =
  | 'registry_unavailable'
  | 'repository_not_found'
  | 'repository_snapshot_unavailable'
  | 'repository_mismatch';

export class OperatorRepositoryError extends Error {
  constructor(
    readonly code: OperatorRepositoryErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OperatorRepositoryError';
  }
}

export interface ReadOperatorRepositorySnapshotInput {
  readonly env?: NodeJS.ProcessEnv;
  readonly repository_id: string;
  readonly graph_source?: ProviderWorkGraphSource;
}

/**
 * The board asks about one repository by id and must be answered about that
 * repository. The id in a snapshot is derived from the resolved root while the
 * request names a registry id, so the two are separate derivations that only
 * agree while the registry is intact; a document that disagrees is refused
 * rather than relabelled, because relabelling would show one repository's lanes
 * under another repository's name. The same assertion guards the worker payload
 * on the far side of the process boundary, where an unrelated or replayed
 * message could otherwise be accepted as this repository's answer.
 */
export function assertOperatorRepositorySnapshotIdentity(
  snapshot: OperatorRepositorySnapshotV1,
  repositoryId: string,
): void {
  if (snapshot === null
    || typeof snapshot !== 'object'
    || snapshot.protocol !== OPERATOR_REPOSITORY_PROTOCOL
    || snapshot.kind !== OPERATOR_REPOSITORY_SNAPSHOT_KIND) {
    throw new OperatorRepositoryError(
      'repository_mismatch',
      `repository snapshot for repository ${repositoryId} is not an operator repository snapshot`,
    );
  }
  if (snapshot.repository_id !== repositoryId) {
    throw new OperatorRepositoryError(
      'repository_mismatch',
      `repository snapshot answered repository ${snapshot.repository_id} for requested repository ${repositoryId}`,
    );
  }
  try {
    if (Object.keys(snapshot).sort().join(',') !== 'kind,organization,planning,protocol,repository_id') throw new Error('shape');
    for (const source of [snapshot.organization, snapshot.planning]) {
      if (!source || !Number.isFinite(Date.parse(source.observed_at))) throw new Error('source');
      if (source.status === 'unavailable') {
        if (source.code !== 'source_unavailable' || Object.keys(source).sort().join(',') !== 'code,observed_at,status') throw new Error('failure');
      } else if (source.status !== 'observed' || ('overlay' in source.snapshot ? source.snapshot.overlay.repository_id : source.snapshot.repository_id) !== repositoryId || Object.keys(source).sort().join(',') !== 'observed_at,snapshot,status') throw new Error('identity');
    }
    if (snapshot.planning.status === 'observed') decodeOperatorPlanningSnapshot(snapshot.planning.snapshot, repositoryId);
    if (snapshot.organization.status === 'observed') decodeOperatorOrganizationSnapshot(snapshot.organization.snapshot, repositoryId);
  } catch (error) {
    throw new OperatorRepositoryError('repository_mismatch', 'invalid scoped repository source', error);
  }

}

function registeredRepositoryRoot(input: ReadOperatorRepositorySnapshotInput): string {
  let repos: ReturnType<typeof readRepoHarnessRegistryStrictSnapshot>['repos'];
  try {
    repos = readRepoHarnessRegistryStrictSnapshot({ env: input.env, adoptedOnly: false }).repos;
  } catch (error) {
    throw new OperatorRepositoryError('registry_unavailable', 'cannot read the fleet registry authority', error);
  }
  const repository = repos.find((candidate) => candidate.id === input.repository_id);
  if (repository === undefined) {
    throw new OperatorRepositoryError('repository_not_found', `repository ${input.repository_id} is not registered`);
  }
  return repository.path;
}

export function readOperatorRepositorySnapshot(
  input: ReadOperatorRepositorySnapshotInput,
): OperatorRepositorySnapshotV1 {
  const repoRoot = registeredRepositoryRoot(input);
  const observe = <T>(reader: () => T): import('../../core/operator/repository-snapshot').RepositorySourceObservation<T> => {
    try { return { status: 'observed', snapshot: reader(), observed_at: new Date().toISOString() }; }
    catch (error) {
      if (error instanceof OperatorRepositoryError && error.code === 'repository_mismatch') throw error;
      return { status: 'unavailable', code: 'source_unavailable', observed_at: new Date().toISOString() };
    }
  };
  const organization = observe(() => {
    const board = collectEngineeringBoard({ repo_root: repoRoot, env: input.env });
    const overlay = board.overlay;
    const attention = board.organization_attention;
    if (overlay.repository_id !== input.repository_id) throw new OperatorRepositoryError('repository_mismatch', 'organization repository differs from request');
    return projectOperatorOrganizationSnapshot(overlay, attention);
  });
  const planning = observe(() => readOperatorPlanningSnapshot(input));
  const projected: OperatorRepositorySnapshotV1 = {
    protocol: OPERATOR_REPOSITORY_PROTOCOL, kind: OPERATOR_REPOSITORY_SNAPSHOT_KIND,
    repository_id: input.repository_id, organization, planning,
  };
  assertOperatorRepositorySnapshotIdentity(projected, input.repository_id);
  return projected;
}

/** Planning joins provider issue observations and admitted sessions to explicit tracked metadata. */
export function readOperatorPlanningSnapshot(input: ReadOperatorRepositorySnapshotInput): OperatorPlanningSnapshot {
  const observedAt = new Date().toISOString();
  const read = () => {
    const registry = readRepoHarnessRegistryStrictSnapshot({ env: input.env, adoptedOnly: false });
    const repo = registry.repos.find(item => item.id === input.repository_id);
    if (!repo) throw new Error('Planning repository unavailable');
    const root = realpathSync(repo.path);
    const scheduling = readProviderEngineerScheduling(repo, input.env);
    let graph: OperatorPlanningSnapshot['graph'];
    try { graph = { status: 'observed', snapshot: readPlanningGraph(repo, registry, input.graph_source) }; }
    catch (error) { graph = { status: 'unavailable', code: error instanceof EngineerSchedulingError && error.code === 'provider_work_graph_missing' ? 'needs_provider_graph' : 'source_unavailable' }; }
    return { root, value: decodeOperatorPlanningSnapshot({ protocol: 2, kind: 'operator_planning_snapshot', repository_id: repo.id,
      scheduling, graph, observation: { observed_at: observedAt, authorization_revision: registry.authorizationRevision } }, repo.id) };
  };
  const before = read(), after = read();
  if (before.root !== after.root || JSON.stringify(before.value) !== JSON.stringify(after.value)) throw new Error('Planning observation changed');
  const registry = readRepoHarnessRegistryStrictSnapshot({ env: input.env, adoptedOnly: false });
  const repo = registry.repos.find(item => item.id === input.repository_id);
  if (!repo || registry.authorizationRevision !== after.value.observation.authorization_revision || realpathSync(repo.path) !== after.root) throw new Error('Planning authorization changed');
  return after.value;
}
function readPlanningGraph(repo: RepoHarnessRegisteredRepo, registry: RepoHarnessRegistrySnapshot, source?: ProviderWorkGraphSource): OperatorPlanningGraph {
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
