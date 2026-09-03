import {
  assertMessageBoundedUtf8,
  assertMessageExactKeys,
  assertMessageInteger,
  assertMessageSha256,
  canonicalMessageBytes,
  canonicalMessageDigest,
  messageRequiredString,
} from '../messages/mechanics';

export const AUTOMATION_CONTROLLER_PROTOCOL = 1 as const;
export const AUTOMATION_CONTROLLER_RUN_KIND = 'repo-harness-automation-controller-run' as const;
export const AUTOMATION_CONTROLLER_EVENT_KIND = 'repo-harness-automation-controller-event' as const;
export const AUTOMATION_CONTROLLER_CURRENT_KIND = 'repo-harness-automation-controller-current' as const;

const RUN_ID = /^sha256:[0-9a-f]{64}$/u;
const REPOSITORY_ID = /^repo_[0-9a-f]{16}$/u;
const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9.-]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export type AutomationControllerState =
  | 'created' | 'observing' | 'acquiring' | 'executing' | 'waiting_for_evidence'
  | 'blocked' | 'budget_exhausted' | 'completed' | 'stopping' | 'stopped'
  | 'reconciliation_required';

export type AutomationControllerOperation =
  | 'start' | 'observe' | 'begin_acquire' | 'acquired' | 'no_offer'
  | 'begin_dispatch' | 'dispatch_started' | 'outcome_observed' | 'retry_wait'
  | 'block' | 'exhaust_budget' | 'complete' | 'request_stop' | 'stop'
  | 'require_reconciliation';

export type AutomationControllerAttentionOwner = 'none' | 'user' | 'operator';

const STATES: readonly AutomationControllerState[] = ['created', 'observing', 'acquiring', 'executing', 'waiting_for_evidence', 'blocked', 'budget_exhausted', 'completed', 'stopping', 'stopped', 'reconciliation_required'];
const OPERATIONS: readonly AutomationControllerOperation[] = ['start', 'observe', 'begin_acquire', 'acquired', 'no_offer', 'begin_dispatch', 'dispatch_started', 'outcome_observed', 'retry_wait', 'block', 'exhaust_budget', 'complete', 'request_stop', 'stop', 'require_reconciliation'];
const ATTENTION_OWNERS: readonly AutomationControllerAttentionOwner[] = ['none', 'user', 'operator'];

export interface AutomationControllerPrincipalV1 {
  readonly authorization_id: string;
  readonly engineer_id: string;
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
  readonly authorization_revision: number;
}

export interface AutomationControllerPolicyV1 {
  readonly maximum_steps_per_invocation: number;
  readonly maximum_duration_ms: number;
  readonly maximum_transient_retries: number;
  readonly initial_backoff_ms: number;
  readonly maximum_backoff_ms: number;
}

export interface AutomationControllerRunV1 {
  readonly protocol: typeof AUTOMATION_CONTROLLER_PROTOCOL;
  readonly kind: typeof AUTOMATION_CONTROLLER_RUN_KIND;
  readonly run_id: string;
  readonly repository_id: string;
  readonly principal: AutomationControllerPrincipalV1;
  readonly budget_sha256: string;
  readonly policy: AutomationControllerPolicyV1;
  readonly protected_paths: readonly string[];
  readonly created_at: string;
  readonly run_sha256: string;
}

export interface AutomationControllerStepReceiptV1 {
  readonly operation: AutomationControllerOperation;
  readonly outcome: string;
  readonly work_package_id: string | null;
  readonly task_id: string | null;
  readonly claim_id: string | null;
  readonly lease_generation: number | null;
  readonly work_envelope_sha256: string | null;
  readonly dispatch_id: string | null;
  readonly runtime_effect_id: string | null;
  readonly evidence_refs: readonly string[];
}

export interface AutomationControllerEventV1 {
  readonly protocol: typeof AUTOMATION_CONTROLLER_PROTOCOL;
  readonly kind: typeof AUTOMATION_CONTROLLER_EVENT_KIND;
  readonly run_id: string;
  readonly revision: number;
  readonly idempotency_key: string;
  readonly operation: AutomationControllerOperation;
  readonly previous_state: AutomationControllerState | null;
  readonly next_state: AutomationControllerState;
  readonly attention_owner: AutomationControllerAttentionOwner;
  readonly blocker: string | null;
  readonly retry_at: string | null;
  readonly receipt: AutomationControllerStepReceiptV1;
  readonly observed_at: string;
  readonly previous_event_sha256: string | null;
  readonly event_sha256: string;
}

