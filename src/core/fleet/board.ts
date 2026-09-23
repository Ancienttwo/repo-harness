import { createHash } from 'crypto';

import type { TaskOfferBlockerV1, TaskOfferExecutionReadiness } from './task-offer';
import type { MergeReadinessBlockerCode, MergeReadinessV1 } from '../publication/merge-readiness';
import type { BoardLeaseState, TaskState } from '../state/types';
import type { AgentRuntimeFailureClass, AgentRuntimeAdapterKind, AgentRuntimeEffectState, AgentRuntimeReceiptKind } from '../engineers/agent-runtime-effect';

/** A fleet projection is its own read model; it never changes BoardColumn. */
export const FLEET_BOARD_PROTOCOL = 5 as const;
export const FLEET_BOARD_KIND = 'fleet_board_snapshot' as const;

export type FleetBoardColumn = 'available' | 'working' | 'in_review' | 'ready_to_merge' | 'done';
export type FleetBoardPlacement =
  | Readonly<{ kind: 'column'; column: FleetBoardColumn }>
  | Readonly<{ kind: 'preparation' }>
  | Readonly<{ kind: 'alternate_workflow'; workflow: 'inline' }>
  | Readonly<{ kind: 'unclassified'; reason: 'observation_failed' | 'canonical_missing' | 'task_drifted' | 'readiness_unavailable' | 'unsupported_readiness' | 'state_unmapped' }>;
export type FleetBoardAttentionOwner = 'user' | 'agent' | 'external' | 'none';
export type FleetBoardSnapshotConsistency = 'stable' | 'changed_during_read' | 'degraded';
export type FleetRepositoryStatus = 'ok' | 'unreadable';
export type RuntimeDeliveryState = 'pending' | 'delivered' | 'acknowledged' | 'failed' | 'reconciliation_required';
export type RuntimeReachability = 'reachable' | 'unavailable' | 'unknown';

export type FleetBoardErrorCode =
  | 'repo_unreadable'
  | 'repo_authority_invalid'
  | 'repo_snapshot_changed'
  | 'repo_board_unavailable'
  | 'repo_publication_unreadable'
  | 'repo_readiness_unavailable'
  | 'repo_feedback_unreadable'
  | 'repo_inbox_unreadable'
  | 'repo_runtime_effect_unreadable'
  | 'repo_collection_timeout';

export interface FleetBoardErrorV1 {
  readonly code: FleetBoardErrorCode;
  readonly message: string;
}

export interface FleetBoardDeliveryObservationV1 {
  readonly adapter_kind: AgentRuntimeAdapterKind;
  readonly effect_state: AgentRuntimeEffectState;
  readonly receipt_kind: AgentRuntimeReceiptKind | null;
  /** Notification observation time, never worker activity or receipt ACK time. */
  readonly observed_at: string;
  readonly observation_sequence: number;
  readonly observation_sha256: string;
}

export interface FleetBoardDeliveryEvidenceV1 {
  readonly candidate_count: number;
  readonly latest: FleetBoardDeliveryObservationV1 | null;
}

export interface FleetBoardInboxSummaryV1 {
  readonly delivery_evidence: FleetBoardDeliveryEvidenceV1 | null;
  readonly unread_count: number;
  readonly addressed_to_current_claim: boolean;
  readonly delivery_state: RuntimeDeliveryState;
  readonly runtime_reachability: RuntimeReachability;
  readonly effect_sha256: string | null;
  readonly failure_class: AgentRuntimeFailureClass | null;
}

export interface FleetBoardFeedbackSummaryV1 {
  readonly pending_count: number;
  readonly no_progress: boolean;
  readonly repair_actions: readonly ('resume_same_owner' | 'explicit_takeover')[];
}

