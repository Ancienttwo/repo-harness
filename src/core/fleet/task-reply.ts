import { canonicalEngineerJson, engineerSha256 } from '../engineers/profile-binding';
import {
  validateClaimActorReceipt,
  validateEngineerPrincipalMapping,
  type ClaimActorReceiptV1,
  type EngineerPrincipalMappingV1,
} from '../engineers/principal-claim';
import { assertMessageExactKeys, assertMessageTimestamp, assertMessageUuid } from '../messages/mechanics';
import {
  buildTaskMessageEvent,
  canonicalTaskMessageDeliveryReceiptBytes,
  validateTaskMessageDeliveryReceipt,
  validateTaskMessageEvent,
  type TaskMessageDeliveryReceiptV1,
  type TaskMessageEventV1,
} from './task-message';

export const TASK_REPLY_PROTOCOL = 1 as const;
export const TASK_REPLY_INTENT_KIND = 'repo-harness-task-reply-intent' as const;
export const TASK_REPLY_COMMIT_KIND = 'repo-harness-task-reply-commit' as const;

/** Frozen recovery inputs. These snapshots bind bytes, not live authorization. */
export interface TaskReplyIntentV1 {
  readonly protocol: typeof TASK_REPLY_PROTOCOL;
  readonly kind: typeof TASK_REPLY_INTENT_KIND;
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly parent: TaskMessageEventV1;
  readonly acknowledgement: TaskMessageDeliveryReceiptV1;
  readonly principal_mapping: EngineerPrincipalMappingV1;
  readonly claim_actor: ClaimActorReceiptV1;
  readonly reply: TaskMessageEventV1;
  readonly prepared_at: string;
  readonly intent_sha256: string;
}

/** Provenance is bound transitively through the intent; body authority stays in the event. */
export interface TaskReplyCommitV1 {
  readonly protocol: typeof TASK_REPLY_PROTOCOL;
  readonly kind: typeof TASK_REPLY_COMMIT_KIND;
  readonly effect_id: string;
  readonly intent_sha256: string;
  readonly reply_event_digest: string;
  readonly acknowledgement_sha256: string;
  readonly committed_at: string;
  readonly commit_sha256: string;
}

export type TaskReplyErrorCode = 'task_reply_invalid' | 'task_reply_conflict' | 'task_reply_fence_changed';
export class TaskReplyError extends Error {
  constructor(readonly code: TaskReplyErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TaskReplyError';
  }
}

function invalid(message: string): never {
  throw new TaskReplyError('task_reply_invalid', message);
}

function source<T>(read: () => T): T {
  try { return read(); } catch (error) {
    if (error instanceof TaskReplyError) throw error;
    throw new TaskReplyError('task_reply_invalid', 'invalid reply source record', error);
  }
}

