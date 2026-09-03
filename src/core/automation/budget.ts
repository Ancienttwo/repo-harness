/**
 * Per-goal automation budget authority.
 *
 * The authorization and limit schema is the host-owned `ProgramAuthorizationV1`
 * / `ProgramBudgetLimitV1` pair specified by the guarded-merge unattended
 * automation PRD. `AutomationBudgetV1` is a thin projection of one exact grant
 * onto one automation run: it never re-states the grant's fields, it embeds the
 * grant verbatim and adds only the run-scoped bindings the grant does not carry
 * (run/goal identity, the exact task-contract revision, the provider metric
 * support revision, the frozen deadline, and the composed effective limits).
 *
 * Everything in this module is pure. Reserve-before-act, persistence, locking,
 * and reconciliation live in `src/effects/automation/budget-store.ts`.
 */
import { createHash } from 'crypto';

export const AUTOMATION_BUDGET_PROTOCOL = 1 as const;

export const PROGRAM_AUTHORIZATION_KIND = 'repo-harness-program-authorization' as const;
export const AUTOMATION_METRIC_SUPPORT_KIND = 'repo-harness-automation-metric-support' as const;
export const AUTOMATION_BUDGET_KIND = 'repo-harness-automation-budget' as const;
export const AUTOMATION_RESERVATION_KIND = 'repo-harness-automation-reservation' as const;
/** The PRD's wire kind for a budget consumption event; this ledger does not mint a second one. */
export const AUTOMATION_USAGE_EVENT_KIND = 'repo-harness-program-budget-event' as const;
export const AUTOMATION_BUDGET_CURRENT_KIND = 'repo-harness-automation-budget-current' as const;
export const AUTOMATION_STOP_RECEIPT_KIND = 'repo-harness-automation-stop-receipt' as const;
export const AUTOMATION_REFUSAL_KIND = 'repo-harness-automation-budget-refusal' as const;

const SHA256 = /^[0-9a-f]{64}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:\/-]{0,255}$/u;

/**
 * Additive metrics: a ledger event contributes its own consumption and the run
 * total is the sum. Wall clock and the no-progress streak are deliberately not
 * here -- one is enforced from a frozen absolute deadline and the other is a
 * property of the ordered outcome sequence, so neither can be summed.
 */
export const AUTOMATION_COUNTED_METRICS = [
  'agent_turns',
  'successful_acquisitions',
  'runner_invocations',
  'provider_failures',
  'repair_cycles',
  'input_tokens',
  'output_tokens',
  'cost_micros',
] as const;

export type AutomationCountedMetric = typeof AUTOMATION_COUNTED_METRICS[number];

/** The metrics a provider must attest before a hard limit on them is enforceable. */
export const AUTOMATION_VERIFIED_USAGE_METRICS = ['input_tokens', 'output_tokens', 'cost_micros'] as const;

export type AutomationVerifiedUsageMetric = typeof AUTOMATION_VERIFIED_USAGE_METRICS[number];

export type AutomationMetricName =
  | AutomationCountedMetric
  | 'wall_clock_seconds'
  | 'consecutive_no_progress_steps';

export const AUTOMATION_METRIC_LIMIT_FIELDS: Readonly<Record<AutomationMetricName, keyof ProgramBudgetLimitV1>> =
  Object.freeze({
    agent_turns: 'max_agent_turns',
    successful_acquisitions: 'max_successful_acquisitions',
    runner_invocations: 'max_runner_invocations',
    provider_failures: 'max_provider_failures',
    repair_cycles: 'max_repair_cycles',
    input_tokens: 'max_input_tokens',
    output_tokens: 'max_output_tokens',
    cost_micros: 'max_cost_micros',
    wall_clock_seconds: 'max_wall_clock_seconds',
    consecutive_no_progress_steps: 'max_consecutive_no_progress_steps',
  } as const);

/** Evaluation order is fixed so a refusal names the same metric on every host. */
export const AUTOMATION_ENFORCEMENT_ORDER: readonly AutomationMetricName[] = Object.freeze([
  'wall_clock_seconds',
  'agent_turns',
  'successful_acquisitions',
  'runner_invocations',
  'provider_failures',
  'consecutive_no_progress_steps',
  'repair_cycles',
  'input_tokens',
  'output_tokens',
  'cost_micros',
] as const);

export type ProgramUnitKind = 'execute' | 'review' | 'verify' | 'integrate' | 'merge';

export type AutomationOperationKind = 'acquisition' | 'dispatch' | 'retry' | 'provider_invocation';

export type AutomationOutcome = 'progress' | 'no_progress' | 'provider_failure' | 'completed';

export type AutomationBudgetState = 'active' | 'reconciliation_required' | 'budget_exhausted';

export type AutomationUsageResolution = 'observed' | 'reconciled_observed' | 'reconciled_reserved' | 'reconciled_not_started';

export type AutomationBudgetErrorCode =
  | 'automation_budget_invalid'
  | 'automation_budget_metric_unenforceable'
  | 'automation_budget_contract_limit_invalid'
  | 'automation_budget_unattended_missing';

export class AutomationBudgetError extends Error {
  constructor(readonly code: AutomationBudgetErrorCode, message: string) {
    super(message);
    this.name = 'AutomationBudgetError';
  }
}

function invalid(message: string): never {
  throw new AutomationBudgetError('automation_budget_invalid', message);
}

/** Deterministic key-sorted JSON; the only preimage any digest in this module uses. */
export function canonicalAutomationJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('canonical JSON cannot encode a non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalAutomationJson(entry)).join(',')}]`;
  if (typeof value !== 'object') invalid(`canonical JSON cannot encode ${typeof value}`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const entry = record[key];
    if (entry === undefined) invalid(`canonical JSON cannot encode an undefined value at ${key}`);
    parts.push(`${JSON.stringify(key)}:${canonicalAutomationJson(entry)}`);
  }
  return `{${parts.join(',')}}`;
}

export function automationDigest(value: unknown): string {
  return createHash('sha256').update(canonicalAutomationJson(value), 'utf8').digest('hex');
}

function digestWithout<T extends object>(value: T, ...fields: readonly (keyof T & string)[]): string {
  const clone: Record<string, unknown> = { ...(value as unknown as Record<string, unknown>) };
  for (const field of fields) delete clone[field];
  return automationDigest(clone);
}

/** Drop a caller-supplied digest field so a re-seal never folds a stale digest into the new one. */
function withoutFields<T extends object>(value: T, ...fields: readonly string[]): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...(value as unknown as Record<string, unknown>) };
  for (const field of fields) delete clone[field];
  return clone;
}

function assertDigest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA256.test(value)) invalid(`${label} must be a 64-character lowercase sha256 hex digest`);
  return value;
}

function assertNullableDigest(value: unknown, label: string): string | null {
  if (value === null) return null;
  return assertDigest(value, label);
}

function assertTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || !TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    invalid(`${label} must be an ISO-8601 UTC timestamp`);
  }
  return value as string;
}

function assertIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) invalid(`${label} is not a valid identifier`);
  return value;
}

function assertNullableIdentifier(value: unknown, label: string): string | null {
  if (value === null) return null;
  return assertIdentifier(value, label);
}

function assertCount(value: unknown, label: string, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    invalid(`${label} must be an integer of at least ${minimum}`);
  }
  return value as number;
}

function assertNullableCount(value: unknown, label: string, minimum: number): number | null {
  if (value === null) return null;
  return assertCount(value, label, minimum);
}

// ---------------------------------------------------------------------------
// PRD schema: ProgramBudgetLimitV1 / ProgramAuthorizationV1
// ---------------------------------------------------------------------------

/**
 * The PRD's limit shape, extended with the three v1 metrics an automation
 * controller needs and the merge program's turn/failure/cycle triple does not
 * express: successful acquisitions, runner invocations, and the consecutive
 * no-progress streak. The nullable trio stays nullable because a null there
 * means "this metric is not limited", never "unlimited by default" -- an
 * unattended run still has to satisfy every non-nullable limit.
 */
