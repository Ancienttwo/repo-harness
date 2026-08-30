import {
  projectOperatorCollaborationSnapshot,
  type OperatorCollaborationSnapshotV1,
} from '../../core/operator/collaboration-snapshot';
import { collectCollaborativeWorkExchange } from '../collaboration/work-exchange';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';

/**
 * The board's read of one repository's collaboration substrate.
 *
 * The mirror image of the board's one write: the browser names a registered
 * repository and nothing else, and this effect re-resolves the repository root
 * locally, so a machine-local path never crosses the HTTP boundary in either
 * direction.
 *
 * Nothing here is read-write gated. `repository_read_only` is a refusal the
 * task-message write owes; a read owes no such thing, and refusing to show a
 * read-only repository's lanes would hide state the operator is entitled to see.
 *
 * Every failure is typed. There is no branch that returns an empty snapshot: an
 * unreadable signal set makes `collectCollaborativeWorkExchange()` throw, and
 * that throw becomes `collaboration_snapshot_unavailable` rather than a quiet
 * zero-lane document, because a collaboration store that cannot be read must
 * never render as a collaboration store with nothing in it.
 */
export type OperatorCollaborationErrorCode =
  | 'registry_unavailable'
  | 'repository_not_found'
  | 'collaboration_snapshot_unavailable';

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
): OperatorCollaborationSnapshotV1 {
  const repoRoot = registeredRepositoryRoot(input);
  let collection: ReturnType<typeof collectCollaborativeWorkExchange>;
  try {
    collection = collectCollaborativeWorkExchange({
      repo_root: repoRoot,
      // The board holds no `EngineerPrincipalV1`, so it cannot ask the scheduling
      // plane what this participant could pick up. The reader is required rather
      // than optional exactly so that decision has to be made here, and the
      // decision is that the board does not ask: the projection drops
      // `execution_offers` entirely, so this list never reaches a reader. Passing
      // a reader that throws instead would mark the source `degraded` and claim
      // the offers were unreadable, which is a different and false statement.
      read_execution_offers: () => [],
    });
  } catch (error) {
    throw new OperatorCollaborationError(
      'collaboration_snapshot_unavailable',
      `cannot read the collaboration store for repository ${input.repository_id}`,
      error,
    );
  }
  return projectOperatorCollaborationSnapshot({
    snapshot: collection.snapshot,
    mode: collection.mode,
    // Assigned straight across, so the projection's restated source vocabulary
    // cannot drift from the collector's without failing typecheck here.
    degraded_sources: collection.degraded_sources,
    changed_sources: collection.changed_sources,
  });
}
