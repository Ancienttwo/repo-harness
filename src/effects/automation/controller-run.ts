import { canonicalMessageDigest } from '../../core/messages/mechanics';
import { buildAutomationControllerRun, type AutomationControllerPolicyV1 } from '../../core/automation/controller';
import { workEnvelopeSha256, type EngineerPrincipalV1 } from '../../core/engineers/principal-claim';
import type { AutomationControllerCurrentV1, AutomationControllerOperation, AutomationControllerStepReceiptV1 } from '../../core/automation/controller';
import {
  AutomationBudgetStoreError,
  appendAutomationUsage,
  readAutomationBudgetStatus,
  reserveAutomationBudget,
} from './budget-store';
import {
  appendAutomationControllerEvent,
  readAutomationControllerStatus,
  startAutomationControllerRun,
} from './controller-store';
import { resolveEngineerPrincipal } from '../engineers/principal';
import { acquireNextScheduledEngineerTask, type AcquireNextScheduledEngineerTaskResult } from '../engineers/scheduling-acquire-next';
import { dispatchDelegatedRun, type DelegatedRunStatus } from '../engineers/delegated-run-store';
import { repoHarnessAuthorizationRevision } from '../repo-registry';
import { readLease } from '../state/coordination-lease-store';
import { renewLeaseLiveness } from '../state/coordination-lease-liveness-store';

export interface StepAutomationControllerInput {
  readonly repo_root: string;
  readonly run_id: string;
  readonly idempotency_key: string;
  readonly dispatch_id?: string;
  readonly max_selection_attempts?: number;
}

export interface AutomationControllerStepResult {
  readonly run_id: string;
  readonly current: AutomationControllerCurrentV1;
  readonly acquisition: AcquireNextScheduledEngineerTaskResult | null;
  readonly dispatch: DelegatedRunStatus | null;
  readonly steps_executed: number;
}

export interface AutomationControllerRunDependencies {
  readonly now: () => Date;
  readonly resolvePrincipal: typeof resolveEngineerPrincipal;
  readonly authorizationRevision: typeof repoHarnessAuthorizationRevision;
  readonly acquireNext: typeof acquireNextScheduledEngineerTask;
  readonly dispatch: typeof dispatchDelegatedRun;
  readonly readBudget: typeof readAutomationBudgetStatus;
  readonly reserveBudget: typeof reserveAutomationBudget;
  readonly appendUsage: typeof appendAutomationUsage;
  readonly readLease: typeof readLease;
  readonly renewLiveness: typeof renewLeaseLiveness;
}

export interface StartBoundedAutomationControllerInput {
  readonly repo_root: string;
  readonly automation_run_id: string;
  readonly authorization_id: string;
  readonly idempotency_key: string;
  readonly policy: AutomationControllerPolicyV1;
  readonly protected_paths: readonly string[];
}

const defaultDependencies: AutomationControllerRunDependencies = {
  now: () => new Date(),
  resolvePrincipal: resolveEngineerPrincipal,
  authorizationRevision: repoHarnessAuthorizationRevision,
  acquireNext: acquireNextScheduledEngineerTask,
  dispatch: dispatchDelegatedRun,
  readBudget: readAutomationBudgetStatus,
  reserveBudget: reserveAutomationBudget,
  appendUsage: appendAutomationUsage,
  readLease,
  renewLiveness: renewLeaseLiveness,
};

function exactPrincipal(repositoryId: string, expected: ReturnType<typeof readAutomationControllerStatus>['run']['principal'], observed: EngineerPrincipalV1, authorizationRevision: number): void {
  if (observed.repository_id !== repositoryId || observed.engineer_id !== expected.engineer_id
    || observed.binding_id !== expected.binding_id || observed.binding_generation !== expected.binding_generation
    || observed.engineer_contract_revision !== expected.engineer_contract_revision
    || observed.auth_subject !== expected.authorization_id || authorizationRevision !== expected.authorization_revision) {
    throw new Error('controller principal, Binding or authorization revision is stale');
  }
}