export interface ProgramBudgetLimitV1 {
  readonly max_agent_turns: number;
  readonly max_successful_acquisitions: number;
  readonly max_runner_invocations: number;
  readonly max_provider_failures: number;
  readonly max_consecutive_no_progress_steps: number;
  readonly max_repair_cycles: number;
  readonly max_wall_clock_seconds: number;
  readonly max_input_tokens: number | null;
  readonly max_output_tokens: number | null;
  readonly max_cost_micros: number | null;
}

export function validateProgramBudgetLimit(value: ProgramBudgetLimitV1): ProgramBudgetLimitV1 {
  if (value === null || typeof value !== 'object') invalid('program budget limit must be an object');
  return Object.freeze({
    max_agent_turns: assertCount(value.max_agent_turns, 'max_agent_turns', 1),
    max_successful_acquisitions: assertCount(value.max_successful_acquisitions, 'max_successful_acquisitions', 1),
    max_runner_invocations: assertCount(value.max_runner_invocations, 'max_runner_invocations', 1),
    max_provider_failures: assertCount(value.max_provider_failures, 'max_provider_failures', 1),
    max_consecutive_no_progress_steps: assertCount(value.max_consecutive_no_progress_steps, 'max_consecutive_no_progress_steps', 1),
    max_repair_cycles: assertCount(value.max_repair_cycles, 'max_repair_cycles', 1),
    max_wall_clock_seconds: assertCount(value.max_wall_clock_seconds, 'max_wall_clock_seconds', 1),
    max_input_tokens: assertNullableCount(value.max_input_tokens, 'max_input_tokens', 1),
    max_output_tokens: assertNullableCount(value.max_output_tokens, 'max_output_tokens', 1),
    max_cost_micros: assertNullableCount(value.max_cost_micros, 'max_cost_micros', 1),
  });
}

export interface ProgramAuthorizationV1 {
  readonly protocol: typeof AUTOMATION_BUDGET_PROTOCOL;
  readonly kind: typeof PROGRAM_AUTHORIZATION_KIND;
  readonly authorization_id: string;
  readonly repository_id: string;
  readonly target_ref: string;
  readonly target_revision: string;
  readonly work_graph_revision: string;
  readonly allowed_work_package_ids: readonly string[];
  readonly allowed_risk_tiers: readonly ['low'];
  readonly merge_mode: 'disabled' | 'manual' | 'auto_merge';
  readonly allowed_merge_method: 'squash' | 'merge' | 'rebase';
  readonly max_repair_cycles: number;
  readonly budget: ProgramBudgetLimitV1;
  readonly issued_by: string;
  readonly issued_at: string;
  readonly expires_at: string;
  readonly authorization_sha256: string;
}

export function validateProgramAuthorization(value: ProgramAuthorizationV1): ProgramAuthorizationV1 {
  if (value === null || typeof value !== 'object') invalid('program authorization must be an object');
  if (value.protocol !== AUTOMATION_BUDGET_PROTOCOL) invalid('program authorization protocol is unsupported');
  if (value.kind !== PROGRAM_AUTHORIZATION_KIND) invalid('program authorization kind is unsupported');
  if (value.merge_mode !== 'disabled' && value.merge_mode !== 'manual' && value.merge_mode !== 'auto_merge') {
    invalid('program authorization merge_mode is unsupported');
  }
  if (value.allowed_merge_method !== 'squash' && value.allowed_merge_method !== 'merge' && value.allowed_merge_method !== 'rebase') {
    invalid('program authorization allowed_merge_method is unsupported');
  }
  if (!Array.isArray(value.allowed_risk_tiers) || value.allowed_risk_tiers.length !== 1 || value.allowed_risk_tiers[0] !== 'low') {
    invalid('program authorization allowed_risk_tiers must be exactly ["low"]');
  }
  if (!Array.isArray(value.allowed_work_package_ids)) invalid('program authorization allowed_work_package_ids must be an array');
  const work = value.allowed_work_package_ids.map((entry, index) => assertIdentifier(entry, `allowed_work_package_ids[${index}]`));
  for (let index = 1; index < work.length; index += 1) {
    if (work[index - 1]! >= work[index]!) invalid('program authorization allowed_work_package_ids must be sorted and unique');
  }
  const issuedAt = assertTimestamp(value.issued_at, 'issued_at');
  const expiresAt = assertTimestamp(value.expires_at, 'expires_at');
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) invalid('program authorization expires_at must be after issued_at');
  const authorization: ProgramAuthorizationV1 = Object.freeze({
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: PROGRAM_AUTHORIZATION_KIND,
    authorization_id: assertIdentifier(value.authorization_id, 'authorization_id'),
    repository_id: assertIdentifier(value.repository_id, 'repository_id'),
    target_ref: assertIdentifier(value.target_ref, 'target_ref'),
    target_revision: assertDigest(value.target_revision, 'target_revision'),
    work_graph_revision: assertDigest(value.work_graph_revision, 'work_graph_revision'),
    allowed_work_package_ids: Object.freeze(work),
    allowed_risk_tiers: Object.freeze(['low']) as readonly ['low'],
    merge_mode: value.merge_mode,
    allowed_merge_method: value.allowed_merge_method,
    max_repair_cycles: assertCount(value.max_repair_cycles, 'max_repair_cycles', 1),
    budget: validateProgramBudgetLimit(value.budget),
    issued_by: assertIdentifier(value.issued_by, 'issued_by'),
    issued_at: issuedAt,
    expires_at: expiresAt,
    authorization_sha256: assertDigest(value.authorization_sha256, 'authorization_sha256'),
  });
  if (digestWithout(authorization, 'authorization_sha256') !== authorization.authorization_sha256) {
    invalid('program authorization digest does not bind its own content');
  }
  if (authorization.max_repair_cycles !== authorization.budget.max_repair_cycles) {
    invalid('program authorization max_repair_cycles must equal its budget max_repair_cycles');
  }
  return authorization;
}

export function sealProgramAuthorization(
  input: Omit<ProgramAuthorizationV1, 'protocol' | 'kind' | 'authorization_sha256'>,
): ProgramAuthorizationV1 {
  const draft = {
    ...withoutFields(input, 'protocol', 'kind', 'authorization_sha256'),
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: PROGRAM_AUTHORIZATION_KIND,
    allowed_work_package_ids: [...input.allowed_work_package_ids].sort(),
    budget: validateProgramBudgetLimit(input.budget),
  };
  return validateProgramAuthorization({ ...draft, authorization_sha256: automationDigest(draft) } as unknown as ProgramAuthorizationV1);
}

// ---------------------------------------------------------------------------
// Provider metric support
// ---------------------------------------------------------------------------

/**
 * The provider capability revision that decides whether a token or cost limit
 * can be enforced at all. It is evidence, never permission: a metric absent
 * from `verified_metrics` makes a hard limit on that metric a preflight
 * rejection rather than an advisory number.
 */
export interface AutomationMetricSupportV1 {
  readonly protocol: typeof AUTOMATION_BUDGET_PROTOCOL;
  readonly kind: typeof AUTOMATION_METRIC_SUPPORT_KIND;
  readonly provider: string;
  readonly capability_sha256: string;
  readonly verified_metrics: readonly AutomationVerifiedUsageMetric[];
  readonly observed_at: string;
  readonly support_sha256: string;
}

export function validateAutomationMetricSupport(value: AutomationMetricSupportV1): AutomationMetricSupportV1 {
  if (value === null || typeof value !== 'object') invalid('metric support must be an object');
  if (value.protocol !== AUTOMATION_BUDGET_PROTOCOL) invalid('metric support protocol is unsupported');
  if (value.kind !== AUTOMATION_METRIC_SUPPORT_KIND) invalid('metric support kind is unsupported');
  if (!Array.isArray(value.verified_metrics)) invalid('metric support verified_metrics must be an array');
  const metrics = value.verified_metrics.map((entry, index) => {
    if (!AUTOMATION_VERIFIED_USAGE_METRICS.includes(entry)) invalid(`verified_metrics[${index}] is not a verifiable usage metric`);
    return entry;
  });
  for (let index = 1; index < metrics.length; index += 1) {
    if (metrics[index - 1]! >= metrics[index]!) invalid('metric support verified_metrics must be sorted and unique');
  }
  const support: AutomationMetricSupportV1 = Object.freeze({
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_METRIC_SUPPORT_KIND,
    provider: assertIdentifier(value.provider, 'metric support provider'),
    capability_sha256: assertDigest(value.capability_sha256, 'metric support capability_sha256'),
    verified_metrics: Object.freeze(metrics),
    observed_at: assertTimestamp(value.observed_at, 'metric support observed_at'),
    support_sha256: assertDigest(value.support_sha256, 'metric support support_sha256'),
  });
  if (digestWithout(support, 'support_sha256') !== support.support_sha256) invalid('metric support digest does not bind its own content');
  return support;
}

