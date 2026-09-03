/**
 * Read-only operator projection of one automation run's budget.
 *
 * The slice carries limits, consumption and the stop receipt's own facts and
 * nothing else: no provider identity, no usage attribution, no evidence refs.
 * It is a projection of the ledger, never a second place where a budget fact is
 * decided.
 */
import {
  AUTOMATION_BUDGET_PROTOCOL,
  AUTOMATION_ENFORCEMENT_ORDER,
  AUTOMATION_METRIC_LIMIT_FIELDS,
  automationDigest,
  type AutomationBudgetCurrentV1,
  type AutomationBudgetState,
  type AutomationBudgetV1,
  type AutomationCurrentDrift,
  type AutomationCountedMetric,
  type AutomationMetricName,
  type AutomationRefusalCode,
  type AutomationStopReceiptV1,
} from './budget';

export const AUTOMATION_BUDGET_SLICE_KIND = 'repo-harness-automation-budget-slice' as const;

export type AutomationBudgetAttentionOwner = 'user' | 'agent' | 'none';

export interface AutomationBudgetMetricSliceV1 {
  readonly metric: AutomationMetricName;
  readonly enforced: boolean;
  readonly limit: number | null;
  readonly consumed: number | null;
  readonly reserved: number | null;
  readonly remaining: number | null;
}

export interface AutomationStopReceiptSliceV1 {
  readonly stop_receipt_sha256: string;
  readonly refusal_code: AutomationRefusalCode;
  readonly triggering_metric: AutomationMetricName;
  readonly limit: number | null;
  readonly consumed: number | null;
  readonly reserved: number | null;
  readonly last_completed_step_index: number;
  readonly in_flight_authority_count: number;
  readonly issued_at: string;
}

export interface AutomationBudgetBoardSliceV1 {
  readonly protocol: typeof AUTOMATION_BUDGET_PROTOCOL;
  readonly kind: typeof AUTOMATION_BUDGET_SLICE_KIND;
  readonly automation_run_id: string;
  readonly goal_id: string;
  readonly repository_id: string;
  readonly engineer_id: string | null;
  readonly claim_id: string | null;
  readonly budget_sha256: string;
  readonly budget_revision: number;
  readonly unattended: boolean;
  readonly state: AutomationBudgetState;
  readonly deadline_at: string;
  readonly metrics: readonly AutomationBudgetMetricSliceV1[];
  readonly consecutive_no_progress_steps: number;
  readonly last_completed_step_index: number;
  readonly open_reservation_count: number;
  readonly event_count: number;
  readonly ledger_sha256: string;
  readonly stop_receipt: AutomationStopReceiptSliceV1 | null;
  /**
   * True when the stored projection has not adopted a durable record yet. The
   * slice still renders the durable truth; the flag says the counters below it
   * are the last ones the projection managed to write.
   */
  readonly projection_stale: boolean;
  readonly attention_owner: AutomationBudgetAttentionOwner;
  readonly slice_sha256: string;
}

export interface ProjectAutomationBudgetSliceInput {
  readonly budget: AutomationBudgetV1;
  readonly current: AutomationBudgetCurrentV1;
  readonly stop_receipt: AutomationStopReceiptV1 | null;
  readonly drift: AutomationCurrentDrift;
  readonly observed_at: string;
}

function metricSlice(
  metric: AutomationMetricName,
  input: ProjectAutomationBudgetSliceInput,
): AutomationBudgetMetricSliceV1 {
  const limit = input.budget.effective_limits[AUTOMATION_METRIC_LIMIT_FIELDS[metric]];
  if (metric === 'wall_clock_seconds') {
    const elapsed = Math.max(0, Math.floor((Date.parse(input.observed_at) - Date.parse(input.budget.created_at)) / 1000));
    return Object.freeze({
      metric,
      enforced: true,
      limit,
      consumed: elapsed,
      reserved: 0,
      remaining: Math.max(0, (limit ?? 0) - elapsed),
    });
  }
  if (metric === 'consecutive_no_progress_steps') {
    const consumed = input.current.consecutive_no_progress_steps;
    return Object.freeze({
      metric,
      enforced: true,
      limit,
      consumed,
      reserved: 0,
      remaining: Math.max(0, (limit ?? 0) - consumed),
    });
  }
  const counted = metric as AutomationCountedMetric;
  const consumed = input.current.consumed[counted];
  const reserved = input.current.open_reserved[counted];
  return Object.freeze({
    metric,
    enforced: limit !== null,
    limit,
    consumed,
    reserved,
    remaining: limit === null ? null : Math.max(0, limit - (consumed ?? 0) - (reserved ?? 0)),
  });
}