export function startBoundedAutomationController(input: StartBoundedAutomationControllerInput, overrides: Partial<AutomationControllerRunDependencies> = {}) {
  const deps = { ...defaultDependencies, ...overrides };
  const principal = deps.resolvePrincipal({ repo_root: input.repo_root, authorization_id: input.authorization_id });
  const authorizationRevision = deps.authorizationRevision();
  const budgetStatus = deps.readBudget(input.repo_root, input.automation_run_id);
  const budget = budgetStatus.budget;
  if (!budget.unattended || budget.automation_run_id !== input.automation_run_id || budget.repository_id !== principal.repository_id || budget.engineer_id !== principal.engineer_id) throw new Error('automation budget does not authorize this exact unattended Engineer controller');
  if (budgetStatus.current.state !== 'active' || budgetStatus.stop_receipt !== null) throw new Error('automation budget is not active');
  const observedAt = deps.now().toISOString();
  const run = buildAutomationControllerRun({ run_id: input.automation_run_id, repository_id: principal.repository_id, principal: { authorization_id: input.authorization_id, engineer_id: principal.engineer_id, binding_id: principal.binding_id, binding_generation: principal.binding_generation, engineer_contract_revision: principal.engineer_contract_revision, authorization_revision: authorizationRevision }, budget_sha256: budget.budget_sha256, policy: input.policy, protected_paths: input.protected_paths, created_at: observedAt });
  return startAutomationControllerRun({ repo_root: input.repo_root, run, idempotency_key: input.idempotency_key, observed_at: observedAt });
}

export function stopAutomationController(repoRoot: string, runId: string, idempotencyKey: string, overrides: Partial<AutomationControllerRunDependencies> = {}) {
  const deps = { ...defaultDependencies, ...overrides }; const status = readAutomationControllerStatus(repoRoot, runId); let current = status.current;
  if (['blocked', 'budget_exhausted', 'completed', 'stopped', 'reconciliation_required'].includes(current.state)) return status;
  const observedAt = deps.now().toISOString();
  if (current.state !== 'stopping') current = append(repoRoot, runId, current, `${idempotencyKey}:request`, 'request_stop', observedAt, receipt('request_stop', 'requested'));
  current = append(repoRoot, runId, current, `${idempotencyKey}:stopped`, 'stop', observedAt, receipt('stop', 'stopped'));
  return Object.freeze({ run: status.run, current });
}

export function reconcileAutomationController(repoRoot: string, runId: string, idempotencyKey: string, evidenceRefs: readonly string[], overrides: Partial<AutomationControllerRunDependencies> = {}) {
  const deps = { ...defaultDependencies, ...overrides }; const status = readAutomationControllerStatus(repoRoot, runId); const current = status.current;
  if (current.state !== 'acquiring' && current.state !== 'waiting_for_evidence' && current.state !== 'executing') return status;
  if (evidenceRefs.length === 0) throw new Error('controller reconciliation requires exact evidence');
  const next = append(repoRoot, runId, current, `${idempotencyKey}:reconcile`, 'require_reconciliation', deps.now().toISOString(), receipt('require_reconciliation', 'evidence_requires_operator', { evidence_refs: evidenceRefs }), 'operator', 'controller_reconciliation_required');
  return Object.freeze({ run: status.run, current: next });
}

function evidence(runId: string, sha256: string) { return Object.freeze([{ ref: `controller-run:${runId}`, sha256 }]); }
function receipt(operation: AutomationControllerOperation, outcome: string, extra: Partial<AutomationControllerStepReceiptV1> = {}): AutomationControllerStepReceiptV1 {
  return Object.freeze({ operation, outcome, work_package_id: null, task_id: null, claim_id: null, lease_generation: null, work_envelope_sha256: null, dispatch_id: null, runtime_effect_id: null, evidence_refs: [], ...extra });
}

function append(repoRoot: string, runId: string, current: AutomationControllerCurrentV1, key: string, operation: AutomationControllerOperation, observedAt: string, stepReceipt: AutomationControllerStepReceiptV1, attentionOwner: 'none' | 'user' | 'operator' = 'none', blocker: string | null = null, retryAt: string | null = null): AutomationControllerCurrentV1 {
  return appendAutomationControllerEvent({ repo_root: repoRoot, run_id: runId, expected_current_sha256: current.current_sha256, idempotency_key: key, operation, attention_owner: attentionOwner, blocker, retry_at: retryAt, receipt: stepReceipt, observed_at: observedAt }).current;
}

function budgetRefusal(repoRoot: string, runId: string, current: AutomationControllerCurrentV1, key: string, error: AutomationBudgetStoreError, observedAt: string): AutomationControllerCurrentV1 {
  const exhausted = error.code === 'automation_budget_refused' && (error.refusal?.refusal_code === 'budget_limit_exceeded' || error.refusal?.refusal_code === 'budget_expired');
  const operation = exhausted ? 'exhaust_budget' : 'require_reconciliation';
  return append(repoRoot, runId, current, `${key}:budget-refusal`, operation, observedAt, receipt(operation, error.code, { evidence_refs: [`automation-budget:${error.code}`] }), exhausted ? 'user' : 'operator', error.refusal?.refusal_code ?? error.code);
}

