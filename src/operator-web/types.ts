/** Browser projections import their transport types from the core authority. */
export type {
  OperatorCollaborationActorKind,
  OperatorCollaborationConsistency,
  OperatorCollaborationExecutionContextKind,
  OperatorCollaborationHandoffV1,
  OperatorCollaborationMode,
  OperatorCollaborationOpportunityReason,
  OperatorCollaborationOpportunityV1,
  OperatorCollaborationParticipantV1,
  OperatorCollaborationSignalV1,
  OperatorCollaborationSnapshotV1,
  OperatorCollaborationSource,
  OperatorCollaborationThreadV1,
} from '../core/operator/collaboration-snapshot';
export type {
  OperatorFleetCardV1,
  OperatorFleetColumn,
  OperatorFleetCountsV1,
  OperatorFleetErrorV1,
  OperatorFleetFeedbackSummaryV1,
  OperatorFleetInboxSummaryV1,
  OperatorFleetRepositoryV1,
  OperatorFleetSnapshotConsistency,
  OperatorFleetSnapshotV1,
} from '../core/operator/fleet-snapshot';

import type {
  OperatorCollaborationHandoffV1,
  OperatorCollaborationOpportunityV1,
  OperatorCollaborationParticipantV1,
  OperatorCollaborationSignalV1,
  OperatorCollaborationSnapshotV1,
  OperatorCollaborationSource,
  OperatorCollaborationThreadV1,
} from '../core/operator/collaboration-snapshot';
import type {
  OperatorFleetCardV1,
  OperatorFleetColumn,
  OperatorFleetRepositoryV1,
  OperatorFleetSnapshotConsistency,
  OperatorFleetSnapshotV1,
} from '../core/operator/fleet-snapshot';

/**
 * The Fleet protocol the browser transport accepts, restated as a literal
 * because `src/core/fleet/board.ts` owns a Node `createHash` import that must
 * not enter the browser bundle. `OperatorFleetSnapshotV1['protocol']` is that
 * module's literal type, so a drift from the core constant fails typecheck
 * here rather than at runtime.
 */
export const OPERATOR_FLEET_PAYLOAD_PROTOCOL: OperatorFleetSnapshotV1['protocol'] = 3;

/**
 * The collaboration protocol the browser transport accepts, restated for the
 * same reason and typed against the core literal, so a bump that forgets the
 * browser fails typecheck.
 */
export const OPERATOR_COLLABORATION_PAYLOAD_PROTOCOL: OperatorCollaborationSnapshotV1['protocol'] = 1;

export interface OperatorApiErrorV1 {
  readonly code: string;
  readonly message: string;
  readonly next_action: string;
}

export interface OperatorApiErrorEnvelopeV1 {
  readonly error: OperatorApiErrorV1;
}

export const OPERATOR_PAYLOAD_INVALID_ERROR: OperatorApiErrorV1 = Object.freeze({
  code: 'operator_payload_invalid',
  message: 'Fleet snapshot response is invalid',
  next_action: 'Run `repo-harness fleet board --json` for diagnostics, then retry.',
});

/** Thrown only after the complete browser transport contract fails decoding. */
export class OperatorPayloadError extends Error {
  readonly code = OPERATOR_PAYLOAD_INVALID_ERROR.code;
  readonly next_action = OPERATOR_PAYLOAD_INVALID_ERROR.next_action;

  constructor() {
    super(OPERATOR_PAYLOAD_INVALID_ERROR.message);
    this.name = 'OperatorPayloadError';
  }
}

export type OperatorSnapshotViewState =
  | { readonly kind: 'loading'; readonly previous: OperatorFleetSnapshotV1 | null }
  | { readonly kind: 'stable'; readonly snapshot: OperatorFleetSnapshotV1 }
  | { readonly kind: 'empty'; readonly snapshot: OperatorFleetSnapshotV1 }
  | { readonly kind: 'repo-degraded'; readonly snapshot: OperatorFleetSnapshotV1 }
  | { readonly kind: 'changed-during-read'; readonly snapshot: OperatorFleetSnapshotV1 }
  | {
      readonly kind: 'stale';
      readonly snapshot: OperatorFleetSnapshotV1;
      readonly error: OperatorApiErrorV1;
    }
  | { readonly kind: 'fatal'; readonly error: OperatorApiErrorV1 };

