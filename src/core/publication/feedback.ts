import { evaluateNoProgress } from '../state/no-progress';
import {
  publicationSha256,
  stablePublicationJson,
} from './publication-receipt';

/** Provider-feedback schemas deliberately do not participate in task or lease digests. */
export const FEEDBACK_PROTOCOL = 1 as const;
export const FEEDBACK_EVENT_KIND = 'repo-harness-feedback-event' as const;
export const FEEDBACK_DELIVERY_RECEIPT_KIND = 'repo-harness-feedback-delivery-receipt' as const;
export const REPAIR_DISPATCH_PROOF_KIND = 'repo-harness-repair-dispatch-proof' as const;
export const REACTION_ATTEMPT_RECEIPT_KIND = 'repo-harness-reaction-attempt-receipt' as const;
export const REPAIR_OFFER_KIND = 'repo-harness-repair-offer' as const;
export const FEEDBACK_SUMMARY_MAX_BYTES = 16 * 1024;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const GIT_OID_PATTERN = /^[0-9a-f]{40,64}$/u;
const RFC3339_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const FEEDBACK_CHECK_CONCLUSIONS = new Set<FeedbackCheckConclusion>([
  'ACTION_REQUIRED', 'CANCELLED', 'FAILURE', 'STARTUP_FAILURE', 'STALE', 'TIMED_OUT',
]);

export type FeedbackProtocolErrorCode =
  | 'feedback_provider_shape_invalid'
  | 'feedback_event_id_missing'
  | 'feedback_unreadable'
  | 'reaction_receipt_conflict';

export class FeedbackProtocolError extends Error {
  constructor(
    readonly code: FeedbackProtocolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FeedbackProtocolError';
  }
}

export interface FeedbackEventV1 {
  readonly protocol: typeof FEEDBACK_PROTOCOL;
  readonly kind: typeof FEEDBACK_EVENT_KIND;
  readonly provider: 'github';
  /** Stable provider object/delivery ID; never a timestamp, URL, or local sequence. */
  readonly provider_event_id: string;
  readonly publication_id: string;
  readonly head_sha: string;
  /** Canonical projection of failing check object IDs retained for the frozen v1 wire field. */
  readonly failing_check_ids: readonly string[];
  /** Every actionable check identity is inseparable from its provider conclusion. */
  readonly failing_checks: readonly FeedbackFailingCheckV1[];
  readonly unresolved_review_thread_ids: readonly string[];
  /** Stable GitHub review object IDs whose current state is CHANGES_REQUESTED. */
  readonly changes_requested_review_ids: readonly string[];
  /** Provider mergeability at the complete observation used to create this event. */
  readonly mergeability: FeedbackMergeability;
  /** Bounded provider-derived synopsis. Provider comment bodies are never persisted here. */
  readonly summary: string;
  readonly provider_url: string;
  readonly observed_at: string;
  /** SHA-256 over every immutable event field except this field. */
  readonly observed_digest: string;
}

export type FeedbackEventInput = Omit<FeedbackEventV1, 'protocol' | 'kind' | 'observed_digest'>;

export type FeedbackCheckConclusion =
  | 'ACTION_REQUIRED'
  | 'CANCELLED'
  | 'FAILURE'
  | 'STARTUP_FAILURE'
  | 'STALE'
  | 'TIMED_OUT';

export interface FeedbackFailingCheckV1 {
  readonly id: string;
  readonly conclusion: FeedbackCheckConclusion;
}

export type FeedbackMergeability = 'MERGEABLE' | 'CONFLICTING';

export type FeedbackDeliveryState = 'pending' | 'delivered' | 'acknowledged' | 'superseded';
export type FeedbackDeliveryChannel = 'none' | 'hook_session' | 'host_adapter' | 'manual';

export interface FeedbackDeliveryReceiptV1 {
  readonly protocol: typeof FEEDBACK_PROTOCOL;
  readonly kind: typeof FEEDBACK_DELIVERY_RECEIPT_KIND;
  readonly provider_event_id: string;
  readonly delivery_state: FeedbackDeliveryState;
  readonly delivery_channel: FeedbackDeliveryChannel;
  readonly delivered_at: string | null;
  readonly acknowledged_at: string | null;
  readonly superseded_at: string | null;
}

export type FeedbackDeliveryReceiptInput = Omit<FeedbackDeliveryReceiptV1, 'protocol' | 'kind'>;

export interface FeedbackDeliveryTransitionInput {
  readonly delivery_state: Exclude<FeedbackDeliveryState, 'pending'>;
  /** Required only when a pending receipt is first delivered or acknowledged. */
  readonly delivery_channel?: Exclude<FeedbackDeliveryChannel, 'none'>;
  readonly transitioned_at: string;
}

export type ReactionAttemptOutcome = 'completed' | 'abandoned';

export type RepairDispatchPhase = 'prepared' | 'dispatched';
export type RepairSuccessorState = 'bound' | 'reserving';

/**
 * Crash-recoverable, evidence-only bridge from a source feedback revision to
 * one real lifecycle successor.  It never grants a lease transition: effects
 * must still call and revalidate the existing publication lifecycle commands.
 */