function transientAcquisition(result: AcquireNextScheduledEngineerTaskResult): boolean {
  return !result.ok && (result.error === 'engineer_offer_stale' || result.error === 'engineer_concurrency_unavailable'
    || (result.error === 'fleet_acquire_failed' && result.fleet?.ok === false && result.fleet.error === 'fleet_acquire_failed'
      && result.fleet.fleet?.ok === false && (result.fleet.fleet.error === 'offer_stale' || result.fleet.fleet.error === 'claim_failed')));
}

export function stepAutomationController(input: StepAutomationControllerInput, overrides: Partial<AutomationControllerRunDependencies> = {}): AutomationControllerStepResult {
  const deps = { ...defaultDependencies, ...overrides }; const status = readAutomationControllerStatus(input.repo_root, input.run_id); const run = status.run;
  const startedAt = deps.now().getTime(); let current = status.current; let steps = 0; let acquisition: AcquireNextScheduledEngineerTaskResult | null = null; let dispatched: DelegatedRunStatus | null = null;
  const observedPrincipal = deps.resolvePrincipal({ repo_root: input.repo_root, authorization_id: run.principal.authorization_id });
  exactPrincipal(run.repository_id, run.principal, observedPrincipal, deps.authorizationRevision());
  const budget = deps.readBudget(input.repo_root, run.run_id);
  if (budget.budget.budget_sha256 !== run.budget_sha256 || !budget.budget.unattended || budget.budget.engineer_id !== run.principal.engineer_id) throw new Error('controller budget does not authorize this exact unattended Engineer run');
  const room = () => steps < run.policy.maximum_steps_per_invocation && deps.now().getTime() - startedAt < run.policy.maximum_duration_ms;
  const at = () => deps.now().toISOString();

  if (current.state === 'created' && room()) { current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:observe`, 'observe', at(), receipt('observe', 'ready')); steps += 1; }
  if (current.state === 'observing' && current.retry_at !== null && Date.parse(current.retry_at) > deps.now().getTime()) return Object.freeze({ run_id: run.run_id, current, acquisition, dispatch: dispatched, steps_executed: steps });
  if (current.state === 'acquiring' || current.state === 'waiting_for_evidence') {
    current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:uncertain`, 'require_reconciliation', at(), receipt('require_reconciliation', 'unresolved_side_effect'), 'operator', 'controller_reconciliation_required'); steps += 1;
    return Object.freeze({ run_id: run.run_id, current, acquisition, dispatch: dispatched, steps_executed: steps });
  }
  if (current.state === 'observing' && room()) {
    let reservation;
    try { reservation = deps.reserveBudget({ repo_root: input.repo_root, automation_run_id: run.run_id, expected_budget_sha256: run.budget_sha256, idempotency_key: `${input.idempotency_key}:acquisition`, operation: 'acquisition', unit_kind: 'execute', unit_id: run.run_id, attempt: 1, provider: null }); }
    catch (error) { if (error instanceof AutomationBudgetStoreError) { current = budgetRefusal(input.repo_root, run.run_id, current, input.idempotency_key, error, at()); return Object.freeze({ run_id: run.run_id, current, acquisition, dispatch: dispatched, steps_executed: steps + 1 }); } throw error; }
    current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:begin-acquire`, 'begin_acquire', at(), receipt('begin_acquire', 'reserved', { evidence_refs: [reservation.reservation_sha256] })); steps += 1;
    try { acquisition = deps.acquireNext({ repo_root: input.repo_root, principal: observedPrincipal, idempotency_key: `${input.idempotency_key}:acquire-next`, max_selection_attempts: input.max_selection_attempts }); }
    catch (error) { current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:acquire-unknown`, 'require_reconciliation', at(), receipt('require_reconciliation', 'acquisition_outcome_unknown'), 'operator', 'controller_reconciliation_required'); throw error; }
    const acquisitionEvidence = evidence(run.run_id, current.current_event_sha256);
    const usage = deps.appendUsage({ repo_root: input.repo_root, reservation, outcome: acquisition.ok ? 'progress' : 'no_progress', evidence_refs: acquisitionEvidence });
    if (acquisition.ok) {
      const envelopeSha = workEnvelopeSha256(acquisition.envelope);
      const lease = deps.readLease(input.repo_root, acquisition.envelope.task_id);
      if (lease.record === null || lease.record.claim_id !== acquisition.envelope.claim_id || lease.record.generation !== acquisition.envelope.generation) throw new Error('acquired WorkEnvelope does not bind the exact current Lease');
      const renewed = deps.renewLiveness({ repo_root: input.repo_root, owner: lease.record, policy: run.policy.lease_liveness, owner_id: run.run_id, observed_at: at(), requested_ttl_ms: run.policy.lease_liveness.maximum_ttl_ms, binding_generation: run.principal.binding_generation, runtime_effect_id: null, expected_current_sha256: null });
      current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:acquired`, 'acquired', at(), receipt('acquired', 'acquired', { work_package_id: acquisition.offer.work_package_id, task_id: acquisition.envelope.task_id, claim_id: acquisition.envelope.claim_id, lease_generation: acquisition.envelope.generation, work_envelope_sha256: envelopeSha, evidence_refs: [acquisition.receipt.receipt_sha256, usage.event.event_sha256, renewed.renewal.renewal_sha256] })); steps += 1;
    } else if (acquisition.error === 'engineer_no_eligible_offer') {
      current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:no-offer`, 'no_offer', at(), receipt('no_offer', 'no_eligible_offer', { evidence_refs: [usage.event.event_sha256] })); steps += 1;
    } else if (transientAcquisition(acquisition)) {
      const nextAttempt = current.consecutive_transient_failures + 1;
      if (nextAttempt > run.policy.maximum_transient_retries) current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:retry-exhausted`, 'block', at(), receipt('block', 'transient_retry_exhausted', { evidence_refs: [usage.event.event_sha256] }), 'operator', 'transient_retry_exhausted');
      else {
        const delay = Math.min(run.policy.maximum_backoff_ms, run.policy.initial_backoff_ms * (2 ** (nextAttempt - 1)));
        current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:retry-${nextAttempt}`, 'retry_wait', at(), receipt('retry_wait', acquisition.error, { evidence_refs: [usage.event.event_sha256] }), 'none', null, new Date(deps.now().getTime() + delay).toISOString());
      }
      steps += 1;
    } else {
      current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:acquire-failed`, 'require_reconciliation', at(), receipt('require_reconciliation', acquisition.error, { evidence_refs: [usage.event.event_sha256] }), 'operator', acquisition.error); steps += 1;
    }
  }
  if (current.state === 'executing' && room()) {
    if (!input.dispatch_id) return Object.freeze({ run_id: run.run_id, current, acquisition, dispatch: dispatched, steps_executed: steps });
    let reservation;
    try { reservation = deps.reserveBudget({ repo_root: input.repo_root, automation_run_id: run.run_id, expected_budget_sha256: run.budget_sha256, idempotency_key: `${input.idempotency_key}:dispatch`, operation: 'dispatch', unit_kind: 'execute', unit_id: run.run_id, attempt: 1, provider: null }); }
    catch (error) { if (error instanceof AutomationBudgetStoreError) { current = budgetRefusal(input.repo_root, run.run_id, current, input.idempotency_key, error, at()); return Object.freeze({ run_id: run.run_id, current, acquisition, dispatch: dispatched, steps_executed: steps + 1 }); } throw error; }
    current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:begin-dispatch`, 'begin_dispatch', at(), receipt('begin_dispatch', 'reserved', { dispatch_id: input.dispatch_id, evidence_refs: [reservation.reservation_sha256] })); steps += 1;
    try { dispatched = deps.dispatch({ repo_root: input.repo_root, dispatch_id: input.dispatch_id, observed_at: at(), protected_paths: run.protected_paths }); }
    catch (error) { current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:dispatch-unknown`, 'require_reconciliation', at(), receipt('require_reconciliation', 'dispatch_outcome_unknown', { dispatch_id: input.dispatch_id }), 'operator', 'controller_reconciliation_required'); throw error; }
    const outcome = dispatched.current.state === 'completed' ? 'progress' : dispatched.current.state === 'failed' ? 'provider_failure' : 'no_progress';
    const usage = deps.appendUsage({ repo_root: input.repo_root, reservation, outcome, evidence_refs: evidence(run.run_id, current.current_event_sha256) });
    if (dispatched.current.state === 'completed') {
      current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:dispatch-started`, 'dispatch_started', at(), receipt('dispatch_started', 'completed', { dispatch_id: input.dispatch_id, evidence_refs: [dispatched.current.observation_sha256, usage.event.event_sha256] })); steps += 1;
      if (room()) { current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:outcome`, 'outcome_observed', at(), receipt('outcome_observed', 'progress', { dispatch_id: input.dispatch_id, evidence_refs: [dispatched.current.observation_sha256] })); steps += 1; }
    } else {
      current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:dispatch-observed`, 'require_reconciliation', at(), receipt('require_reconciliation', dispatched.current.state, { dispatch_id: input.dispatch_id, evidence_refs: [dispatched.current.observation_sha256, usage.event.event_sha256] }), 'operator', 'controller_reconciliation_required'); steps += 1;
    }
  }
  return Object.freeze({ run_id: run.run_id, current, acquisition, dispatch: dispatched, steps_executed: steps });
}

export function controllerRunId(input: { readonly repository_id: string; readonly engineer_id: string; readonly budget_sha256: string; readonly idempotency_key: string }): string { return canonicalMessageDigest(input); }
