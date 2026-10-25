import { validateTaskMessageClaim, sameTaskMessageClaim, type TaskMessageClaim } from '../messages/task-message-claim';
import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';
import { messageSha256, assertMessageExactKeys, assertMessageTimestamp, assertMessageUuid } from '../messages/mechanics';
import {
  buildTaskMessageEvent,
  canonicalTaskMessageDeliveryReceiptBytes,
  validateTaskMessageDeliveryReceipt,
  validateTaskMessageEvent,
  type TaskMessageDeliveryReceiptV2,
  type TaskMessageEventV2,
} from './admitted-task-message';

/** Total canonical UTF-8 record bytes, including the persisted trailing LF. */
export const TASK_REPLY_RECORD_MAX_BYTES = 64 * 1024;
export const TASK_REPLY_PROTOCOL = 2 as const;
export const TASK_REPLY_INTENT_KIND = 'repo-harness-task-reply-intent' as const;
export const TASK_REPLY_COMMIT_KIND = 'repo-harness-task-reply-commit' as const;

/** Frozen recovery inputs. These snapshots bind bytes, not live authorization. */
export interface TaskReplyIntentV2 {
  readonly protocol: typeof TASK_REPLY_PROTOCOL;
  readonly kind: typeof TASK_REPLY_INTENT_KIND;
  readonly effect_id: string;
  readonly idempotency_key: string;
  readonly parent: TaskMessageEventV2;
  readonly acknowledgement: TaskMessageDeliveryReceiptV2;
  readonly session: TaskReplySession;
  readonly reply: TaskMessageEventV2;
  readonly prepared_at: string;
  readonly intent_sha256: string;
}

/** Provenance is bound transitively through the intent; body authority stays in the event. */
export interface TaskReplyCommitV2 {
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

function assertReplyRecordSize(value: object): void {
  const bytes = Buffer.byteLength(canonicalize(value as JsonValue), 'utf8') + 1;
  if (bytes > TASK_REPLY_RECORD_MAX_BYTES) {
    invalid(`encoded reply record exceeds ${TASK_REPLY_RECORD_MAX_BYTES} bytes including the trailing LF; reduce the reply body or source metadata`);
  }
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
  return messageSha256(canonicalize(value as JsonValue));
}

function acknowledgementDigest(ack: TaskMessageDeliveryReceiptV2): string {
  return messageSha256(canonicalTaskMessageDeliveryReceiptBytes(ack));
}

/** Immutable recorded provenance, never a replacement for a fresh session admission. */
export interface TaskReplySession {
  readonly execution_actor: string;
  readonly claim: TaskMessageClaim;
  readonly grant_sha256: string;
  readonly session_binding_sha256: string;
}

export function validateTaskReplySession(value: unknown): TaskReplySession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('session must be an object');
  const input = value as Record<string, unknown>;
  assertMessageExactKeys(input, ['execution_actor', 'claim', 'grant_sha256', 'session_binding_sha256'], 'session', invalid);
  if (typeof input.execution_actor !== 'string' || !input.execution_actor.trim()) invalid('execution_actor is required');
  return Object.freeze({ execution_actor: input.execution_actor,
    claim: validateTaskMessageClaim(input.claim),
    grant_sha256: digest(input.grant_sha256, 'grant_sha256'),
    session_binding_sha256: digest(input.session_binding_sha256, 'session_binding_sha256') });
}

function validateSources(input: {
  parent: unknown;
  acknowledgement: unknown;
  session: unknown;
}): Pick<TaskReplyIntentV2, 'parent' | 'acknowledgement' | 'session'> {
  return source(() => {
    const parent = validateTaskMessageEvent(input.parent);
    const ack = validateTaskMessageDeliveryReceipt(input.acknowledgement);
    const session = validateTaskReplySession(input.session);
    if (parent.audience !== 'owner' || parent.in_reply_to !== null
      || (parent.sender_kind !== 'user' && parent.sender_kind !== 'operator')
      || parent.sender_trust !== 'local_operator') invalid('parent is not an original human owner steer');
    if (parent.scope === 'claim' && !sameTaskMessageClaim(parent.target_claim, session.claim)) invalid('parent claim differs from session');
    if (ack.delivery_state !== 'acknowledged' || ack.message_id !== parent.message_id
      || ack.recipient_admission_sha256 !== parent.admission_sha256 || ack.recipient_kind !== 'claim'
      || !sameTaskMessageClaim(ack.recipient_claim, session.claim)) {
      invalid('reply requires the exact admitted recipient acknowledgement');
    }
    return { parent, acknowledgement: ack, session };
  });
}

