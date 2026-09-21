/** Browser-safe closed observation protocol; original stores own all semantics. */
type Decoder<T> = (value: unknown) => T;
function invalid(): never { throw new Error('automation_summary_invalid'); }
function object<S extends Record<string, Decoder<unknown>>>(shape: S): Decoder<{ readonly [K in keyof S]: ReturnType<S[K]> }> {
  return (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const row = value as Record<string, unknown>;
    if (Object.keys(row).sort().join(',') !== Object.keys(shape).sort().join(',')) invalid();
    return Object.fromEntries(Object.entries(shape).map(([key, decode]) => [key, decode(row[key])])) as { readonly [K in keyof S]: ReturnType<S[K]> };
  };
}
function choices<const T extends readonly (string | number | boolean | null)[]>(...values: T): Decoder<T[number]> {
  return (value) => { if (!values.includes(value as T[number])) invalid(); return value as T[number]; };
}
function text(value: unknown): string { if (typeof value !== 'string' || value.length < 1 || value.length > 4096 || /[\u0000-\u001f]/u.test(value)) invalid(); return value; }
function id(value: unknown): string { const v = text(value); if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(v)) invalid(); return v; }
function digest(value: unknown): string { const v = text(value); if (!/^(?:sha256:)?[0-9a-f]{64}$/u.test(v)) invalid(); return v; }
function timestamp(value: unknown): string { const v = text(value); if (!Number.isFinite(Date.parse(v)) || !/^\d{4}-\d\d-\d\dT/u.test(v)) invalid(); return v; }
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) invalid(); return value; }
function integer(value: unknown): number { const n = number(value); if (!Number.isSafeInteger(n)) invalid(); return n; }
function positive(value: unknown): number { const n = integer(value); if (n === 0) invalid(); return n; }
function nullable<T>(decode: Decoder<T>): Decoder<T | null> { return (value) => value === null ? null : decode(value); }
function array<T>(decode: Decoder<T>, max = 64): Decoder<readonly T[]> { return (value) => { if (!Array.isArray(value) || value.length > max) invalid(); return value.map(decode); }; }
function relative(value: unknown): string { const v = text(value); if (v.startsWith('/') || v.includes('\\') || v.split('/').includes('..') || /^[A-Za-z]:/u.test(v)) invalid(); return v; }
const metric = choices('agent_turns','successful_acquisitions','runner_invocations','provider_failures','consecutive_no_progress_steps','repair_cycles','wall_clock_seconds','input_tokens','output_tokens','cost_micros','controller_steps','provider_calls');
export const decodeAutomationGrant = object({
  authorization_id: id, authorization_sha256: digest, target_ref: relative, target_revision: (v: unknown) => { const s = text(v); if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(s)) invalid(); return s; },
  allowed_work_package_ids: array(id), contract_scope: choices('task_contract','contract_less'),
  contract_path: nullable(relative), merge_mode: choices('disabled','manual','auto_merge'),
  issued_at: timestamp, expires_at: timestamp, campaign_id: nullable(id),
});
export const decodeAutomationBudget = object({
  automation_run_id: digest, budget_sha256: digest, budget_revision: positive,
  state: choices('active','reconciliation_required','budget_exhausted'), deadline_at: timestamp,
  ledger_sha256: digest, slice_sha256: digest, event_count: integer, last_completed_step_index: integer,
  open_reservation_count: integer, projection_stale: choices(true,false),
  attention_owner: choices('user','agent','none'),
  metrics: array(object({ metric, enforced: choices(true,false), limit: nullable(number), consumed: nullable(number), reserved: nullable(number), remaining: nullable(number) })),
  stop_receipt: nullable(object({ stop_receipt_sha256: digest, refusal_code: choices('budget_revision_stale','budget_exhausted','reconciliation_required','budget_expired','budget_limit_exceeded','clock_regression'), issued_at: timestamp, triggering_metric: metric })),
});
export const decodeAutomationController = object({
  run_id: digest, run_sha256: digest, budget_sha256: digest, current_sha256: digest, event_sha256: digest,
  revision: positive, state: choices('created','observing','acquiring','executing','waiting_for_evidence','blocked','budget_exhausted','completed','stopping','stopped','reconciliation_required'),
  operation: choices('start','observe','begin_acquire','acquired','no_offer','begin_dispatch','dispatch_started','outcome_observed','retry_wait','block','exhaust_budget','complete','request_stop','stop','require_reconciliation'),
  observed_at: timestamp, retry_at: nullable(timestamp), source_attention_owner: choices('none','user','operator'),
  typed_reason_status: choices('missing','unavailable'), task_id: nullable(digest), claim_id: nullable(id),
  dispatch_id: nullable(id), runtime_effect_id: nullable(id),
});
const step = object({
  group_number: choices(1,2,3), intent_sha256: digest,
  last_decision: nullable(object({ receipt_sha256: digest,
    action: choices('idle','observe','fill_missing','edit_issue','comment_unexpected','close_unexpected','campaign_no_progress','reconciliation_required'),
    outcome: choices('idle','progress','no_progress','reconciliation_required'), observed_at: timestamp, next_check_at: nullable(timestamp),
  })),
});
export const decodeAutomationCampaign = object({
  campaign_id: id, campaign_sha256: digest, authorization_sha256: digest, current_sha256: digest, event_sha256: digest,
  revision: positive, state: choices('authorized','group_preparing','group_running','group_auditing','group_accepted','completed','completed_with_followups','stopped','budget_exhausted','human_attention_required','reconciliation_required','authorization_expired'),
  operation: choices('authorize','prepare_group','start_group','begin_group_audit','accept_group','complete','complete_with_followups','stop','exhaust_budget','require_human_attention','require_reconciliation','expire_authorization'),
  observed_at: timestamp, typed_reason_status: choices('unavailable'), source_attention_owner: choices('unavailable'),
  group_decisions: array(step, 3),
});
export type AutomationSource<T> = { readonly status: 'known' | 'missing' | 'unavailable'; readonly observed_at: string; readonly reason: null | 'source_unavailable' | 'source_changed' | 'limit_exceeded'; readonly records: readonly T[] };
function source<T>(decode: Decoder<T>): Decoder<AutomationSource<T>> {
  const parse = object({ status: choices('known','missing','unavailable'), observed_at: timestamp, reason: nullable(choices('source_unavailable','source_changed','limit_exceeded')), records: array(decode) });
  return (value) => {
    const result = parse(value);
    if ((result.status === 'known') !== (result.records.length > 0)
      || (result.status === 'unavailable') !== (result.reason !== null)) invalid();
    return result;
  };
}
const summary = object({
  protocol: choices(1), repository_id: id, consistency: choices('observed'), observed_at: timestamp,
  policy: source(object({ mode: choices('off','shadow','active'), source_ref: choices('registered_worktree_policy'), policy_sha256: digest })),
  grants: source(decodeAutomationGrant), budgets: source(decodeAutomationBudget),
  controllers: source(decodeAutomationController), campaigns: source(decodeAutomationCampaign),
  native_execution: object({ status: choices('unavailable'), reason: choices('native_admission_authority_unavailable'), turn_ref: choices(null) }),
});
export type OperatorAutomationSummary = ReturnType<typeof summary>;
export const AUTOMATION_SUMMARY_MAX_BYTES = 512 * 1024;
export function decodeOperatorAutomationSummary(value: unknown, repositoryId: string): OperatorAutomationSummary {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > AUTOMATION_SUMMARY_MAX_BYTES) invalid();
  const result = summary(value);
  if (result.repository_id !== repositoryId || result.policy.records.length > 1) invalid();
  return result;
}
