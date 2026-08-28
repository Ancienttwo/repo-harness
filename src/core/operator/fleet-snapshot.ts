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
  const mergeReadiness = card.merge_readiness === null ? null : Object.freeze({
    protocol: card.merge_readiness.protocol,
    kind: card.merge_readiness.kind,
    publication_id: card.merge_readiness.publication_id,
    ready: card.merge_readiness.ready,
    expected_head_sha: card.merge_readiness.expected_head_sha,
    expected_base_sha: card.merge_readiness.expected_base_sha,
    integration_mode: card.merge_readiness.integration_mode,
    attention_owner: card.merge_readiness.attention_owner,
    blockers: Object.freeze(card.merge_readiness.blockers.map((blocker) => Object.freeze({
      code: blocker.code,
      attention_owner: blocker.attention_owner,
    }))),
  });
  return Object.freeze({
    repository_id: card.repository_id,
    task_id: card.task_id,
    task_revision: card.task_revision,
    task_label: card.task_label,
    task_index: card.task_index,
    claim_id: card.claim_id,
    generation: card.generation,
    column: card.column,
    attention_owner: card.attention_owner,
    execution_readiness: card.execution_readiness,
    lease_state: card.lease_state,
    publication_id: card.publication_id,
    head_sha: card.head_sha,
    merge_readiness: mergeReadiness,
    blocker_codes: Object.freeze(card.blocker_codes.map((code) => code)),
    feedback: Object.freeze({
      pending_count: card.feedback.pending_count,
      no_progress: card.feedback.no_progress,
      repair_actions: Object.freeze(card.feedback.repair_actions.map((action) => action)),
    }),
    inbox: Object.freeze({
      unread_count: card.inbox.unread_count,
      addressed_to_current_claim: card.inbox.addressed_to_current_claim,
    }),
    snapshot_consistency: card.snapshot_consistency,
  });
}

function projectRepository(repository: FleetRepositoryBoardV1): OperatorFleetRepositoryV1 {
  const error = repository.error;
  return Object.freeze({
    repository_id: repository.repository_id,
    access_mode: repository.access_mode,
    status: repository.status,
    snapshot_consistency: repository.snapshot_consistency,
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
  const sourceSnapshotSha256 = snapshot.snapshot_sha256;
  return Object.freeze({
    protocol: snapshot.protocol,
    kind: 'operator_fleet_snapshot',
    registry_revision: snapshot.registry_revision,
    sequence: snapshot.sequence,
    observed_at: snapshot.observed_at,
    snapshot_consistency: snapshot.snapshot_consistency,
    repositories,
    counts: Object.freeze({
      available: snapshot.counts.available,
      working: snapshot.counts.working,
      in_review: snapshot.counts.in_review,
      ready_to_merge: snapshot.counts.ready_to_merge,
      done: snapshot.counts.done,
      unreadable: snapshot.counts.unreadable,
    }),
    source_snapshot_sha256: sourceSnapshotSha256,
  });
}