export function sealAutomationMetricSupport(
  input: Omit<AutomationMetricSupportV1, 'protocol' | 'kind' | 'support_sha256'>,
): AutomationMetricSupportV1 {
  const draft = {
    ...withoutFields(input, 'protocol', 'kind', 'support_sha256'),
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_METRIC_SUPPORT_KIND,
    verified_metrics: [...input.verified_metrics].sort(),
  };
  return validateAutomationMetricSupport({ ...draft, support_sha256: automationDigest(draft) } as unknown as AutomationMetricSupportV1);
}

// ---------------------------------------------------------------------------
// Contract-level runner budget composition
// ---------------------------------------------------------------------------

/**
 * The task contract's own `delegation.budget` block, carried verbatim. This is
 * a read of an existing authority, not a second meaning for it: the runner's
 * fields keep the runner's semantics and only bound the automation limits.
 */
export interface AutomationContractLimitsV1 {
  readonly contract_path: string;
  readonly tokens: number | null;
  readonly runner_invocations: number | null;
  readonly wall_time_minutes: number | null;
}

export type AutomationLimitSource = 'authorization' | 'task_contract' | 'authorization_expiry';

export interface AutomationLimitDerivationV1 {
  readonly metric: AutomationMetricName;
  readonly limit_field: string;
  readonly authorization_value: number | null;
  readonly contract_value: number | null;
  readonly selected_source: AutomationLimitSource;
  readonly selected_value: number | null;
}

export interface AutomationLimitCompositionV1 {
  readonly limits: ProgramBudgetLimitV1;
  readonly derivations: readonly AutomationLimitDerivationV1[];
}

function strictest(authorizationValue: number | null, contractValue: number | null): AutomationLimitSource {
  if (contractValue === null) return 'authorization';
  if (authorizationValue === null) return 'task_contract';
  return contractValue < authorizationValue ? 'task_contract' : 'authorization';
}

/**
 * Strictest applicable limit wins, and every metric records where its value
 * came from so the derivation is part of the budget digest rather than a
 * comment. A contract that declares `tokens` is rejected instead of reused:
 * `scripts/contract-run.ts` already refuses a non-null token budget as
 * unenforceable, so accepting one here would invent a second meaning for a
 * field the runner treats as invalid.
 */
export function composeAutomationLimits(
  authorization: ProgramBudgetLimitV1,
  contract: AutomationContractLimitsV1 | null,
): AutomationLimitCompositionV1 {
  const base = validateProgramBudgetLimit(authorization);
  if (contract !== null) {
    if (contract.tokens !== null) {
      throw new AutomationBudgetError(
        'automation_budget_contract_limit_invalid',
        `task contract ${contract.contract_path} declares delegation.budget.tokens, which the contract runner rejects as unenforceable; it cannot be composed into an automation token limit`,
      );
    }
    assertNullableCount(contract.runner_invocations, 'contract runner_invocations', 1);
    if (contract.wall_time_minutes !== null) {
      if (typeof contract.wall_time_minutes !== 'number' || !Number.isFinite(contract.wall_time_minutes) || contract.wall_time_minutes <= 0) {
        invalid('contract wall_time_minutes must be a positive number');
      }
    }
  }
  const contractInvocations = contract?.runner_invocations ?? null;
  const contractWallSeconds = contract?.wall_time_minutes === null || contract?.wall_time_minutes === undefined
    ? null
    : Math.max(1, Math.floor(contract.wall_time_minutes * 60));

  const invocationSource = strictest(base.max_runner_invocations, contractInvocations);
  const wallSource = strictest(base.max_wall_clock_seconds, contractWallSeconds);
  const limits: ProgramBudgetLimitV1 = Object.freeze({
    ...base,
    max_runner_invocations: invocationSource === 'task_contract' ? contractInvocations! : base.max_runner_invocations,
    max_wall_clock_seconds: wallSource === 'task_contract' ? contractWallSeconds! : base.max_wall_clock_seconds,
  });
  const derivations: AutomationLimitDerivationV1[] = [];
  for (const metric of AUTOMATION_ENFORCEMENT_ORDER) {
    const field = AUTOMATION_METRIC_LIMIT_FIELDS[metric];
    const contractValue = metric === 'runner_invocations'
      ? contractInvocations
      : metric === 'wall_clock_seconds'
        ? contractWallSeconds
        : null;
    const source = metric === 'runner_invocations'
      ? invocationSource
      : metric === 'wall_clock_seconds'
        ? wallSource
        : 'authorization';
    derivations.push(Object.freeze({
      metric,
      limit_field: field,
      authorization_value: base[field],
      contract_value: contractValue,
      selected_source: source,
      selected_value: limits[field],
    }));
  }
  return Object.freeze({ limits, derivations: Object.freeze(derivations) });
}

// ---------------------------------------------------------------------------
// AutomationBudgetV1
// ---------------------------------------------------------------------------

export interface AutomationBudgetV1 {
  readonly protocol: typeof AUTOMATION_BUDGET_PROTOCOL;
  readonly kind: typeof AUTOMATION_BUDGET_KIND;
  readonly automation_run_id: string;
  readonly goal_id: string;
  readonly goal_revision: string;
  readonly repository_id: string;
  /** Bound by issue #283; a budget never mints an Engineer identity of its own. */
  readonly engineer_id: string | null;
  /** Bound by issues #286/#287; a budget never creates, releases, or steals a claim. */
  readonly claim_id: string | null;
  readonly authorization: ProgramAuthorizationV1;
  readonly contract_sha256: string | null;
  readonly contract_limits: AutomationContractLimitsV1 | null;
  readonly metric_support: AutomationMetricSupportV1;
  readonly effective_limits: ProgramBudgetLimitV1;
  readonly limit_derivations: readonly AutomationLimitDerivationV1[];
  readonly unattended: boolean;
  /** Frozen absolute wall clock; never recomputed from process-local elapsed time. */
  readonly deadline_at: string;
  readonly created_by: string;
  readonly created_at: string;
  readonly supersedes_sha256: string | null;
  readonly revision: number;
  readonly budget_sha256: string;
}

export interface BuildAutomationBudgetInput {
  readonly automation_run_id: string;
  readonly goal_id: string;
  readonly goal_revision: string;
  readonly repository_id: string;
  readonly engineer_id: string | null;
  readonly claim_id: string | null;
  readonly authorization: ProgramAuthorizationV1;
  readonly contract_sha256: string | null;
  readonly contract_limits: AutomationContractLimitsV1 | null;
  readonly metric_support: AutomationMetricSupportV1;
  readonly unattended: boolean;
  readonly created_by: string;
  readonly created_at: string;
  readonly supersedes_sha256: string | null;
  readonly revision: number;
}

function assertMetricsEnforceable(limits: ProgramBudgetLimitV1, support: AutomationMetricSupportV1): void {
  for (const metric of AUTOMATION_VERIFIED_USAGE_METRICS) {
    const configured = limits[AUTOMATION_METRIC_LIMIT_FIELDS[metric]];
    if (configured === null) continue;
    if (!support.verified_metrics.includes(metric)) {
      throw new AutomationBudgetError(
        'automation_budget_metric_unenforceable',
        `hard limit on ${metric} is configured but provider ${support.provider} (capability ${support.capability_sha256}) does not expose verified attributable usage for it`,
      );
    }
  }
}

function isoAfter(from: string, seconds: number): string {
  return new Date(Date.parse(from) + (seconds * 1000)).toISOString().replace(/\.\d{3}Z$/u, '.000Z');
}

