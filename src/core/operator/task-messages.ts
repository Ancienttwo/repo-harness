import type {
  TaskMessageAudience,
  TaskMessageDeliveryReceiptV2,
  TaskMessageDeliveryState,
  TaskMessageEventV2,
  TaskMessageRecipientKind,
  TaskMessageSenderKind,
} from '../fleet/admitted-task-message';

/**
 * `GET /api/v1/repositories/<id>/tasks/<task_id>/messages`: the stored task
 * inbox of one verified task, read-only. The route serves only a task that the
 * execution view of the same repository lists as verified.
 */
export const TASK_MESSAGES_KIND = 'operator_task_messages' as const;
export const TASK_MESSAGES_PROTOCOL = 1 as const;
/** One read returns at most this many messages; the inbox reader stops at its scan, byte and time budget. */
export const TASK_MESSAGES_LIMIT = 100;
export const TASK_MESSAGES_BUDGET = Object.freeze({ max_scan: 1000, max_bytes: 2 * 1024 * 1024, deadline_ms: 250 });
const BODY_MAX_BYTES = 8 * 1024;

/** The child-process failures of the read; the server adds the verification refusals. */
export const TASK_MESSAGES_FAILURES = ['registry_unavailable', 'repository_not_found', 'unavailable', 'busy', 'timeout'] as const;
export type TaskMessagesFailure = typeof TASK_MESSAGES_FAILURES[number];
/** Refusals before the read: the task is not in the execution view, or it is there but not verified. */
export type TaskMessagesRefusal = 'task_not_found' | 'task_unverified';

export interface TaskMessagesRequest { readonly repository_id: string; readonly task_id: string }

export interface TaskMessageReceiptView {
  readonly recipient_kind: TaskMessageRecipientKind;
  /** The orchestrator or user id; null for the claim owner, whose id is its claim reference. */
  readonly recipient_id: string | null;
  readonly delivery_state: TaskMessageDeliveryState;
  readonly delivered_at: string | null;
  readonly acknowledged_at: string | null;
}

export interface TaskMessageView {
  readonly message_id: string;
  readonly body: string;
  readonly sender_kind: TaskMessageSenderKind;
  readonly sender_id: string | null;
  readonly audience: TaskMessageAudience;
  readonly created_at: string;
  readonly receipts: readonly TaskMessageReceiptView[];
}

export interface TaskMessagesViewV1 {
  readonly protocol: typeof TASK_MESSAGES_PROTOCOL;
  readonly kind: typeof TASK_MESSAGES_KIND;
  readonly repository_id: string;
  readonly task_id: string;
  /** Newest first. */
  readonly messages: readonly TaskMessageView[];
  /** False when the read stopped at its limit or budget: some stored messages are not in `messages`. */
  readonly complete: boolean;
}

const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const TASK_ID = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SENDER_KINDS: readonly unknown[] = ['user', 'operator', 'agent'];
const AUDIENCES: readonly unknown[] = ['owner', 'orchestrator', 'user'];
const RECIPIENT_KINDS: readonly unknown[] = ['claim', 'orchestrator', 'user'];
const DELIVERY_STATES: readonly unknown[] = ['pending', 'delivered', 'acknowledged', 'superseded'];

/**
 * Only a 64-hex task id has a task inbox (the inbox and the route both require
 * it). The execution view admits wider task text, so a caller filters with this.
 */
export function isTaskMessagesTaskId(value: string): boolean {
  return TASK_ID.test(value);
}

export function isTaskMessagesRequest(value: unknown): value is TaskMessagesRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && typeof record.repository_id === 'string' && REPOSITORY_ID.test(record.repository_id)
    && typeof record.task_id === 'string' && isTaskMessagesTaskId(record.task_id);
}

/** Newest first, then by message id: the order of `messages` in every view. */
export const newestFirst = (left: TaskMessageView, right: TaskMessageView): number =>
  left.created_at !== right.created_at ? (left.created_at < right.created_at ? 1 : -1)
    : left.message_id < right.message_id ? 1 : left.message_id > right.message_id ? -1 : 0;

