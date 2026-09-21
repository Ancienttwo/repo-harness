import type { TaskMessageEventV1, TaskMessageDeliveryReceiptV1 } from '../fleet/task-message';
import type { TaskReplyChainObservation } from '../fleet/task-reply';
import type { ClaimActorReceiptV1 } from '../engineers/principal-claim';

export const TASK_ACTIVITY_MAX_SCAN = 1000;
export const TASK_ACTIVITY_MAX_BYTES = 2 * 1024 * 1024;
export const TASK_ACTIVITY_MAX_OUTPUT_BYTES = 1024 * 1024;
export const TASK_ACTIVITY_DEADLINE_MS = 250;
export const TASK_ACTIVITY_FAILURES = ['unavailable', 'history_unavailable', 'busy', 'timeout'] as const;
export type TaskActivityFailure = typeof TASK_ACTIVITY_FAILURES[number];
export interface OperatorTaskActivityRequest {
  readonly repository_id: string;
  readonly task_id: string;
  readonly limit: number;
  readonly after: string | null;
  readonly message_id: string | null;
}
export type ActivityEvent = Omit<TaskMessageEventV1, 'protocol' | 'kind' | 'task_id'>;
export type ActivityReceipt = Omit<TaskMessageDeliveryReceiptV1, 'protocol' | 'kind'>;
export type ActivityActor = Pick<ClaimActorReceiptV1, 'engineer_id' | 'binding_id' | 'binding_generation' | 'engineer_contract_revision' | 'claim_id' | 'lease_generation' | 'receipt_sha256'>;
export interface ActivityReply {
  readonly claim_id: string;
  readonly generation: number;
  readonly reply_message_id: string | null;
  readonly state: TaskReplyChainObservation['state'];
  readonly reason: string | null;
  readonly actor: ActivityActor | null;
}
export interface ActivityEntry {
  readonly event: ActivityEvent;
  readonly receipts: readonly ActivityReceipt[];
  readonly replies: readonly ActivityReply[];
  readonly provenance: 'not_reply' | 'unverified' | 'recorded_claim_actor';
}
export interface OperatorTaskActivity extends OperatorTaskActivityRequest {
  readonly protocol: 1;
  readonly kind: 'operator_task_activity';
  readonly observed_at: string;
  /** A bounded observation of stored records, not an atomic/current execution authority. */
  readonly consistency: 'observed';
  readonly entries: readonly ActivityEntry[];
  readonly coverage: {
    readonly scope: 'task' | 'message'; readonly complete: boolean;
    readonly reason: 'page' | 'scan' | 'bytes' | 'deadline' | 'output' | null;
    readonly scanned: number; readonly bytes: number;
  };
  readonly next_cursor: string | null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DIGEST = /^[0-9a-f]{64}$/u;
const SHA = /^sha256:[0-9a-f]{64}$/u;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const hash = (v: unknown): v is string => typeof v === 'string' && SHA.test(v);
const integer = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const text = (v: unknown, max = 8192, allowEmpty = false): v is string => typeof v === 'string' && (allowEmpty || v.length > 0) && new TextEncoder().encode(v).length <= max;
const timestamp = (v: unknown): boolean => text(v, 64) && Number.isFinite(Date.parse(v));
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const one = (v: unknown, values: readonly unknown[]): boolean => values.includes(v);
const nullable = (v: unknown, valid: (v: unknown) => boolean): boolean => v === null || valid(v);
export function isTaskActivityRequest(value: unknown): value is OperatorTaskActivityRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as OperatorTaskActivityRequest;
  return typeof r.repository_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(r.repository_id)
    && typeof r.task_id === 'string' && DIGEST.test(r.task_id) && integer(r.limit, 1) && r.limit <= 100
    && nullable(r.after, isUuid) && nullable(r.message_id, isUuid) && (r.message_id === null || (r.limit === 1 && r.after === null));
}
export function parseTaskActivityRequest(repository_id: string, task_id: string, params: URLSearchParams): OperatorTaskActivityRequest {
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || keys.some(k => !['limit', 'after', 'message_id'].includes(k))
    || (params.has('message_id') && (params.has('limit') || params.has('after')))
    || (params.has('limit') && !/^[1-9][0-9]*$/u.test(params.get('limit')!))) throw new Error('Invalid activity request');
  const value = { repository_id, task_id, limit: params.has('message_id') ? 1 : Number(params.get('limit') ?? 50), after: params.get('after'), message_id: params.get('message_id') };
  if (!isTaskActivityRequest(value)) throw new Error('Invalid activity request');
  return value;
}
const eventKeys = ['message_id','task_revision','scope','target_claim_id','target_generation','sender_kind','sender_id','sender_trust','audience','body','body_sha256','created_at','in_reply_to','event_digest'];
const receiptKeys = ['message_id','recipient_kind','recipient_id','recipient_task_revision','recipient_claim_id','recipient_generation','delivery_state','delivery_channel','delivery_ref','delivered_at','acknowledged_at'];
function validEvent(v: unknown): v is ActivityEvent {
  if (!exact(v, eventKeys)) return false;
  return isUuid(v.message_id) && typeof v.task_revision === 'string' && DIGEST.test(v.task_revision)
    && one(v.scope, ['task','claim']) && (v.scope === 'claim' ? isUuid(v.target_claim_id) && integer(v.target_generation, 1) : v.target_claim_id === null && v.target_generation === null)
    && one(v.sender_kind, ['user','operator','agent']) && nullable(v.sender_id, text)
    && one(v.sender_trust, ['local_operator','lease_owner','unverified_agent']) && one(v.audience, ['owner','orchestrator','user'])
    && text(v.body, 8192, true) && hash(v.body_sha256) && timestamp(v.created_at) && nullable(v.in_reply_to, isUuid) && hash(v.event_digest);
}
function validReceipt(v: unknown, event: ActivityEvent): v is ActivityReceipt {
  if (!exact(v, receiptKeys)) return false;
  return v.message_id === event.message_id && v.recipient_task_revision === event.task_revision && text(v.recipient_id)
    && one(v.recipient_kind, ['claim','orchestrator','user'])
    && (v.recipient_kind === 'claim' ? isUuid(v.recipient_claim_id) && integer(v.recipient_generation, 1) : v.recipient_claim_id === null && v.recipient_generation === null)
    && one(v.delivery_state, ['pending','delivered','acknowledged','superseded']) && one(v.delivery_channel, ['hook_session','manual','agent_runtime_effect'])
    && nullable(v.delivery_ref, text) && nullable(v.delivered_at, timestamp) && nullable(v.acknowledged_at, timestamp);
}
function validReply(v: unknown): v is ActivityReply {
  if (!exact(v, ['claim_id','generation','reply_message_id','state','reason','actor']) || !isUuid(v.claim_id) || !integer(v.generation, 1) || !nullable(v.reply_message_id, isUuid)
    || !one(v.state, ['absent','intent_only','event_uncommitted','orphan_event','complete','inconsistent'])) return false;
  if (v.state === 'inconsistent' ? !one(v.reason, ['commit_missing_records','source_mismatch','event_mismatch','commit_mismatch']) : v.reason !== null) return false;
  const hasIntent = one(v.state, ['intent_only','event_uncommitted','complete']);
  if (hasIntent && !isUuid(v.reply_message_id)) return false;
  if (v.state === 'absent' && v.reply_message_id !== null) return false;
  if (v.actor === null) return true;
  if (!hasIntent) return false;
  const a = v.actor;
  return exact(a, ['engineer_id','binding_id','binding_generation','engineer_contract_revision','claim_id','lease_generation','receipt_sha256'])
    && text(a.engineer_id) && isUuid(a.binding_id) && integer(a.binding_generation, 1) && hash(a.engineer_contract_revision)
    && a.claim_id === v.claim_id && a.lease_generation === v.generation && hash(a.receipt_sha256) && v.state !== 'inconsistent';
}
export function decodeOperatorTaskActivity(value: unknown, request: OperatorTaskActivityRequest): OperatorTaskActivity {
  const invalid = (): never => { throw new Error('Invalid task activity response'); };
  if (!exact(value, ['repository_id','task_id','limit','after','message_id','protocol','kind','observed_at','consistency','entries','coverage','next_cursor']) || !isTaskActivityRequest(value)) return invalid();
  const r = value as unknown as OperatorTaskActivity;
  if (['repository_id','task_id','limit','after','message_id'].some(k => r[k as keyof OperatorTaskActivityRequest] !== request[k as keyof OperatorTaskActivityRequest])
    || r.protocol !== 1 || r.kind !== 'operator_task_activity' || r.consistency !== 'observed' || !timestamp(r.observed_at)
    || !Array.isArray(r.entries) || r.entries.length > r.limit || !nullable(r.next_cursor, isUuid)) return invalid();
  const c = r.coverage;
  if (!exact(c, ['scope','complete','reason','scanned','bytes']) || c.scope !== (r.message_id === null ? 'task' : 'message') || typeof c.complete !== 'boolean'
    || !one(c.reason, [null,'page','scan','bytes','deadline','output']) || c.complete !== (c.reason === null)
    || !integer(c.scanned) || c.scanned > TASK_ACTIVITY_MAX_SCAN || !integer(c.bytes) || c.bytes > TASK_ACTIVITY_MAX_BYTES) return invalid();
  if (r.message_id !== null && c.complete && r.entries.length !== 1) return invalid();
  let previous = r.after;
  for (const entry of r.entries) {
    if (!exact(entry, ['event','receipts','replies','provenance']) || !validEvent(entry.event) || !Array.isArray(entry.receipts) || !Array.isArray(entry.replies) || entry.receipts.length > TASK_ACTIVITY_MAX_SCAN || entry.replies.length > TASK_ACTIVITY_MAX_SCAN
      || !entry.replies.every(validReply)) return invalid();
    const event = entry.event;
    if (!entry.receipts.every(v => validReceipt(v, event))) return invalid();
    if ((previous !== null && entry.event.message_id <= previous) || (r.message_id !== null && entry.event.message_id !== r.message_id)) return invalid();
    previous = entry.event.message_id;
    const expected = entry.event.in_reply_to === null ? 'not_reply' : entry.replies.some(reply => reply.actor && reply.reply_message_id === event.message_id && reply.actor.receipt_sha256 === event.sender_id) ? 'recorded_claim_actor' : 'unverified';
    if (entry.provenance !== expected) return invalid();
    if (expected === 'recorded_claim_actor' && (event.sender_kind !== 'agent' || event.sender_trust !== 'lease_owner' || event.audience !== 'user' || event.scope !== 'task')) return invalid();
  }
  if (c.reason === 'page' ? (r.message_id !== null || r.entries.length !== r.limit || r.next_cursor !== previous) : r.next_cursor !== null) return invalid();
  if (new TextEncoder().encode(JSON.stringify(r)).length > TASK_ACTIVITY_MAX_OUTPUT_BYTES) return invalid();
  return r;
}