export function buildAutomationBudget(input: BuildAutomationBudgetInput): AutomationBudgetV1 {
  const authorization = validateProgramAuthorization(input.authorization);
  const support = validateAutomationMetricSupport(input.metric_support);
  const createdAt = assertTimestamp(input.created_at, 'created_at');
  const composition = composeAutomationLimits(authorization.budget, input.contract_limits);
  assertMetricsEnforceable(composition.limits, support);
  if (Date.parse(authorization.expires_at) <= Date.parse(createdAt)) {
    invalid('automation budget cannot be created after its authorization expires');
  }
  const wallDeadline = isoAfter(createdAt, composition.limits.max_wall_clock_seconds);
  const clampedByGrant = Date.parse(authorization.expires_at) < Date.parse(wallDeadline);
  const deadlineAt = clampedByGrant
    ? new Date(Date.parse(authorization.expires_at)).toISOString().replace(/\.\d{3}Z$/u, '.000Z')
    : wallDeadline;
  const derivations = composition.derivations.map((entry) => (
    entry.metric === 'wall_clock_seconds' && clampedByGrant
      ? Object.freeze({
        ...entry,
        selected_source: 'authorization_expiry' as const,
        selected_value: Math.max(1, Math.floor((Date.parse(authorization.expires_at) - Date.parse(createdAt)) / 1000)),
      })
      : entry
  ));
  const limits = clampedByGrant
    ? Object.freeze({
      ...composition.limits,
      max_wall_clock_seconds: Math.max(1, Math.floor((Date.parse(authorization.expires_at) - Date.parse(createdAt)) / 1000)),
    })
    : composition.limits;
  const draft = {
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_BUDGET_KIND,
    automation_run_id: assertDigest(input.automation_run_id, 'automation_run_id'),
    goal_id: assertDigest(input.goal_id, 'goal_id'),
    goal_revision: assertDigest(input.goal_revision, 'goal_revision'),
    repository_id: assertIdentifier(input.repository_id, 'repository_id'),
    engineer_id: assertNullableIdentifier(input.engineer_id, 'engineer_id'),
    claim_id: assertNullableIdentifier(input.claim_id, 'claim_id'),
    authorization,
    contract_sha256: assertNullableDigest(input.contract_sha256, 'contract_sha256'),
    contract_limits: input.contract_limits === null ? null : Object.freeze({ ...input.contract_limits }),
    metric_support: support,
    effective_limits: limits,
    limit_derivations: Object.freeze(derivations),
    unattended: input.unattended === true,
    deadline_at: deadlineAt,
    created_by: assertIdentifier(input.created_by, 'created_by'),
    created_at: createdAt,
    supersedes_sha256: assertNullableDigest(input.supersedes_sha256, 'supersedes_sha256'),
    revision: assertCount(input.revision, 'revision', 1),
  };
  if (input.contract_limits !== null && draft.contract_sha256 === null) {
    invalid('composing task-contract limits requires the exact contract_sha256 revision');
  }
  if (draft.revision === 1 && draft.supersedes_sha256 !== null) invalid('the first budget revision cannot supersede another');
  if (draft.revision > 1 && draft.supersedes_sha256 === null) invalid('a budget revision above 1 must name the revision it supersedes');
  if (typeof input.unattended !== 'boolean') invalid('unattended must be a boolean');
  return validateAutomationBudget({ ...draft, budget_sha256: automationDigest(draft) } as AutomationBudgetV1);
}

export function validateAutomationBudget(value: AutomationBudgetV1): AutomationBudgetV1 {
  if (value === null || typeof value !== 'object') invalid('automation budget must be an object');
  if (value.protocol !== AUTOMATION_BUDGET_PROTOCOL) invalid('automation budget protocol is unsupported');
  if (value.kind !== AUTOMATION_BUDGET_KIND) invalid('automation budget kind is unsupported');
  const authorization = validateProgramAuthorization(value.authorization);
  const support = validateAutomationMetricSupport(value.metric_support);
  const limits = validateProgramBudgetLimit(value.effective_limits);
  assertMetricsEnforceable(limits, support);
  if (!Array.isArray(value.limit_derivations) || value.limit_derivations.length !== AUTOMATION_ENFORCEMENT_ORDER.length) {
    invalid('automation budget must record one limit derivation per enforced metric');
  }
  const budget: AutomationBudgetV1 = Object.freeze({
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_BUDGET_KIND,
    automation_run_id: assertDigest(value.automation_run_id, 'automation_run_id'),
    goal_id: assertDigest(value.goal_id, 'goal_id'),
    goal_revision: assertDigest(value.goal_revision, 'goal_revision'),
    repository_id: assertIdentifier(value.repository_id, 'repository_id'),
    engineer_id: assertNullableIdentifier(value.engineer_id, 'engineer_id'),
    claim_id: assertNullableIdentifier(value.claim_id, 'claim_id'),
    authorization,
    contract_sha256: assertNullableDigest(value.contract_sha256, 'contract_sha256'),
    contract_limits: value.contract_limits === null ? null : Object.freeze({ ...value.contract_limits }),
    metric_support: support,
    effective_limits: limits,
    limit_derivations: Object.freeze(value.limit_derivations.map((entry) => Object.freeze({ ...entry }))),
    unattended: value.unattended,
    deadline_at: assertTimestamp(value.deadline_at, 'deadline_at'),
    created_by: assertIdentifier(value.created_by, 'created_by'),
    created_at: assertTimestamp(value.created_at, 'created_at'),
    supersedes_sha256: assertNullableDigest(value.supersedes_sha256, 'supersedes_sha256'),
    revision: assertCount(value.revision, 'revision', 1),
    budget_sha256: assertDigest(value.budget_sha256, 'budget_sha256'),
  });
  if (typeof budget.unattended !== 'boolean') invalid('automation budget unattended must be a boolean');
  if (Date.parse(budget.deadline_at) <= Date.parse(budget.created_at)) invalid('automation budget deadline must be after creation');
  if (digestWithout(budget, 'budget_sha256') !== budget.budget_sha256) invalid('automation budget digest does not bind its own content');
  return budget;
}

/**
 * An explicitly unattended run must present a concrete enforceable budget.
 * There is no null, default, or "inherit the session" path: the absence of a
 * budget is the refusal, not an unlimited run.
 */
export function requireUnattendedAutomationBudget(budget: AutomationBudgetV1 | null): AutomationBudgetV1 {
  if (budget === null) {
    throw new AutomationBudgetError(
      'automation_budget_unattended_missing',
      'an unattended automation run requires a concrete enforceable budget; there is no unlimited default',
    );
  }
  const validated = validateAutomationBudget(budget);
  if (!validated.unattended) {
    throw new AutomationBudgetError(
      'automation_budget_unattended_missing',
      `budget ${validated.budget_sha256} is not marked unattended and cannot authorize an unattended run`,
    );
  }
  return validated;
}

// ---------------------------------------------------------------------------
// Metric vectors and reservations
// ---------------------------------------------------------------------------

export interface AutomationMetricVectorV1 {
  readonly agent_turns: number;
  readonly successful_acquisitions: number;
  readonly runner_invocations: number;
  readonly provider_failures: number;
  readonly repair_cycles: number;
  readonly input_tokens: number | null;
  readonly output_tokens: number | null;
  readonly cost_micros: number | null;
}

export function emptyAutomationMetricVector(): AutomationMetricVectorV1 {
  return Object.freeze({
    agent_turns: 0,
    successful_acquisitions: 0,
    runner_invocations: 0,
    provider_failures: 0,
    repair_cycles: 0,
    input_tokens: null,
    output_tokens: null,
    cost_micros: null,
  });
}

function addNullable(left: number | null, right: number | null): number | null {
  if (left === null && right === null) return null;
  return (left ?? 0) + (right ?? 0);
}

export function addAutomationMetricVectors(
  left: AutomationMetricVectorV1,
  right: AutomationMetricVectorV1,
): AutomationMetricVectorV1 {
  return Object.freeze({
    agent_turns: left.agent_turns + right.agent_turns,
    successful_acquisitions: left.successful_acquisitions + right.successful_acquisitions,
    runner_invocations: left.runner_invocations + right.runner_invocations,
    provider_failures: left.provider_failures + right.provider_failures,
    repair_cycles: left.repair_cycles + right.repair_cycles,
    input_tokens: addNullable(left.input_tokens, right.input_tokens),
    output_tokens: addNullable(left.output_tokens, right.output_tokens),
    cost_micros: addNullable(left.cost_micros, right.cost_micros),
  });
}