export const OPERATOR_COLUMNS: readonly { readonly id: OperatorFleetColumn; readonly label: string }[] = [
  { id: 'available', label: 'Available' },
  { id: 'working', label: 'Working' },
  { id: 'in_review', label: 'In review' },
  { id: 'ready_to_merge', label: 'Ready to merge' },
  { id: 'done', label: 'Done' },
];

export function snapshotViewKind(snapshot: OperatorFleetSnapshotV1): Exclude<OperatorSnapshotViewState['kind'], 'loading' | 'stale' | 'fatal'> {
  if (snapshot.repositories.length === 0) return 'empty';
  if (
    snapshot.snapshot_consistency === 'changed_during_read'
    || snapshot.repositories.some((repository) => repository.snapshot_consistency === 'changed_during_read')
  ) return 'changed-during-read';
  if (
    snapshot.snapshot_consistency === 'degraded'
    || snapshot.repositories.some((repository) => repository.status === 'unreadable' || repository.snapshot_consistency === 'degraded')
  ) return 'repo-degraded';
  return 'stable';
}

export function projectSnapshotViewState(snapshot: OperatorFleetSnapshotV1): OperatorSnapshotViewState {
  const kind = snapshotViewKind(snapshot);
  return { kind, snapshot } as OperatorSnapshotViewState;
}

export function allCards(snapshot: OperatorFleetSnapshotV1): readonly OperatorFleetCardV1[] {
  return snapshot.repositories.flatMap((repository) => repository.cards);
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasRequiredString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.includes(value as T);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || hasRequiredString(value);
}

const SNAPSHOT_CONSISTENCIES = ['stable', 'changed_during_read', 'degraded'] as const;
const COLUMNS = ['available', 'working', 'in_review', 'ready_to_merge', 'done'] as const;
const ATTENTION_OWNERS = ['user', 'agent', 'external', 'none'] as const;
const ERROR_CODES = [
  'repo_unreadable',
  'repo_authority_invalid',
  'repo_snapshot_changed',
  'repo_board_unavailable',
  'repo_publication_unreadable',
  'repo_readiness_unavailable',
  'repo_feedback_unreadable',
  'repo_inbox_unreadable',
  'repo_collection_timeout',
] as const;
const EXECUTION_READINESS = ['execution_ready', 'planning_required', 'inline_ready', 'unsupported'] as const;
const LEASE_STATES = ['available', 'reserving', 'bound', 'completing', 'reviewing', 'released', 'unknown'] as const;
const FEEDBACK_REPAIRS = ['resume_same_owner', 'explicit_takeover'] as const;
const MERGE_BLOCKERS = [
  'receipt_unavailable',
  'publication_claim_mismatch',
  'publication_pointer_mismatch',
  'lease_not_reviewing',
  'provider_unavailable',
  'provider_data_incomplete',
  'changed_during_read',
  'pr_not_open',
  'draft',
  'head_moved',
  'base_moved_since_verification',
  'review_subject_mismatch',
  'verification_evidence_stale',
  'checks_failed',
  'checks_pending',
  'acceptance_missing',
  'required_reviews_missing',
  'changes_requested',
  'unresolved_threads',
  'not_mergeable',
  'task_revision_mismatch',
  'already_integrated',
] as const;
const MERGE_ATTENTION_OWNERS = ['agent', 'user', 'external'] as const;
const MERGE_INTEGRATION_MODES = ['unmerged', 'ancestor', 'absorbed', 'unavailable'] as const;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const GIT_OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
const COLLABORATION_RECORD_ID_PATTERN = /^[0-9a-f]{64}$/u;
const COLLABORATION_MODES = ['off', 'shadow', 'active'] as const;
const COLLABORATION_SOURCES = ['signals', 'handoffs', 'adoptions', 'execution_offers'] as const;
const COLLABORATION_ACTOR_KINDS = ['module_engineer', 'delegated_worker'] as const;
const COLLABORATION_EXECUTION_CONTEXT_KINDS = [
  'delegated_worker',
  'bound_task',
  'publication',
  'none',
] as const;
const COLLABORATION_OPPORTUNITY_REASONS = [
  'unadopted_handoff',
  'low_contributor_coverage',
  'cross_thread_reference',
  'recent_activity',
  'artifact_rich_thread',
  'exploration_slot',
] as const;