export interface RepairDispatchProofV1 {
  readonly protocol: typeof FEEDBACK_PROTOCOL;
  readonly kind: typeof REPAIR_DISPATCH_PROOF_KIND;
  /** Derived from immutable source fences, not supplied by a caller. */
  readonly repair_id: string;
  readonly publication_id: string;
  readonly receipt_sha256: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly generation: number;
  readonly head_sha: string;
  readonly ship_transaction_key: string;
  readonly feedback_revision: string;
  readonly before_reaction_token: string;
  readonly action: RepairOfferAction;
  readonly phase: RepairDispatchPhase;
  readonly successor_claim_id: string | null;
  readonly successor_generation: number | null;
  readonly successor_state: RepairSuccessorState | null;
}

export type RepairDispatchProofInput = Omit<RepairDispatchProofV1, 'protocol' | 'kind' | 'repair_id'>;
export type RepairDispatchProofIdentityInput = Omit<RepairDispatchProofInput,
  'phase' | 'successor_claim_id' | 'successor_generation' | 'successor_state'>;

export interface RepairDispatchSuccessorInput {
  readonly successor_claim_id: string;
  readonly successor_generation: number;
  readonly successor_state: RepairSuccessorState;
}

export interface ReactionAttemptReceiptV1 {
  readonly protocol: typeof FEEDBACK_PROTOCOL;
  readonly kind: typeof REACTION_ATTEMPT_RECEIPT_KIND;
  /** Source publication whose feedback caused the repair. */
  readonly publication_id: string;
  /** Derived dispatch-proof identity, never a caller-supplied attempt ID. */
  readonly repair_id: string;
  /** Derived from the dispatched repair plus the independently verified completion. */
  readonly completion_id: string;
  readonly successor_claim_id: string;
  readonly successor_generation: number;
  readonly completion_publication_id: string;
  readonly completion_receipt_sha256: string;
  readonly completion_head_sha: string;
  readonly completion_ship_transaction_key: string;
  readonly before_reaction_token: string;
  readonly after_reaction_token: string;
  readonly outcome: ReactionAttemptOutcome;
  readonly recorded_at: string;
}

export type ReactionAttemptReceiptInput = Omit<ReactionAttemptReceiptV1, 'protocol' | 'kind' | 'completion_id'>;

export type CompletionIdentityInput = Pick<ReactionAttemptReceiptInput,
  'repair_id' | 'successor_claim_id' | 'successor_generation' | 'completion_publication_id'
  | 'completion_receipt_sha256' | 'completion_head_sha' | 'completion_ship_transaction_key'>;

export interface ReactionTokenInput {
  readonly publication_id: string;
  readonly head_sha: string;
  readonly failing_checks: readonly FeedbackFailingCheckV1[];
  readonly unresolved_review_thread_ids: readonly string[];
  readonly mergeability: FeedbackMergeability;
}

export type RepairOfferAction = 'resume_same_owner' | 'explicit_takeover';
export type RepairOfferAttentionOwner = 'agent' | 'user';

export interface RepairOfferV1 {
  readonly protocol: typeof FEEDBACK_PROTOCOL;
  readonly kind: typeof REPAIR_OFFER_KIND;
  readonly task_id: string;
  readonly publication_id: string;
  readonly expected_claim_id: string;
  readonly expected_generation: number;
  readonly expected_head_sha: string;
  readonly feedback_revision: string;
  readonly attention_owner: RepairOfferAttentionOwner;
  readonly allowed_actions: readonly [RepairOfferAction, RepairOfferAction];
}

export type RepairOfferInput = Omit<RepairOfferV1, 'protocol' | 'kind'>;

export interface RepairOfferProjectionInput {
  readonly task_id: string;
  readonly publication_id: string;
  readonly expected_claim_id: string;
  readonly expected_generation: number;
  readonly expected_head_sha: string;
  readonly feedback_revision: string;
  readonly reaction_token: string;
  readonly reaction_attempts: readonly ReactionAttemptReceiptV1[];
}

export type RepairOfferProjection =
  | { readonly state: 'offered'; readonly attention_owner: 'agent'; readonly offer: RepairOfferV1 }
  | {
    readonly state: 'no_progress';
    readonly attention_owner: 'user';
    readonly publication_id: string;
    readonly feedback_revision: string;
    readonly reaction_token: string;
  };

function fail(code: FeedbackProtocolErrorCode, message: string): never {
  throw new FeedbackProtocolError(code, message);
}

function byteCompare(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function requiredString(value: unknown, label: string, code: FeedbackProtocolErrorCode = 'feedback_provider_shape_invalid'): string {
  if (typeof value !== 'string' || value.trim() === '') fail(code, `${label} is required`);
  return value;
}

function requiredDigest(value: unknown, label: string): string {
  const digest = requiredString(value, label);
  if (!SHA256_PATTERN.test(digest)) fail('feedback_provider_shape_invalid', `${label} is invalid`);
  return digest;
}

function requiredPublicationId(value: unknown, label = 'publication_id'): string {
  return requiredDigest(value, label);
}

function requiredGitOid(value: unknown, label: string): string {
  const oid = requiredString(value, label);
  if (!GIT_OID_PATTERN.test(oid)) fail('feedback_provider_shape_invalid', `${label} is invalid`);
  return oid;
}

function requiredTimestamp(value: unknown, label: string): string {
  const timestamp = requiredString(value, label);
  if (!RFC3339_UTC_PATTERN.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    fail('feedback_provider_shape_invalid', `${label} is invalid`);
  }
  return timestamp;
}

function optionalTimestamp(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredTimestamp(value, label);
}

function requiredTaskId(value: unknown): string {
  const taskId = requiredString(value, 'task_id');
  if (!/^[0-9a-f]{64}$/u.test(taskId)) fail('feedback_provider_shape_invalid', 'task_id is invalid');
  return taskId;
}

function normalizeIdentifierList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) fail('feedback_provider_shape_invalid', `${label} must be an array`);
  const values = value.map((entry) => requiredString(entry, `${label} entry`));
  if (new Set(values).size !== values.length) fail('feedback_provider_shape_invalid', `${label} must be unique`);
  return Object.freeze([...values].sort(byteCompare));
}