export function validateAutomationMetricVector(
  value: AutomationMetricVectorV1,
  label: string,
): AutomationMetricVectorV1 {
  if (value === null || typeof value !== 'object') invalid(`${label} must be an object`);
  return Object.freeze({
    agent_turns: assertCount(value.agent_turns, `${label}.agent_turns`, 0),
    successful_acquisitions: assertCount(value.successful_acquisitions, `${label}.successful_acquisitions`, 0),
    runner_invocations: assertCount(value.runner_invocations, `${label}.runner_invocations`, 0),
    provider_failures: assertCount(value.provider_failures, `${label}.provider_failures`, 0),
    repair_cycles: assertCount(value.repair_cycles, `${label}.repair_cycles`, 0),
    input_tokens: assertNullableCount(value.input_tokens, `${label}.input_tokens`, 0),
    output_tokens: assertNullableCount(value.output_tokens, `${label}.output_tokens`, 0),
    cost_micros: assertNullableCount(value.cost_micros, `${label}.cost_micros`, 0),
  });
}

/**
 * Every controller operation costs one step. The rest of the vector is the
 * upper bound the operation may spend, so a refusal happens before the
 * operation runs rather than after its cost is already real.
 */
export function automationOperationReservation(
  operation: AutomationOperationKind,
  tokens: Pick<AutomationMetricVectorV1, 'input_tokens' | 'output_tokens' | 'cost_micros'>,
): AutomationMetricVectorV1 {
  const base = {
    ...emptyAutomationMetricVector(),
    agent_turns: 1,
    input_tokens: tokens.input_tokens,
    output_tokens: tokens.output_tokens,
    cost_micros: tokens.cost_micros,
  };
  switch (operation) {
    case 'acquisition':
      return Object.freeze({ ...base, successful_acquisitions: 1 });
    case 'dispatch':
    case 'provider_invocation':
      return Object.freeze({ ...base, runner_invocations: 1, provider_failures: 1 });
    case 'retry':
      return Object.freeze({ ...base, runner_invocations: 1, provider_failures: 1, repair_cycles: 1 });
    default:
      return invalid(`unsupported automation operation kind: ${String(operation)}`);
  }
}

export interface AutomationBudgetReservationV1 {
  readonly protocol: typeof AUTOMATION_BUDGET_PROTOCOL;
  readonly kind: typeof AUTOMATION_RESERVATION_KIND;
  readonly automation_run_id: string;
  readonly budget_sha256: string;
  readonly idempotency_key: string;
  readonly operation: AutomationOperationKind;
  readonly unit_kind: ProgramUnitKind;
  readonly unit_id: string;
  readonly attempt: number;
  readonly provider: string | null;
  readonly step_index: number;
  readonly reserved: AutomationMetricVectorV1;
  readonly reserved_at: string;
  readonly deadline_at: string;
  readonly previous_ledger_sha256: string;
  readonly reservation_sha256: string;
}

const UNIT_KINDS: readonly ProgramUnitKind[] = Object.freeze(['execute', 'review', 'verify', 'integrate', 'merge']);
const OPERATION_KINDS: readonly AutomationOperationKind[] = Object.freeze(['acquisition', 'dispatch', 'retry', 'provider_invocation']);
const OUTCOMES: readonly AutomationOutcome[] = Object.freeze(['progress', 'no_progress', 'provider_failure', 'completed']);

export function validateAutomationReservation(value: AutomationBudgetReservationV1): AutomationBudgetReservationV1 {
  if (value === null || typeof value !== 'object') invalid('automation reservation must be an object');
  if (value.protocol !== AUTOMATION_BUDGET_PROTOCOL) invalid('automation reservation protocol is unsupported');
  if (value.kind !== AUTOMATION_RESERVATION_KIND) invalid('automation reservation kind is unsupported');
  if (!OPERATION_KINDS.includes(value.operation)) invalid('automation reservation operation is unsupported');
  if (!UNIT_KINDS.includes(value.unit_kind)) invalid('automation reservation unit_kind is unsupported');
  const reservation: AutomationBudgetReservationV1 = Object.freeze({
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_RESERVATION_KIND,
    automation_run_id: assertDigest(value.automation_run_id, 'reservation automation_run_id'),
    budget_sha256: assertDigest(value.budget_sha256, 'reservation budget_sha256'),
    idempotency_key: assertIdentifier(value.idempotency_key, 'reservation idempotency_key'),
    operation: value.operation,
    unit_kind: value.unit_kind,
    unit_id: assertIdentifier(value.unit_id, 'reservation unit_id'),
    attempt: assertCount(value.attempt, 'reservation attempt', 1),
    provider: assertNullableIdentifier(value.provider, 'reservation provider'),
    step_index: assertCount(value.step_index, 'reservation step_index', 1),
    reserved: validateAutomationMetricVector(value.reserved, 'reservation reserved'),
    reserved_at: assertTimestamp(value.reserved_at, 'reservation reserved_at'),
    deadline_at: assertTimestamp(value.deadline_at, 'reservation deadline_at'),
    previous_ledger_sha256: assertDigest(value.previous_ledger_sha256, 'reservation previous_ledger_sha256'),
    reservation_sha256: assertDigest(value.reservation_sha256, 'reservation reservation_sha256'),
  });
  if (digestWithout(reservation, 'reservation_sha256') !== reservation.reservation_sha256) {
    invalid('automation reservation digest does not bind its own content');
  }
  return reservation;
}

export function sealAutomationReservation(
  input: Omit<AutomationBudgetReservationV1, 'protocol' | 'kind' | 'reservation_sha256'>,
): AutomationBudgetReservationV1 {
  const draft = {
    ...withoutFields(input, 'protocol', 'kind', 'reservation_sha256'),
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_RESERVATION_KIND,
    reserved: validateAutomationMetricVector(input.reserved, 'reservation reserved'),
  };
  return validateAutomationReservation({ ...draft, reservation_sha256: automationDigest(draft) } as unknown as AutomationBudgetReservationV1);
}

// ---------------------------------------------------------------------------
// Usage events and ledger folding
// ---------------------------------------------------------------------------

export interface AutomationUsageAttributionV1 {
  readonly provider: string;
  readonly capability_sha256: string;
  readonly evidence_ref: string;
  readonly evidence_sha256: string;
}

export interface AutomationEvidenceRefV1 {
  readonly ref: string;
  readonly sha256: string;
}

export interface AutomationUsageEventV1 {
  readonly protocol: typeof AUTOMATION_BUDGET_PROTOCOL;
  readonly kind: typeof AUTOMATION_USAGE_EVENT_KIND;
  readonly event_id: string;
  readonly automation_run_id: string;
  readonly authorization_id: string;
  readonly budget_sha256: string;
  readonly reservation_sha256: string;
  readonly idempotency_key: string;
  readonly unit_kind: ProgramUnitKind;
  readonly unit_id: string;
  readonly attempt: number;
  readonly provider: string | null;
  readonly step_index: number;
  readonly usage: {
    readonly input_tokens: number | null;
    readonly output_tokens: number | null;
    readonly cost_micros: number | null;
  };
  readonly usage_attribution: AutomationUsageAttributionV1 | null;
  readonly consumed: AutomationMetricVectorV1;
  readonly outcome: AutomationOutcome;
  readonly resolution: AutomationUsageResolution;
  readonly evidence_refs: readonly AutomationEvidenceRefV1[];
  readonly observed_at: string;
  readonly event_sha256: string;
}

const RESOLUTIONS: readonly AutomationUsageResolution[] = Object.freeze([
  'observed',
  'reconciled_observed',
  'reconciled_reserved',
  'reconciled_not_started',
]);

