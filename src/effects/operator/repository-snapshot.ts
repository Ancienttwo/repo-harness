import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import type { BoardDocumentV1 } from '../../core/state/types';
import { projectOperatorTaskContext } from '../../core/operator/task-context';
import { decodeOperatorPlanningSnapshot, PLANNING_MAX_TASKS, PLANNING_MAX_REPOSITORIES, PLANNING_MAX_EDGES, PLANNING_MAX_BYTES, type OperatorPlanningSnapshot, type OperatorPlanningGraph } from '../../core/operator/planning-snapshot';
import { validateWorkGraphTopology } from '../../core/engineers/scheduling';
import { readTrackedWorkGraphProjectionAt, readProjectedWorkGraph, type ProjectedGraphRead } from '../engineers/scheduling';
import { resolveDependencyObservation } from '../engineers/dependency-authority';
import { collectRepoTaskOffers } from '../fleet/acquire';
import { resolveBoard } from '../state/resolve-board';
import { isRepoHarnessAdoptedPath, type RepoHarnessRegisteredRepo, type RepoHarnessRegistrySnapshot } from '../repo-registry';
import { decodeOperatorOrganizationSnapshot, projectOperatorOrganizationSnapshot } from '../../core/operator/organization-snapshot';
import { validateEngineeringOverlaySnapshot, validateOrganizationAttentionSnapshot } from '../../core/engineers/engineering-overlay';
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
      } else if (source.status !== 'observed' || source.snapshot.repository_id !== repositoryId || Object.keys(source).sort().join(',') !== 'observed_at,snapshot,status') throw new Error('identity');
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
    const overlay = validateEngineeringOverlaySnapshot(board.overlay);
    const attention = validateOrganizationAttentionSnapshot(board.organization_attention);
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

/** Complete Planning observations use the same Board and TaskOffer authority
 * as task details. Graph failure is independent from readable requirements. */
export function readOperatorPlanningSnapshot(input: ReadOperatorRepositorySnapshotInput): OperatorPlanningSnapshot {
  const observedAt = new Date().toISOString();
  const now = Date.now();
  const read = () => {
    const registry = readRepoHarnessRegistryStrictSnapshot({ env:input.env,adoptedOnly:false });
    const repo = registry.repos.find(r => r.id === input.repository_id);
    if (!repo) throw new Error('Planning repository unavailable');
    const root = realpathSync(repo.path);
    let board: BoardDocumentV1 | null = null;
    const offers = collectRepoTaskOffers(repo,registry,{ env:input.env,now_ms:now,board_reader:(...args) => {
      const result = resolveBoard(...args);
      if (result.cards.length > PLANNING_MAX_TASKS || result.snapshot_consistency !== 'stable') throw new Error('Planning board unavailable');
      board = result; return result;
    } });
    const current = board as BoardDocumentV1 | null;
    if (offers !== null && current === null) throw new Error('Planning board missing');
    if (offers?.snapshot_consistency === 'changed_during_read') throw new Error('Planning board changed');
    const tasks = current === null ? [] : current.cards.filter(card => card.task_state !== 'missing').map(card => {
      const offer = offers?.offers.find(o => o.task_id === card.task_id);
      if (!offer || offer.snapshot_consistency !== 'stable') throw new Error('Planning offer unavailable');
      return projectOperatorTaskContext({ repository_id:repo.id,board:current,card,offer,authorization_revision:registry.authorizationRevision,observed_at:observedAt });
    });
    let graph: OperatorPlanningSnapshot['graph'];
    try {
      graph = { status:'observed',observed_at:observedAt,snapshot:readPlanningGraph(repo,registry,current,input.env) };
    } catch {
      graph = { status:'unavailable',observed_at:observedAt,code:'source_unavailable' };
    }
    const value = decodeOperatorPlanningSnapshot({ protocol:1,kind:'operator_planning_snapshot',repository_id:repo.id,
      canonical:current ? { target_ref:current.canonical_target.ref,commit:current.canonical_target.oid,sprint_path:current.sprint_path } : null,
      tasks,graph,observation:{observed_at:observedAt,authorization_revision:registry.authorizationRevision,board_revision:current?.revisions.board ?? null},
    },repo.id);
    return {root,value};
  };
  const before = read(), after = read();
  if (before.root !== after.root || JSON.stringify(before.value) !== JSON.stringify(after.value)) throw new Error('Planning observation changed');
  const registry = readRepoHarnessRegistryStrictSnapshot({env:input.env,adoptedOnly:false});
  const repo = registry.repos.find(r => r.id === input.repository_id);
  if (!repo || registry.authorizationRevision !== after.value.observation.authorization_revision || realpathSync(repo.path) !== after.root) throw new Error('Planning authorization changed');
  return after.value;
}