function requireRecord(value: unknown): UnknownRecord {
  if (!isRecord(value)) throw new OperatorPayloadError();
  return value;
}

function requireString(value: unknown): string {
  if (!hasRequiredString(value)) throw new OperatorPayloadError();
  return value;
}

function requireSha256(value: unknown): string {
  const digest = requireString(value);
  if (!SHA256_PATTERN.test(digest)) throw new OperatorPayloadError();
  return digest;
}

function requireGitOid(value: unknown): string {
  const oid = requireString(value);
  if (!GIT_OID_PATTERN.test(oid)) throw new OperatorPayloadError();
  return oid;
}

function requireNullableString(value: unknown): string | null {
  if (!isNullableString(value)) throw new OperatorPayloadError();
  return value;
}

function requireNonNegativeInteger(value: unknown): number {
  if (!isSafeNonNegativeInteger(value)) throw new OperatorPayloadError();
  return value;
}

function requirePositiveInteger(value: unknown): number {
  if (!isSafePositiveInteger(value)) throw new OperatorPayloadError();
  return value;
}

function requireOneOf<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!isOneOf(value, choices)) throw new OperatorPayloadError();
  return value;
}

function requireBoolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new OperatorPayloadError();
  return value;
}

function requireArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new OperatorPayloadError();
  return value;
}

function decodeError(value: unknown): OperatorFleetRepositoryV1['error'] {
  if (value === null) return null;
  const error = requireRecord(value);
  if (!isOneOf(error.code, ERROR_CODES) || !hasRequiredString(error.message)) throw new OperatorPayloadError();
  return Object.freeze({ code: error.code, message: error.message });
}

function decodeMergeReadiness(value: unknown): OperatorFleetCardV1['merge_readiness'] {
  if (value === null) return null;
  const readiness = requireRecord(value);
  if (readiness.protocol !== 1 || readiness.kind !== 'repo-harness-merge-readiness') throw new OperatorPayloadError();
  const publicationId = requireString(readiness.publication_id);
  const ready = requireBoolean(readiness.ready);
  const expectedHeadSha = requireGitOid(readiness.expected_head_sha);
  const expectedBaseSha = requireGitOid(readiness.expected_base_sha);
  const integrationMode = requireOneOf(readiness.integration_mode, MERGE_INTEGRATION_MODES);
  const attentionOwner = requireOneOf(readiness.attention_owner, ATTENTION_OWNERS);
  const blockers: Array<NonNullable<OperatorFleetCardV1['merge_readiness']>['blockers'][number]> = [];
  for (const blockerValue of requireArray(readiness.blockers)) {
    const blocker = requireRecord(blockerValue);
    if (!isOneOf(blocker.code, MERGE_BLOCKERS) || !isOneOf(blocker.attention_owner, MERGE_ATTENTION_OWNERS)) {
      throw new OperatorPayloadError();
    }
    blockers.push(Object.freeze({ code: blocker.code, attention_owner: blocker.attention_owner }));
  }
  return Object.freeze({
    protocol: 1,
    kind: 'repo-harness-merge-readiness',
    publication_id: publicationId,
    ready,
    expected_head_sha: expectedHeadSha,
    expected_base_sha: expectedBaseSha,
    integration_mode: integrationMode,
    attention_owner: attentionOwner,
    blockers: Object.freeze(blockers),
  });
}