export function validateAutomationUsageEvent(value: AutomationUsageEventV1): AutomationUsageEventV1 {
  if (value === null || typeof value !== 'object') invalid('automation usage event must be an object');
  if (value.protocol !== AUTOMATION_BUDGET_PROTOCOL) invalid('automation usage event protocol is unsupported');
  if (value.kind !== AUTOMATION_USAGE_EVENT_KIND) invalid('automation usage event kind is unsupported');
  if (!OUTCOMES.includes(value.outcome)) invalid('automation usage event outcome is unsupported');
  if (!RESOLUTIONS.includes(value.resolution)) invalid('automation usage event resolution is unsupported');
  if (!UNIT_KINDS.includes(value.unit_kind)) invalid('automation usage event unit_kind is unsupported');
  if (!Array.isArray(value.evidence_refs)) invalid('automation usage event evidence_refs must be an array');
  if (value.usage === null || typeof value.usage !== 'object') invalid('automation usage event usage must be an object');
  const event: AutomationUsageEventV1 = Object.freeze({
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_USAGE_EVENT_KIND,
    event_id: assertDigest(value.event_id, 'usage event_id'),
    automation_run_id: assertDigest(value.automation_run_id, 'usage automation_run_id'),
    authorization_id: assertIdentifier(value.authorization_id, 'usage authorization_id'),
    budget_sha256: assertDigest(value.budget_sha256, 'usage budget_sha256'),
    reservation_sha256: assertDigest(value.reservation_sha256, 'usage reservation_sha256'),
    idempotency_key: assertIdentifier(value.idempotency_key, 'usage idempotency_key'),
    unit_kind: value.unit_kind,
    unit_id: assertIdentifier(value.unit_id, 'usage unit_id'),
    attempt: assertCount(value.attempt, 'usage attempt', 1),
    provider: assertNullableIdentifier(value.provider, 'usage provider'),
    step_index: assertCount(value.step_index, 'usage step_index', 1),
    usage: Object.freeze({
      input_tokens: assertNullableCount(value.usage.input_tokens, 'usage.input_tokens', 0),
      output_tokens: assertNullableCount(value.usage.output_tokens, 'usage.output_tokens', 0),
      cost_micros: assertNullableCount(value.usage.cost_micros, 'usage.cost_micros', 0),
    }),
    usage_attribution: value.usage_attribution === null ? null : Object.freeze({
      provider: assertIdentifier(value.usage_attribution.provider, 'usage_attribution.provider'),
      capability_sha256: assertDigest(value.usage_attribution.capability_sha256, 'usage_attribution.capability_sha256'),
      evidence_ref: assertIdentifier(value.usage_attribution.evidence_ref, 'usage_attribution.evidence_ref'),
      evidence_sha256: assertDigest(value.usage_attribution.evidence_sha256, 'usage_attribution.evidence_sha256'),
    }),
    consumed: validateAutomationMetricVector(value.consumed, 'usage consumed'),
    outcome: value.outcome,
    resolution: value.resolution,
    evidence_refs: Object.freeze(value.evidence_refs.map((entry, index) => Object.freeze({
      ref: assertIdentifier(entry.ref, `evidence_refs[${index}].ref`),
      sha256: assertDigest(entry.sha256, `evidence_refs[${index}].sha256`),
    }))),
    observed_at: assertTimestamp(value.observed_at, 'usage observed_at'),
    event_sha256: assertDigest(value.event_sha256, 'usage event_sha256'),
  });
  if (digestWithout(event, 'event_id', 'event_sha256') !== event.event_id) {
    invalid('automation usage event_id does not bind the event content');
  }
  if (digestWithout(event, 'event_sha256') !== event.event_sha256) invalid('automation usage event digest does not bind its own content');
  return event;
}

export interface SealAutomationUsageEventInput {
  readonly budget: AutomationBudgetV1;
  readonly reservation: AutomationBudgetReservationV1;
  readonly usage: AutomationUsageEventV1['usage'];
  readonly usage_attribution: AutomationUsageAttributionV1 | null;
  readonly consumed: AutomationMetricVectorV1;
  readonly outcome: AutomationOutcome;
  readonly resolution: AutomationUsageResolution;
  readonly evidence_refs: readonly AutomationEvidenceRefV1[];
  readonly observed_at: string;
}

/**
 * A token or cost number may only enter the ledger with a provider attestation
 * bound to the exact capability revision the budget was minted against. Without
 * it the append is refused; the ledger never invents a usage figure to keep a
 * run moving.
 */
export function sealAutomationUsageEvent(input: SealAutomationUsageEventInput): AutomationUsageEventV1 {
  const budget = validateAutomationBudget(input.budget);
  const reservation = validateAutomationReservation(input.reservation);
  if (reservation.budget_sha256 !== budget.budget_sha256) invalid('usage event reservation belongs to a different budget revision');
  const consumed = validateAutomationMetricVector(input.consumed, 'usage consumed');
  for (const metric of AUTOMATION_COUNTED_METRICS) {
    const reserved = reservation.reserved[metric];
    const actual = consumed[metric];
    if (reserved === null) {
      if (actual !== null) invalid(`usage consumed.${metric} was never reserved`);
      continue;
    }
    if (actual === null) invalid(`usage consumed.${metric} must be a number because it was reserved`);
    if (actual > reserved) invalid(`usage consumed.${metric} (${actual}) exceeds the reserved upper bound (${reserved})`);
  }
  for (const metric of AUTOMATION_VERIFIED_USAGE_METRICS) {
    const limit = budget.effective_limits[AUTOMATION_METRIC_LIMIT_FIELDS[metric]];
    if (limit === null) continue;
    if (input.resolution === 'reconciled_not_started') continue;
    const observed = input.usage[metric];
    if (observed === null) invalid(`usage.${metric} is required because a hard ${metric} limit is enforced`);
    if (consumed[metric] !== observed) invalid(`usage consumed.${metric} must equal the attested usage.${metric}`);
    if (input.usage_attribution === null) {
      invalid(`usage.${metric} requires provider-authoritative attribution; no unattested token or cost claim is accepted`);
    }
    if (input.usage_attribution.capability_sha256 !== budget.metric_support.capability_sha256) {
      invalid('usage attribution capability revision does not match the revision this budget was minted against');
    }
    if (input.usage_attribution.provider !== budget.metric_support.provider) {
      invalid('usage attribution provider does not match the provider this budget was minted against');
    }
  }
  const draft = {
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_USAGE_EVENT_KIND,
    automation_run_id: budget.automation_run_id,
    authorization_id: budget.authorization.authorization_id,
    budget_sha256: budget.budget_sha256,
    reservation_sha256: reservation.reservation_sha256,
    idempotency_key: reservation.idempotency_key,
    unit_kind: reservation.unit_kind,
    unit_id: reservation.unit_id,
    attempt: reservation.attempt,
    provider: reservation.provider,
    step_index: reservation.step_index,
    usage: Object.freeze({ ...input.usage }),
    usage_attribution: input.usage_attribution === null ? null : Object.freeze({ ...input.usage_attribution }),
    consumed,
    outcome: input.outcome,
    resolution: input.resolution,
    evidence_refs: Object.freeze([...input.evidence_refs].map((entry) => Object.freeze({ ...entry }))),
    observed_at: assertTimestamp(input.observed_at, 'usage observed_at'),
  };
  const eventId = automationDigest(draft);
  const withId = { ...draft, event_id: eventId };
  return validateAutomationUsageEvent({ ...withId, event_sha256: automationDigest(withId) } as AutomationUsageEventV1);
}

export interface AutomationLedgerFoldV1 {
  readonly consumed: AutomationMetricVectorV1;
  readonly consecutive_no_progress_steps: number;
  readonly last_completed_step_index: number;
  readonly event_count: number;
}

/**
 * The consecutive no-progress streak is a property of the ordered outcome
 * sequence, so it is folded here rather than stored as a counter that a crash
 * could leave stale.
 */