export interface AutomationControllerCurrentV1 {
  readonly protocol: typeof AUTOMATION_CONTROLLER_PROTOCOL;
  readonly kind: typeof AUTOMATION_CONTROLLER_CURRENT_KIND;
  readonly run_id: string;
  readonly run_sha256: string;
  readonly revision: number;
  readonly state: AutomationControllerState;
  readonly attention_owner: AutomationControllerAttentionOwner;
  readonly blocker: string | null;
  readonly retry_at: string | null;
  readonly current_event_sha256: string;
  readonly previous_current_sha256: string | null;
  readonly current_sha256: string;
}

export class AutomationControllerError extends Error {
  constructor(readonly code: 'automation_controller_invalid' | 'automation_controller_transition_invalid', message: string) {
    super(message); this.name = 'AutomationControllerError';
  }
}

function invalid(message: string): never { throw new AutomationControllerError('automation_controller_invalid', message); }
function transitionInvalid(message: string): never { throw new AutomationControllerError('automation_controller_transition_invalid', message); }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void { assertMessageExactKeys(value, keys, label, invalid); }
function string(value: unknown, field: string, pattern?: RegExp, maximum = 512): string {
  const result = messageRequiredString(value, field, invalid); assertMessageBoundedUtf8(result, field, maximum, invalid);
  if (pattern && !pattern.test(result)) invalid(`${field} is invalid`); return result;
}
function sha(value: unknown, field: string): string { const result = string(value, field); assertMessageSha256(result, field, invalid); return result; }
function timestamp(value: unknown, field: string): string {
  const result = string(value, field); if (!RFC3339.test(result) || Number.isNaN(Date.parse(result))) invalid(`${field} is invalid`); return result;
}
function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  assertMessageInteger(value, field, minimum, invalid); if ((value as number) > maximum) invalid(`${field} must be <= ${maximum}`); return value as number;
}

function principal(value: unknown): AutomationControllerPrincipalV1 {
  const row = object(value, 'principal'); exact(row, ['authorization_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision', 'authorization_revision'], 'principal');
  return Object.freeze({ authorization_id: string(row.authorization_id, 'principal.authorization_id'), engineer_id: string(row.engineer_id, 'principal.engineer_id', ENGINEER_ID), binding_id: string(row.binding_id, 'principal.binding_id', UUID), binding_generation: integer(row.binding_generation, 'principal.binding_generation', 1, Number.MAX_SAFE_INTEGER), engineer_contract_revision: sha(row.engineer_contract_revision, 'principal.engineer_contract_revision'), authorization_revision: integer(row.authorization_revision, 'principal.authorization_revision', 1, Number.MAX_SAFE_INTEGER) });
}

function policy(value: unknown): AutomationControllerPolicyV1 {
  const row = object(value, 'policy'); exact(row, ['maximum_steps_per_invocation', 'maximum_duration_ms', 'maximum_transient_retries', 'initial_backoff_ms', 'maximum_backoff_ms'], 'policy');
  const result = Object.freeze({ maximum_steps_per_invocation: integer(row.maximum_steps_per_invocation, 'policy.maximum_steps_per_invocation', 1, 64), maximum_duration_ms: integer(row.maximum_duration_ms, 'policy.maximum_duration_ms', 100, 300_000), maximum_transient_retries: integer(row.maximum_transient_retries, 'policy.maximum_transient_retries', 0, 16), initial_backoff_ms: integer(row.initial_backoff_ms, 'policy.initial_backoff_ms', 1, 60_000), maximum_backoff_ms: integer(row.maximum_backoff_ms, 'policy.maximum_backoff_ms', 1, 300_000) });
  if (result.maximum_backoff_ms < result.initial_backoff_ms) invalid('policy.maximum_backoff_ms must be >= initial_backoff_ms');
  return result;
}