export interface FleetBoardCardV1 {
  readonly repository_id: string;
  readonly task_id: string;
  readonly task_revision: string;
  /**
   * The sprint row's own task cell -- the human-readable preimage of
   * `task_id`, carried verbatim from the same authority that derived the
   * digest. Null means the card has no canonical row to name, which is a
   * snapshot fact and never a placeholder for an unread label.
   */
  readonly task_label: string | null;
  /** The sprint row's own index cell, null under the same no-row condition. */
  readonly task_index: number | null;
  readonly claim_id: string | null;
  readonly generation: number | null;
  readonly task_state: TaskState;
  readonly placement: FleetBoardPlacement;
  readonly attention_owner: FleetBoardAttentionOwner;
  readonly execution_readiness: TaskOfferExecutionReadiness | null;
  readonly readiness_blockers: readonly TaskOfferBlockerV1[] | null;
  readonly lease_state: BoardLeaseState;
  /** Exact reviewing-pointer facts only; neither value is inferred from a branch or provider response. */
  readonly publication_id: string | null;
  readonly head_sha: string | null;
  readonly merge_readiness: MergeReadinessV1 | null;
  readonly blocker_codes: readonly MergeReadinessBlockerCode[];
  readonly feedback: FleetBoardFeedbackSummaryV1;
  readonly inbox: FleetBoardInboxSummaryV1;
  readonly snapshot_consistency: Exclude<FleetBoardSnapshotConsistency, 'degraded'>;
  /**
   * The failure unit is the card. A card whose own observation threw carries
   * the typed reason here, is never classified, and never hides the sibling
   * cards of its repository; the repository stays readable and degraded.
   */
  readonly error: FleetBoardErrorV1 | null;
}

export interface FleetRepositoryBoardV1 {
  readonly repository_id: string;
  readonly repo_root: string;
  readonly access_mode: 'read_only' | 'read_write';
  readonly status: FleetRepositoryStatus;
  readonly snapshot_consistency: FleetBoardSnapshotConsistency;
  readonly cards: readonly FleetBoardCardV1[];
  readonly error: FleetBoardErrorV1 | null;
}

export interface FleetBoardCountsV1 {
  readonly available: number;
  readonly working: number;
  readonly in_review: number;
  readonly ready_to_merge: number;
  readonly done: number;
  readonly unreadable: number;
  readonly preparation: number;
  readonly alternate_workflow: number;
  readonly isolated_execution: number;
  readonly known_tasks: number;
  /** Canonical cards without a sound placement, including failed observations. */
  readonly unclassified: number;
}

export interface FleetBoardSnapshotV1 {
  readonly protocol: typeof FLEET_BOARD_PROTOCOL;
  readonly kind: typeof FLEET_BOARD_KIND;
  readonly registry_revision: string;
  readonly sequence: number;
  readonly observed_at: string;
  readonly snapshot_consistency: FleetBoardSnapshotConsistency;
  readonly repositories: readonly FleetRepositoryBoardV1[];
  readonly counts: FleetBoardCountsV1;
  readonly snapshot_sha256: string;
}

export interface FleetBoardCardInputV1 {
  readonly task_id: string;
  readonly task_revision: string;
  readonly task_label: string | null;
  readonly task_index: number | null;
  readonly task_state: TaskState;
  readonly lease_state: BoardLeaseState;
  readonly claim_id: string | null;
  readonly generation: number | null;
  readonly current_publication: { readonly publication_id: string; readonly head_sha: string } | null;
  readonly merge_readiness: MergeReadinessV1 | null;
  readonly execution_readiness: TaskOfferExecutionReadiness | null;
  readonly readiness_blockers: readonly TaskOfferBlockerV1[] | null;
  readonly feedback: FleetBoardFeedbackSummaryV1;
  readonly inbox: FleetBoardInboxSummaryV1;
  readonly snapshot_consistency: 'stable' | 'changed_during_read';
  readonly error: FleetBoardErrorV1 | null;
}