/**
 * Exhaustion and a stalled reconciliation are both states only a human can
 * clear -- a budget never renews or reconciles itself -- so both raise user
 * attention rather than leaving the run looking merely idle.
 */
function attentionOwner(state: AutomationBudgetState): AutomationBudgetAttentionOwner {
  if (state === 'budget_exhausted' || state === 'reconciliation_required') return 'user';
  return 'agent';
}

/**
 * A read-only projection may not repair anything, so it reports the durable
 * records rather than the stored counters when the two disagree: a stop receipt
 * on disk means the run is stopped whatever the projection still says, and any
 * other unadopted record means the run needs explicit reconciliation.
 */
function durableState(input: ProjectAutomationBudgetSliceInput): AutomationBudgetState {
  if (input.stop_receipt !== null) return 'budget_exhausted';
  if (input.drift !== 'none') return 'reconciliation_required';
  return input.current.state;
}

export function projectAutomationBudgetSlice(
  input: ProjectAutomationBudgetSliceInput,
): AutomationBudgetBoardSliceV1 {
  if (input.current.automation_run_id !== input.budget.automation_run_id) {
    throw new Error('automation budget current belongs to a different run');
  }
  if (input.current.budget_sha256 !== input.budget.budget_sha256) {
    throw new Error('automation budget current belongs to a different budget revision');
  }
  if (input.stop_receipt !== null
    && input.current.stop_receipt_sha256 !== null
    && input.stop_receipt.stop_receipt_sha256 !== input.current.stop_receipt_sha256) {
    throw new Error('automation stop receipt does not match the current projection');
  }
  const draft = {
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_BUDGET_SLICE_KIND,
    automation_run_id: input.budget.automation_run_id,
    goal_id: input.budget.goal_id,
    repository_id: input.budget.repository_id,
    engineer_id: input.budget.engineer_id,
    claim_id: input.budget.claim_id,
    budget_sha256: input.budget.budget_sha256,
    budget_revision: input.budget.revision,
    unattended: input.budget.unattended,
    state: durableState(input),
    deadline_at: input.budget.deadline_at,
    metrics: AUTOMATION_ENFORCEMENT_ORDER.map((metric) => metricSlice(metric, input)),
    consecutive_no_progress_steps: input.current.consecutive_no_progress_steps,
    last_completed_step_index: input.current.last_completed_step_index,
    open_reservation_count: input.current.open_reservation_sha256s.length,
    event_count: input.current.event_count,
    ledger_sha256: input.current.ledger_sha256,
    stop_receipt: input.stop_receipt === null ? null : Object.freeze({
      stop_receipt_sha256: input.stop_receipt.stop_receipt_sha256,
      refusal_code: input.stop_receipt.refusal_code,
      triggering_metric: input.stop_receipt.triggering_metric,
      limit: input.stop_receipt.limit,
      consumed: input.stop_receipt.consumed,
      reserved: input.stop_receipt.reserved,
      last_completed_step_index: input.stop_receipt.last_completed_step_index,
      in_flight_authority_count: input.stop_receipt.in_flight_authority.length,
      issued_at: input.stop_receipt.issued_at,
    }),
    projection_stale: input.drift !== 'none',
    attention_owner: attentionOwner(durableState(input)),
  };
  return Object.freeze({ ...draft, slice_sha256: automationDigest(draft) });
}