export function buildAutomationControllerRun(input: Omit<AutomationControllerRunV1, 'protocol' | 'kind' | 'run_sha256'>): AutomationControllerRunV1 {
  if (!Array.isArray(input.protected_paths) || input.protected_paths.length === 0 || input.protected_paths.length > 128) invalid('protected_paths must be a non-empty bounded array');
  const protectedPaths = Object.freeze(input.protected_paths.map((value, index) => { const path = string(value, `protected_paths[${index}]`, undefined, 2048); if (path.startsWith('/') || path.startsWith('-') || path.includes('\\') || path.split('/').some((part) => part === '' || part === '.' || part === '..')) invalid(`protected_paths[${index}] is unsafe`); return path; }));
  const basis = Object.freeze({ protocol: AUTOMATION_CONTROLLER_PROTOCOL, kind: AUTOMATION_CONTROLLER_RUN_KIND, run_id: string(input.run_id, 'run_id', RUN_ID), repository_id: string(input.repository_id, 'repository_id', REPOSITORY_ID), principal: principal(input.principal), budget_sha256: sha(input.budget_sha256, 'budget_sha256'), policy: policy(input.policy), protected_paths: protectedPaths, created_at: timestamp(input.created_at, 'created_at') });
  return Object.freeze({ ...basis, run_sha256: canonicalMessageDigest(basis) });
}

export function validateAutomationControllerRun(value: unknown): AutomationControllerRunV1 {
  const row = object(value, 'controller run'); exact(row, ['protocol', 'kind', 'run_id', 'repository_id', 'principal', 'budget_sha256', 'policy', 'protected_paths', 'created_at', 'run_sha256'], 'controller run');
  if (row.protocol !== AUTOMATION_CONTROLLER_PROTOCOL || row.kind !== AUTOMATION_CONTROLLER_RUN_KIND) invalid('controller run protocol or kind is invalid');
  const built = buildAutomationControllerRun(row as unknown as Omit<AutomationControllerRunV1, 'protocol' | 'kind' | 'run_sha256'>);
  if (row.run_sha256 !== built.run_sha256 || canonicalMessageBytes(row) !== canonicalMessageBytes(built as unknown as Record<string, unknown>)) invalid('controller run digest is stale'); return built;
}

const TRANSITIONS: Readonly<Record<AutomationControllerState | 'absent', Readonly<Record<string, AutomationControllerState>>>> = Object.freeze({
  absent: Object.freeze({ start: 'created' }),
  created: Object.freeze({ observe: 'observing', request_stop: 'stopping', require_reconciliation: 'reconciliation_required' }),
  observing: Object.freeze({ begin_acquire: 'acquiring', no_offer: 'completed', block: 'blocked', exhaust_budget: 'budget_exhausted', request_stop: 'stopping', require_reconciliation: 'reconciliation_required' }),
  acquiring: Object.freeze({ acquired: 'executing', retry_wait: 'observing', block: 'blocked', exhaust_budget: 'budget_exhausted', request_stop: 'stopping', require_reconciliation: 'reconciliation_required' }),
  executing: Object.freeze({ begin_dispatch: 'executing', dispatch_started: 'waiting_for_evidence', exhaust_budget: 'budget_exhausted', request_stop: 'stopping', require_reconciliation: 'reconciliation_required' }),
  waiting_for_evidence: Object.freeze({ outcome_observed: 'observing', retry_wait: 'observing', complete: 'completed', block: 'blocked', exhaust_budget: 'budget_exhausted', request_stop: 'stopping', require_reconciliation: 'reconciliation_required' }),
  stopping: Object.freeze({ stop: 'stopped', require_reconciliation: 'reconciliation_required' }),
  blocked: Object.freeze({}), budget_exhausted: Object.freeze({}), completed: Object.freeze({}), stopped: Object.freeze({}), reconciliation_required: Object.freeze({}),
});

export function nextAutomationControllerState(current: AutomationControllerState | null, operation: AutomationControllerOperation): AutomationControllerState {
  const next = TRANSITIONS[current ?? 'absent'][operation]; if (!next) transitionInvalid(`cannot ${operation} from ${current ?? 'absent'}`); return next;
}