export interface FleetRepositoryBoardInputV1 {
  readonly repository_id: string;
  readonly repo_root: string;
  readonly access_mode: 'read_only' | 'read_write';
  readonly status: FleetRepositoryStatus;
  readonly snapshot_consistency: FleetBoardSnapshotConsistency;
  readonly cards: readonly FleetBoardCardInputV1[];
  readonly error: FleetBoardErrorV1 | null;
}

export interface FleetBoardProjectionInputV1 {
  readonly registry_revision: string;
  readonly sequence: number;
  readonly observed_at: string;
  readonly repositories: readonly FleetRepositoryBoardInputV1[];
}

function compare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf-8'), Buffer.from(right, 'utf-8'));
}

/** Public repository errors are a closed, non-diagnostic vocabulary. */
export const FLEET_BOARD_ERROR_MESSAGES: Readonly<Record<FleetBoardErrorCode, string>> = Object.freeze({
  repo_unreadable: 'repository authority cannot be read',
  repo_authority_invalid: 'repository authority is invalid',
  repo_snapshot_changed: 'repository snapshot changed during observation',
  repo_board_unavailable: 'repository board observation is unavailable',
  repo_publication_unreadable: 'repository publication observation is unavailable',
  repo_readiness_unavailable: 'repository readiness observation is unavailable',
  repo_feedback_unreadable: 'repository feedback observation is unavailable',
  repo_inbox_unreadable: 'repository inbox observation is unavailable',
  repo_runtime_effect_unreadable: 'repository Agent Runtime effect store is unavailable',
  repo_collection_timeout: 'repository collection exceeded the fleet round deadline',
});

export function fleetBoardErrorMessage(code: FleetBoardErrorCode): string {
  return FLEET_BOARD_ERROR_MESSAGES[code];
}

function attention(...owners: readonly FleetBoardAttentionOwner[]): FleetBoardAttentionOwner {
  if (owners.includes('user')) return 'user';
  if (owners.includes('agent')) return 'agent';
  if (owners.includes('external')) return 'external';
  return 'none';
}

function feedbackAttention(summary: FleetBoardFeedbackSummaryV1): FleetBoardAttentionOwner {
  if (summary.no_progress) return 'user';
  if (summary.repair_actions.length > 0) return 'agent';
  return 'none';
}

const PREPARATION_BLOCKERS = new Set<TaskOfferBlockerV1['code']>([
  'repo_read_only', 'plan_missing', 'plan_not_approved', 'plan_not_projectable', 'contract_missing', 'contract_not_projectable',
]);

/** Existing execution facts precede reacquisition readiness. */
export function classifyFleetBoardPlacement(input: FleetBoardCardInputV1): FleetBoardPlacement {
  const unclassified = (reason: Extract<FleetBoardPlacement, { kind: 'unclassified' }>['reason']): FleetBoardPlacement => Object.freeze({ kind: 'unclassified', reason });
  const column = (column: FleetBoardColumn): FleetBoardPlacement => Object.freeze({ kind: 'column', column });
  if (input.error !== null) return unclassified('observation_failed');
  if (input.task_state === 'missing') return unclassified('canonical_missing');
  if (input.task_state === 'drifted') return unclassified('task_drifted');
  if (input.task_state === 'done') return column('done');
  if (input.lease_state === 'reviewing' && input.current_publication !== null) {
    return column(input.merge_readiness?.ready === true ? 'ready_to_merge' : 'in_review');
  }
  if (input.lease_state === 'reserving' || input.lease_state === 'bound' || input.lease_state === 'completing') return column('working');
  if (input.task_state !== 'pending' || input.lease_state !== 'available') return unclassified('state_unmapped');
  const blockers = input.readiness_blockers;
  if (input.execution_readiness === null || blockers === null) return unclassified('readiness_unavailable');
  if (input.execution_readiness === 'execution_ready' && blockers.length === 0) return column('available');
  if (input.execution_readiness === 'inline_ready' && blockers.length === 0) return Object.freeze({ kind: 'alternate_workflow', workflow: 'inline' });
  if ((input.execution_readiness === 'planning_required' || input.execution_readiness === 'unsupported')
    && blockers.length > 0 && blockers.every(blocker => PREPARATION_BLOCKERS.has(blocker.code))) return Object.freeze({ kind: 'preparation' });
  return unclassified('unsupported_readiness');
}

