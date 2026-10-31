import { decodeAdmittedTaskSessions } from '../core/sessions/task-sessions';
import type { OperatorRepositorySnapshotV1 } from '../core/operator/repository-snapshot';
export type { OperatorRepositorySnapshotV1 } from '../core/operator/repository-snapshot';
import { isOperatorServiceEpoch } from '../core/operator/observation-identity';
import { validateRequiredCheckFailureEvidence } from '../core/evidence/required-check-evidence';
import { validateRequiredCheckCoverageEvidence } from '../core/publication/required-check-coverage';
import { decodeOperatorPlanningSnapshot } from '../core/operator/planning-snapshot';
import { decodeOperatorOrganizationSnapshot } from '../core/operator/organization-snapshot';
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

/**
 * The Fleet protocol the browser transport accepts, restated as a literal
 * because `src/core/fleet/board.ts` owns a Node `createHash` import that must
 * not enter the browser bundle. `OperatorFleetSnapshotV1['protocol']` is that
 * module's literal type, so a drift from the core constant fails typecheck
 * here rather than at runtime.
 */
export const OPERATOR_FLEET_PAYLOAD_PROTOCOL: OperatorFleetSnapshotV1['protocol'] = 8;

/**
 * The repository protocol the browser transport accepts, restated for the
 * same reason and typed against the core literal, so a bump that forgets the
 * browser fails typecheck.
 */
export const OPERATOR_REPOSITORY_PAYLOAD_PROTOCOL: OperatorRepositorySnapshotV1['protocol'] = 1;

export interface OperatorApiErrorV1 {
  readonly code: string;
  readonly message: string;
  readonly next_action: string;
}

/**
 * Every typed failure code the three routes this bundle calls can return, plus
 * the codes the browser raises for itself. The set is closed so board copy can
 * be owned by the client dictionary; a code outside it is a server ahead of
 * this bundle and is rendered as a labelled passthrough, never as board copy.
 *
 * `code` on the wire stays `string`: this list is a copy contract, not a
 * decoder, and a stricter transport type would turn a newer server's typed
 * error into an undecodable payload.
 */
export const OPERATOR_API_ERROR_CODES = [
  // Raised in the browser.
  'operator_api_unavailable',
  'operator_payload_invalid',
  'operator_repository_payload_invalid',
  'repository_mismatch',
  'task_message_response_invalid',
  'task_message_unavailable',
  // GET /api/v1/fleet/snapshot
  'fleet_snapshot_timeout',
  'fleet_snapshot_unavailable',
  'fleet_registry_unavailable',
  'fleet_registry_invalid',
  'fleet_board_argument_invalid',
  'fleet_watch_aborted_before_first_snapshot',
  // GET /api/v1/repositories/{repository}/snapshot
  'repository_snapshot_unavailable',
  'repository_snapshot_busy',
  'repository_snapshot_timeout',
  // POST /api/v1/fleet/tasks/{repository}/{task}/messages
  'task_message_timeout',
  'task_message_invalid',
  'task_message_unreadable',
  'task_message_transition_invalid',
  'task_message_envelope_too_large',
  'task_message_body_too_large',
  'message_id_conflict',
  'task_revision_mismatch',
  'canonical_source_stale',
  'canonical_sprint_unavailable',
  'task_not_found',
  'task_not_pending',
  'task_unowned',
  'claim_mismatch',
  'recipient_unavailable',
  'repository_read_only',
  // Shared across the routes above.
  'registry_unavailable',
  'repository_not_found',
  'invalid_request',
  'host_not_allowed',
  'origin_required',
  'origin_not_allowed',
  'method_not_allowed',
  'not_found',
  'operator_assets_unavailable',
  'operator_server_unavailable',
] as const;

export type OperatorApiErrorCode = typeof OPERATOR_API_ERROR_CODES[number];

export interface OperatorApiErrorEnvelopeV1 {
  readonly error: OperatorApiErrorV1;
}

export const OPERATOR_TASK_MESSAGE_RESPONSE_PROTOCOL = 1 as const;