function receipt(value: AutomationControllerStepReceiptV1, operation: AutomationControllerOperation): AutomationControllerStepReceiptV1 {
  const row = object(value, 'receipt'); exact(row, ['operation', 'outcome', 'work_package_id', 'task_id', 'claim_id', 'lease_generation', 'work_envelope_sha256', 'dispatch_id', 'runtime_effect_id', 'evidence_refs'], 'receipt');
  if (row.operation !== operation) invalid('receipt.operation does not match event operation');
  const nullable = (field: string, pattern?: RegExp): string | null => row[field] === null ? null : string(row[field], `receipt.${field}`, pattern, 2048);
  if (!Array.isArray(row.evidence_refs) || row.evidence_refs.length > 32) invalid('receipt.evidence_refs must be a bounded array');
  return Object.freeze({ operation, outcome: string(row.outcome, 'receipt.outcome'), work_package_id: nullable('work_package_id'), task_id: nullable('task_id', /^[0-9a-f]{64}$/u), claim_id: nullable('claim_id', UUID), lease_generation: row.lease_generation === null ? null : integer(row.lease_generation, 'receipt.lease_generation', 1, Number.MAX_SAFE_INTEGER), work_envelope_sha256: row.work_envelope_sha256 === null ? null : sha(row.work_envelope_sha256, 'receipt.work_envelope_sha256'), dispatch_id: row.dispatch_id === null ? null : sha(row.dispatch_id, 'receipt.dispatch_id'), runtime_effect_id: row.runtime_effect_id === null ? null : sha(row.runtime_effect_id, 'receipt.runtime_effect_id'), evidence_refs: Object.freeze(row.evidence_refs.map((item, index) => string(item, `receipt.evidence_refs[${index}]`, undefined, 2048))) });
}

export function buildAutomationControllerEvent(input: Omit<AutomationControllerEventV1, 'protocol' | 'kind' | 'next_state' | 'event_sha256'>): AutomationControllerEventV1 {
  if (!OPERATIONS.includes(input.operation)) invalid('operation is invalid');
  if (input.previous_state !== null && !STATES.includes(input.previous_state)) invalid('previous_state is invalid');
  if (!ATTENTION_OWNERS.includes(input.attention_owner)) invalid('attention_owner is invalid');
  const nextState = nextAutomationControllerState(input.previous_state, input.operation);
  if ((input.attention_owner === 'none') !== (input.blocker === null)) invalid('blocker and attention_owner must be present together');
  if (input.operation === 'block' && input.attention_owner === 'none') invalid('block needs an attention owner');
  if (input.retry_at !== null) timestamp(input.retry_at, 'retry_at');
  const basis = Object.freeze({ protocol: AUTOMATION_CONTROLLER_PROTOCOL, kind: AUTOMATION_CONTROLLER_EVENT_KIND, run_id: string(input.run_id, 'run_id', RUN_ID), revision: integer(input.revision, 'revision', 1, Number.MAX_SAFE_INTEGER), idempotency_key: string(input.idempotency_key, 'idempotency_key'), operation: input.operation, previous_state: input.previous_state, next_state: nextState, attention_owner: input.attention_owner, blocker: input.blocker === null ? null : string(input.blocker, 'blocker', undefined, 4096), retry_at: input.retry_at, receipt: receipt(input.receipt, input.operation), observed_at: timestamp(input.observed_at, 'observed_at'), previous_event_sha256: input.previous_event_sha256 === null ? null : sha(input.previous_event_sha256, 'previous_event_sha256') });
  return Object.freeze({ ...basis, event_sha256: canonicalMessageDigest(basis) });
}

