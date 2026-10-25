import type { TaskMessageClaim } from '../messages/task-message-claim';
import type { TaskMessageEventV2, TaskMessageDeliveryReceiptV2 } from '../fleet/admitted-task-message';
import type { TaskReplySession, TaskReplyChainObservation } from '../fleet/admitted-task-reply';
import { isAdmittedSessionSelector, SESSION_SELECTOR_KEYS, type AdmittedSessionSelector } from '../sessions/session-selector';
import { parseTaskDiffRequest } from './task-diff';
import { isTaskActivityRequest, parseTaskActivityRequest, TASK_ACTIVITY_MAX_BYTES, TASK_ACTIVITY_MAX_OUTPUT_BYTES, TASK_ACTIVITY_MAX_SCAN, type OperatorTaskActivity } from './task-activity';

export interface AdmittedTaskActivityRequest {
  readonly selector: AdmittedSessionSelector;
  readonly limit: number;
  readonly after: string | null;
  readonly message_id: string | null;
}
export interface AdmittedActivityEntry {
  readonly event: TaskMessageEventV2;
  readonly receipts: readonly TaskMessageDeliveryReceiptV2[];
  readonly replies: readonly { readonly claim: TaskMessageClaim; readonly reply_message_id: string | null; readonly observation: TaskReplyChainObservation; readonly session: TaskReplySession | null }[];
}
export interface AdmittedTaskActivity extends AdmittedTaskActivityRequest {
  readonly protocol: 2;
  readonly kind: 'operator_admitted_task_activity';
  readonly admission_sha256: string;
  readonly observed_at: string;
  readonly consistency: 'observed';
  readonly entries: readonly AdmittedActivityEntry[];
  readonly coverage: OperatorTaskActivity['coverage'];
  readonly next_cursor: string | null;
}
const exact = (v: unknown, keys: readonly string[]): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && Object.keys(v).every(k => keys.includes(k));
const text = (v: unknown, max = 8192, empty = false): v is string => typeof v === 'string' && (empty || v.trim().length > 0) && new TextEncoder().encode(v).length <= max;
const sha = (v: unknown): v is string => typeof v === 'string' && /^sha256:[0-9a-f]{64}$/u.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v);
const timestamp = (v: unknown): boolean => text(v, 64) && Number.isFinite(Date.parse(v));
const nullable = (v: unknown, valid: (v: unknown) => boolean): boolean => v === null || valid(v);
const one = (v: unknown, choices: readonly unknown[]): boolean => choices.includes(v);
const claim = (v: unknown): boolean => exact(v, ['reference', 'revision']) && text(v.reference) && !/[\x00-\x1f\x7f]/u.test(v.reference as string) && sha(v.revision);
const sameClaim = (a: TaskMessageClaim, b: TaskMessageClaim): boolean => a.reference === b.reference && a.revision === b.revision;
export function isAdmittedTaskActivityRequest(value: unknown): value is AdmittedTaskActivityRequest {
  return exact(value, ['selector', 'limit', 'after', 'message_id']) && isAdmittedSessionSelector(value.selector)
    && isTaskActivityRequest({ repository_id: value.selector.repository_id, task_id: value.selector.task, limit: value.limit, after: value.after, message_id: value.message_id });
}
export function parseAdmittedTaskActivityRequest(repositoryId: string, params: URLSearchParams): AdmittedTaskActivityRequest {
  const selector = new URLSearchParams(), page = new URLSearchParams();
  for (const [key, value] of params) ((SESSION_SELECTOR_KEYS as readonly string[]).includes(key) ? selector : page).append(key, value);
  const selected = parseTaskDiffRequest(repositoryId, selector);
  const pagination = parseTaskActivityRequest(repositoryId, selected.task, page);
  const result = { selector: selected, limit: pagination.limit, after: pagination.after, message_id: pagination.message_id };
  if (!isAdmittedTaskActivityRequest(result)) throw new Error('Invalid admitted activity request');
  return result;
}
function eventValid(v: unknown, selector: AdmittedSessionSelector): v is TaskMessageEventV2 {
  if (!exact(v, ['protocol','kind','message_id','task_id','task_identity','admission_sha256','scope','target_claim','sender_kind','sender_id','sender_trust','audience','body','body_sha256','created_at','in_reply_to','event_digest'])) return false;
  const identity = v.task_identity;
  return v.protocol === 2 && v.kind === 'repo-harness-task-message-event' && uuid(v.message_id) && v.task_id === selector.task
    && exact(identity, ['repository_id','issue_id','campaign_id']) && identity.repository_id === selector.provider_repository_id && identity.issue_id === selector.issue_id && identity.campaign_id === selector.campaign_id
    && sha(v.admission_sha256) && one(v.scope, ['task','claim']) && (v.scope === 'claim' ? claim(v.target_claim) : v.target_claim === null)
    && one(v.sender_kind, ['user','operator','agent']) && nullable(v.sender_id, text) && one(v.sender_trust, ['local_operator','admitted_session','unverified_agent'])
    && one(v.audience, ['owner','orchestrator','user']) && text(v.body, 8192, true) && sha(v.body_sha256) && timestamp(v.created_at) && nullable(v.in_reply_to, uuid) && sha(v.event_digest);
}
function receiptValid(v: unknown, event: TaskMessageEventV2): boolean {
  return exact(v, ['protocol','kind','message_id','recipient_kind','recipient_id','recipient_admission_sha256','recipient_claim','delivery_state','delivery_channel','delivery_ref','delivered_at','acknowledged_at'])
    && v.protocol === 2 && v.kind === 'repo-harness-task-message-delivery-receipt' && v.message_id === event.message_id && v.recipient_admission_sha256 === event.admission_sha256
    && one(v.recipient_kind, ['claim','orchestrator','user']) && text(v.recipient_id) && (v.recipient_kind === 'claim' ? claim(v.recipient_claim) : v.recipient_claim === null)
    && one(v.delivery_state, ['pending','delivered','acknowledged','superseded']) && one(v.delivery_channel, ['hook_session','manual','agent_runtime_effect','controlled_request'])
    && nullable(v.delivery_ref, text) && nullable(v.delivered_at, timestamp) && nullable(v.acknowledged_at, timestamp);
}
function replyValid(v: unknown): boolean {
  if (!exact(v, ['claim','reply_message_id','observation','session']) || !claim(v.claim) || !nullable(v.reply_message_id, uuid)) return false;
  const o = v.observation;
  if (!o || typeof o !== 'object') return false;
  const state = (o as { state?: unknown }).state;
  if (state === 'inconsistent') {
    if (!exact(o, ['state','reason']) || !one(o.reason, ['commit_missing_records','source_mismatch','event_mismatch','commit_mismatch']) || v.session !== null) return false;
  } else if (!exact(o, ['state']) || !one(state, ['absent','intent_only','event_uncommitted','orphan_event','complete'])) return false;
  if (state === 'absent' && v.reply_message_id !== null) return false;
  if (one(state, ['intent_only','event_uncommitted','complete']) && !uuid(v.reply_message_id)) return false;
  if (v.session === null) return true;
  const s = v.session;
  return one(state, ['intent_only','event_uncommitted','complete']) && exact(s, ['execution_actor','claim','grant_sha256','session_binding_sha256'])
    && text(s.execution_actor) && claim(s.claim) && sameClaim(s.claim as TaskMessageClaim, v.claim as TaskMessageClaim) && sha(s.grant_sha256) && sha(s.session_binding_sha256);
}
/** Browser-safe transport validation. The inbox reader validates canonical record bytes. */
export function decodeAdmittedTaskActivity(value: unknown, request: AdmittedTaskActivityRequest): AdmittedTaskActivity {
  const invalid = (): never => { throw new Error('Invalid admitted activity response'); };
  if (!isAdmittedTaskActivityRequest(request) || !exact(value, ['selector','limit','after','message_id','protocol','kind','admission_sha256','observed_at','consistency','entries','coverage','next_cursor'])) return invalid();
  const r = value as unknown as AdmittedTaskActivity;
  if (!isAdmittedTaskActivityRequest({selector:r.selector,limit:r.limit,after:r.after,message_id:r.message_id})
    || SESSION_SELECTOR_KEYS.some(k => r.selector[k] !== request.selector[k]) || r.limit !== request.limit || r.after !== request.after || r.message_id !== request.message_id
    || r.protocol !== 2 || r.kind !== 'operator_admitted_task_activity' || !sha(r.admission_sha256) || !timestamp(r.observed_at) || r.consistency !== 'observed'
    || !Array.isArray(r.entries) || r.entries.length > r.limit || !nullable(r.next_cursor, uuid)) return invalid();
  const c = r.coverage;
  if (!exact(c, ['scope','complete','reason','scanned','bytes']) || c.scope !== (r.message_id === null ? 'task' : 'message') || typeof c.complete !== 'boolean' || !one(c.reason, [null,'page','scan','bytes','deadline','output'])
    || c.complete !== (c.reason === null) || !Number.isSafeInteger(c.scanned) || c.scanned < 0 || c.scanned > TASK_ACTIVITY_MAX_SCAN || !Number.isSafeInteger(c.bytes) || c.bytes < 0 || c.bytes > TASK_ACTIVITY_MAX_BYTES) return invalid();
  let previous = r.after;
  for (const entry of r.entries) {
    if (!exact(entry, ['event','receipts','replies']) || !eventValid(entry.event, r.selector) || !Array.isArray(entry.receipts) || !Array.isArray(entry.replies)
      || entry.receipts.length > TASK_ACTIVITY_MAX_SCAN || entry.replies.length > TASK_ACTIVITY_MAX_SCAN || !entry.replies.every(replyValid)) return invalid();
    const event = entry.event;
    if (!entry.receipts.every(v => receiptValid(v, event))) return invalid();
    if ((previous !== null && entry.event.message_id <= previous) || (r.message_id !== null && entry.event.message_id !== r.message_id)) return invalid();
    previous = entry.event.message_id;
  }
  if (r.message_id !== null && c.complete && r.entries.length !== 1) return invalid();
  if (c.reason === 'page' ? r.message_id !== null || r.entries.length !== r.limit || r.next_cursor !== previous : r.next_cursor !== null) return invalid();
  if (new TextEncoder().encode(JSON.stringify(r)).length > TASK_ACTIVITY_MAX_OUTPUT_BYTES) return invalid();
  return r;
}
