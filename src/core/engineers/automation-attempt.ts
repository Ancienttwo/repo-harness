import { canonicalEngineerJson, engineerSha256 } from './profile-binding';
import type { AutomationFailureClass, WorkPackageRetryPolicyV1 } from './scheduling';

export const AUTOMATION_ATTEMPT_PROTOCOL = 1 as const;
export type TaskAutomationAttemptOutcome = 'started' | 'completed' | 'user_blocked' | 'external_blocked' | 'transient_failure' | 'permanent_failure' | 'lease_lost' | 'cancelled' | 'reconciliation_required';
export interface TaskAutomationAttemptV1 {
  readonly protocol: 1; readonly kind: 'repo-harness-task-automation-attempt';
  readonly repository_id: string; readonly sprint_path: string; readonly task_id: string; readonly task_revision: string;
  readonly work_package_id: string; readonly work_package_revision: string; readonly engineer_id: string; readonly binding_generation: number;
  readonly claim_id: string; readonly lease_generation: number; readonly controller_run_id: string; readonly budget_revision: string;
  readonly dispatch_id: string; readonly runtime_effect_id: string | null; readonly sequence: number; readonly started_at: string; readonly ended_at: string | null;
  readonly outcome: TaskAutomationAttemptOutcome; readonly evidence_refs: readonly string[]; readonly previous_attempt_sha256: string | null; readonly attempt_sha256: string;
}
export interface TaskAutomationAttemptCurrentV1 {
  readonly protocol: 1; readonly kind: 'repo-harness-task-automation-attempt-current'; readonly repository_id: string; readonly work_package_id: string;
  readonly work_package_revision: string; readonly attempt_count: number; readonly last_outcome: TaskAutomationAttemptOutcome | null; readonly next_eligible_at: string | null;
  readonly first_eligible_at: string; readonly last_attempt_sha256: string | null; readonly current_sha256: string;
}
export type RetryEligibilityState = 'eligible' | 'retry_backoff' | 'retry_exhausted' | 'retry_forbidden' | 'reconciliation_required' | 'authority_unavailable';
export interface RetryEligibilityObservationV1 { readonly state: RetryEligibilityState; readonly attempt_count: number; readonly last_outcome: TaskAutomationAttemptOutcome | null; readonly next_eligible_at: string | null; readonly eligible_since: string | null; readonly attention_owner: 'none' | 'user' | 'operator'; readonly starvation_attention: boolean; readonly authority_revision: string; }

function iso(value: string, field: string): number { const parsed = Date.parse(value); if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`${field} must be a canonical ISO timestamp`); return parsed; }
function positive(value: number, field: string): void { if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${field} must be a positive integer`); }
function sha(value: string, field: string): void { if (!/^sha256:[0-9a-f]{64}$/u.test(value)) throw new Error(`${field} must be sha256`); }
function digest(value: unknown): string { return engineerSha256(canonicalEngineerJson(value)); }
function record(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`); return value as Record<string, unknown>; }
function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void { if (Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) throw new Error(`${label} keys are invalid`); }
export function attemptIdentity(input: Pick<TaskAutomationAttemptV1, 'claim_id' | 'lease_generation' | 'controller_run_id' | 'dispatch_id'>): string { return digest({ claim_id: input.claim_id, lease_generation: input.lease_generation, controller_run_id: input.controller_run_id, dispatch_id: input.dispatch_id }); }

