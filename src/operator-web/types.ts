/** Browser projections import their transport types from the core authority. */
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
  OperatorFleetCardV1,
  OperatorFleetColumn,
  OperatorFleetRepositoryV1,
  OperatorFleetSnapshotConsistency,
  OperatorFleetSnapshotV1,
} from '../core/operator/fleet-snapshot';

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

export function cardsForColumn(
  snapshot: OperatorFleetSnapshotV1,
  column: OperatorFleetColumn,
): readonly OperatorFleetCardV1[] {
  return snapshot.repositories.flatMap((repository) =>
    repository.cards.filter((card) => card.column === column),
  );
}

export function attentionCards(snapshot: OperatorFleetSnapshotV1): readonly OperatorFleetCardV1[] {
  return snapshot.repositories.flatMap((repository) =>
    repository.cards.filter((card) => card.attention_owner !== 'none'),
  );
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

function requireRecord(value: unknown): UnknownRecord {
  if (!isRecord(value)) throw new OperatorPayloadError();
  return value;
}

function requireString(value: unknown): string {
  if (!hasRequiredString(value)) throw new OperatorPayloadError();
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

function decodeError(value: unknown): void {
  if (value === null) return;
  const error = requireRecord(value);
  if (!isOneOf(error.code, ERROR_CODES) || !hasRequiredString(error.message)) throw new OperatorPayloadError();
}

function decodeMergeReadiness(value: unknown): void {
  if (value === null) return;
  const readiness = requireRecord(value);
  if (readiness.protocol !== 1 || readiness.kind !== 'repo-harness-merge-readiness') throw new OperatorPayloadError();
  if (!hasRequiredString(readiness.publication_id) || typeof readiness.ready !== 'boolean') throw new OperatorPayloadError();
  if (!hasRequiredString(readiness.expected_head_sha) || !hasRequiredString(readiness.expected_base_sha)) throw new OperatorPayloadError();
  if (!isOneOf(readiness.integration_mode, MERGE_INTEGRATION_MODES)) throw new OperatorPayloadError();
  if (!isOneOf(readiness.attention_owner, ATTENTION_OWNERS)) throw new OperatorPayloadError();
  for (const blockerValue of requireArray(readiness.blockers)) {
    const blocker = requireRecord(blockerValue);
    if (!isOneOf(blocker.code, MERGE_BLOCKERS) || !isOneOf(blocker.attention_owner, MERGE_ATTENTION_OWNERS)) {
      throw new OperatorPayloadError();
    }
  }
}

function decodeCard(value: unknown, repositoryId: string): void {
  const card = requireRecord(value);
  if (!hasRequiredString(card.repository_id) || card.repository_id !== repositoryId) throw new OperatorPayloadError();
  if (!hasRequiredString(card.task_id) || !hasRequiredString(card.task_revision)) throw new OperatorPayloadError();
  if (!isNullableString(card.claim_id) || !(card.generation === null || isSafeNonNegativeInteger(card.generation))) throw new OperatorPayloadError();
  if (!(card.column === null || isOneOf(card.column, COLUMNS))) throw new OperatorPayloadError();
  if (!isOneOf(card.attention_owner, ATTENTION_OWNERS)) throw new OperatorPayloadError();
  if (!(card.execution_readiness === null || isOneOf(card.execution_readiness, EXECUTION_READINESS))) throw new OperatorPayloadError();
  if (!isOneOf(card.lease_state, LEASE_STATES)) throw new OperatorPayloadError();
  if (!isNullableString(card.publication_id) || !isNullableString(card.head_sha)) throw new OperatorPayloadError();
  decodeMergeReadiness(card.merge_readiness);
  if (!Array.isArray(card.blocker_codes) || card.blocker_codes.some((code) => !isOneOf(code, MERGE_BLOCKERS))) throw new OperatorPayloadError();
  const feedback = requireRecord(card.feedback);
  if (!isSafeNonNegativeInteger(feedback.pending_count) || typeof feedback.no_progress !== 'boolean') throw new OperatorPayloadError();
  if (!Array.isArray(feedback.repair_actions) || feedback.repair_actions.some((repair) => !isOneOf(repair, FEEDBACK_REPAIRS))) throw new OperatorPayloadError();
  const inbox = requireRecord(card.inbox);
  if (!isSafeNonNegativeInteger(inbox.unread_count) || typeof inbox.addressed_to_current_claim !== 'boolean') throw new OperatorPayloadError();
  if (!isOneOf(card.snapshot_consistency, ['stable', 'changed_during_read'] as const)) throw new OperatorPayloadError();
}

function decodeRepository(value: unknown): void {
  const repository = requireRecord(value);
  if (!hasRequiredString(repository.repository_id)) throw new OperatorPayloadError();
  if (!isOneOf(repository.access_mode, ['read_only', 'read_write'] as const)) throw new OperatorPayloadError();
  if (!isOneOf(repository.status, ['ok', 'unreadable'] as const)) throw new OperatorPayloadError();
  if (!isOneOf(repository.snapshot_consistency, SNAPSHOT_CONSISTENCIES)) throw new OperatorPayloadError();
  decodeError(repository.error);
  for (const card of requireArray(repository.cards)) decodeCard(card, repository.repository_id);
  if (repository.status === 'unreadable' && repository.error === null) throw new OperatorPayloadError();
}

/** Decode the complete browser payload before any component receives it. */
export function decodeOperatorFleetSnapshot(value: unknown): OperatorFleetSnapshotV1 {
  const snapshot = requireRecord(value);
  if (snapshot.protocol !== 1 || snapshot.kind !== 'operator_fleet_snapshot') throw new OperatorPayloadError();
  if (!hasRequiredString(snapshot.registry_revision) || !isSafePositiveInteger(snapshot.sequence)) throw new OperatorPayloadError();
  if (!hasRequiredString(snapshot.observed_at) || Number.isNaN(Date.parse(snapshot.observed_at))) throw new OperatorPayloadError();
  if (!isOneOf(snapshot.snapshot_consistency, SNAPSHOT_CONSISTENCIES)) throw new OperatorPayloadError();
  if (!SHA256_PATTERN.test(requireString(snapshot.source_snapshot_sha256))) throw new OperatorPayloadError();
  const counts = requireRecord(snapshot.counts);
  for (const key of ['available', 'working', 'in_review', 'ready_to_merge', 'done', 'unreadable'] as const) {
    if (!isSafeNonNegativeInteger(counts[key])) throw new OperatorPayloadError();
  }
  for (const repository of requireArray(snapshot.repositories)) decodeRepository(repository);
  return snapshot as unknown as OperatorFleetSnapshotV1;
}

export function formatObservedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}