export interface OperatorTaskMessageRequestIdentityV1 {
  readonly repository_id: string;
  readonly task_id: string;
  readonly message_id: string;
  readonly scope: 'task' | 'claim';
}

export interface OperatorTaskMessageResponseV1 extends OperatorTaskMessageRequestIdentityV1 {
  readonly ok: true;
  readonly protocol: typeof OPERATOR_TASK_MESSAGE_RESPONSE_PROTOCOL;
  readonly created: boolean;
}

export const OPERATOR_TASK_MESSAGE_RESPONSE_INVALID_ERROR: OperatorApiErrorV1 = Object.freeze({
  code: 'task_message_response_invalid',
  message: 'The task message acknowledgment is invalid',
  next_action: 'Retry with the same message ID so the server can return the incumbent event.',
});

export class OperatorTaskMessageResponseError extends Error {
  readonly code = OPERATOR_TASK_MESSAGE_RESPONSE_INVALID_ERROR.code;
  readonly next_action = OPERATOR_TASK_MESSAGE_RESPONSE_INVALID_ERROR.next_action;

  constructor() {
    super(OPERATOR_TASK_MESSAGE_RESPONSE_INVALID_ERROR.message);
    this.name = 'OperatorTaskMessageResponseError';
  }
}

export const OPERATOR_PAYLOAD_INVALID_ERROR: OperatorApiErrorV1 = Object.freeze({
  code: 'operator_payload_invalid',
  message: 'Fleet snapshot response is invalid',
  next_action: 'Run `repo-harness fleet board --json` for diagnostics, then retry.',
});

/** Repository decoding has its own typed failure so the panel can preserve
 * the operation that failed without exposing response contents. */