export function buildTaskAutomationAttempt(input: Omit<TaskAutomationAttemptV1, 'protocol' | 'kind' | 'attempt_sha256'>): TaskAutomationAttemptV1 {
  positive(input.sequence, 'sequence'); positive(input.lease_generation, 'lease_generation'); positive(input.binding_generation, 'binding_generation'); iso(input.started_at, 'started_at');
  if (input.outcome === 'started' ? input.ended_at !== null || input.evidence_refs.length !== 0 : input.ended_at === null || input.evidence_refs.length === 0) throw new Error('attempt outcome, end timestamp and evidence are inconsistent');
  if (input.ended_at !== null && iso(input.ended_at, 'ended_at') < iso(input.started_at, 'started_at')) throw new Error('attempt ended before it started');
  if (!/^[0-9a-f]{64}$/u.test(input.task_revision)) throw new Error('task_revision is invalid');
  for (const field of ['work_package_revision', 'controller_run_id', 'budget_revision', 'dispatch_id'] as const) sha(input[field], field);
  if (input.runtime_effect_id !== null) sha(input.runtime_effect_id, 'runtime_effect_id'); if (input.previous_attempt_sha256 !== null) sha(input.previous_attempt_sha256, 'previous_attempt_sha256');
  const basis = Object.freeze({ protocol: AUTOMATION_ATTEMPT_PROTOCOL, kind: 'repo-harness-task-automation-attempt' as const, ...input, evidence_refs: Object.freeze([...input.evidence_refs]) });
  return Object.freeze({ ...basis, attempt_sha256: digest(basis) });
}
export function completeTaskAutomationAttempt(start: TaskAutomationAttemptV1, input: { readonly outcome: Exclude<TaskAutomationAttemptOutcome, 'started'>; readonly ended_at: string; readonly runtime_effect_id: string | null; readonly evidence_refs: readonly string[] }): TaskAutomationAttemptV1 {
  if (start.outcome !== 'started') throw new Error('only a started attempt can complete');
  const { protocol: _protocol, kind: _kind, attempt_sha256: _attemptSha256, ...basis } = start;
  return buildTaskAutomationAttempt({ ...basis, outcome: input.outcome, ended_at: input.ended_at, runtime_effect_id: input.runtime_effect_id, evidence_refs: input.evidence_refs });
}
const ATTEMPT_KEYS = ['protocol','kind','repository_id','sprint_path','task_id','task_revision','work_package_id','work_package_revision','engineer_id','binding_generation','claim_id','lease_generation','controller_run_id','budget_revision','dispatch_id','runtime_effect_id','sequence','started_at','ended_at','outcome','evidence_refs','previous_attempt_sha256','attempt_sha256'] as const;
export function validateTaskAutomationAttempt(value: unknown): TaskAutomationAttemptV1 {
  const row = record(value, 'automation attempt'); exact(row, ATTEMPT_KEYS, 'automation attempt');
  if (row.protocol !== AUTOMATION_ATTEMPT_PROTOCOL || row.kind !== 'repo-harness-task-automation-attempt' || !Array.isArray(row.evidence_refs)) throw new Error('automation attempt protocol or fields are invalid');
  const { protocol: _protocol, kind: _kind, attempt_sha256, ...input } = row;
  const built = buildTaskAutomationAttempt(input as unknown as Omit<TaskAutomationAttemptV1, 'protocol'|'kind'|'attempt_sha256'>);
  if (attempt_sha256 !== built.attempt_sha256 || canonicalEngineerJson(row) !== canonicalEngineerJson(built)) throw new Error('automation attempt digest is stale');
  return built;
}
function backoffSeconds(policy: WorkPackageRetryPolicyV1, attemptCount: number): number { return policy.backoff.kind === 'fixed' ? policy.backoff.initial_seconds : Math.min(policy.backoff.maximum_seconds, policy.backoff.initial_seconds * (2 ** Math.max(0, attemptCount - 1))); }
export function projectAttemptCurrent(input: { readonly repository_id: string; readonly work_package_id: string; readonly work_package_revision: string; readonly policy: WorkPackageRetryPolicyV1; readonly attempts: readonly TaskAutomationAttemptV1[]; readonly first_eligible_at: string }): TaskAutomationAttemptCurrentV1 {
  iso(input.first_eligible_at, 'first_eligible_at'); let previous: string | null = null;
  for (let index = 0; index < input.attempts.length; index += 1) { const item = input.attempts[index]!; if (item.sequence !== index + 1 || item.previous_attempt_sha256 !== previous || item.work_package_revision !== input.work_package_revision) throw new Error('attempt chain is stale or forked'); previous = item.attempt_sha256; }
  const last = input.attempts.at(-1) ?? null; const retryable = last !== null && last.outcome !== 'started' && input.policy.retryable_failure_classes.includes(last.outcome as AutomationFailureClass);
  const next = retryable && last!.ended_at !== null ? new Date(iso(last!.ended_at, 'ended_at') + backoffSeconds(input.policy, input.attempts.length) * 1_000).toISOString() : null;
  const basis = { protocol: AUTOMATION_ATTEMPT_PROTOCOL, kind: 'repo-harness-task-automation-attempt-current' as const, repository_id: input.repository_id, work_package_id: input.work_package_id, work_package_revision: input.work_package_revision, attempt_count: input.attempts.length, last_outcome: last?.outcome ?? null, next_eligible_at: next, first_eligible_at: input.first_eligible_at, last_attempt_sha256: previous };
  return Object.freeze({ ...basis, current_sha256: digest(basis) });
}
export function observeRetryEligibility(input: { readonly policy: WorkPackageRetryPolicyV1; readonly current: TaskAutomationAttemptCurrentV1 | null; readonly work_package_revision: string; readonly observed_at: string }): RetryEligibilityObservationV1 {
  const now = iso(input.observed_at, 'observed_at'); if (input.current === null) return Object.freeze({ state: 'eligible', attempt_count: 0, last_outcome: null, next_eligible_at: null, eligible_since: input.observed_at, attention_owner: 'none', starvation_attention: false, authority_revision: digest({ work_package_revision: input.work_package_revision, attempt: null }) });
  const current = input.current; if (current.work_package_revision !== input.work_package_revision) return Object.freeze({ state: 'authority_unavailable', attempt_count: current.attempt_count, last_outcome: current.last_outcome, next_eligible_at: current.next_eligible_at, eligible_since: null, attention_owner: 'operator', starvation_attention: false, authority_revision: current.current_sha256 });
  let state: RetryEligibilityState = 'eligible'; let owner: 'none' | 'user' | 'operator' = 'none';
  if (current.last_outcome === 'started' || current.last_outcome === 'reconciliation_required') { state = 'reconciliation_required'; owner = 'operator'; }
  else if (current.attempt_count >= input.policy.max_automated_attempts) { state = 'retry_exhausted'; owner = 'user'; }
  else if (current.last_outcome !== null && !input.policy.retryable_failure_classes.includes(current.last_outcome as AutomationFailureClass)) { state = 'retry_forbidden'; owner = current.last_outcome === 'user_blocked' || current.last_outcome === 'permanent_failure' ? 'user' : 'operator'; }
  else if (current.next_eligible_at !== null && now < iso(current.next_eligible_at, 'next_eligible_at')) state = 'retry_backoff';
  const eligibleSince = state === 'eligible' ? current.next_eligible_at ?? current.first_eligible_at : null;
  const starvation = eligibleSince !== null && now - iso(eligibleSince, 'eligible_since') >= input.policy.attention_after_seconds * 1_000;
  return Object.freeze({ state, attempt_count: current.attempt_count, last_outcome: current.last_outcome, next_eligible_at: current.next_eligible_at, eligible_since: eligibleSince, attention_owner: starvation ? 'operator' : owner, starvation_attention: starvation, authority_revision: current.current_sha256 });
}
const CURRENT_KEYS = ['protocol','kind','repository_id','work_package_id','work_package_revision','attempt_count','last_outcome','next_eligible_at','first_eligible_at','last_attempt_sha256','current_sha256'] as const;
export function validateTaskAutomationAttemptCurrent(value: unknown): TaskAutomationAttemptCurrentV1 {
  const row = record(value, 'automation attempt current'); exact(row, CURRENT_KEYS, 'automation attempt current');
  if (row.protocol !== AUTOMATION_ATTEMPT_PROTOCOL || row.kind !== 'repo-harness-task-automation-attempt-current') throw new Error('automation attempt current protocol is invalid');
  if (!Number.isSafeInteger(row.attempt_count) || (row.attempt_count as number) < 0) throw new Error('attempt_count is invalid');
  iso(row.first_eligible_at as string, 'first_eligible_at'); if (row.next_eligible_at !== null) iso(row.next_eligible_at as string, 'next_eligible_at');
  if (row.last_attempt_sha256 !== null) sha(row.last_attempt_sha256 as string, 'last_attempt_sha256');
  const { current_sha256, ...basis } = row; if (current_sha256 !== digest(basis)) throw new Error('automation attempt current digest is stale');
  return Object.freeze(row as unknown as TaskAutomationAttemptCurrentV1);
}