export function buildTaskReplyIntent(input: {
  readonly parent: TaskMessageEventV2;
  readonly acknowledgement: TaskMessageDeliveryReceiptV2;
  readonly session: TaskReplySession;
  readonly reply_message_id: string;
  readonly body: string;
  readonly prepared_at: string;
}): TaskReplyIntentV2 {
  const sources = validateSources(input);
  const preparedAt = timestamp(input.prepared_at, 'prepared_at');
  const reply = source(() => buildTaskMessageEvent({
    message_id: input.reply_message_id,
    task_id: sources.parent.task_id,
    task_identity: sources.parent.task_identity,
    admission_sha256: sources.parent.admission_sha256,
    scope: 'task', target_claim: null,
    sender_kind: 'agent', sender_id: sources.session.session_binding_sha256, sender_trust: 'admitted_session',
    audience: 'user', body: input.body, created_at: preparedAt, in_reply_to: sources.parent.message_id,
  }));
  if (reply.message_id === sources.parent.message_id) invalid('reply and parent IDs must differ');
  const basis = {
    protocol: TASK_REPLY_PROTOCOL, kind: TASK_REPLY_INTENT_KIND,
    effect_id: reply.message_id, idempotency_key: reply.message_id,
    ...sources, reply, prepared_at: preparedAt,
  };
  const intent = { ...basis, intent_sha256: sha(basis) };
  assertReplyRecordSize(intent);
  return Object.freeze(intent);
}

export function validateTaskReplyIntent(value: unknown): TaskReplyIntentV2 {
  const input = record(value, ['protocol', 'kind', 'effect_id', 'idempotency_key', 'parent', 'acknowledgement',
    'session', 'reply', 'prepared_at', 'intent_sha256'], TASK_REPLY_INTENT_KIND);
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

export function canonicalTaskReplyIntentBytes(value: TaskReplyIntentV2): string {
  return canonicalize(validateTaskReplyIntent(value) as unknown as JsonValue);
}

export function buildTaskReplyCommit(input: {
  readonly intent: TaskReplyIntentV2;
  readonly committed_at: string;
}): TaskReplyCommitV2 {
  const intent = validateTaskReplyIntent(input.intent);
  const basis = {
    protocol: TASK_REPLY_PROTOCOL, kind: TASK_REPLY_COMMIT_KIND,
    effect_id: intent.effect_id, intent_sha256: intent.intent_sha256,
    reply_event_digest: intent.reply.event_digest,
    acknowledgement_sha256: acknowledgementDigest(intent.acknowledgement),
    committed_at: timestamp(input.committed_at, 'committed_at'),
  };
  const commit = { ...basis, commit_sha256: sha(basis) };
  assertReplyRecordSize(commit);
  return Object.freeze(commit);
}

export function validateTaskReplyCommit(value: unknown): TaskReplyCommitV2 {
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
  const commit = { ...basis, commit_sha256: sha(basis) };
  assertReplyRecordSize(commit);
  return Object.freeze(commit);
}

export function canonicalTaskReplyCommitBytes(value: TaskReplyCommitV2): string {
  return canonicalize(validateTaskReplyCommit(value) as unknown as JsonValue);
}

export type TaskReplyChainObservation =
  | { readonly state: 'absent' | 'intent_only' | 'event_uncommitted' | 'orphan_event' | 'complete' }
  | { readonly state: 'inconsistent'; readonly reason: 'commit_missing_records' | 'source_mismatch' | 'event_mismatch' | 'commit_mismatch' };

/**
 * Read-only integrity oracle. `complete` is structural, never proof of authenticated
 * storage or present permission. The protected effect/reader must establish provenance.
 * Recorded chains deliberately do not require their old session to remain active.
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