export function projectFleetBoardCard(repositoryId: string, input: FleetBoardCardInputV1): FleetBoardCardV1 {
  const readinessAttention = input.merge_readiness?.attention_owner ?? 'none';
  const publication = input.current_publication;
  const error = input.error;
  const placement = classifyFleetBoardPlacement(input);
  const preExecution = placement.kind !== 'column' || placement.column === 'available';
  if (error === null && input.inbox.delivery_evidence === null) throw new Error('Readable Fleet card requires delivery evidence');
  return Object.freeze({
    repository_id: repositoryId,
    task_id: input.task_id,
    task_revision: input.task_revision,
    task_label: input.task_label,
    task_index: input.task_index,
    claim_id: input.claim_id,
    generation: input.generation,
    task_state: input.task_state,
    placement,
    attention_owner: attention(
      ...(preExecution && input.task_state === 'pending' ? input.readiness_blockers?.map(blocker => blocker.attention_owner) ?? [] : []),
      readinessAttention,
      feedbackAttention(input.feedback),
      input.inbox.addressed_to_current_claim ? 'agent' : 'none',
    ),
    execution_readiness: input.execution_readiness,
    readiness_blockers: input.readiness_blockers === null ? null : Object.freeze(input.readiness_blockers.map(blocker => Object.freeze({ code: blocker.code, attention_owner: blocker.attention_owner }))),
    lease_state: input.lease_state,
    publication_id: publication?.publication_id ?? null,
    head_sha: publication?.head_sha ?? null,
    merge_readiness: input.merge_readiness,
    blocker_codes: Object.freeze(input.merge_readiness?.blockers.map((blocker) => blocker.code) ?? []),
    feedback: Object.freeze({
      pending_count: input.feedback.pending_count,
      no_progress: input.feedback.no_progress,
      repair_actions: Object.freeze([...input.feedback.repair_actions]),
    }),
    inbox: Object.freeze({
      delivery_evidence: error !== null || input.inbox.delivery_evidence === null ? null : Object.freeze({
        candidate_count: input.inbox.delivery_evidence.candidate_count,
        latest: input.inbox.delivery_evidence.latest === null ? null : Object.freeze({
          adapter_kind: input.inbox.delivery_evidence.latest.adapter_kind,
          effect_state: input.inbox.delivery_evidence.latest.effect_state,
          receipt_kind: input.inbox.delivery_evidence.latest.receipt_kind,
          observed_at: input.inbox.delivery_evidence.latest.observed_at,
          observation_sequence: input.inbox.delivery_evidence.latest.observation_sequence,
          observation_sha256: input.inbox.delivery_evidence.latest.observation_sha256,
        }),
      }),
      unread_count: input.inbox.unread_count,
      addressed_to_current_claim: input.inbox.addressed_to_current_claim,
      delivery_state: input.inbox.delivery_state,
      runtime_reachability: input.inbox.runtime_reachability,
      effect_sha256: input.inbox.effect_sha256,
      failure_class: input.inbox.failure_class,
    }),
    snapshot_consistency: input.snapshot_consistency,
    error: error === null ? null : Object.freeze({ code: error.code, message: fleetBoardErrorMessage(error.code) }),
  });
}