/** The public fields of the stored records: no digest, admission, claim reference or delivery reference. */
export function projectTaskMessages(request: TaskMessagesRequest,
  entries: readonly { readonly event: TaskMessageEventV2; readonly receipts: readonly TaskMessageDeliveryReceiptV2[] }[],
  complete: boolean): TaskMessagesViewV1 {
  const messages = entries.map(({ event, receipts }): TaskMessageView => ({
    message_id: event.message_id, body: event.body, sender_kind: event.sender_kind, sender_id: event.sender_id,
    audience: event.audience, created_at: event.created_at,
    receipts: receipts.map(receipt => ({
      recipient_kind: receipt.recipient_kind, recipient_id: receipt.recipient_kind === 'claim' ? null : receipt.recipient_id,
      delivery_state: receipt.delivery_state, delivered_at: receipt.delivered_at, acknowledged_at: receipt.acknowledged_at,
    })),
  }));
  return { protocol: TASK_MESSAGES_PROTOCOL, kind: TASK_MESSAGES_KIND, repository_id: request.repository_id, task_id: request.task_id,
    messages: messages.sort(newestFirst), complete };
}

type Json = Record<string, unknown>;
function fail(what: string): never { throw new Error(`task messages invalid: ${what}`); }
function exact(value: unknown, keys: readonly string[], what: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(what);
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || [...keys].sort().some((key, index) => actual[index] !== key)) fail(`${what} keys`);
  return value as Json;
}
const text = (value: unknown): boolean => typeof value === 'string' && value.length > 0;
const time = (value: unknown): boolean => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nullableTime = (value: unknown): boolean => value === null || time(value);

/** Strict decoder for the server, before it sends the child's answer, and for the browser. */
export function decodeTaskMessagesView(value: unknown, request: TaskMessagesRequest): TaskMessagesViewV1 {
  const view = exact(value, ['protocol', 'kind', 'repository_id', 'task_id', 'messages', 'complete'], 'view');
  if (view.protocol !== TASK_MESSAGES_PROTOCOL || view.kind !== TASK_MESSAGES_KIND) fail('protocol');
  if (view.repository_id !== request.repository_id || view.task_id !== request.task_id) fail('identity');
  if (typeof view.complete !== 'boolean') fail('complete');
  if (!Array.isArray(view.messages) || view.messages.length > TASK_MESSAGES_LIMIT) fail('messages');
  let previous: TaskMessageView | null = null;
  for (const raw of view.messages) {
    const message = exact(raw, ['message_id', 'body', 'sender_kind', 'sender_id', 'audience', 'created_at', 'receipts'], 'message');
    if (typeof message.message_id !== 'string' || !UUID.test(message.message_id)) fail('message_id');
    if (typeof message.body !== 'string' || new TextEncoder().encode(message.body).length > BODY_MAX_BYTES) fail('body');
    if (!SENDER_KINDS.includes(message.sender_kind) || (message.sender_id !== null && !text(message.sender_id))) fail('sender');
    if (!AUDIENCES.includes(message.audience) || !time(message.created_at)) fail('audience or created_at');
    if (!Array.isArray(message.receipts)) fail('receipts');
    for (const rawReceipt of message.receipts) {
      const receipt = exact(rawReceipt, ['recipient_kind', 'recipient_id', 'delivery_state', 'delivered_at', 'acknowledged_at'], 'receipt');
      if (!RECIPIENT_KINDS.includes(receipt.recipient_kind)
        || (receipt.recipient_kind === 'claim' ? receipt.recipient_id !== null : !text(receipt.recipient_id))) fail('recipient');
      if (!DELIVERY_STATES.includes(receipt.delivery_state) || !nullableTime(receipt.delivered_at) || !nullableTime(receipt.acknowledged_at)) fail('delivery');
    }
    const current = message as unknown as TaskMessageView;
    if (previous !== null && newestFirst(previous, current) >= 0) fail('order');
    previous = current;
  }
  return value as TaskMessagesViewV1;
}
