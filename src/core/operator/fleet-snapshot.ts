import { SESSION_SELECTOR_KEYS } from '../sessions/session-selector';
import type { AdmittedTaskSession } from '../sessions/task-sessions';
import { isOperatorServiceEpoch } from './observation-identity';
import {
  FLEET_BOARD_PROTOCOL,
  fleetBoardErrorMessage,
  type FleetBoardCardV2,
  type FleetBoardColumn,
  type FleetBoardCountsV1,
  type FleetBoardErrorCode,
  type FleetBoardFeedbackSummaryV1,
  type FleetBoardInboxSummaryV1,
  type FleetBoardSnapshotV2,
  type FleetBoardSnapshotConsistency,
  type FleetRepositoryBoardV2,
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
export type OperatorFleetCardV1 = FleetBoardCardV2;

export interface OperatorFleetRepositoryV1 {
  readonly repository_id: string;
  readonly display_name: string;
  readonly access_mode: 'read_only' | 'read_write';
  readonly status: FleetRepositoryStatus;
  readonly snapshot_consistency: OperatorFleetSnapshotConsistency;
  readonly cards: readonly OperatorFleetCardV1[];
  readonly error: OperatorFleetErrorV1 | null;
}

export interface OperatorFleetSnapshotV1 extends Omit<FleetBoardSnapshotV2, 'protocol' | 'kind' | 'repositories' | 'snapshot_sha256'> {
  readonly protocol: 8;
  readonly service_epoch: string;
  readonly kind: 'operator_fleet_snapshot';
  readonly repositories: readonly OperatorFleetRepositoryV1[];
  /** Digest of the canonical source snapshot, not of this redacted document. */
  readonly source_snapshot_sha256: string;
}

function projectExecution(execution: AdmittedTaskSession | null): AdmittedTaskSession | null {
  if (execution === null) return null;
  const selector = Object.fromEntries(SESSION_SELECTOR_KEYS.map(key => [key, execution.selector[key]])) as unknown as AdmittedTaskSession['selector'];
  return Object.freeze({ selector: Object.freeze(selector), admission_sha256: execution.admission_sha256,
    branch: execution.branch, runtime: execution.runtime, harness_kind: execution.harness_kind });
}

function projectCard(card: FleetBoardCardV2): OperatorFleetCardV1 {
  const mergeReadiness = card.merge_readiness === null ? null : Object.freeze({
    protocol: card.merge_readiness.protocol,
    kind: card.merge_readiness.kind,
    provider_repository_id: card.merge_readiness.provider_repository_id,
    repository: card.merge_readiness.repository,
    pr_number: card.merge_readiness.pr_number,
    ready: card.merge_readiness.ready,
    expected_head_sha: card.merge_readiness.expected_head_sha,
    expected_base_sha: card.merge_readiness.expected_base_sha,
    integration_mode: card.merge_readiness.integration_mode,
    attention_owner: card.merge_readiness.attention_owner,
    blockers: Object.freeze(card.merge_readiness.blockers.map((blocker) => Object.freeze({
      code: blocker.code,
      attention_owner: blocker.attention_owner,
      ...(blocker.detail === undefined ? {} : { detail: blocker.detail }),
    }))),
    check_failures: Object.freeze([...card.merge_readiness.check_failures]),
    required_check_coverage: card.merge_readiness.required_check_coverage,
    stack: card.merge_readiness.stack,
  });
  return Object.freeze({
    repository_id: card.repository_id,
    provider_repository_id: card.provider_repository_id,
    provider_issue_id: card.provider_issue_id,
    issue_state: card.issue_state,
    issue_revision: card.issue_revision,
    execution_status: card.execution_status,
    execution: projectExecution(card.execution),
    task_id: card.task_id,
    task_label: card.task_label,
    task_index: card.task_index,
    placement: Object.freeze(card.placement.kind === 'column'
      ? { kind: 'column' as const, column: card.placement.column }
      : card.placement.kind === 'alternate_workflow'
        ? { kind: 'alternate_workflow' as const, workflow: card.placement.workflow }
        : card.placement.kind === 'unclassified'
          ? { kind: 'unclassified' as const, reason: card.placement.reason }
          : { kind: 'preparation' as const }),
    attention_owner: card.attention_owner,
    execution_readiness: card.execution_readiness,
    readiness_blockers: card.readiness_blockers === null ? null : Object.freeze(card.readiness_blockers.map(blocker => Object.freeze(blocker.code === 'provider_ineligible'
      ? { code: blocker.code, attention_owner: blocker.attention_owner, eligibility_reasons: Object.freeze([...blocker.eligibility_reasons]) }
      : { code: blocker.code, attention_owner: blocker.attention_owner }))),
    merge_readiness: mergeReadiness,
    blocker_codes: Object.freeze(card.blocker_codes.map((code) => code)),
    feedback: Object.freeze({
      observation_status: card.feedback.observation_status,
      pending_count: card.feedback.pending_count,
      no_progress: card.feedback.no_progress,
      repair_actions: Object.freeze(card.feedback.repair_actions.map((action) => action)),
    }),
    inbox: Object.freeze({
      observation_status: card.inbox.observation_status,
      unread_count: card.inbox.unread_count,
      addressed_to_current_claim: card.inbox.addressed_to_current_claim,
    }),
    snapshot_consistency: card.snapshot_consistency,
    error: card.error === null
      ? null
      : Object.freeze({
          code: card.error.code,
          message: fleetBoardErrorMessage(card.error.code),
        }),
  });
}

function projectRepository(repository: FleetRepositoryBoardV2, displayName: (repoRoot: string) => string): OperatorFleetRepositoryV1 {
  const error = repository.error;
  return Object.freeze({
    repository_id: repository.repository_id,
    display_name: displayName(repository.repo_root),
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
 * derive attention from labels.  The output versions its browser contract separately and keeps the Fleet
 * digest so consumers can correlate the transport view with the source read
 * model while absolute paths and diagnostic causes stay server-side.
 */
export function projectOperatorFleetSnapshot(
  snapshot: FleetBoardSnapshotV2, serviceEpoch: string, displayName: (repoRoot: string) => string,
): OperatorFleetSnapshotV1 {
  if (!isOperatorServiceEpoch(serviceEpoch)) throw new Error('invalid operator service epoch');
  if (snapshot.protocol !== FLEET_BOARD_PROTOCOL) {
    throw new Error(`unsupported Fleet snapshot protocol: ${String(snapshot.protocol)}`);
  }

  const repositories = Object.freeze(snapshot.repositories.map((repository) => projectRepository(repository, displayName)));
  const sourceSnapshotSha256 = snapshot.snapshot_sha256;
  return Object.freeze({
    protocol: 8,
    service_epoch: serviceEpoch,
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
      unclassified: snapshot.counts.unclassified,
      preparation: snapshot.counts.preparation,
      alternate_workflow: snapshot.counts.alternate_workflow,
      isolated_execution: snapshot.counts.isolated_execution,
      known_tasks: snapshot.counts.known_tasks,
    }),
    source_snapshot_sha256: sourceSnapshotSha256,
  });
}