function projectRepository(input: FleetRepositoryBoardInputV1): FleetRepositoryBoardV1 {
  if (input.status === 'unreadable') {
    if (input.error === null) throw new Error(`unreadable repository ${input.repository_id} requires an error`);
    return Object.freeze({
      repository_id: input.repository_id,
      repo_root: input.repo_root,
      access_mode: input.access_mode,
      status: 'unreadable',
      snapshot_consistency: 'degraded',
      cards: Object.freeze([]),
      error: Object.freeze({ code: input.error.code, message: fleetBoardErrorMessage(input.error.code) }),
    });
  }
  const cards = input.cards
    .map((card) => projectFleetBoardCard(input.repository_id, card))
    .sort((left, right) => compare(left.task_id, right.task_id) || compare(left.task_revision, right.task_revision));
  if (new Set(cards.map(card => card.task_id)).size !== cards.length) throw new Error('Fleet repository contains duplicate task identities');
  const unclassified = cards.some((card) => card.placement.kind === 'unclassified');
  const changedCard = cards.some((card) => card.snapshot_consistency === 'changed_during_read');
  const consistency = input.snapshot_consistency === 'degraded' || unclassified
    ? 'degraded'
    : input.snapshot_consistency === 'changed_during_read' || changedCard
      ? 'changed_during_read'
      : 'stable';
  const error = input.error ?? (unclassified
    ? { code: 'repo_board_unavailable' as const, message: 'one or more cards have no sound Fleet placement' }
    : null);
  return Object.freeze({
    repository_id: input.repository_id,
    repo_root: input.repo_root,
    access_mode: input.access_mode,
    status: 'ok',
    snapshot_consistency: consistency,
    cards: Object.freeze(cards),
    error: error === null ? null : Object.freeze({ code: error.code, message: fleetBoardErrorMessage(error.code) }),
  });
}

export function fleetBoardSnapshotDigest(input: Omit<FleetBoardSnapshotV1, 'snapshot_sha256' | 'observed_at' | 'sequence'>): string {
  return `sha256:${createHash('sha256').update(canonicalJson(input), 'utf-8').digest('hex')}`;
}

/** Canonical object-key ordering keeps the digest independent of construction order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!value || typeof value !== 'object') throw new Error('fleet board snapshot contains an unsupported canonical value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(compare).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export function projectFleetBoardSnapshot(input: FleetBoardProjectionInputV1): FleetBoardSnapshotV1 {
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) throw new Error('fleet board sequence must be a positive integer');
  const repositories = input.repositories
    .map(projectRepository)
    .sort((left, right) => compare(left.repository_id, right.repository_id));
  if (new Set(repositories.map(repository => repository.repository_id)).size !== repositories.length) throw new Error('Fleet snapshot contains duplicate repository identities');
  const counts: { -readonly [Key in keyof FleetBoardCountsV1]: number } = {
    available: 0, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 0,
    preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 0,
  };
  let consistency: FleetBoardSnapshotConsistency = 'stable';
  for (const repository of repositories) {
    if (repository.status === 'unreadable') {
      counts.unreadable += 1;
      consistency = 'degraded';
      continue;
    }
    if (repository.snapshot_consistency === 'degraded') consistency = 'degraded';
    else if (repository.snapshot_consistency === 'changed_during_read' && consistency === 'stable') consistency = 'changed_during_read';
    for (const card of repository.cards) {
      if (card.task_state === 'missing') { counts.isolated_execution += 1; continue; }
      counts.known_tasks += 1;
      if (card.placement.kind === 'column') counts[card.placement.column] += 1;
      else counts[card.placement.kind] += 1;
    }
  }
  const basis = {
    protocol: FLEET_BOARD_PROTOCOL,
    kind: FLEET_BOARD_KIND,
    registry_revision: input.registry_revision,
    snapshot_consistency: consistency,
    repositories: Object.freeze(repositories),
    counts: Object.freeze({ ...counts }),
  } as const;
  return Object.freeze({
    ...basis,
    sequence: input.sequence,
    observed_at: input.observed_at,
    snapshot_sha256: fleetBoardSnapshotDigest(basis),
  });
}