function readPlanningGraph(repo: RepoHarnessRegisteredRepo, registry: RepoHarnessRegistrySnapshot, board: BoardDocumentV1 | null, env: NodeJS.ProcessEnv | undefined): OperatorPlanningGraph {
  const unclassified: OperatorPlanningGraph = { lane:'unclassified',work_graph_revision:null,packages:[],sources:[] };
  if (board === null) return unclassified;
  const selected = readTrackedWorkGraphProjectionAt(repo.path,repo.id,board.sprint_path,board.canonical_target.oid);
  if (selected.commit !== board.canonical_target.oid) throw new Error('Planning graph target changed');
  if (selected.graph === null) return unclassified;
  const reads: ProjectedGraphRead[] = [{repo,...selected}];
  let edgeCount = 0;
  for (let index = 0; index < reads.length; index++) {
    const read = reads[index]!;
    if (!read.graph || read.graph.work_packages.length > PLANNING_MAX_TASKS) throw new Error('Planning graph unavailable');
    const edges = read.graph.work_packages.flatMap(p => p.depends_on);
    edgeCount += edges.length;
    if (edgeCount > PLANNING_MAX_EDGES) throw new Error('Planning graph edge limit');
    for (const dependency of edges) {
      if (reads.some(r => r.repo.id === dependency.repository_id)) continue;
      if (reads.length >= PLANNING_MAX_REPOSITORIES) throw new Error('Planning graph repository limit');
      const target = registry.repos.find(r => r.id === dependency.repository_id);
      if (!target) throw new Error('Planning dependency repository unavailable');
      const graph = readProjectedWorkGraph(target);
      if (graph.graph === null) throw new Error('Planning dependency graph unavailable');
      reads.push(graph);
    }
  }
  const graphs = reads.map(r => r.graph!);
  validateWorkGraphTopology(graphs);
  // Preserve the scheduling resolver's adopted-registry precondition while
  // keeping registered read-only repositories visible in the Planning UI.
  const authorityRegistry = {...registry,repos:registry.repos.filter(r => isRepoHarnessAdoptedPath(r.path))};
  const readFileAtCommit = (root: string, commit: string, path: string): string | null => {
    try { return execFileSync('git',['show',`${commit}:${path}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:PLANNING_MAX_BYTES,timeout:1000}); }
    catch { return null; }
  };
  const packages = selected.graph.work_packages.map(item => ({
    work_package_id:item.work_package_id,work_package_revision:item.work_package_revision,task_id:item.task_id,task_revision:item.task_revision,
    primary_capability:item.primary_capability,required_acceptance:item.required_acceptance,rollback_boundary:item.rollback_boundary,
    dependencies:item.depends_on.map(dependency => {
      const target = graphs.flatMap(g => g.work_packages).find(p => p.repository_id === dependency.repository_id && p.work_package_id === dependency.work_package_id);
      if (!target) throw new Error('Planning dependency disappeared');
      return resolveDependencyObservation({dependency,target,reads,registry:authorityRegistry,env,readFileAtCommit});
    }),
  }));
  return {lane:selected.graph.lane,work_graph_revision:selected.graph.work_graph_revision,packages,
    sources:reads.map(r => ({repository_id:r.repo.id,commit:r.commit!,work_graph_revision:r.graph!.work_graph_revision})).sort((a,b) => a.repository_id < b.repository_id ? -1 : a.repository_id > b.repository_id ? 1 : 0)};
}
