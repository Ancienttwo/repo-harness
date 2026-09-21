import { decodeOperatorOrganizationSnapshot, projectOperatorOrganizationSnapshot } from '../../core/operator/organization-snapshot';
import { validateEngineeringOverlaySnapshot, validateOrganizationAttentionSnapshot } from '../../core/engineers/engineering-overlay';
import { collectEngineeringBoard } from '../engineers/engineering-overlay';
import {
  OPERATOR_COLLABORATION_PROTOCOL,
  OPERATOR_COLLABORATION_SNAPSHOT_KIND,
  projectOperatorWorkExchangeSnapshot,
  type OperatorCollaborationSnapshotV2,
} from '../../core/operator/collaboration-snapshot';
import { collectCollaborativeWorkExchange } from '../collaboration/work-exchange';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';

/** Resolve only registered repository IDs. WorkExchange and Organization are
 * independent stored observations; one unavailable source cannot become an
 * empty result or hide the other. Registry/identity failures refuse the whole
 * response. No reader acquires, binds, delivers, acknowledges or runs a provider.
 */
export type OperatorCollaborationErrorCode =
  | 'registry_unavailable'
  | 'repository_not_found'
  | 'collaboration_snapshot_unavailable'
  | 'collaboration_repository_mismatch';

export class OperatorCollaborationError extends Error {
  constructor(
    readonly code: OperatorCollaborationErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OperatorCollaborationError';
  }
}

export interface ReadOperatorCollaborationSnapshotInput {
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
export function assertOperatorCollaborationSnapshotIdentity(
  snapshot: OperatorCollaborationSnapshotV2,
  repositoryId: string,
): void {
  if (snapshot === null
    || typeof snapshot !== 'object'
    || snapshot.protocol !== OPERATOR_COLLABORATION_PROTOCOL
    || snapshot.kind !== OPERATOR_COLLABORATION_SNAPSHOT_KIND) {
    throw new OperatorCollaborationError(
      'collaboration_repository_mismatch',
      `collaboration snapshot for repository ${repositoryId} is not an operator collaboration snapshot`,
    );
  }
  if (snapshot.repository_id !== repositoryId) {
    throw new OperatorCollaborationError(
      'collaboration_repository_mismatch',
      `collaboration snapshot answered repository ${snapshot.repository_id} for requested repository ${repositoryId}`,
    );
  }
  try {
    if (Object.keys(snapshot).sort().join(',') !== 'exchange,kind,organization,protocol,repository_id') throw new Error('shape');
    for (const source of [snapshot.exchange, snapshot.organization]) {
      if (!source || !Number.isFinite(Date.parse(source.observed_at))) throw new Error('source');
      if (source.status === 'unavailable') {
        if (source.code !== 'source_unavailable' || Object.keys(source).sort().join(',') !== 'code,observed_at,status') throw new Error('failure');
      } else if (source.status !== 'observed' || source.snapshot.repository_id !== repositoryId || Object.keys(source).sort().join(',') !== 'observed_at,snapshot,status') throw new Error('identity');
    }
    if (snapshot.organization.status === 'observed') decodeOperatorOrganizationSnapshot(snapshot.organization.snapshot, repositoryId);
    if (snapshot.exchange.status === 'observed' && (snapshot.exchange.snapshot.protocol !== 1 || snapshot.exchange.snapshot.kind !== 'operator_work_exchange_snapshot')) throw new Error('exchange');
  } catch (error) {
    throw new OperatorCollaborationError('collaboration_repository_mismatch', 'invalid scoped collaboration source', error);
  }

}

function registeredRepositoryRoot(input: ReadOperatorCollaborationSnapshotInput): string {
  let repos: ReturnType<typeof readRepoHarnessRegistryStrictSnapshot>['repos'];
  try {
    repos = readRepoHarnessRegistryStrictSnapshot({ env: input.env, adoptedOnly: false }).repos;
  } catch (error) {
    throw new OperatorCollaborationError('registry_unavailable', 'cannot read the fleet registry authority', error);
  }
  const repository = repos.find((candidate) => candidate.id === input.repository_id);
  if (repository === undefined) {
    throw new OperatorCollaborationError('repository_not_found', `repository ${input.repository_id} is not registered`);
  }
  return repository.path;
}

export function readOperatorCollaborationSnapshot(
  input: ReadOperatorCollaborationSnapshotInput,
): OperatorCollaborationSnapshotV2 {
  const repoRoot = registeredRepositoryRoot(input);
  const observe = <T>(reader: () => T): import('../../core/operator/collaboration-snapshot').OperatorCollaborationSourceObservation<T> => {
    try { return { status: 'observed', snapshot: reader(), observed_at: new Date().toISOString() }; }
    catch (error) {
      if (error instanceof OperatorCollaborationError && error.code === 'collaboration_repository_mismatch') throw error;
      return { status: 'unavailable', code: 'source_unavailable', observed_at: new Date().toISOString() };
    }
  };
  const exchange = observe(() => {
    const collection = collectCollaborativeWorkExchange({ repo_root: repoRoot, read_execution_offers: () => [] });
    const snapshot = projectOperatorWorkExchangeSnapshot({ snapshot: collection.snapshot, mode: collection.mode, degraded_sources: collection.degraded_sources, changed_sources: collection.changed_sources });
    if (snapshot.repository_id !== input.repository_id) throw new OperatorCollaborationError('collaboration_repository_mismatch', 'exchange repository differs from request');
    return snapshot;
  });
  const organization = observe(() => {
    const board = collectEngineeringBoard({ repo_root: repoRoot, env: input.env });
    const overlay = validateEngineeringOverlaySnapshot(board.overlay);
    const attention = validateOrganizationAttentionSnapshot(board.organization_attention);
    if (overlay.repository_id !== input.repository_id) throw new OperatorCollaborationError('collaboration_repository_mismatch', 'organization repository differs from request');
    return projectOperatorOrganizationSnapshot(overlay, attention);
  });
  const projected: OperatorCollaborationSnapshotV2 = {
    protocol: OPERATOR_COLLABORATION_PROTOCOL, kind: OPERATOR_COLLABORATION_SNAPSHOT_KIND,
    repository_id: input.repository_id, exchange, organization,
  };
  assertOperatorCollaborationSnapshotIdentity(projected, input.repository_id);
  return projected;
}