export function foldAutomationLedger(events: readonly AutomationUsageEventV1[]): AutomationLedgerFoldV1 {
  const ordered = [...events].sort((left, right) => left.step_index - right.step_index);
  let consumed = emptyAutomationMetricVector();
  let streak = 0;
  let lastStep = 0;
  for (const event of ordered) {
    consumed = addAutomationMetricVectors(consumed, event.consumed);
    streak = event.outcome === 'progress' || event.outcome === 'completed' ? 0 : streak + 1;
    lastStep = event.step_index;
  }
  return Object.freeze({
    consumed,
    consecutive_no_progress_steps: streak,
    last_completed_step_index: lastStep,
    event_count: ordered.length,
  });
}

/** Append-only chaining: an event can be added but no earlier one can be edited out. */
export function chainAutomationLedgerDigest(previous: string, eventSha256: string): string {
  return createHash('sha256').update(`${previous}\n${eventSha256}`, 'utf8').digest('hex');
}

export const AUTOMATION_LEDGER_GENESIS = '0'.repeat(64);

// ---------------------------------------------------------------------------
// Reservation evaluation
// ---------------------------------------------------------------------------

export type AutomationRefusalCode =
  | 'budget_revision_stale'
  | 'budget_exhausted'
  | 'reconciliation_required'
  | 'budget_expired'
  | 'budget_limit_exceeded';

export interface AutomationBudgetRefusalV1 {
  readonly protocol: typeof AUTOMATION_BUDGET_PROTOCOL;
  readonly kind: typeof AUTOMATION_REFUSAL_KIND;
  readonly automation_run_id: string;
  readonly budget_sha256: string;
  readonly refusal_code: AutomationRefusalCode;
  readonly operation: AutomationOperationKind;
  readonly idempotency_key: string;
  readonly metric: AutomationMetricName | null;
  readonly limit: number | null;
  readonly consumed: number | null;
  readonly reserved: number | null;
  readonly would_consume: number | null;
  readonly refused_at: string;
}

export interface AutomationBudgetStateV1 {
  readonly consumed: AutomationMetricVectorV1;
  readonly open_reserved: AutomationMetricVectorV1;
  readonly consecutive_no_progress_steps: number;
  readonly open_reservation_sha256s: readonly string[];
  readonly state: AutomationBudgetState;
}

export type AutomationReservationDecisionV1 =
  | { readonly decision: 'granted' }
  | { readonly decision: 'refused'; readonly refusal: AutomationBudgetRefusalV1 };

export interface EvaluateAutomationReservationInput {
  readonly budget: AutomationBudgetV1;
  readonly state: AutomationBudgetStateV1;
  readonly expected_budget_sha256: string;
  readonly operation: AutomationOperationKind;
  readonly idempotency_key: string;
  readonly reserved: AutomationMetricVectorV1;
  readonly now: string;
}

function refusal(
  input: EvaluateAutomationReservationInput,
  code: AutomationRefusalCode,
  metric: AutomationMetricName | null,
  limit: number | null,
  consumed: number | null,
  reserved: number | null,
  wouldConsume: number | null,
): AutomationReservationDecisionV1 {
  return Object.freeze({
    decision: 'refused' as const,
    refusal: Object.freeze({
      protocol: AUTOMATION_BUDGET_PROTOCOL,
      kind: AUTOMATION_REFUSAL_KIND,
      automation_run_id: input.budget.automation_run_id,
      budget_sha256: input.budget.budget_sha256,
      refusal_code: code,
      operation: input.operation,
      idempotency_key: input.idempotency_key,
      metric,
      limit,
      consumed,
      reserved,
      would_consume: wouldConsume,
      refused_at: input.now,
    }),
  });
}

/**
 * The whole enforcement decision, as a pure function of the exact budget
 * revision and the folded ledger. A limit that a reservation would push past is
 * refused before the operation runs, which is the only ordering that can stop
 * the next claim or dispatch; checking totals afterwards cannot.
 */
export function evaluateAutomationReservation(
  input: EvaluateAutomationReservationInput,
): AutomationReservationDecisionV1 {
  const budget = input.budget;
  const now = assertTimestamp(input.now, 'now');
  if (input.expected_budget_sha256 !== budget.budget_sha256) {
    return refusal(input, 'budget_revision_stale', null, null, null, null, null);
  }
  if (input.state.state === 'budget_exhausted') {
    return refusal(input, 'budget_exhausted', null, null, null, null, null);
  }
  if (input.state.state === 'reconciliation_required' || input.state.open_reservation_sha256s.length > 0) {
    return refusal(input, 'reconciliation_required', null, null, null, null, null);
  }
  if (Date.parse(now) >= Date.parse(budget.deadline_at)) {
    const elapsed = Math.max(0, Math.floor((Date.parse(now) - Date.parse(budget.created_at)) / 1000));
    return refusal(
      input,
      'budget_expired',
      'wall_clock_seconds',
      budget.effective_limits.max_wall_clock_seconds,
      elapsed,
      0,
      elapsed,
    );
  }
  const streakLimit = budget.effective_limits.max_consecutive_no_progress_steps;
  if (input.state.consecutive_no_progress_steps >= streakLimit) {
    return refusal(
      input,
      'budget_limit_exceeded',
      'consecutive_no_progress_steps',
      streakLimit,
      input.state.consecutive_no_progress_steps,
      0,
      input.state.consecutive_no_progress_steps + 1,
    );
  }
  const reserved = validateAutomationMetricVector(input.reserved, 'reserved');
  for (const metric of AUTOMATION_ENFORCEMENT_ORDER) {
    if (metric === 'wall_clock_seconds' || metric === 'consecutive_no_progress_steps') continue;
    const counted = metric as AutomationCountedMetric;
    const limit = budget.effective_limits[AUTOMATION_METRIC_LIMIT_FIELDS[counted]];
    const request = reserved[counted];
    if (limit === null) {
      if (request !== null) {
        return refusal(input, 'budget_limit_exceeded', counted, null, null, null, request);
      }
      continue;
    }
    if (request === null) {
      return refusal(input, 'budget_limit_exceeded', counted, limit, input.state.consumed[counted], 0, null);
    }
    const consumed = input.state.consumed[counted] ?? 0;
    const open = input.state.open_reserved[counted] ?? 0;
    const wouldConsume = consumed + open + request;
    if (wouldConsume > limit) {
      return refusal(input, 'budget_limit_exceeded', counted, limit, consumed, open, wouldConsume);
    }
  }
  return Object.freeze({ decision: 'granted' as const });
}

// ---------------------------------------------------------------------------
// Current projection and stop receipt
// ---------------------------------------------------------------------------

export interface AutomationBudgetCurrentV1 {
  readonly protocol: typeof AUTOMATION_BUDGET_PROTOCOL;
  readonly kind: typeof AUTOMATION_BUDGET_CURRENT_KIND;
  readonly automation_run_id: string;
  readonly budget_sha256: string;
  readonly state: AutomationBudgetState;
  readonly consumed: AutomationMetricVectorV1;
  readonly open_reserved: AutomationMetricVectorV1;
  readonly consecutive_no_progress_steps: number;
  readonly last_completed_step_index: number;
  readonly next_step_index: number;
  readonly open_reservation_sha256s: readonly string[];
  readonly event_count: number;
  readonly ledger_sha256: string;
  readonly stop_receipt_sha256: string | null;
  readonly previous_current_sha256: string | null;
  readonly updated_at: string;
  readonly current_sha256: string;
}

const BUDGET_STATES: readonly AutomationBudgetState[] = Object.freeze(['active', 'reconciliation_required', 'budget_exhausted']);

