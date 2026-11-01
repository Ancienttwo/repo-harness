import { createHash } from 'crypto';
import type { MergeReadinessBlockerCode, PullRequestReadinessV2 } from '../publication/merge-readiness';
import type { AdmittedTaskSession } from '../sessions/task-sessions';

export type FleetExecutionReadiness =
  | 'execution_ready'
  | 'planning_required'
  | 'inline_ready'
  | 'unsupported';

/**
 * The blocker vocabulary is intentionally closed.  A caller can route every
 * preparation row without interpreting a free-form diagnostic string.
 */
export type FleetBlockerCode =
  | 'provider_ineligible'
  | 'repo_read_only'
  | 'plan_missing'
  | 'plan_ambiguous'
  | 'plan_not_approved'
  | 'plan_source_mismatch'
  | 'plan_not_projectable'
  | 'contract_missing'
  | 'contract_not_projectable';

export type FleetAttentionOwner = 'agent' | 'user' | 'external';

export type FleetBlockerV1 = Readonly<{
  code: Exclude<FleetBlockerCode, 'provider_ineligible'>;
  attention_owner: FleetAttentionOwner;
}> | Readonly<{
  code: 'provider_ineligible';
  attention_owner: 'user';
  eligibility_reasons: readonly string[];
}>;



/** Fleet placement is a read model over provider issues and admitted sessions. */
export const FLEET_BOARD_PROTOCOL = 6 as const;
export const FLEET_BOARD_KIND = 'fleet_board_snapshot' as const;

/** Refuse a Fleet snapshot of another protocol or kind at a process boundary (Surface contract, docs/adr/ADR-0002). */
export function decodeFleetBoardSnapshot(value: unknown): FleetBoardSnapshotV2 {
  const snapshot = value as Partial<FleetBoardSnapshotV2> | null;
  if (snapshot?.protocol !== FLEET_BOARD_PROTOCOL) throw new Error(`unsupported Fleet snapshot protocol: ${String(snapshot?.protocol)}`);
  if (snapshot.kind !== FLEET_BOARD_KIND) throw new Error(`unsupported Fleet snapshot kind: ${String(snapshot.kind)}`);
  return snapshot as FleetBoardSnapshotV2;
}

export type FleetBoardColumn = 'available' | 'working' | 'in_review' | 'ready_to_merge' | 'done';
export type FleetBoardPlacement =
  | Readonly<{ kind: 'column'; column: FleetBoardColumn }>
  | Readonly<{ kind: 'preparation' }>
  | Readonly<{ kind: 'alternate_workflow'; workflow: 'inline' }>
  | Readonly<{ kind: 'unclassified'; reason: 'observation_failed' | 'canonical_missing' | 'task_drifted' | 'readiness_unavailable' | 'unsupported_readiness' | 'state_unmapped' }>;
export type FleetBoardAttentionOwner = 'user' | 'agent' | 'external' | 'none';
export type FleetBoardSnapshotConsistency = 'stable' | 'changed_during_read' | 'degraded';
export type FleetRepositoryStatus = 'ok' | 'unreadable';

export type FleetBoardErrorCode =
  | 'repo_unreadable'
  | 'repo_authority_invalid'
  | 'repo_snapshot_changed'
  | 'repo_board_unavailable'
  | 'repo_publication_unreadable'
  | 'repo_readiness_unavailable'
  | 'repo_feedback_unreadable'
  | 'repo_inbox_unreadable'
  | 'repo_collection_timeout';

export interface FleetBoardErrorV1 {
  readonly code: FleetBoardErrorCode;
  readonly message: string;
}

export interface FleetBoardInboxSummaryV1 {
  readonly observation_status: 'observed' | 'unavailable';
  readonly unread_count: number;
  readonly addressed_to_current_claim: boolean;
}

export interface FleetBoardFeedbackSummaryV1 {
  readonly observation_status: 'observed' | 'unavailable';
  readonly pending_count: number;
  readonly no_progress: boolean;
  readonly repair_actions: readonly never[];
}