function decodeCard(value: unknown, repositoryId: string): OperatorFleetCardV1 {
  const card = requireRecord(value);
  if (!hasRequiredString(card.repository_id) || card.repository_id !== repositoryId) throw new OperatorPayloadError();
  const taskId = requireString(card.task_id);
  const taskRevision = requireString(card.task_revision);
  const taskLabel = requireNullableString(card.task_label);
  const taskIndex = card.task_index === null ? null : requireNonNegativeInteger(card.task_index);
  const claimId = requireNullableString(card.claim_id);
  const generation = card.generation === null ? null : requireNonNegativeInteger(card.generation);
  const column = card.column === null ? null : requireOneOf(card.column, COLUMNS);
  const attentionOwner = requireOneOf(card.attention_owner, ATTENTION_OWNERS);
  const executionReadiness = card.execution_readiness === null
    ? null
    : requireOneOf(card.execution_readiness, EXECUTION_READINESS);
  const leaseState = requireOneOf(card.lease_state, LEASE_STATES);
  const publicationId = requireNullableString(card.publication_id);
  const headSha = card.head_sha === null ? null : requireGitOid(card.head_sha);
  const mergeReadiness = decodeMergeReadiness(card.merge_readiness);
  const blockerCodes = requireArray(card.blocker_codes).map((code) => requireOneOf(code, MERGE_BLOCKERS));
  const feedback = requireRecord(card.feedback);
  const pendingCount = requireNonNegativeInteger(feedback.pending_count);
  const noProgress = requireBoolean(feedback.no_progress);
  const repairActions = requireArray(feedback.repair_actions).map((repair) => requireOneOf(repair, FEEDBACK_REPAIRS));
  const inbox = requireRecord(card.inbox);
  const unreadCount = requireNonNegativeInteger(inbox.unread_count);
  const addressedToCurrentClaim = requireBoolean(inbox.addressed_to_current_claim);
  const deliveryState = requireOneOf(inbox.delivery_state, ['pending', 'delivered', 'acknowledged', 'failed', 'reconciliation_required'] as const);
  const runtimeReachability = requireOneOf(inbox.runtime_reachability, ['reachable', 'unavailable', 'unknown'] as const);
  const effectSha256 = requireNullableString(inbox.effect_sha256);
  const failureClass = inbox.failure_class === null ? null : requireOneOf(inbox.failure_class, [
    'none', 'binding_stale', 'claim_stale', 'capability_unsupported', 'adapter_unavailable',
    'receipt_missing', 'receipt_mismatch', 'unknown',
  ] as const);
  const snapshotConsistency = requireOneOf(card.snapshot_consistency, ['stable', 'changed_during_read'] as const);
  return Object.freeze({
    repository_id: repositoryId,
    task_id: taskId,
    task_revision: taskRevision,
    task_label: taskLabel,
    task_index: taskIndex,
    claim_id: claimId,
    generation,
    column,
    attention_owner: attentionOwner,
    execution_readiness: executionReadiness,
    lease_state: leaseState,
    publication_id: publicationId,
    head_sha: headSha,
    merge_readiness: mergeReadiness,
    blocker_codes: Object.freeze(blockerCodes),
    feedback: Object.freeze({
      pending_count: pendingCount,
      no_progress: noProgress,
      repair_actions: Object.freeze(repairActions),
    }),
    inbox: Object.freeze({
      unread_count: unreadCount,
      addressed_to_current_claim: addressedToCurrentClaim,
      delivery_state: deliveryState,
      runtime_reachability: runtimeReachability,
      effect_sha256: effectSha256,
      failure_class: failureClass,
    }),
    snapshot_consistency: snapshotConsistency,
  });
}

function decodeRepository(value: unknown): OperatorFleetRepositoryV1 {
  const repository = requireRecord(value);
  const repositoryId = requireString(repository.repository_id);
  const accessMode = requireOneOf(repository.access_mode, ['read_only', 'read_write'] as const);
  const status = requireOneOf(repository.status, ['ok', 'unreadable'] as const);
  const snapshotConsistency = requireOneOf(repository.snapshot_consistency, SNAPSHOT_CONSISTENCIES);
  const error = decodeError(repository.error);
  const cards = requireArray(repository.cards).map((card) => decodeCard(card, repositoryId));
  if (repository.status === 'unreadable' && repository.error === null) throw new OperatorPayloadError();
  return Object.freeze({
    repository_id: repositoryId,
    access_mode: accessMode,
    status,
    snapshot_consistency: snapshotConsistency,
    cards: Object.freeze(cards),
    error,
  });
}

function requireCollaborationRecordId(value: unknown): string {
  const id = requireString(value);
  if (!COLLABORATION_RECORD_ID_PATTERN.test(id)) throw new OperatorPayloadError();
  return id;
}