export function validateAutomationBudgetCurrent(value: AutomationBudgetCurrentV1): AutomationBudgetCurrentV1 {
  if (value === null || typeof value !== 'object') invalid('automation budget current must be an object');
  if (value.protocol !== AUTOMATION_BUDGET_PROTOCOL) invalid('automation budget current protocol is unsupported');
  if (value.kind !== AUTOMATION_BUDGET_CURRENT_KIND) invalid('automation budget current kind is unsupported');
  if (!BUDGET_STATES.includes(value.state)) invalid('automation budget current state is unsupported');
  if (!Array.isArray(value.open_reservation_sha256s)) invalid('open_reservation_sha256s must be an array');
  const current: AutomationBudgetCurrentV1 = Object.freeze({
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_BUDGET_CURRENT_KIND,
    automation_run_id: assertDigest(value.automation_run_id, 'current automation_run_id'),
    budget_sha256: assertDigest(value.budget_sha256, 'current budget_sha256'),
    state: value.state,
    consumed: validateAutomationMetricVector(value.consumed, 'current consumed'),
    open_reserved: validateAutomationMetricVector(value.open_reserved, 'current open_reserved'),
    consecutive_no_progress_steps: assertCount(value.consecutive_no_progress_steps, 'current consecutive_no_progress_steps', 0),
    last_completed_step_index: assertCount(value.last_completed_step_index, 'current last_completed_step_index', 0),
    next_step_index: assertCount(value.next_step_index, 'current next_step_index', 1),
    open_reservation_sha256s: Object.freeze(value.open_reservation_sha256s.map((entry, index) => assertDigest(entry, `open_reservation_sha256s[${index}]`))),
    event_count: assertCount(value.event_count, 'current event_count', 0),
    ledger_sha256: assertDigest(value.ledger_sha256, 'current ledger_sha256'),
    stop_receipt_sha256: assertNullableDigest(value.stop_receipt_sha256, 'current stop_receipt_sha256'),
    previous_current_sha256: assertNullableDigest(value.previous_current_sha256, 'current previous_current_sha256'),
    updated_at: assertTimestamp(value.updated_at, 'current updated_at'),
    current_sha256: assertDigest(value.current_sha256, 'current current_sha256'),
  });
  if (digestWithout(current, 'current_sha256') !== current.current_sha256) invalid('automation budget current digest does not bind its own content');
  if (current.state === 'budget_exhausted' && current.stop_receipt_sha256 === null) {
    invalid('an exhausted automation budget must name its stop receipt');
  }
  return current;
}

export function sealAutomationBudgetCurrent(
  input: Omit<AutomationBudgetCurrentV1, 'protocol' | 'kind' | 'current_sha256'>,
): AutomationBudgetCurrentV1 {
  const draft = {
    ...withoutFields(input, 'protocol', 'kind', 'current_sha256'),
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_BUDGET_CURRENT_KIND,
    open_reservation_sha256s: [...input.open_reservation_sha256s],
  };
  return validateAutomationBudgetCurrent({ ...draft, current_sha256: automationDigest(draft) } as unknown as AutomationBudgetCurrentV1);
}

export type AutomationInFlightAuthorityKind = 'reservation' | 'claim' | 'lease' | 'delegated_run';

export interface AutomationInFlightAuthorityV1 {
  readonly authority_kind: AutomationInFlightAuthorityKind;
  readonly authority_id: string;
  /** Budget exhaustion never releases or steals an authority; recovery stays with its own owner. */
  readonly recovery: 'normal_recovery_required';
}

export interface AutomationStopReceiptV1 {
  readonly protocol: typeof AUTOMATION_BUDGET_PROTOCOL;
  readonly kind: typeof AUTOMATION_STOP_RECEIPT_KIND;
  readonly automation_run_id: string;
  readonly budget_sha256: string;
  readonly authorization_id: string;
  readonly refusal_code: AutomationRefusalCode;
  readonly triggering_metric: AutomationMetricName;
  readonly limit: number | null;
  readonly consumed: number | null;
  readonly reserved: number | null;
  readonly last_completed_step_index: number;
  readonly in_flight_authority: readonly AutomationInFlightAuthorityV1[];
  readonly ledger_sha256: string;
  readonly issued_at: string;
  readonly stop_receipt_sha256: string;
}

const REFUSAL_CODES: readonly AutomationRefusalCode[] = Object.freeze([
  'budget_revision_stale',
  'budget_exhausted',
  'reconciliation_required',
  'budget_expired',
  'budget_limit_exceeded',
]);

const IN_FLIGHT_AUTHORITY_KINDS: readonly AutomationInFlightAuthorityKind[] = Object.freeze([
  'reservation',
  'claim',
  'lease',
  'delegated_run',
]);

export function validateAutomationStopReceipt(value: AutomationStopReceiptV1): AutomationStopReceiptV1 {
  if (value === null || typeof value !== 'object') invalid('automation stop receipt must be an object');
  if (value.protocol !== AUTOMATION_BUDGET_PROTOCOL) invalid('automation stop receipt protocol is unsupported');
  if (value.kind !== AUTOMATION_STOP_RECEIPT_KIND) invalid('automation stop receipt kind is unsupported');
  if (!Array.isArray(value.in_flight_authority)) invalid('in_flight_authority must be an array');
  if (!(value.triggering_metric in AUTOMATION_METRIC_LIMIT_FIELDS)) invalid('stop receipt triggering_metric is unsupported');
  if (!REFUSAL_CODES.includes(value.refusal_code)) invalid('stop receipt refusal_code is unsupported');
  const receipt: AutomationStopReceiptV1 = Object.freeze({
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_STOP_RECEIPT_KIND,
    automation_run_id: assertDigest(value.automation_run_id, 'stop receipt automation_run_id'),
    budget_sha256: assertDigest(value.budget_sha256, 'stop receipt budget_sha256'),
    authorization_id: assertIdentifier(value.authorization_id, 'stop receipt authorization_id'),
    refusal_code: value.refusal_code,
    triggering_metric: value.triggering_metric,
    limit: assertNullableCount(value.limit, 'stop receipt limit', 0),
    consumed: assertNullableCount(value.consumed, 'stop receipt consumed', 0),
    reserved: assertNullableCount(value.reserved, 'stop receipt reserved', 0),
    last_completed_step_index: assertCount(value.last_completed_step_index, 'stop receipt last_completed_step_index', 0),
    in_flight_authority: Object.freeze(value.in_flight_authority.map((entry, index) => {
      if (!IN_FLIGHT_AUTHORITY_KINDS.includes(entry.authority_kind)) {
        invalid(`in_flight_authority[${index}].authority_kind is unsupported`);
      }
      if (entry.recovery !== 'normal_recovery_required') {
        invalid(`in_flight_authority[${index}].recovery is unsupported`);
      }
      return Object.freeze({
        authority_kind: entry.authority_kind,
        authority_id: assertIdentifier(entry.authority_id, `in_flight_authority[${index}].authority_id`),
        recovery: 'normal_recovery_required' as const,
      });
    })),
    ledger_sha256: assertDigest(value.ledger_sha256, 'stop receipt ledger_sha256'),
    issued_at: assertTimestamp(value.issued_at, 'stop receipt issued_at'),
    stop_receipt_sha256: assertDigest(value.stop_receipt_sha256, 'stop receipt stop_receipt_sha256'),
  });
  if (digestWithout(receipt, 'stop_receipt_sha256') !== receipt.stop_receipt_sha256) {
    invalid('automation stop receipt digest does not bind its own content');
  }
  return receipt;
}

export interface SealAutomationStopReceiptInput {
  readonly budget: AutomationBudgetV1;
  readonly refusal: AutomationBudgetRefusalV1;
  readonly last_completed_step_index: number;
  readonly in_flight_authority: readonly AutomationInFlightAuthorityV1[];
  readonly ledger_sha256: string;
  readonly issued_at: string;
}

export function sealAutomationStopReceipt(input: SealAutomationStopReceiptInput): AutomationStopReceiptV1 {
  if (input.refusal.metric === null) invalid('a stop receipt requires the triggering metric');
  const draft = {
    protocol: AUTOMATION_BUDGET_PROTOCOL,
    kind: AUTOMATION_STOP_RECEIPT_KIND,
    automation_run_id: input.budget.automation_run_id,
    budget_sha256: input.budget.budget_sha256,
    authorization_id: input.budget.authorization.authorization_id,
    refusal_code: input.refusal.refusal_code,
    triggering_metric: input.refusal.metric,
    limit: input.refusal.limit,
    consumed: input.refusal.consumed,
    reserved: input.refusal.reserved,
    last_completed_step_index: input.last_completed_step_index,
    in_flight_authority: [...input.in_flight_authority].map((entry) => Object.freeze({ ...entry })),
    ledger_sha256: input.ledger_sha256,
    issued_at: input.issued_at,
  };
  return validateAutomationStopReceipt({ ...draft, stop_receipt_sha256: automationDigest(draft) } as AutomationStopReceiptV1);
}