export interface FleetBoardCardV2 {
  readonly repository_id: string;
  readonly provider_repository_id: string;
  readonly provider_issue_id: string;
  readonly issue_state: 'open' | 'closed' | null;
  readonly issue_revision: string | null;
  readonly execution_status: 'observed' | 'unavailable';
  readonly execution: AdmittedTaskSession | null;
  readonly task_id: string | null;
  readonly task_label: string | null;
  readonly task_index: number | null;
  readonly placement: FleetBoardPlacement;
  readonly attention_owner: FleetBoardAttentionOwner;
  readonly execution_readiness: FleetExecutionReadiness | null;
  readonly readiness_blockers: readonly FleetBlockerV1[] | null;
  readonly merge_readiness: PullRequestReadinessV2 | null;
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

export interface FleetRepositoryBoardV2 {
  readonly repository_id: string;
  readonly repo_root: string;
  readonly access_mode: 'read_only' | 'read_write';
  readonly status: FleetRepositoryStatus;
  readonly snapshot_consistency: FleetBoardSnapshotConsistency;
  readonly cards: readonly FleetBoardCardV2[];
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

export interface FleetBoardSnapshotV2 {
  readonly protocol: typeof FLEET_BOARD_PROTOCOL;
  readonly kind: typeof FLEET_BOARD_KIND;
  readonly registry_revision: string;
  readonly sequence: number;
  readonly observed_at: string;
  readonly snapshot_consistency: FleetBoardSnapshotConsistency;
  readonly repositories: readonly FleetRepositoryBoardV2[];
  readonly counts: FleetBoardCountsV1;
  readonly snapshot_sha256: string;
}

export interface FleetBoardCardInputV2 {
  readonly provider_repository_id: string;
  readonly provider_issue_id: string;
  readonly issue_state: 'open' | 'closed' | null;
  readonly issue_revision: string | null;
  readonly execution_status: 'observed' | 'unavailable';
  readonly execution: AdmittedTaskSession | null;
  readonly task_id: string | null;
  readonly task_label: string | null;
  readonly task_index: number | null;
  readonly merge_readiness: PullRequestReadinessV2 | null;
  readonly execution_readiness: FleetExecutionReadiness | null;
  readonly readiness_blockers: readonly FleetBlockerV1[] | null;
  readonly feedback: FleetBoardFeedbackSummaryV1;
  readonly inbox: FleetBoardInboxSummaryV1;
  readonly snapshot_consistency: 'stable' | 'changed_during_read';
  readonly error: FleetBoardErrorV1 | null;
}

export interface FleetRepositoryBoardInputV2 {
  readonly repository_id: string;
  readonly repo_root: string;
  readonly access_mode: 'read_only' | 'read_write';
  readonly status: FleetRepositoryStatus;
  readonly snapshot_consistency: FleetBoardSnapshotConsistency;
  readonly cards: readonly FleetBoardCardInputV2[];
  readonly error: FleetBoardErrorV1 | null;
}

export interface FleetBoardProjectionInputV2 {
  readonly registry_revision: string;
  readonly sequence: number;
  readonly observed_at: string;
  readonly repositories: readonly FleetRepositoryBoardInputV2[];
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
  return 'none';
}

/** Provider issue status and admitted execution are separate observations. */
export function classifyFleetBoardPlacement(input: FleetBoardCardInputV2): FleetBoardPlacement {
  if (input.error !== null) return { kind: 'unclassified', reason: 'observation_failed' };
  if (input.issue_state === null) return { kind: 'unclassified', reason: 'canonical_missing' };
  if (input.issue_state === 'closed') return { kind: 'column', column: 'done' };
  if (input.merge_readiness !== null) return { kind: 'column', column: input.merge_readiness.ready ? 'ready_to_merge' : 'in_review' };
  if (input.execution_status === 'unavailable') return { kind: 'unclassified', reason: 'readiness_unavailable' };
  if (input.execution !== null) return { kind: 'column', column: 'working' };
  const blockers = input.readiness_blockers;
  if (input.execution_readiness === null && blockers === null) return { kind: 'unclassified', reason: 'readiness_unavailable' };
  if (input.execution_readiness === 'execution_ready' && blockers?.length === 0) return { kind: 'column', column: 'available' };
  if (input.execution_readiness === 'inline_ready' && blockers?.length === 0) return { kind: 'alternate_workflow', workflow: 'inline' };
  const preparation = new Set(['provider_ineligible', 'repo_read_only', 'plan_missing', 'plan_not_approved', 'plan_not_projectable', 'contract_missing', 'contract_not_projectable']);
  if (['planning_required', 'unsupported'].includes(input.execution_readiness ?? '') && blockers && blockers.length > 0 && blockers.every(blocker => preparation.has(blocker.code))) return { kind: 'preparation' };
  return { kind: 'unclassified', reason: blockers === null ? 'readiness_unavailable' : 'unsupported_readiness' };
}

export function projectFleetBoardCard(repositoryId: string, input: FleetBoardCardInputV2): FleetBoardCardV2 {
  if (!/^[1-9][0-9]*$/u.test(input.provider_repository_id) || !/^[1-9][0-9]*$/u.test(input.provider_issue_id)
    || input.task_id !== (input.execution?.selector.task ?? null)
    || (input.execution !== null && (input.execution.selector.repository_id !== repositoryId
      || input.execution.selector.provider_repository_id !== input.provider_repository_id
      || input.execution.selector.issue_id !== input.provider_issue_id || input.execution_status !== 'observed'))) throw new Error('Fleet provider/session identity mismatch');
  const readinessAttention = input.merge_readiness?.attention_owner ?? 'none';
  const error = input.error;
  const placement = classifyFleetBoardPlacement(input);
  const preExecution = placement.kind !== 'column' || placement.column === 'available';
  return Object.freeze({
    repository_id: repositoryId,
    provider_repository_id: input.provider_repository_id,
    provider_issue_id: input.provider_issue_id,
    issue_state: input.issue_state,
    issue_revision: input.issue_revision,
    execution_status: input.execution_status,
    execution: input.execution,
    task_id: input.task_id,
    task_label: input.task_label,
    task_index: input.task_index,
    placement,
    attention_owner: attention(
      ...(preExecution && input.issue_state === 'open' ? input.readiness_blockers?.map(blocker => blocker.attention_owner) ?? [] : []),
      readinessAttention,
      feedbackAttention(input.feedback),
      input.inbox.addressed_to_current_claim ? 'agent' : 'none',
    ),
    execution_readiness: input.execution_readiness,
    readiness_blockers: input.readiness_blockers === null ? null : Object.freeze(input.readiness_blockers.map(blocker => Object.freeze(blocker.code === 'provider_ineligible'
      ? { code: blocker.code, attention_owner: blocker.attention_owner, eligibility_reasons: Object.freeze([...blocker.eligibility_reasons]) }
      : { code: blocker.code, attention_owner: blocker.attention_owner }))),
    merge_readiness: input.merge_readiness,
    blocker_codes: Object.freeze(input.merge_readiness?.blockers.map((blocker) => blocker.code) ?? []),
    feedback: Object.freeze({
      observation_status: input.feedback.observation_status,
      pending_count: input.feedback.pending_count,
      no_progress: input.feedback.no_progress,
      repair_actions: Object.freeze([...input.feedback.repair_actions]),
    }),
    inbox: Object.freeze({
      observation_status: error === null ? input.inbox.observation_status : 'unavailable',
      unread_count: input.inbox.unread_count,
      addressed_to_current_claim: input.inbox.addressed_to_current_claim,
    }),
    snapshot_consistency: input.snapshot_consistency,
    error: error === null ? null : Object.freeze({ code: error.code, message: fleetBoardErrorMessage(error.code) }),
  });
}

export function fleetCardIdentity(card: Pick<FleetBoardCardV2, 'provider_repository_id' | 'provider_issue_id' | 'execution'>): string {
  return `${card.provider_repository_id}/${card.provider_issue_id}/${card.execution?.selector.session_binding_sha256 ?? 'unassigned'}`;
}

function projectRepository(input: FleetRepositoryBoardInputV2): FleetRepositoryBoardV2 {
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
    .sort((left, right) => compare(fleetCardIdentity(left), fleetCardIdentity(right)));
  if (new Set(cards.map(fleetCardIdentity)).size !== cards.length) throw new Error('Fleet repository contains duplicate task identities');
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

export function fleetBoardSnapshotDigest(input: Omit<FleetBoardSnapshotV2, 'snapshot_sha256' | 'observed_at' | 'sequence'>): string {
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

export function projectFleetBoardSnapshot(input: FleetBoardProjectionInputV2): FleetBoardSnapshotV2 {
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
      if (card.issue_state === null) { counts.isolated_execution += 1; continue; }
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