function record(value: unknown, keys: readonly string[], kind: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${kind} must be an object`);
  const result = value as Record<string, unknown>;
  assertMessageExactKeys(result, keys, kind, invalid);
  if (result.protocol !== TASK_REPLY_PROTOCOL || result.kind !== kind) invalid('reply protocol or kind is invalid');
  return result;
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== 'string') invalid(`${label} must be a UUID`);
  assertMessageUuid(value, label, invalid);
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') invalid(`${label} must be a timestamp`);
  assertMessageTimestamp(value, label, invalid);
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) invalid(`${label} must be a digest`);
  return value;
}

function sha(value: object): string {
  return engineerSha256(canonicalEngineerJson(value));
}

function acknowledgementDigest(ack: TaskMessageDeliveryReceiptV1): string {
  return engineerSha256(canonicalTaskMessageDeliveryReceiptBytes(ack));
}

function validateSources(input: {
  parent: unknown;
  acknowledgement: unknown;
  principal_mapping: unknown;
  claim_actor: unknown;
}): Pick<TaskReplyIntentV1, 'parent' | 'acknowledgement' | 'principal_mapping' | 'claim_actor'> {
  return source(() => {
    const parent = validateTaskMessageEvent(input.parent);
    const ack = validateTaskMessageDeliveryReceipt(input.acknowledgement);
    const mapping = validateEngineerPrincipalMapping(input.principal_mapping);
    const actor = validateClaimActorReceipt(input.claim_actor);
    if (parent.audience !== 'owner' || parent.in_reply_to !== null
      || (parent.sender_kind !== 'user' && parent.sender_kind !== 'operator')
      || parent.sender_trust !== 'local_operator') invalid('parent is not an original human owner steer');
    if (parent.task_id !== actor.task_id || parent.task_revision !== actor.task_revision) invalid('parent task or revision differs from actor');
    if (parent.scope === 'claim' && (parent.target_claim_id !== actor.claim_id
      || parent.target_generation !== actor.lease_generation)) invalid('parent claim fence differs from actor');
    if (ack.delivery_state !== 'acknowledged' || ack.message_id !== parent.message_id
      || ack.recipient_task_revision !== parent.task_revision || ack.recipient_kind !== 'claim'
      || ack.recipient_claim_id !== actor.claim_id || ack.recipient_generation !== actor.lease_generation) {
      invalid('reply requires the exact actor recipient acknowledgement');
    }
    if (mapping.state !== 'active' || mapping.repository_id !== actor.repository_id
      || mapping.engineer_id !== actor.engineer_id || mapping.binding_id !== actor.binding_id
      || mapping.binding_generation !== actor.binding_generation
      || mapping.engineer_contract_revision !== actor.engineer_contract_revision) invalid('mapping and actor fences differ');
    return { parent, acknowledgement: ack, principal_mapping: mapping, claim_actor: actor };
  });
}

export function buildTaskReplyIntent(input: {
  readonly parent: TaskMessageEventV1;
  readonly acknowledgement: TaskMessageDeliveryReceiptV1;
  readonly principal_mapping: EngineerPrincipalMappingV1;
  readonly claim_actor: ClaimActorReceiptV1;
  readonly reply_message_id: string;
  readonly body: string;
  readonly prepared_at: string;
}): TaskReplyIntentV1 {
  const sources = validateSources(input);
  const preparedAt = timestamp(input.prepared_at, 'prepared_at');
  const reply = source(() => buildTaskMessageEvent({
    message_id: input.reply_message_id,
    task_id: sources.parent.task_id,
    task_revision: sources.parent.task_revision,
    scope: 'task', target_claim_id: null, target_generation: null,
    sender_kind: 'agent', sender_id: sources.claim_actor.receipt_sha256, sender_trust: 'lease_owner',
    audience: 'user', body: input.body, created_at: preparedAt, in_reply_to: sources.parent.message_id,
  }));
  if (reply.message_id === sources.parent.message_id) invalid('reply and parent IDs must differ');
  const basis = {
    protocol: TASK_REPLY_PROTOCOL, kind: TASK_REPLY_INTENT_KIND,
    effect_id: reply.message_id, idempotency_key: reply.message_id,
    ...sources, reply, prepared_at: preparedAt,
  };
  return Object.freeze({ ...basis, intent_sha256: sha(basis) });
}

export function validateTaskReplyIntent(value: unknown): TaskReplyIntentV1 {
  const input = record(value, ['protocol', 'kind', 'effect_id', 'idempotency_key', 'parent', 'acknowledgement',
    'principal_mapping', 'claim_actor', 'reply', 'prepared_at', 'intent_sha256'], TASK_REPLY_INTENT_KIND);
  const sources = validateSources(input as Parameters<typeof validateSources>[0]);
  const reply = source(() => validateTaskMessageEvent(input.reply));
  const expected = buildTaskReplyIntent({ ...sources, reply_message_id: reply.message_id, body: reply.body,
    prepared_at: timestamp(input.prepared_at, 'prepared_at') });
  if (input.effect_id !== expected.effect_id || input.idempotency_key !== expected.idempotency_key
    || reply.event_digest !== expected.reply.event_digest || input.intent_sha256 !== expected.intent_sha256) {
    invalid('reply intent bytes, direction or digest mismatch');
  }
  return expected;
}

export function canonicalTaskReplyIntentBytes(value: TaskReplyIntentV1): string {
  return canonicalEngineerJson(validateTaskReplyIntent(value));
}

export function buildTaskReplyCommit(input: {
  readonly intent: TaskReplyIntentV1;
  readonly committed_at: string;
}): TaskReplyCommitV1 {
  const intent = validateTaskReplyIntent(input.intent);
  const basis = {
    protocol: TASK_REPLY_PROTOCOL, kind: TASK_REPLY_COMMIT_KIND,
    effect_id: intent.effect_id, intent_sha256: intent.intent_sha256,
    reply_event_digest: intent.reply.event_digest,
    acknowledgement_sha256: acknowledgementDigest(intent.acknowledgement),
    committed_at: timestamp(input.committed_at, 'committed_at'),
  };
  return Object.freeze({ ...basis, commit_sha256: sha(basis) });
}

export function validateTaskReplyCommit(value: unknown): TaskReplyCommitV1 {
  const input = record(value, ['protocol', 'kind', 'effect_id', 'intent_sha256', 'reply_event_digest',
    'acknowledgement_sha256', 'committed_at', 'commit_sha256'], TASK_REPLY_COMMIT_KIND);
  const basis = {
    protocol: TASK_REPLY_PROTOCOL, kind: TASK_REPLY_COMMIT_KIND,
    effect_id: uuid(input.effect_id, 'effect_id'), intent_sha256: digest(input.intent_sha256, 'intent_sha256'),
    reply_event_digest: digest(input.reply_event_digest, 'reply_event_digest'),
    acknowledgement_sha256: digest(input.acknowledgement_sha256, 'acknowledgement_sha256'),
    committed_at: timestamp(input.committed_at, 'committed_at'),
  };
  if (input.commit_sha256 !== sha(basis)) invalid('reply commit digest mismatch');
  return Object.freeze({ ...basis, commit_sha256: sha(basis) });
}

export function canonicalTaskReplyCommitBytes(value: TaskReplyCommitV1): string {
  return canonicalEngineerJson(validateTaskReplyCommit(value));
}

/** Checks a retry of a persisted intent; it never allocates a replacement identity. */
export function assertTaskReplyRetry(stored: TaskReplyIntentV1, retry: TaskReplyIntentV1): void {
  if (canonicalTaskReplyIntentBytes(stored) !== canonicalTaskReplyIntentBytes(retry)) {
    throw new TaskReplyError('task_reply_conflict', 'reply retry differs from the frozen intent');
  }
}

/** The effect owner must read these sources under its live authority locks. This is not authentication. */
export function assertTaskReplyResumeFence(intent: TaskReplyIntentV1, current: {
  readonly principal_mapping: EngineerPrincipalMappingV1;
  readonly claim_actor: ClaimActorReceiptV1;
}): void {
  const frozen = validateTaskReplyIntent(intent);
  const mapping = source(() => validateEngineerPrincipalMapping(current.principal_mapping));
  const actor = source(() => validateClaimActorReceipt(current.claim_actor));
  if (mapping.state !== 'active' || mapping.mapping_digest !== frozen.principal_mapping.mapping_digest
    || actor.receipt_sha256 !== frozen.claim_actor.receipt_sha256) {
    throw new TaskReplyError('task_reply_fence_changed', 'cannot resume reply under a different authorization or actor fence');
  }
}

export type TaskReplyChainObservation =
  | { readonly state: 'absent' | 'intent_only' | 'event_uncommitted' | 'orphan_event' | 'complete' }
  | { readonly state: 'inconsistent'; readonly reason: 'commit_missing_records' | 'source_mismatch' | 'event_mismatch' | 'commit_mismatch' };

/**
 * Read-only integrity oracle. `complete` is structural, never proof of authenticated
 * storage or present permission. The protected effect/reader must establish provenance.
 * Historical chains deliberately do not require their old principal to remain active.
 */
export function inspectTaskReplyChain(input: {
  readonly parent: unknown;
  readonly acknowledgement: unknown | null;
  readonly intent: unknown | null;
  readonly event: unknown | null;
  readonly commit: unknown | null;
}): TaskReplyChainObservation {
  const parent = source(() => validateTaskMessageEvent(input.parent));
  const ack = input.acknowledgement === null ? null : source(() => validateTaskMessageDeliveryReceipt(input.acknowledgement));
  const intent = input.intent === null ? null : validateTaskReplyIntent(input.intent);
  const event = input.event === null ? null : source(() => validateTaskMessageEvent(input.event));
  const commit = input.commit === null ? null : validateTaskReplyCommit(input.commit);
  if (commit && (!intent || !event)) return { state: 'inconsistent', reason: 'commit_missing_records' };
  if (!intent) return { state: event ? 'orphan_event' : 'absent' };
  if (intent.parent.event_digest !== parent.event_digest || !ack
    || acknowledgementDigest(intent.acknowledgement) !== acknowledgementDigest(ack)) {
    return { state: 'inconsistent', reason: 'source_mismatch' };
  }
  if (event && event.event_digest !== intent.reply.event_digest) return { state: 'inconsistent', reason: 'event_mismatch' };
  if (commit && (commit.effect_id !== intent.effect_id || commit.intent_sha256 !== intent.intent_sha256
    || commit.reply_event_digest !== intent.reply.event_digest
    || commit.acknowledgement_sha256 !== acknowledgementDigest(ack))) {
    return { state: 'inconsistent', reason: 'commit_mismatch' };
  }
  return { state: commit ? 'complete' : event ? 'event_uncommitted' : 'intent_only' };
}