function requireCanonicalIdentifierList(value: unknown, label: string): readonly string[] {
  const normalized = normalizeIdentifierList(value, label);
  if (!Array.isArray(value) || value.length !== normalized.length || value.some((entry, index) => entry !== normalized[index])) {
    fail('feedback_unreadable', `${label} is not sorted canonically`);
  }
  return normalized;
}

function requiredMergeability(value: unknown): FeedbackMergeability {
  if (value !== 'MERGEABLE' && value !== 'CONFLICTING') {
    fail('feedback_provider_shape_invalid', 'mergeability is invalid');
  }
  return value;
}

function normalizeFailingChecks(value: unknown, label: string): readonly FeedbackFailingCheckV1[] {
  if (!Array.isArray(value)) fail('feedback_provider_shape_invalid', `${label} must be an array`);
  const checks: FeedbackFailingCheckV1[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail('feedback_provider_shape_invalid', `${label} entry must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record).sort(byteCompare);
    if (stablePublicationJson(keys) !== stablePublicationJson(['conclusion', 'id'])) {
      fail('feedback_provider_shape_invalid', `${label} entry fields are invalid`);
    }
    const id = requiredString(record.id, `${label} entry id`);
    if (ids.has(id)) fail('feedback_provider_shape_invalid', `${label} must be unique by id`);
    ids.add(id);
    const conclusion = record.conclusion;
    if (typeof conclusion !== 'string' || !FEEDBACK_CHECK_CONCLUSIONS.has(conclusion as FeedbackCheckConclusion)) {
      fail('feedback_provider_shape_invalid', `${label} entry conclusion is invalid`);
    }
    checks.push(Object.freeze({ id, conclusion: conclusion as FeedbackCheckConclusion }));
  }
  return Object.freeze(checks.sort((left, right) => byteCompare(left.id, right.id)));
}

function requireCanonicalFailingChecks(value: unknown, label: string): readonly FeedbackFailingCheckV1[] {
  const normalized = normalizeFailingChecks(value, label);
  if (!Array.isArray(value) || value.length !== normalized.length
    || value.some((entry, index) => stablePublicationJson(entry) !== stablePublicationJson(normalized[index]))) {
    fail('feedback_unreadable', `${label} is not sorted canonically`);
  }
  return normalized;
}

function sameIdentifierList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requireExactKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort(byteCompare);
  const sortedExpected = [...expected].sort(byteCompare);
  if (stablePublicationJson(actual) !== stablePublicationJson(sortedExpected)) {
    fail('feedback_unreadable', `${label} fields are invalid: expected ${sortedExpected.join(', ')}`);
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('feedback_unreadable', `${label} must be an object`);
  return value as Record<string, unknown>;
}

function normalizeEventInput(input: FeedbackEventInput): FeedbackEventInput {
  const providerEventId = requiredString(input.provider_event_id, 'provider_event_id', 'feedback_event_id_missing');
  const summary = requiredString(input.summary, 'summary');
  if (Buffer.byteLength(summary, 'utf-8') > FEEDBACK_SUMMARY_MAX_BYTES) {
    fail('feedback_provider_shape_invalid', `summary exceeds ${FEEDBACK_SUMMARY_MAX_BYTES} bytes`);
  }
  const providerUrl = requiredString(input.provider_url, 'provider_url');
  try {
    const url = new URL(providerUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported protocol');
  } catch {
    fail('feedback_provider_shape_invalid', 'provider_url is invalid');
  }
  if (input.provider !== 'github') fail('feedback_provider_shape_invalid', 'provider is invalid');
  const failingChecks = normalizeFailingChecks(input.failing_checks, 'failing_checks');
  const failingCheckIds = normalizeIdentifierList(input.failing_check_ids, 'failing_check_ids');
  if (!sameIdentifierList(failingCheckIds, failingChecks.map((check) => check.id))) {
    fail('feedback_provider_shape_invalid', 'failing_check_ids must match failing_checks');
  }
  return Object.freeze({
    provider: 'github',
    provider_event_id: providerEventId,
    publication_id: requiredPublicationId(input.publication_id),
    head_sha: requiredGitOid(input.head_sha, 'head_sha'),
    failing_check_ids: failingCheckIds,
    failing_checks: failingChecks,
    unresolved_review_thread_ids: normalizeIdentifierList(input.unresolved_review_thread_ids, 'unresolved_review_thread_ids'),
    changes_requested_review_ids: normalizeIdentifierList(input.changes_requested_review_ids, 'changes_requested_review_ids'),
    mergeability: requiredMergeability(input.mergeability),
    summary,
    provider_url: providerUrl,
    observed_at: requiredTimestamp(input.observed_at, 'observed_at'),
  });
}

function eventBasis(input: FeedbackEventInput): Omit<FeedbackEventV1, 'observed_digest'> {
  return Object.freeze({
    protocol: FEEDBACK_PROTOCOL,
    kind: FEEDBACK_EVENT_KIND,
    ...normalizeEventInput(input),
  });
}

/** The immutable event digest intentionally excludes itself and all delivery state. */
export function feedbackObservedDigest(event: Omit<FeedbackEventV1, 'observed_digest'>): string {
  return publicationSha256(stablePublicationJson(event));
}

export function buildFeedbackEvent(input: FeedbackEventInput): FeedbackEventV1 {
  const basis = eventBasis(input);
  return Object.freeze({ ...basis, observed_digest: feedbackObservedDigest(basis) });
}

export function validateFeedbackEvent(value: unknown): FeedbackEventV1 {
  const record = object(value, 'feedback event');
  requireExactKeys(record, [
    'protocol', 'kind', 'provider', 'provider_event_id', 'publication_id', 'head_sha',
    'failing_check_ids', 'failing_checks', 'unresolved_review_thread_ids', 'changes_requested_review_ids',
    'mergeability', 'summary', 'provider_url', 'observed_at', 'observed_digest',
  ], 'feedback event');
  if (record.protocol !== FEEDBACK_PROTOCOL || record.kind !== FEEDBACK_EVENT_KIND) {
    fail('feedback_unreadable', 'feedback event protocol or kind is invalid');
  }
  const built = buildFeedbackEvent({
    provider: record.provider as 'github',
    provider_event_id: record.provider_event_id as string,
    publication_id: record.publication_id as string,
    head_sha: record.head_sha as string,
    failing_check_ids: record.failing_check_ids as readonly string[],
    failing_checks: record.failing_checks as readonly FeedbackFailingCheckV1[],
    unresolved_review_thread_ids: record.unresolved_review_thread_ids as readonly string[],
    changes_requested_review_ids: record.changes_requested_review_ids as readonly string[],
    mergeability: record.mergeability as FeedbackMergeability,
    summary: record.summary as string,
    provider_url: record.provider_url as string,
    observed_at: record.observed_at as string,
  });
  requireCanonicalIdentifierList(record.failing_check_ids, 'failing_check_ids');
  requireCanonicalFailingChecks(record.failing_checks, 'failing_checks');
  requireCanonicalIdentifierList(record.unresolved_review_thread_ids, 'unresolved_review_thread_ids');
  requireCanonicalIdentifierList(record.changes_requested_review_ids, 'changes_requested_review_ids');
  if (record.observed_digest !== built.observed_digest) {
    fail('feedback_unreadable', 'feedback event observed_digest is stale');
  }
  return built;
}

export function canonicalFeedbackEventBytes(event: FeedbackEventV1): string {
  return stablePublicationJson(validateFeedbackEvent(event));
}

function validateDeliveryInput(input: FeedbackDeliveryReceiptInput): FeedbackDeliveryReceiptInput {
  const receipt: FeedbackDeliveryReceiptInput = {
    provider_event_id: requiredString(input.provider_event_id, 'provider_event_id', 'feedback_event_id_missing'),
    delivery_state: input.delivery_state,
    delivery_channel: input.delivery_channel,
    delivered_at: optionalTimestamp(input.delivered_at, 'delivered_at'),
    acknowledged_at: optionalTimestamp(input.acknowledged_at, 'acknowledged_at'),
    superseded_at: optionalTimestamp(input.superseded_at, 'superseded_at'),
  };
  if (!['pending', 'delivered', 'acknowledged', 'superseded'].includes(receipt.delivery_state)) {
    fail('feedback_provider_shape_invalid', 'delivery_state is invalid');
  }
  if (!['none', 'hook_session', 'host_adapter', 'manual'].includes(receipt.delivery_channel)) {
    fail('feedback_provider_shape_invalid', 'delivery_channel is invalid');
  }
  if (receipt.delivery_state === 'pending') {
    if (receipt.delivery_channel !== 'none' || receipt.delivered_at !== null || receipt.acknowledged_at !== null || receipt.superseded_at !== null) {
      fail('feedback_provider_shape_invalid', 'pending delivery receipt has transition fields');
    }
  } else if (receipt.delivery_state === 'delivered') {
    if (receipt.delivery_channel === 'none' || receipt.delivered_at === null || receipt.acknowledged_at !== null || receipt.superseded_at !== null) {
      fail('feedback_provider_shape_invalid', 'delivered receipt fields are invalid');
    }
  } else if (receipt.delivery_state === 'acknowledged') {
    if (receipt.delivery_channel === 'none' || receipt.delivered_at === null || receipt.acknowledged_at === null || receipt.superseded_at !== null) {
      fail('feedback_provider_shape_invalid', 'acknowledged receipt fields are invalid');
    }
  } else if (receipt.superseded_at === null || receipt.acknowledged_at !== null || (receipt.delivered_at === null) !== (receipt.delivery_channel === 'none')) {
    fail('feedback_provider_shape_invalid', 'superseded receipt fields are invalid');
  }
  return Object.freeze(receipt);
}

export function buildFeedbackDeliveryReceipt(input: FeedbackDeliveryReceiptInput): FeedbackDeliveryReceiptV1 {
  return Object.freeze({
    protocol: FEEDBACK_PROTOCOL,
    kind: FEEDBACK_DELIVERY_RECEIPT_KIND,
    ...validateDeliveryInput(input),
  });
}

export function validateFeedbackDeliveryReceipt(value: unknown): FeedbackDeliveryReceiptV1 {
  const record = object(value, 'feedback delivery receipt');
  requireExactKeys(record, [
    'protocol', 'kind', 'provider_event_id', 'delivery_state', 'delivery_channel',
    'delivered_at', 'acknowledged_at', 'superseded_at',
  ], 'feedback delivery receipt');
  if (record.protocol !== FEEDBACK_PROTOCOL || record.kind !== FEEDBACK_DELIVERY_RECEIPT_KIND) {
    fail('feedback_unreadable', 'feedback delivery receipt protocol or kind is invalid');
  }
  try {
    return buildFeedbackDeliveryReceipt({
      provider_event_id: record.provider_event_id as string,
      delivery_state: record.delivery_state as FeedbackDeliveryState,
      delivery_channel: record.delivery_channel as FeedbackDeliveryChannel,
      delivered_at: record.delivered_at as string | null,
      acknowledged_at: record.acknowledged_at as string | null,
      superseded_at: record.superseded_at as string | null,
    });
  } catch (error) {
    if (error instanceof FeedbackProtocolError) throw new FeedbackProtocolError('feedback_unreadable', error.message);
    throw error;
  }
}

export function canonicalFeedbackDeliveryReceiptBytes(receipt: FeedbackDeliveryReceiptV1): string {
  return stablePublicationJson(validateFeedbackDeliveryReceipt(receipt));
}

/**
 * Delivery is mutable but monotonic.  Repeating a completed transition returns
 * the canonical existing receipt only when it is already in that exact state.
 */
export function transitionFeedbackDeliveryReceipt(
  receipt: FeedbackDeliveryReceiptV1,
  input: FeedbackDeliveryTransitionInput,
): FeedbackDeliveryReceiptV1 {
  const current = validateFeedbackDeliveryReceipt(receipt);
  const at = requiredTimestamp(input.transitioned_at, 'transitioned_at');
  const next = input.delivery_state;
  if (!['delivered', 'acknowledged', 'superseded'].includes(next)) {
    fail('feedback_provider_shape_invalid', 'delivery transition state is invalid');
  }
  if (next === current.delivery_state) return current;
  if (current.delivery_state === 'acknowledged' || current.delivery_state === 'superseded') {
    fail('feedback_provider_shape_invalid', `cannot transition ${current.delivery_state} delivery receipt`);
  }
  if (current.delivery_state === 'pending') {
    if (next === 'superseded') {
      if (input.delivery_channel !== undefined) fail('feedback_provider_shape_invalid', 'pending supersede cannot set delivery_channel');
      return buildFeedbackDeliveryReceipt({
        provider_event_id: current.provider_event_id,
        delivery_state: 'superseded',
        delivery_channel: 'none',
        delivered_at: null,
        acknowledged_at: null,
        superseded_at: at,
      });
    }
    const channel = input.delivery_channel;
    if (channel === undefined) fail('feedback_provider_shape_invalid', 'first delivery requires delivery_channel');
    return buildFeedbackDeliveryReceipt({
      provider_event_id: current.provider_event_id,
      delivery_state: next,
      delivery_channel: channel,
      delivered_at: at,
      acknowledged_at: next === 'acknowledged' ? at : null,
      superseded_at: null,
    });
  }
  if (input.delivery_channel !== undefined && input.delivery_channel !== current.delivery_channel) {
    fail('feedback_provider_shape_invalid', 'delivery_channel cannot change after delivery');
  }
  return buildFeedbackDeliveryReceipt({
    provider_event_id: current.provider_event_id,
    delivery_state: next,
    delivery_channel: current.delivery_channel,
    delivered_at: current.delivered_at,
    acknowledged_at: next === 'acknowledged' ? at : null,
    superseded_at: next === 'superseded' ? at : null,
  });
}

function requireGeneration(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) {
    fail('feedback_provider_shape_invalid', `${label} is invalid`);
  }
  return value as number;
}

function validateDispatchIdentity(input: RepairDispatchProofIdentityInput): RepairDispatchProofIdentityInput {
  if (input.action !== 'resume_same_owner' && input.action !== 'explicit_takeover') {
    fail('feedback_provider_shape_invalid', 'repair action is invalid');
  }
  return Object.freeze({
    publication_id: requiredPublicationId(input.publication_id),
    receipt_sha256: requiredDigest(input.receipt_sha256, 'receipt_sha256'),
    task_id: requiredTaskId(input.task_id),
    task_revision: requiredTaskId(input.task_revision),
    claim_id: requiredString(input.claim_id, 'claim_id'),
    generation: requireGeneration(input.generation, 'generation'),
    head_sha: requiredGitOid(input.head_sha, 'head_sha'),
    ship_transaction_key: requiredString(input.ship_transaction_key, 'ship_transaction_key'),
    feedback_revision: requiredDigest(input.feedback_revision, 'feedback_revision'),
    before_reaction_token: requiredDigest(input.before_reaction_token, 'before_reaction_token'),
    action: input.action,
  });
}

/** Stable key for one source publication/feedback/action repair intent. */
export function deriveRepairId(input: RepairDispatchProofIdentityInput): string {
  const valid = validateDispatchIdentity(input);
  return publicationSha256(stablePublicationJson([
    REPAIR_DISPATCH_PROOF_KIND,
    valid.publication_id,
    valid.receipt_sha256,
    valid.task_id,
    valid.task_revision,
    valid.claim_id,
    valid.generation,
    valid.head_sha,
    valid.ship_transaction_key,
    valid.feedback_revision,
    valid.before_reaction_token,
    valid.action,
  ]));
}

function validateDispatchProofInput(input: RepairDispatchProofInput): RepairDispatchProofInput {
  const identity = validateDispatchIdentity(input);
  if (input.phase !== 'prepared' && input.phase !== 'dispatched') {
    fail('feedback_provider_shape_invalid', 'repair dispatch phase is invalid');
  }
  const successorClaim = input.successor_claim_id;
  const successorGeneration = input.successor_generation;
  const successorState = input.successor_state;
  if (input.phase === 'prepared') {
    if (successorClaim !== null || successorGeneration !== null || successorState !== null) {
      fail('feedback_provider_shape_invalid', 'prepared repair dispatch cannot contain a successor');
    }
  } else {
    if (typeof successorClaim !== 'string' || successorClaim.trim() === ''
      || typeof successorGeneration !== 'number' || !Number.isInteger(successorGeneration) || successorGeneration < 1
      || (successorState !== 'bound' && successorState !== 'reserving')) {
      fail('feedback_provider_shape_invalid', 'dispatched repair successor is invalid');
    }
    if (identity.action === 'resume_same_owner' && (
      successorClaim !== identity.claim_id
      || successorGeneration !== identity.generation
      || successorState !== 'bound'
    )) {
      fail('feedback_provider_shape_invalid', 'same-owner repair successor does not match the source lease');
    }
    if (identity.action === 'explicit_takeover' && (
      successorClaim === identity.claim_id
      || successorGeneration !== identity.generation + 1
      || successorState !== 'reserving'
    )) {
      fail('feedback_provider_shape_invalid', 'takeover repair successor does not match lifecycle fencing');
    }
  }
  return Object.freeze({
    ...identity,
    phase: input.phase,
    successor_claim_id: successorClaim,
    successor_generation: successorGeneration,
    successor_state: successorState,
  });
}

export function buildRepairDispatchProof(input: RepairDispatchProofInput): RepairDispatchProofV1 {
  const valid = validateDispatchProofInput(input);
  return Object.freeze({
    protocol: FEEDBACK_PROTOCOL,
    kind: REPAIR_DISPATCH_PROOF_KIND,
    repair_id: deriveRepairId(valid),
    ...valid,
  });
}

export function validateRepairDispatchProof(value: unknown): RepairDispatchProofV1 {
  const record = object(value, 'repair dispatch proof');
  requireExactKeys(record, [
    'protocol', 'kind', 'repair_id', 'publication_id', 'receipt_sha256', 'task_id', 'task_revision',
    'claim_id', 'generation', 'head_sha', 'ship_transaction_key', 'feedback_revision',
    'before_reaction_token', 'action', 'phase', 'successor_claim_id', 'successor_generation', 'successor_state',
  ], 'repair dispatch proof');
  if (record.protocol !== FEEDBACK_PROTOCOL || record.kind !== REPAIR_DISPATCH_PROOF_KIND) {
    fail('feedback_unreadable', 'repair dispatch proof protocol or kind is invalid');
  }
  try {
    const proof = buildRepairDispatchProof({
      publication_id: record.publication_id as string,
      receipt_sha256: record.receipt_sha256 as string,
      task_id: record.task_id as string,
      task_revision: record.task_revision as string,
      claim_id: record.claim_id as string,
      generation: record.generation as number,
      head_sha: record.head_sha as string,
      ship_transaction_key: record.ship_transaction_key as string,
      feedback_revision: record.feedback_revision as string,
      before_reaction_token: record.before_reaction_token as string,
      action: record.action as RepairOfferAction,
      phase: record.phase as RepairDispatchPhase,
      successor_claim_id: record.successor_claim_id as string | null,
      successor_generation: record.successor_generation as number | null,
      successor_state: record.successor_state as RepairSuccessorState | null,
    });
    if (record.repair_id !== proof.repair_id) fail('feedback_unreadable', 'repair dispatch proof repair_id is stale');
    return proof;
  } catch (error) {
    if (error instanceof FeedbackProtocolError) throw new FeedbackProtocolError('feedback_unreadable', error.message);
    throw error;
  }
}

export function canonicalRepairDispatchProofBytes(proof: RepairDispatchProofV1): string {
  return stablePublicationJson(validateRepairDispatchProof(proof));
}

/** The only pure proof phase transition: `prepared` records its real lifecycle successor once. */
export function transitionRepairDispatchProof(
  proof: RepairDispatchProofV1,
  successor: RepairDispatchSuccessorInput,
): RepairDispatchProofV1 {
  const current = validateRepairDispatchProof(proof);
  if (current.phase === 'dispatched') {
    if (current.successor_claim_id === successor.successor_claim_id
      && current.successor_generation === successor.successor_generation
      && current.successor_state === successor.successor_state) return current;
    fail('feedback_provider_shape_invalid', 'repair dispatch proof successor cannot change');
  }
  return buildRepairDispatchProof({
    publication_id: current.publication_id,
    receipt_sha256: current.receipt_sha256,
    task_id: current.task_id,
    task_revision: current.task_revision,
    claim_id: current.claim_id,
    generation: current.generation,
    head_sha: current.head_sha,
    ship_transaction_key: current.ship_transaction_key,
    feedback_revision: current.feedback_revision,
    before_reaction_token: current.before_reaction_token,
    action: current.action,
    phase: 'dispatched',
    successor_claim_id: successor.successor_claim_id,
    successor_generation: successor.successor_generation,
    successor_state: successor.successor_state,
  });
}

function validateCompletionIdentity(input: CompletionIdentityInput): CompletionIdentityInput {
  return Object.freeze({
    repair_id: requiredDigest(input.repair_id, 'repair_id'),
    successor_claim_id: requiredString(input.successor_claim_id, 'successor_claim_id'),
    successor_generation: requireGeneration(input.successor_generation, 'successor_generation'),
    completion_publication_id: requiredPublicationId(input.completion_publication_id, 'completion_publication_id'),
    completion_receipt_sha256: requiredDigest(input.completion_receipt_sha256, 'completion_receipt_sha256'),
    completion_head_sha: requiredGitOid(input.completion_head_sha, 'completion_head_sha'),
    completion_ship_transaction_key: requiredString(input.completion_ship_transaction_key, 'completion_ship_transaction_key'),
  });
}

/** Stable idempotency key for the verified completion of one dispatched repair. */
export function deriveCompletionId(input: CompletionIdentityInput): string {
  const valid = validateCompletionIdentity(input);
  return publicationSha256(stablePublicationJson([
    REACTION_ATTEMPT_RECEIPT_KIND,
    valid.repair_id,
    valid.successor_claim_id,
    valid.successor_generation,
    valid.completion_publication_id,
    valid.completion_receipt_sha256,
    valid.completion_head_sha,
    valid.completion_ship_transaction_key,
  ]));
}

function validateReactionInput(input: ReactionAttemptReceiptInput): ReactionAttemptReceiptInput {
  const outcome = input.outcome;
  if (outcome !== 'completed' && outcome !== 'abandoned') {
    fail('feedback_provider_shape_invalid', 'reaction outcome is invalid');
  }
  const completion = validateCompletionIdentity(input);
  return Object.freeze({
    publication_id: requiredPublicationId(input.publication_id),
    ...completion,
    before_reaction_token: requiredDigest(input.before_reaction_token, 'before_reaction_token'),
    after_reaction_token: requiredDigest(input.after_reaction_token, 'after_reaction_token'),
    outcome,
    recorded_at: requiredTimestamp(input.recorded_at, 'recorded_at'),
  });
}

export function buildReactionAttemptReceipt(input: ReactionAttemptReceiptInput): ReactionAttemptReceiptV1 {
  const valid = validateReactionInput(input);
  return Object.freeze({
    protocol: FEEDBACK_PROTOCOL,
    kind: REACTION_ATTEMPT_RECEIPT_KIND,
    completion_id: deriveCompletionId(valid),
    ...valid,
  });
}

export function validateReactionAttemptReceipt(value: unknown): ReactionAttemptReceiptV1 {
  const record = object(value, 'reaction attempt receipt');
  requireExactKeys(record, [
    'protocol', 'kind', 'publication_id', 'repair_id', 'completion_id', 'successor_claim_id',
    'successor_generation', 'completion_publication_id', 'completion_receipt_sha256',
    'completion_head_sha', 'completion_ship_transaction_key', 'before_reaction_token',
    'after_reaction_token', 'outcome', 'recorded_at',
  ], 'reaction attempt receipt');
  if (record.protocol !== FEEDBACK_PROTOCOL || record.kind !== REACTION_ATTEMPT_RECEIPT_KIND) {
    fail('feedback_unreadable', 'reaction attempt receipt protocol or kind is invalid');
  }
  try {
    const receipt = buildReactionAttemptReceipt({
      publication_id: record.publication_id as string,
      repair_id: record.repair_id as string,
      successor_claim_id: record.successor_claim_id as string,
      successor_generation: record.successor_generation as number,
      completion_publication_id: record.completion_publication_id as string,
      completion_receipt_sha256: record.completion_receipt_sha256 as string,
      completion_head_sha: record.completion_head_sha as string,
      completion_ship_transaction_key: record.completion_ship_transaction_key as string,
      before_reaction_token: record.before_reaction_token as string,
      after_reaction_token: record.after_reaction_token as string,
      outcome: record.outcome as ReactionAttemptOutcome,
      recorded_at: record.recorded_at as string,
    });
    if (record.completion_id !== receipt.completion_id) {
      fail('feedback_unreadable', 'reaction attempt receipt completion_id is stale');
    }
    return receipt;
  } catch (error) {
    if (error instanceof FeedbackProtocolError) throw new FeedbackProtocolError('feedback_unreadable', error.message);
    throw error;
  }
}

export function canonicalReactionAttemptReceiptBytes(receipt: ReactionAttemptReceiptV1): string {
  return stablePublicationJson(validateReactionAttemptReceipt(receipt));
}

/**
 * Deliberately excludes summary, URLs, timestamps, delivery state and local
 * attempt metadata. The frozen breaker domain is publication/head identity,
 * failing check conclusions, unresolved threads, and mergeability; individual
 * changes-requested review IDs remain immutable feedback-revision evidence.
 */
export function deriveReactionToken(input: ReactionTokenInput): string {
  return publicationSha256(stablePublicationJson([
    requiredPublicationId(input.publication_id),
    requiredGitOid(input.head_sha, 'head_sha'),
    normalizeFailingChecks(input.failing_checks, 'failing_checks'),
    normalizeIdentifierList(input.unresolved_review_thread_ids, 'unresolved_review_thread_ids'),
    requiredMergeability(input.mergeability),
  ]));
}

function validateRepairOfferInput(input: RepairOfferInput): RepairOfferInput {
  const allowed = input.allowed_actions;
  if (!Array.isArray(allowed) || allowed.length !== 2
    || allowed[0] !== 'resume_same_owner' || allowed[1] !== 'explicit_takeover') {
    fail('feedback_provider_shape_invalid', 'repair offer allowed_actions is invalid');
  }
  if (input.attention_owner !== 'agent' && input.attention_owner !== 'user') {
    fail('feedback_provider_shape_invalid', 'repair offer attention_owner is invalid');
  }
  if (!Number.isInteger(input.expected_generation) || input.expected_generation < 1) {
    fail('feedback_provider_shape_invalid', 'repair offer expected_generation is invalid');
  }
  return Object.freeze({
    task_id: requiredTaskId(input.task_id),
    publication_id: requiredPublicationId(input.publication_id),
    expected_claim_id: requiredString(input.expected_claim_id, 'expected_claim_id'),
    expected_generation: input.expected_generation,
    expected_head_sha: requiredGitOid(input.expected_head_sha, 'expected_head_sha'),
    feedback_revision: requiredDigest(input.feedback_revision, 'feedback_revision'),
    attention_owner: input.attention_owner,
    allowed_actions: Object.freeze(['resume_same_owner', 'explicit_takeover']) as readonly [RepairOfferAction, RepairOfferAction],
  });
}

export function buildRepairOffer(input: RepairOfferInput): RepairOfferV1 {
  return Object.freeze({
    protocol: FEEDBACK_PROTOCOL,
    kind: REPAIR_OFFER_KIND,
    ...validateRepairOfferInput(input),
  });
}

export function validateRepairOffer(value: unknown): RepairOfferV1 {
  const record = object(value, 'repair offer');
  requireExactKeys(record, [
    'protocol', 'kind', 'task_id', 'publication_id', 'expected_claim_id', 'expected_generation',
    'expected_head_sha', 'feedback_revision', 'attention_owner', 'allowed_actions',
  ], 'repair offer');
  if (record.protocol !== FEEDBACK_PROTOCOL || record.kind !== REPAIR_OFFER_KIND) {
    fail('feedback_unreadable', 'repair offer protocol or kind is invalid');
  }
  try {
    return buildRepairOffer({
      task_id: record.task_id as string,
      publication_id: record.publication_id as string,
      expected_claim_id: record.expected_claim_id as string,
      expected_generation: record.expected_generation as number,
      expected_head_sha: record.expected_head_sha as string,
      feedback_revision: record.feedback_revision as string,
      attention_owner: record.attention_owner as RepairOfferAttentionOwner,
      allowed_actions: record.allowed_actions as [RepairOfferAction, RepairOfferAction],
    });
  } catch (error) {
    if (error instanceof FeedbackProtocolError) throw new FeedbackProtocolError('feedback_unreadable', error.message);
    throw error;
  }
}

/** The set hash is independent of provider response order and delivery receipts. */
export function deriveFeedbackRevision(events: readonly FeedbackEventV1[]): string {
  const canonical = events.map((event) => validateFeedbackEvent(event));
  const ids = new Set<string>();
  let publicationId: string | null = null;
  for (const event of canonical) {
    if (ids.has(event.provider_event_id)) fail('feedback_provider_shape_invalid', 'feedback revision has duplicate provider_event_id');
    ids.add(event.provider_event_id);
    if (publicationId === null) publicationId = event.publication_id;
    else if (publicationId !== event.publication_id) fail('feedback_provider_shape_invalid', 'feedback revision spans publications');
  }
  return publicationSha256(stablePublicationJson(
    canonical.sort((left, right) => byteCompare(left.provider_event_id, right.provider_event_id)),
  ));
}

export function projectRepairOffer(input: RepairOfferProjectionInput): RepairOfferProjection {
  const publicationId = requiredPublicationId(input.publication_id);
  const feedbackRevision = requiredDigest(input.feedback_revision, 'feedback_revision');
  const token = requiredDigest(input.reaction_token, 'reaction_token');
  const relevant = input.reaction_attempts
    .map((receipt) => validateReactionAttemptReceipt(receipt))
    .filter((receipt) => receipt.publication_id === publicationId)
    .map((receipt) => ({
      outcome: receipt.outcome,
      before_token: receipt.before_reaction_token,
      after_token: receipt.after_reaction_token,
    }));
  if (evaluateNoProgress(relevant, token) === 'no_progress') {
    return Object.freeze({
      state: 'no_progress',
      attention_owner: 'user',
      publication_id: publicationId,
      feedback_revision: feedbackRevision,
      reaction_token: token,
    });
  }
  return Object.freeze({
    state: 'offered',
    attention_owner: 'agent',
    offer: buildRepairOffer({
      task_id: input.task_id,
      publication_id: publicationId,
      expected_claim_id: input.expected_claim_id,
      expected_generation: input.expected_generation,
      expected_head_sha: input.expected_head_sha,
      feedback_revision: feedbackRevision,
      attention_owner: 'agent',
      allowed_actions: ['resume_same_owner', 'explicit_takeover'],
    }),
  });
}