export const OPERATOR_REPOSITORY_PAYLOAD_INVALID_ERROR: OperatorApiErrorV1 = Object.freeze({
  code: 'operator_repository_payload_invalid',
  message: 'Repository snapshot response is invalid',
  next_action: 'Check the repository repository observation sources, then refresh the board.',
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

/** Thrown only after the complete repository transport contract fails. */
export class OperatorRepositoryPayloadError extends Error {
  readonly code = OPERATOR_REPOSITORY_PAYLOAD_INVALID_ERROR.code;
  readonly next_action = OPERATOR_REPOSITORY_PAYLOAD_INVALID_ERROR.next_action;

  constructor() {
    super(OPERATOR_REPOSITORY_PAYLOAD_INVALID_ERROR.message);
    this.name = 'OperatorRepositoryPayloadError';
  }
}

export type OperatorSnapshotViewState =
  | { readonly kind: 'loading'; readonly previous: OperatorFleetSnapshotV1 | null; readonly staleError?: OperatorApiErrorV1 }
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

export function allCards(snapshot: Pick<OperatorFleetSnapshotV1, 'repositories'>): readonly OperatorFleetCardV1[] {
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
/** The closed repository failure vocabulary, exported so board copy can cover it. */
export const OPERATOR_REPOSITORY_ERROR_CODES = [
  'repo_unreadable',
  'repo_authority_invalid',
  'repo_snapshot_changed',
  'repo_board_unavailable',
  'repo_publication_unreadable',
  'repo_readiness_unavailable',
  'repo_feedback_unreadable',
  'repo_inbox_unreadable',
  'repo_runtime_effect_unreadable',
  'repo_collection_timeout',
] as const;
const EXECUTION_READINESS = ['execution_ready', 'planning_required', 'inline_ready', 'unsupported'] as const;
const MERGE_BLOCKERS = [
  'provider_unavailable',
  'provider_data_incomplete',
  'changed_during_read',
  'pr_not_open',
  'draft',
  'head_moved',
  'base_moved_since_verification',
  'checks_failed',
  'checks_pending',
  'changes_requested',
  'unresolved_threads',
  'not_mergeable',
  'already_integrated',
  'required_check_coverage_missing',
  'required_check_coverage_policy_invalid',
  'stack_member',
  'stack_depth_exceeded',
  'stack_cycle',
  'stack_base_pr_missing',
  'stack_base_pr_not_open',
  'stack_foreign_pr',
] as const;
const MERGE_ATTENTION_OWNERS = ['agent', 'user', 'external'] as const;
const MERGE_INTEGRATION_MODES = ['unmerged', 'ancestor', 'absorbed', 'unavailable'] as const;
const MERGE_STACK_STATUSES = [
  'not_member', 'complete', 'depth_exceeded', 'cycle', 'base_pr_missing', 'base_pr_not_open', 'foreign_pr', 'unobserved',
] as const;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const GIT_OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
// Keep these transport-side checks byte-for-byte aligned with the canonical
// Task Message route and `task-message.ts`; importing those Node modules would
// pull `crypto` into the browser bundle.
const TASK_DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
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

function requireTaskDigest(value: unknown): string {
  const digest = requireString(value);
  if (!TASK_DIGEST_PATTERN.test(digest)) throw new OperatorPayloadError();
  return digest;
}

function requireUuid(value: unknown): string {
  const uuid = requireString(value);
  if (!UUID_PATTERN.test(uuid)) throw new OperatorPayloadError();
  return uuid;
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

function requireExactKeys(value: UnknownRecord, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new OperatorPayloadError();
  }
}

function decodeError(value: unknown): OperatorFleetRepositoryV1['error'] {
  if (value === null) return null;
  const error = requireRecord(value);
  if (!isOneOf(error.code, OPERATOR_REPOSITORY_ERROR_CODES) || !hasRequiredString(error.message)) throw new OperatorPayloadError();
  return Object.freeze({ code: error.code, message: error.message });
}

function decodeStack(value: unknown): NonNullable<OperatorFleetCardV1['merge_readiness']>['stack'] {
  const stack = requireRecord(value);
  requireExactKeys(stack, ['member', 'depth', 'chain', 'final_base_sha', 'status']);
  const member = requireBoolean(stack.member);
  const depth = requireNonNegativeInteger(stack.depth);
  const status = requireOneOf(stack.status, MERGE_STACK_STATUSES);
  const finalBaseSha = stack.final_base_sha === null ? null : requireGitOid(stack.final_base_sha);
  const chain = requireArray(stack.chain).map((entryValue) => {
    const entry = requireRecord(entryValue);
    requireExactKeys(entry, ['pr_number', 'head_ref', 'head_sha', 'base_ref', 'base_sha']);
    return Object.freeze({
      pr_number: requirePositiveInteger(entry.pr_number),
      head_ref: requireString(entry.head_ref),
      head_sha: requireGitOid(entry.head_sha),
      base_ref: requireString(entry.base_ref),
      base_sha: requireGitOid(entry.base_sha),
    });
  });
  if (!member) {
    if ((status !== 'not_member' && status !== 'unobserved') || depth !== 0 || chain.length !== 0 || finalBaseSha !== null) {
      throw new OperatorPayloadError();
    }
  } else if (status === 'not_member' || chain.length === 0 || depth !== chain.length - 1) {
    throw new OperatorPayloadError();
  }
  if (status === 'complete') {
    if (depth < 1 || finalBaseSha === null || finalBaseSha !== chain[chain.length - 1]!.base_sha) throw new OperatorPayloadError();
  } else if (finalBaseSha !== null) {
    throw new OperatorPayloadError();
  }
  return Object.freeze({ member, depth, chain: Object.freeze(chain), final_base_sha: finalBaseSha, status });
}

function decodeMergeReadiness(value: unknown): OperatorFleetCardV1['merge_readiness'] {
  if (value === null) return null;
  const readiness = requireRecord(value);
  requireExactKeys(readiness, ['protocol', 'kind', 'provider_repository_id', 'repository', 'pr_number', 'ready',
    'expected_head_sha', 'expected_base_sha', 'integration_mode', 'attention_owner', 'blockers', 'check_failures',
    'required_check_coverage', 'stack']);
  if (readiness.protocol !== 2 || readiness.kind !== 'repo-harness-pull-request-readiness') throw new OperatorPayloadError();
  const repositoryId = requireString(readiness.provider_repository_id);
  const repository = requireString(readiness.repository);
  if (!/^[1-9][0-9]*$/.test(repositoryId) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    || !isSafePositiveInteger(readiness.pr_number)) throw new OperatorPayloadError();
  const prNumber = readiness.pr_number;
  const ready = requireBoolean(readiness.ready);
  const expectedHeadSha = requireGitOid(readiness.expected_head_sha);
  const expectedBaseSha = requireGitOid(readiness.expected_base_sha);
  const integrationMode = requireOneOf(readiness.integration_mode, MERGE_INTEGRATION_MODES);
  const attentionOwner = requireOneOf(readiness.attention_owner, ATTENTION_OWNERS);
  const blockers: Array<NonNullable<OperatorFleetCardV1['merge_readiness']>['blockers'][number]> = [];
  for (const blockerValue of requireArray(readiness.blockers)) {
    const blocker = requireRecord(blockerValue);
    // Only a coverage blocker carries action text; every other code keeps its two-field shape.
    const keys = Object.keys(blocker).sort().join(',');
    if (keys !== 'attention_owner,code' && keys !== 'attention_owner,code,detail') throw new OperatorPayloadError();
    if (!isOneOf(blocker.code, MERGE_BLOCKERS) || !isOneOf(blocker.attention_owner, MERGE_ATTENTION_OWNERS)) {
      throw new OperatorPayloadError();
    }
    const detail = blocker.detail === undefined ? undefined : requireString(blocker.detail);
    if (detail !== undefined && blocker.code !== 'required_check_coverage_missing'
      && blocker.code !== 'required_check_coverage_policy_invalid') throw new OperatorPayloadError();
    blockers.push(Object.freeze({ code: blocker.code, attention_owner: blocker.attention_owner, ...(detail === undefined ? {} : { detail }) }));
  }
  const checkFailures = requireArray(readiness.check_failures).map((entry) => {
    try { return validateRequiredCheckFailureEvidence(entry); } catch { throw new OperatorPayloadError(); }
  });
  let requiredCheckCoverage: ReturnType<typeof validateRequiredCheckCoverageEvidence> | null = null;
  if (readiness.required_check_coverage !== null) {
    try { requiredCheckCoverage = validateRequiredCheckCoverageEvidence(readiness.required_check_coverage); } catch { throw new OperatorPayloadError(); }
  }
  return Object.freeze({
    protocol: 2,
    kind: 'repo-harness-pull-request-readiness',
    provider_repository_id: repositoryId, repository, pr_number: prNumber,
    ready,
    expected_head_sha: expectedHeadSha,
    expected_base_sha: expectedBaseSha,
    integration_mode: integrationMode,
    attention_owner: attentionOwner,
    blockers: Object.freeze(blockers),
    check_failures: Object.freeze(checkFailures),
    required_check_coverage: requiredCheckCoverage,
    stack: decodeStack(readiness.stack),
  });
}

function decodePlacement(value: unknown): OperatorFleetCardV1['placement'] {
  const placement = requireRecord(value);
  switch (placement.kind) {
    case 'column':
      requireExactKeys(placement, ['kind', 'column']);
      return Object.freeze({ kind: 'column', column: requireOneOf(placement.column, COLUMNS) });
    case 'preparation':
      requireExactKeys(placement, ['kind']);
      return Object.freeze({ kind: 'preparation' });
    case 'alternate_workflow':
      requireExactKeys(placement, ['kind', 'workflow']);
      return Object.freeze({ kind: 'alternate_workflow', workflow: requireOneOf(placement.workflow, ['inline'] as const) });
    case 'unclassified':
      requireExactKeys(placement, ['kind', 'reason']);
      return Object.freeze({ kind: 'unclassified', reason: requireOneOf(placement.reason, ['observation_failed', 'canonical_missing', 'task_drifted', 'readiness_unavailable', 'unsupported_readiness', 'state_unmapped'] as const) });
    default: throw new OperatorPayloadError();
  }
}

function decodeReadinessBlockers(value: unknown): OperatorFleetCardV1['readiness_blockers'] {
  if (value === null) return null;
  return Object.freeze(requireArray(value).map(value => {
    const blocker = requireRecord(value);
    if (blocker.code === 'provider_ineligible') {
      requireExactKeys(blocker, ['code', 'attention_owner', 'eligibility_reasons']);
      const reasons = requireArray(blocker.eligibility_reasons);
      if (blocker.attention_owner !== 'user' || reasons.length > 100
        || !reasons.every((reason): reason is string => typeof reason === 'string' && reason.length > 0
          && reason.length <= 1024 && reason.trim() === reason && !/[\u0000-\u001f\u007f]/u.test(reason))
        || new Set(reasons).size !== reasons.length
        || JSON.stringify(reasons) !== JSON.stringify([...reasons].sort())) throw new OperatorPayloadError();
      return Object.freeze({ code: 'provider_ineligible' as const, attention_owner: 'user' as const,
        eligibility_reasons: Object.freeze([...reasons]) });
    }
    requireExactKeys(blocker, ['code', 'attention_owner']);
    return Object.freeze({ code: requireOneOf(blocker.code, [
      'repo_read_only', 'plan_missing', 'plan_ambiguous', 'plan_not_approved', 'plan_source_mismatch', 'plan_not_projectable',
      'contract_missing', 'contract_not_projectable',
    ] as const), attention_owner: requireOneOf(blocker.attention_owner, ['agent', 'user', 'external'] as const) });
  }));
}

function decodeCard(value: unknown, repositoryId: string): OperatorFleetCardV1 {
  const card = requireRecord(value);
  if (Object.hasOwn(card, 'column')) throw new OperatorPayloadError();
  if (!hasRequiredString(card.repository_id) || card.repository_id !== repositoryId) throw new OperatorPayloadError();
  requireExactKeys(card, ['repository_id', 'provider_repository_id', 'provider_issue_id', 'issue_state', 'issue_revision', 'execution_status', 'execution',
    'task_id', 'task_label', 'task_index', 'placement', 'readiness_blockers', 'attention_owner', 'execution_readiness', 'merge_readiness', 'blocker_codes', 'feedback', 'inbox', 'snapshot_consistency', 'error']);
  const providerRepositoryId = requireString(card.provider_repository_id), providerIssueId = requireString(card.provider_issue_id);
  if (!/^[1-9][0-9]*$/u.test(providerRepositoryId) || !/^[1-9][0-9]*$/u.test(providerIssueId)) throw new OperatorPayloadError();
  const issueState = card.issue_state === null ? null : requireOneOf(card.issue_state, ['open', 'closed'] as const);
  const issueRevision = card.issue_revision === null ? null : requireSha256(card.issue_revision);
  const executionStatus = requireOneOf(card.execution_status, ['observed', 'unavailable'] as const);
  let execution: OperatorFleetCardV1['execution'] = null;
  if (card.execution !== null) {
    try { execution = decodeAdmittedTaskSessions({ protocol: 1, kind: 'operator_task_sessions', repository_id: repositoryId,
      observed_at: '1970-01-01T00:00:00.000Z', sessions: [card.execution] }, { repository_id: repositoryId }).sessions[0]!; }
    catch { throw new OperatorPayloadError(); }
    if (execution.selector.provider_repository_id !== providerRepositoryId || execution.selector.issue_id !== providerIssueId || executionStatus !== 'observed') throw new OperatorPayloadError();
  }
  const taskId = requireNullableString(card.task_id);
  if (taskId !== (execution?.selector.task ?? null)) throw new OperatorPayloadError();
  const taskLabel = requireNullableString(card.task_label);
  const taskIndex = card.task_index === null ? null : requireNonNegativeInteger(card.task_index);
  const placement = decodePlacement(card.placement);
  const readinessBlockers = decodeReadinessBlockers(card.readiness_blockers);
  const attentionOwner = requireOneOf(card.attention_owner, ATTENTION_OWNERS);
  const executionReadiness = card.execution_readiness === null
    ? null
    : requireOneOf(card.execution_readiness, EXECUTION_READINESS);
  const mergeReadiness = decodeMergeReadiness(card.merge_readiness);
  const blockerCodes = requireArray(card.blocker_codes).map((code) => requireOneOf(code, MERGE_BLOCKERS));
  const feedback = requireRecord(card.feedback);
  const pendingCount = requireNonNegativeInteger(feedback.pending_count);
  const noProgress = requireBoolean(feedback.no_progress);
  if (requireArray(feedback.repair_actions).length !== 0) throw new OperatorPayloadError();
  const inbox = requireRecord(card.inbox);
  const unreadCount = requireNonNegativeInteger(inbox.unread_count);
  const addressedToCurrentClaim = requireBoolean(inbox.addressed_to_current_claim);
  const deliveryState = requireOneOf(inbox.delivery_state, ['pending', 'delivered', 'acknowledged', 'failed', 'reconciliation_required'] as const);
  const runtimeReachability = requireOneOf(inbox.runtime_reachability, ['reachable', 'unavailable', 'unknown'] as const);
  // The board renders this as a copyable identifier, so an arbitrary non-empty
  // string would be presented as evidence it is not.
  const effectSha256 = inbox.effect_sha256 === null ? null : requireSha256(inbox.effect_sha256);
  const failureClass = inbox.failure_class === null ? null : requireOneOf(inbox.failure_class, [
    'none', 'binding_stale', 'claim_stale', 'capability_unsupported', 'adapter_unavailable',
    'receipt_missing', 'receipt_mismatch', 'unknown',
  ] as const);
  const snapshotConsistency = requireOneOf(card.snapshot_consistency, ['stable', 'changed_during_read'] as const);
  const error = decodeError(card.error);
  if (error !== null && (placement.kind !== 'unclassified' || placement.reason !== 'observation_failed')) throw new OperatorPayloadError();
  if (issueState === null && placement.kind !== 'unclassified') throw new OperatorPayloadError();
  const evidence = inbox.delivery_evidence === null ? null : requireRecord(inbox.delivery_evidence);
  if (error !== null && evidence !== null) throw new OperatorPayloadError();
  const inboxObservation = requireOneOf(inbox.observation_status, ['observed', 'unavailable'] as const);
  if (inboxObservation === 'observed' && evidence === null) throw new OperatorPayloadError();
  const candidateCount = evidence === null ? 0 : requireNonNegativeInteger(evidence.candidate_count);
  const latest = evidence === null || evidence.latest === null ? null : requireRecord(evidence.latest);
  if ((candidateCount === 1) !== (latest !== null)) throw new OperatorPayloadError();
  const deliveryEvidence = evidence === null ? null : Object.freeze({
    candidate_count: candidateCount,
    latest: latest === null ? null : Object.freeze({
      adapter_kind: requireOneOf(latest.adapter_kind, ['herdr-cli-agent'] as const),
      effect_state: requireOneOf(latest.effect_state, ['intent_persisted', 'effect_started', 'observed_success', 'observed_failure', 'reconciliation_required', 'stopped', 'superseded'] as const),
      receipt_kind: latest.receipt_kind === null ? null : requireOneOf(latest.receipt_kind, ['task_message_delivery_receipt', 'controller_step_receipt'] as const),
      observed_at: requireNotificationInstant(latest.observed_at),
      observation_sequence: requireNonNegativeInteger(latest.observation_sequence),
      observation_sha256: requireSha256(latest.observation_sha256),
    }),
  });
  return Object.freeze({
    repository_id: repositoryId,
    provider_repository_id: providerRepositoryId, provider_issue_id: providerIssueId,
    issue_state: issueState, issue_revision: issueRevision, execution_status: executionStatus, execution,
    task_id: taskId, task_label: taskLabel, task_index: taskIndex,
    placement,
    readiness_blockers: readinessBlockers,
    attention_owner: attentionOwner,
    execution_readiness: executionReadiness,
    merge_readiness: mergeReadiness,
    blocker_codes: Object.freeze(blockerCodes),
    feedback: Object.freeze({
      observation_status: requireOneOf(feedback.observation_status, ['observed', 'unavailable'] as const),
      pending_count: pendingCount,
      no_progress: noProgress,
      repair_actions: Object.freeze([]),
    }),
    inbox: Object.freeze({
      observation_status: inboxObservation,
      unread_count: unreadCount,
      addressed_to_current_claim: addressedToCurrentClaim,
      delivery_state: deliveryState,
      runtime_reachability: runtimeReachability,
      effect_sha256: effectSha256,
      failure_class: failureClass,
      delivery_evidence: deliveryEvidence,
    }),
    snapshot_consistency: snapshotConsistency,
    error,
  });
}

function decodeRepository(value: unknown): OperatorFleetRepositoryV1 {
  const repository = requireRecord(value);
  const repositoryId = requireString(repository.repository_id);
  const displayName = requireString(repository.display_name);
  const accessMode = requireOneOf(repository.access_mode, ['read_only', 'read_write'] as const);
  const status = requireOneOf(repository.status, ['ok', 'unreadable'] as const);
  const snapshotConsistency = requireOneOf(repository.snapshot_consistency, SNAPSHOT_CONSISTENCIES);
  const error = decodeError(repository.error);
  const cards = requireArray(repository.cards).map((card) => decodeCard(card, repositoryId));
  if (status === 'unreadable' && (error === null || cards.length !== 0 || snapshotConsistency !== 'degraded')) {
    throw new OperatorPayloadError();
  }
  if (new Set(cards.map(card => `${card.provider_repository_id}/${card.provider_issue_id}/${card.execution?.selector.session_binding_sha256 ?? 'unassigned'}`)).size !== cards.length) throw new OperatorPayloadError();
  if (cards.some(card => card.placement.kind === 'unclassified') && snapshotConsistency !== 'degraded') throw new OperatorPayloadError();
  const cardChanged = cards.some((card) => card.snapshot_consistency === 'changed_during_read');
  if (cardChanged && snapshotConsistency === 'stable') throw new OperatorPayloadError();
  return Object.freeze({
    repository_id: repositoryId,
    display_name: displayName,
    access_mode: accessMode,
    status,
    snapshot_consistency: snapshotConsistency,
    cards: Object.freeze(cards),
    error,
  });
}

/** Same UTC timestamp wire grammar as the notification authority; no Node imports in this bundle. */
function requireNotificationInstant(value: unknown): string {
  const instant = requireInstant(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(instant)) throw new OperatorPayloadError();
  return instant;
}

function requireInstant(value: unknown): string {
  const instant = requireString(value);
  if (Number.isNaN(Date.parse(instant))) throw new OperatorPayloadError();
  return instant;
}

export function decodeOperatorRepositorySnapshot(value: unknown): OperatorRepositorySnapshotV1 {
  try {
    const v = requireRecord(value);
    requireExactKeys(v, ['protocol', 'kind', 'repository_id', 'organization', 'planning']);
    if (v.protocol !== OPERATOR_REPOSITORY_PAYLOAD_PROTOCOL || v.kind !== 'operator_repository_snapshot') throw new OperatorPayloadError();
    const repositoryId = requireString(v.repository_id);
    const source = <T,>(value: unknown, decode: (snapshot: unknown) => T): import('../core/operator/repository-snapshot').RepositorySourceObservation<T> => {
      const s = requireRecord(value);
      const observed_at = requireInstant(s.observed_at);
      if (s.status === 'unavailable') {
        requireExactKeys(s, ['status', 'observed_at', 'code']);
        if (s.code !== 'source_unavailable') throw new OperatorPayloadError();
        return { status: 'unavailable', observed_at, code: 'source_unavailable' };
      }
      requireExactKeys(s, ['status', 'observed_at', 'snapshot']);
      if (s.status !== 'observed') throw new OperatorPayloadError();
      return { status: 'observed', observed_at, snapshot: decode(s.snapshot) };
    };
    return {
      protocol: OPERATOR_REPOSITORY_PAYLOAD_PROTOCOL, kind: 'operator_repository_snapshot', repository_id: repositoryId,
      organization: source(v.organization, raw => decodeOperatorOrganizationSnapshot(raw, repositoryId)),
      planning: source(v.planning, raw => decodeOperatorPlanningSnapshot(raw, repositoryId)),
    };
  } catch { throw new OperatorRepositoryPayloadError(); }
}

/** Decode the complete browser payload before any component receives it. */
export function decodeOperatorFleetSnapshot(value: unknown): OperatorFleetSnapshotV1 {
  const snapshot = requireRecord(value);
  if (snapshot.protocol !== OPERATOR_FLEET_PAYLOAD_PROTOCOL || snapshot.kind !== 'operator_fleet_snapshot' || !isOperatorServiceEpoch(snapshot.service_epoch)) {
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
    unclassified: requireNonNegativeInteger(counts.unclassified),
    preparation: requireNonNegativeInteger(counts.preparation),
    alternate_workflow: requireNonNegativeInteger(counts.alternate_workflow),
    isolated_execution: requireNonNegativeInteger(counts.isolated_execution),
    known_tasks: requireNonNegativeInteger(counts.known_tasks),
  });
  const repositories = requireArray(snapshot.repositories).map(decodeRepository);
  const actualCounts = { available: 0, working: 0, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0, unclassified: 0, preparation: 0, alternate_workflow: 0, isolated_execution: 0, known_tasks: 0 };
  if (new Set(repositories.map(repository => repository.repository_id)).size !== repositories.length) throw new OperatorPayloadError();
  for (const repository of repositories) {
    if (repository.status === 'unreadable') { actualCounts.unreadable++; continue; }
    for (const card of repository.cards) {
      if (card.issue_state === null) { actualCounts.isolated_execution++; continue; }
      actualCounts.known_tasks++;
      if (card.placement.kind === 'column') actualCounts[card.placement.column]++;
      else actualCounts[card.placement.kind]++;
    }
  }
  if ((Object.keys(actualCounts) as Array<keyof typeof actualCounts>).some(key => actualCounts[key] !== decodedCounts[key])) throw new OperatorPayloadError();
  const leastHealthyRepository = repositories.some((repository) => repository.snapshot_consistency === 'degraded')
    ? 'degraded'
    : repositories.some((repository) => repository.snapshot_consistency === 'changed_during_read')
      ? 'changed_during_read'
      : 'stable';
  if (
    (snapshotConsistency === 'stable' && leastHealthyRepository !== 'stable')
    || (snapshotConsistency === 'changed_during_read' && leastHealthyRepository === 'degraded')
  ) {
    throw new OperatorPayloadError();
  }
  return Object.freeze({
    protocol: OPERATOR_FLEET_PAYLOAD_PROTOCOL,
    service_epoch: snapshot.service_epoch,
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

/** Decode and bind a 2xx Task Message acknowledgment to its exact request. */
export function decodeOperatorTaskMessageResponse(
  value: unknown,
  expected: OperatorTaskMessageRequestIdentityV1,
  status: number,
): OperatorTaskMessageResponseV1 {
  try {
    const response = requireRecord(value);
    requireExactKeys(response, [
      'ok', 'protocol', 'repository_id', 'task_id', 'message_id', 'scope', 'created',
    ]);
    if (response.ok !== true || response.protocol !== OPERATOR_TASK_MESSAGE_RESPONSE_PROTOCOL) {
      throw new OperatorPayloadError();
    }
    const repositoryId = requireString(response.repository_id);
    const taskId = requireTaskDigest(response.task_id);
    const messageId = requireUuid(response.message_id);
    const scope = requireOneOf(response.scope, ['task', 'claim'] as const);
    const created = requireBoolean(response.created);
    if (
      repositoryId !== expected.repository_id
      || taskId !== expected.task_id
      || messageId !== expected.message_id
      || scope !== expected.scope
      || (created ? status !== 201 : status !== 200)
    ) {
      throw new OperatorPayloadError();
    }
    return Object.freeze({
      ok: true,
      protocol: OPERATOR_TASK_MESSAGE_RESPONSE_PROTOCOL,
      repository_id: repositoryId,
      task_id: taskId,
      message_id: messageId,
      scope,
      created,
    });
  } catch (error) {
    if (error instanceof OperatorPayloadError) throw new OperatorTaskMessageResponseError();
    throw error;
  }
}
