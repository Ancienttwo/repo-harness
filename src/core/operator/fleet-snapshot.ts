import {
  FLEET_BOARD_PROTOCOL,
  fleetBoardErrorMessage,
  type FleetBoardCardV1,
  type FleetBoardColumn,
  type FleetBoardCountsV1,
  type FleetBoardErrorCode,
  type FleetBoardFeedbackSummaryV1,
  type FleetBoardInboxSummaryV1,
  type FleetBoardSnapshotV1,
  type FleetBoardSnapshotConsistency,
  type FleetRepositoryBoardV1,
  type FleetRepositoryStatus,
} from '../fleet/board';

/**
 * Browser-facing view of one Fleet snapshot.
 *
 * The Fleet read model remains the authority for every semantic field.  This
 * transport view only removes the machine-local repository root before the
 * document crosses the HTTP boundary.
 */
export type OperatorFleetColumn = FleetBoardColumn;
export type OperatorFleetSnapshotConsistency = FleetBoardSnapshotConsistency;
export type OperatorFleetCountsV1 = FleetBoardCountsV1;
export type OperatorFleetErrorV1 = Readonly<{
  readonly code: FleetBoardErrorCode;
  readonly message: string;
}>;
export type OperatorFleetFeedbackSummaryV1 = FleetBoardFeedbackSummaryV1;
export type OperatorFleetInboxSummaryV1 = FleetBoardInboxSummaryV1;
export type OperatorFleetCardV1 = FleetBoardCardV1;

export interface OperatorFleetRepositoryV1 {
  readonly repository_id: string;
  readonly access_mode: 'read_only' | 'read_write';
  readonly status: FleetRepositoryStatus;
  readonly snapshot_consistency: OperatorFleetSnapshotConsistency;
  readonly cards: readonly OperatorFleetCardV1[];
  readonly error: OperatorFleetErrorV1 | null;
}

export interface OperatorFleetSnapshotV1 extends Omit<FleetBoardSnapshotV1, 'kind' | 'repositories' | 'snapshot_sha256'> {
  readonly kind: 'operator_fleet_snapshot';
  readonly repositories: readonly OperatorFleetRepositoryV1[];
  /** Digest of the canonical source snapshot, not of this redacted document. */
  readonly source_snapshot_sha256: string;
}

function projectCard(card: FleetBoardCardV1): OperatorFleetCardV1 {
  const mergeReadiness = card.merge_readiness === null
    ? null
    : Object.freeze({
        ...card.merge_readiness,
        blockers: Object.freeze(card.merge_readiness.blockers.map((blocker) => Object.freeze({ ...blocker }))),
      });
  return Object.freeze({
    ...card,
    merge_readiness: mergeReadiness,
    blocker_codes: Object.freeze([...card.blocker_codes]),
    feedback: Object.freeze({
      ...card.feedback,
      repair_actions: Object.freeze([...card.feedback.repair_actions]),
    }),
    inbox: Object.freeze({ ...card.inbox }),
  });
}

function projectRepository(repository: FleetRepositoryBoardV1): OperatorFleetRepositoryV1 {
  const { repo_root: _repoRoot, error, ...publicRepository } = repository;
  return Object.freeze({
    ...publicRepository,
    cards: Object.freeze(repository.cards.map(projectCard)),
    error: error === null
      ? null
      : Object.freeze({
          code: error.code,
          message: fleetBoardErrorMessage(error.code),
        }),
  });
}

/**
 * Project the canonical Fleet read model into a browser-safe document.
 *
 * This function deliberately does not classify cards, recalculate counts, or
 * derive attention from labels.  The output keeps the Fleet protocol and
 * digest so consumers can correlate the transport view with the source read
 * model while absolute paths and diagnostic causes stay server-side.
 */
export function projectOperatorFleetSnapshot(
  snapshot: FleetBoardSnapshotV1,
): OperatorFleetSnapshotV1 {
  if (snapshot.protocol !== FLEET_BOARD_PROTOCOL) {
    throw new Error(`unsupported Fleet snapshot protocol: ${String(snapshot.protocol)}`);
  }

  const repositories = Object.freeze(snapshot.repositories.map(projectRepository));
  const { snapshot_sha256: sourceSnapshotSha256, ...publicSnapshot } = snapshot;
  return Object.freeze({
    ...publicSnapshot,
    kind: 'operator_fleet_snapshot',
    repositories,
    source_snapshot_sha256: sourceSnapshotSha256,
  });
}
