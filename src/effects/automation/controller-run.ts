import { canonicalMessageDigest } from '../../core/messages/mechanics';
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
} from './controller-store';
import { resolveEngineerPrincipal } from '../engineers/principal';
import { acquireNextScheduledEngineerTask, type AcquireNextScheduledEngineerTaskResult } from '../engineers/scheduling-acquire-next';
import { dispatchDelegatedRun, type DelegatedRunStatus } from '../engineers/delegated-run-store';
import { repoHarnessAuthorizationRevision } from '../repo-registry';

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
};

function exactPrincipal(expected: ReturnType<typeof readAutomationControllerStatus>['run']['principal'], observed: EngineerPrincipalV1, authorizationRevision: number): void {
  if (observed.repository_id === '' || observed.engineer_id !== expected.engineer_id
    || observed.binding_id !== expected.binding_id || observed.binding_generation !== expected.binding_generation
    || observed.engineer_contract_revision !== expected.engineer_contract_revision
    || observed.auth_subject !== expected.authorization_id || authorizationRevision !== expected.authorization_revision) {
    throw new Error('controller principal, Binding or authorization revision is stale');
  }
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

export function stepAutomationController(input: StepAutomationControllerInput, overrides: Partial<AutomationControllerRunDependencies> = {}): AutomationControllerStepResult {
  const deps = { ...defaultDependencies, ...overrides }; const status = readAutomationControllerStatus(input.repo_root, input.run_id); const run = status.run;
  const startedAt = deps.now().getTime(); let current = status.current; let steps = 0; let acquisition: AcquireNextScheduledEngineerTaskResult | null = null; let dispatched: DelegatedRunStatus | null = null;
  const observedPrincipal = deps.resolvePrincipal({ repo_root: input.repo_root, authorization_id: run.principal.authorization_id });
  exactPrincipal(run.principal, observedPrincipal, deps.authorizationRevision());
  const budget = deps.readBudget(input.repo_root, run.run_id);
  if (budget.budget.budget_sha256 !== run.budget_sha256 || !budget.budget.unattended || budget.budget.engineer_id !== run.principal.engineer_id) throw new Error('controller budget does not authorize this exact unattended Engineer run');
  const room = () => steps < run.policy.maximum_steps_per_invocation && deps.now().getTime() - startedAt < run.policy.maximum_duration_ms;
  const at = () => deps.now().toISOString();

  if (current.state === 'created' && room()) { current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:observe`, 'observe', at(), receipt('observe', 'ready')); steps += 1; }
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
      current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:acquired`, 'acquired', at(), receipt('acquired', 'acquired', { work_package_id: acquisition.offer.work_package_id, task_id: acquisition.envelope.task_id, claim_id: acquisition.envelope.claim_id, lease_generation: acquisition.envelope.generation, work_envelope_sha256: envelopeSha, evidence_refs: [acquisition.receipt.receipt_sha256, usage.event.event_sha256] })); steps += 1;
    } else if (acquisition.error === 'engineer_no_eligible_offer') {
      current = append(input.repo_root, run.run_id, current, `${input.idempotency_key}:no-offer`, 'retry_wait', at(), receipt('retry_wait', 'no_eligible_offer', { evidence_refs: [usage.event.event_sha256] }), 'none', null, new Date(deps.now().getTime() + run.policy.initial_backoff_ms).toISOString()); steps += 1;
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