function requireInstant(value: unknown): string {
  const instant = requireString(value);
  if (Number.isNaN(Date.parse(instant))) throw new OperatorPayloadError();
  return instant;
}

function decodeCollaborationThread(value: unknown): OperatorCollaborationThreadV1 {
  const thread = requireRecord(value);
  return Object.freeze({
    thread_key: requireString(thread.thread_key),
    signal_count: requireNonNegativeInteger(thread.signal_count),
    distinct_contributor_count: requireNonNegativeInteger(thread.distinct_contributor_count),
    latest_signal_at: requireInstant(thread.latest_signal_at),
    artifact_ref_count: requireNonNegativeInteger(thread.artifact_ref_count),
    unadopted_handoff_count: requireNonNegativeInteger(thread.unadopted_handoff_count),
    adoption_count: requireNonNegativeInteger(thread.adoption_count),
    cross_thread_reference_count: requireNonNegativeInteger(thread.cross_thread_reference_count),
    recency_rank: requireNonNegativeInteger(thread.recency_rank),
    hotspot_score: requireNonNegativeInteger(thread.hotspot_score),
    thread_sha256: requireSha256(thread.thread_sha256),
  });
}

function decodeCollaborationSignal(value: unknown): OperatorCollaborationSignalV1 {
  const signal = requireRecord(value);
  return Object.freeze({
    signal_id: requireCollaborationRecordId(signal.signal_id),
    signal_sha256: requireSha256(signal.signal_sha256),
    thread_key: requireString(signal.thread_key),
    actor_lineage: requireString(signal.actor_lineage),
    title: requireString(signal.title),
    labels: Object.freeze(requireArray(signal.labels).map(requireString)),
    artifact_ref_count: requireNonNegativeInteger(signal.artifact_ref_count),
    created_at: requireInstant(signal.created_at),
    superseded: requireBoolean(signal.superseded),
  });
}

function decodeCollaborationHandoff(value: unknown): OperatorCollaborationHandoffV1 {
  const handoff = requireRecord(value);
  return Object.freeze({
    handoff_id: requireCollaborationRecordId(handoff.handoff_id),
    handoff_sha256: requireSha256(handoff.handoff_sha256),
    thread_key: requireString(handoff.thread_key),
    actor_lineage: requireString(handoff.actor_lineage),
    trigger: requireString(handoff.trigger),
    goal: requireString(handoff.goal),
    next_action_count: requireNonNegativeInteger(handoff.next_action_count),
    open_hypothesis_count: requireNonNegativeInteger(handoff.open_hypothesis_count),
    adoption_count: requireNonNegativeInteger(handoff.adoption_count),
    created_at: requireInstant(handoff.created_at),
    // Null is the withheld `bound_task` context, so it is decoded rather than
    // defaulted: an absent key would silently become the same value as a proof
    // that did not hold.
    execution_context_kind: handoff.execution_context_kind === null
      ? null
      : requireOneOf(handoff.execution_context_kind, COLLABORATION_EXECUTION_CONTEXT_KINDS),
  });
}

function decodeCollaborationParticipant(value: unknown): OperatorCollaborationParticipantV1 {
  const participant = requireRecord(value);
  return Object.freeze({
    actor_lineage: requireString(participant.actor_lineage),
    actor_kind: requireOneOf(participant.actor_kind, COLLABORATION_ACTOR_KINDS),
    latest_actor_sha256: requireSha256(participant.latest_actor_sha256),
    signal_count: requireNonNegativeInteger(participant.signal_count),
    handoff_count: requireNonNegativeInteger(participant.handoff_count),
    thread_keys: Object.freeze(requireArray(participant.thread_keys).map(requireString)),
    latest_activity_at: requireInstant(participant.latest_activity_at),
  });
}

function decodeCollaborationOpportunity(value: unknown): OperatorCollaborationOpportunityV1 {
  const opportunity = requireRecord(value);
  return Object.freeze({
    thread_key: requireString(opportunity.thread_key),
    reason: requireOneOf(opportunity.reason, COLLABORATION_OPPORTUNITY_REASONS),
    source_refs: Object.freeze(requireArray(opportunity.source_refs).map(requireString)),
  });
}