export function validateAutomationControllerEvent(value: unknown): AutomationControllerEventV1 {
  const row = object(value, 'controller event');
  exact(row, ['protocol', 'kind', 'run_id', 'revision', 'idempotency_key', 'operation', 'previous_state', 'next_state', 'attention_owner', 'blocker', 'retry_at', 'receipt', 'observed_at', 'previous_event_sha256', 'event_sha256'], 'controller event');
  if (row.protocol !== AUTOMATION_CONTROLLER_PROTOCOL || row.kind !== AUTOMATION_CONTROLLER_EVENT_KIND) invalid('controller event protocol or kind is invalid');
  const built = buildAutomationControllerEvent(row as unknown as Omit<AutomationControllerEventV1, 'protocol' | 'kind' | 'next_state' | 'event_sha256'>);
  if (row.next_state !== built.next_state || row.event_sha256 !== built.event_sha256 || canonicalMessageBytes(row) !== canonicalMessageBytes(built as unknown as Record<string, unknown>)) invalid('controller event digest is stale');
  return built;
}

export function foldAutomationControllerCurrent(run: AutomationControllerRunV1, previous: AutomationControllerCurrentV1 | null, event: AutomationControllerEventV1): AutomationControllerCurrentV1 {
  if (event.run_id !== run.run_id || event.revision !== (previous?.revision ?? 0) + 1 || event.previous_state !== (previous?.state ?? null) || event.previous_event_sha256 !== (previous?.current_event_sha256 ?? null)) transitionInvalid('event does not extend exact controller current');
  const basis = Object.freeze({ protocol: AUTOMATION_CONTROLLER_PROTOCOL, kind: AUTOMATION_CONTROLLER_CURRENT_KIND, run_id: run.run_id, run_sha256: run.run_sha256, revision: event.revision, state: event.next_state, attention_owner: event.attention_owner, blocker: event.blocker, retry_at: event.retry_at, current_event_sha256: event.event_sha256, previous_current_sha256: previous?.current_sha256 ?? null });
  return Object.freeze({ ...basis, current_sha256: canonicalMessageDigest(basis) });
}

export function validateAutomationControllerCurrent(value: unknown): AutomationControllerCurrentV1 {
  const row = object(value, 'controller current');
  exact(row, ['protocol', 'kind', 'run_id', 'run_sha256', 'revision', 'state', 'attention_owner', 'blocker', 'retry_at', 'current_event_sha256', 'previous_current_sha256', 'current_sha256'], 'controller current');
  if (row.protocol !== AUTOMATION_CONTROLLER_PROTOCOL || row.kind !== AUTOMATION_CONTROLLER_CURRENT_KIND || !STATES.includes(row.state as AutomationControllerState) || !ATTENTION_OWNERS.includes(row.attention_owner as AutomationControllerAttentionOwner)) invalid('controller current protocol, kind or enum is invalid');
  const basis = { protocol: AUTOMATION_CONTROLLER_PROTOCOL, kind: AUTOMATION_CONTROLLER_CURRENT_KIND, run_id: string(row.run_id, 'run_id', RUN_ID), run_sha256: sha(row.run_sha256, 'run_sha256'), revision: integer(row.revision, 'revision', 1, Number.MAX_SAFE_INTEGER), state: row.state as AutomationControllerState, attention_owner: row.attention_owner as AutomationControllerAttentionOwner, blocker: row.blocker === null ? null : string(row.blocker, 'blocker', undefined, 4096), retry_at: row.retry_at === null ? null : timestamp(row.retry_at, 'retry_at'), current_event_sha256: sha(row.current_event_sha256, 'current_event_sha256'), previous_current_sha256: row.previous_current_sha256 === null ? null : sha(row.previous_current_sha256, 'previous_current_sha256') };
  const built = Object.freeze({ ...basis, current_sha256: canonicalMessageDigest(basis) });
  if (row.current_sha256 !== built.current_sha256 || canonicalMessageBytes(row) !== canonicalMessageBytes(built as unknown as Record<string, unknown>)) invalid('controller current digest is stale');
  return built;
}

export function canonicalAutomationControllerRunBytes(value: AutomationControllerRunV1): string { return canonicalMessageBytes(value as unknown as Record<string, unknown>); }
export function canonicalAutomationControllerEventBytes(value: AutomationControllerEventV1): string { return canonicalMessageBytes(value as unknown as Record<string, unknown>); }
export function canonicalAutomationControllerCurrentBytes(value: AutomationControllerCurrentV1): string { return canonicalMessageBytes(value as unknown as Record<string, unknown>); }