function decodeCollaborationSources(value: unknown): readonly OperatorCollaborationSource[] {
  return Object.freeze(requireArray(value).map((source) => requireOneOf(source, COLLABORATION_SOURCES)));
}

/**
 * Decode the complete collaboration payload before any panel receives it.
 *
 * A payload that does not decode raises `OperatorPayloadError` and the panel
 * shows a stated failure. It never falls back to a partial document: a lane list
 * that silently dropped the entries it could not read would be the healthy-empty
 * reading the collaboration program exists to refuse.
 */
export function decodeOperatorCollaborationSnapshot(value: unknown): OperatorCollaborationSnapshotV1 {
  const snapshot = requireRecord(value);
  if (
    snapshot.protocol !== OPERATOR_COLLABORATION_PAYLOAD_PROTOCOL
    || snapshot.kind !== 'operator_collaboration_snapshot'
  ) {
    throw new OperatorPayloadError();
  }
  return Object.freeze({
    protocol: OPERATOR_COLLABORATION_PAYLOAD_PROTOCOL,
    kind: 'operator_collaboration_snapshot',
    repository_id: requireString(snapshot.repository_id),
    mode: requireOneOf(snapshot.mode, COLLABORATION_MODES),
    snapshot_consistency: requireOneOf(snapshot.snapshot_consistency, SNAPSHOT_CONSISTENCIES),
    degraded_sources: decodeCollaborationSources(snapshot.degraded_sources),
    changed_sources: decodeCollaborationSources(snapshot.changed_sources),
    threads: Object.freeze(requireArray(snapshot.threads).map(decodeCollaborationThread)),
    signals: Object.freeze(requireArray(snapshot.signals).map(decodeCollaborationSignal)),
    handoffs: Object.freeze(requireArray(snapshot.handoffs).map(decodeCollaborationHandoff)),
    participants: Object.freeze(requireArray(snapshot.participants).map(decodeCollaborationParticipant)),
    opportunities: Object.freeze(requireArray(snapshot.opportunities).map(decodeCollaborationOpportunity)),
    unverified_execution_context_count: requireNonNegativeInteger(snapshot.unverified_execution_context_count),
    source_snapshot_sha256: requireSha256(snapshot.source_snapshot_sha256),
  });
}

/** Decode the complete browser payload before any component receives it. */
export function decodeOperatorFleetSnapshot(value: unknown): OperatorFleetSnapshotV1 {
  const snapshot = requireRecord(value);
  if (snapshot.protocol !== OPERATOR_FLEET_PAYLOAD_PROTOCOL || snapshot.kind !== 'operator_fleet_snapshot') {
    throw new OperatorPayloadError();
  }
  const registryRevision = requireSha256(snapshot.registry_revision);
  const sequence = requirePositiveInteger(snapshot.sequence);
  const observedAt = requireString(snapshot.observed_at);
  if (Number.isNaN(Date.parse(observedAt))) throw new OperatorPayloadError();
  const snapshotConsistency = requireOneOf(snapshot.snapshot_consistency, SNAPSHOT_CONSISTENCIES);
  const sourceSnapshotSha256 = requireSha256(snapshot.source_snapshot_sha256);
  const counts = requireRecord(snapshot.counts);
  const decodedCounts = Object.freeze({
    available: requireNonNegativeInteger(counts.available),
    working: requireNonNegativeInteger(counts.working),
    in_review: requireNonNegativeInteger(counts.in_review),
    ready_to_merge: requireNonNegativeInteger(counts.ready_to_merge),
    done: requireNonNegativeInteger(counts.done),
    unreadable: requireNonNegativeInteger(counts.unreadable),
  });
  const repositories = requireArray(snapshot.repositories).map(decodeRepository);
  return Object.freeze({
    protocol: OPERATOR_FLEET_PAYLOAD_PROTOCOL,
    kind: 'operator_fleet_snapshot',
    registry_revision: registryRevision,
    sequence,
    observed_at: observedAt,
    snapshot_consistency: snapshotConsistency,
    repositories: Object.freeze(repositories),
    counts: decodedCounts,
    source_snapshot_sha256: sourceSnapshotSha256,
  });
}
