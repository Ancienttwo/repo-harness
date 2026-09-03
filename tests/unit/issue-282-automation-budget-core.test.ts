/**
 * Pure falsification of the automation budget algebra (issue #282).
 *
 * Nothing here touches the filesystem: every property proven in this file is a
 * property of the schema, the strictest-limit composition, the frozen
 * deadline, or the reserve decision, and none of them may depend on where the
 * ledger happens to be stored.
 */
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';

import {
  AUTOMATION_ENFORCEMENT_ORDER,
  AUTOMATION_LEDGER_GENESIS,
  AutomationBudgetError,
  addAutomationMetricVectors,
  automationOperationReservation,
  buildAutomationBudget,
  chainAutomationLedgerDigest,
  composeAutomationLimits,
  emptyAutomationMetricVector,
  evaluateAutomationReservation,
  foldAutomationLedger,
  requireUnattendedAutomationBudget,
  sealAutomationBudgetCurrent,
  sealAutomationMetricSupport,
  sealAutomationReservation,
  sealAutomationStopReceipt,
  sealAutomationUsageEvent,
  sealProgramAuthorization,
  validateAutomationBudget,
  validateAutomationUsageEvent,
  validateProgramAuthorization,
  type AutomationBudgetStateV1,
  type AutomationBudgetV1,
  type AutomationMetricVectorV1,
  type ProgramBudgetLimitV1,
} from '../../src/core/automation/budget';
import { projectAutomationBudgetSlice } from '../../src/core/automation/projection';

const hex = (seed: string): string => createHash('sha256').update(seed, 'utf8').digest('hex');

const LIMITS: ProgramBudgetLimitV1 = Object.freeze({
  max_agent_turns: 10,
  max_successful_acquisitions: 2,
  max_runner_invocations: 6,
  max_provider_failures: 3,
  max_consecutive_no_progress_steps: 2,
  max_repair_cycles: 4,
  max_wall_clock_seconds: 3600,
  max_input_tokens: null,
  max_output_tokens: null,
  max_cost_micros: null,
});

function authorization(limits: ProgramBudgetLimitV1 = LIMITS, expiresAt = '2026-09-04T00:00:00.000Z') {
  return sealProgramAuthorization({
    authorization_id: 'authorization-282',
    repository_id: 'repo-harness',
    target_ref: 'refs/heads/main',
    target_revision: hex('target'),
    work_graph_revision: hex('work-graph'),
    allowed_work_package_ids: ['wp-1', 'wp-2'],
    allowed_risk_tiers: ['low'],
    merge_mode: 'disabled',
    allowed_merge_method: 'squash',
    max_repair_cycles: limits.max_repair_cycles,
    budget: limits,
    issued_by: 'ancienttwo',
    issued_at: '2026-09-03T00:00:00.000Z',
    expires_at: expiresAt,
  });
}

const SUPPORT_NONE = sealAutomationMetricSupport({
  provider: 'codex',
  capability_sha256: hex('capability-no-usage'),
  verified_metrics: [],
  observed_at: '2026-09-03T00:00:00.000Z',
});

const SUPPORT_TOKENS = sealAutomationMetricSupport({
  provider: 'codex',
  capability_sha256: hex('capability-verified-usage'),
  verified_metrics: ['cost_micros', 'input_tokens', 'output_tokens'],
  observed_at: '2026-09-03T00:00:00.000Z',
});

function budget(overrides: Partial<Parameters<typeof buildAutomationBudget>[0]> = {}): AutomationBudgetV1 {
  return buildAutomationBudget({
    automation_run_id: hex('run'),
    goal_id: hex('goal'),
    goal_revision: hex('goal-revision'),
    repository_id: 'repo-harness',
    engineer_id: null,
    claim_id: null,
    authorization: authorization(),
    contract_sha256: null,
    contract_limits: null,
    metric_support: SUPPORT_NONE,
    unattended: true,
    created_by: 'ancienttwo',
    created_at: '2026-09-03T00:00:00.000Z',
    supersedes_sha256: null,
    revision: 1,
    ...overrides,
  });
}

function activeState(overrides: Partial<AutomationBudgetStateV1> = {}): AutomationBudgetStateV1 {
  return Object.freeze({
    consumed: emptyAutomationMetricVector(),
    open_reserved: emptyAutomationMetricVector(),
    consecutive_no_progress_steps: 0,
    open_reservation_sha256s: [],
    state: 'active',
    ...overrides,
  });
}

const NO_TOKENS = { input_tokens: null, output_tokens: null, cost_micros: null } as const;

describe('issue #282 — schema and digest binding', () => {
  test('an authorization digest binds its own content', () => {
    const grant = authorization();
    expect(validateProgramAuthorization(grant)).toEqual(grant);
    expect(() => validateProgramAuthorization({ ...grant, max_repair_cycles: 99 })).toThrow(AutomationBudgetError);
    expect(() => validateProgramAuthorization({ ...grant, issued_by: 'someone-else' })).toThrow(/digest does not bind/u);
  });

  test('a budget digest binds every composed limit and derivation', () => {
    const value = budget();
    expect(validateAutomationBudget(value)).toEqual(value);
    expect(() => validateAutomationBudget({
      ...value,
      effective_limits: { ...value.effective_limits, max_successful_acquisitions: 99 },
    })).toThrow(/digest does not bind/u);
  });

  test('the same inputs always seal to the same budget digest', () => {
    expect(budget().budget_sha256).toBe(budget().budget_sha256);
  });
});

describe('issue #282 — unattended runs need a concrete budget', () => {
  test('a missing budget is a refusal, not an unlimited run', () => {
    expect(() => requireUnattendedAutomationBudget(null)).toThrow(/requires a concrete enforceable budget/u);
    try {
      requireUnattendedAutomationBudget(null);
    } catch (error) {
      expect((error as AutomationBudgetError).code).toBe('automation_budget_unattended_missing');
    }
  });

  test('a budget that is not marked unattended cannot authorize an unattended run', () => {
    expect(() => requireUnattendedAutomationBudget(budget({ unattended: false }))).toThrow(/not marked unattended/u);
  });

  test('a null or zero v1 hard limit never validates', () => {
    for (const field of [
      'max_agent_turns',
      'max_successful_acquisitions',
      'max_runner_invocations',
      'max_provider_failures',
      'max_consecutive_no_progress_steps',
      'max_repair_cycles',
      'max_wall_clock_seconds',
    ] as const) {
      expect(() => authorization({ ...LIMITS, [field]: 0 } as ProgramBudgetLimitV1)).toThrow(AutomationBudgetError);
      expect(() => authorization({ ...LIMITS, [field]: null } as unknown as ProgramBudgetLimitV1)).toThrow(AutomationBudgetError);
    }
  });
});

describe('issue #282 — strictest composition with contract runner budgets', () => {
  test('the stricter of the grant and the task contract wins per metric, with the derivation recorded', () => {
    const composed = composeAutomationLimits(LIMITS, {
      contract_path: 'tasks/contracts/x.contract.md',
      tokens: null,
      runner_invocations: 2,
      wall_time_minutes: 120,
    });
    expect(composed.limits.max_runner_invocations).toBe(2);
    expect(composed.limits.max_wall_clock_seconds).toBe(3600);
    const invocation = composed.derivations.find((entry) => entry.metric === 'runner_invocations');
    expect(invocation).toEqual({
      metric: 'runner_invocations',
      limit_field: 'max_runner_invocations',
      authorization_value: 6,
      contract_value: 2,
      selected_source: 'task_contract',
      selected_value: 2,
    });
    const wall = composed.derivations.find((entry) => entry.metric === 'wall_clock_seconds');
    expect(wall?.selected_source).toBe('authorization');
    expect(wall?.contract_value).toBe(7200);
    expect(composed.derivations).toHaveLength(AUTOMATION_ENFORCEMENT_ORDER.length);
  });

  test('a contract token budget is rejected rather than given a second meaning', () => {
    expect(() => composeAutomationLimits(LIMITS, {
      contract_path: 'tasks/contracts/x.contract.md',
      tokens: 100_000,
      runner_invocations: null,
      wall_time_minutes: null,
    })).toThrow(/contract runner rejects as unenforceable/u);
  });

  test('composing contract limits requires the exact contract revision', () => {
    expect(() => budget({
      contract_sha256: null,
      contract_limits: {
        contract_path: 'tasks/contracts/x.contract.md',
        tokens: null,
        runner_invocations: 2,
        wall_time_minutes: null,
      },
    })).toThrow(/requires the exact contract_sha256/u);
  });

  test('the composed limit lands in the budget digest', () => {
    const composed = budget({
      contract_sha256: hex('contract'),
      contract_limits: {
        contract_path: 'tasks/contracts/x.contract.md',
        tokens: null,
        runner_invocations: 2,
        wall_time_minutes: null,
      },
    });
    expect(composed.effective_limits.max_runner_invocations).toBe(2);
    expect(composed.budget_sha256).not.toBe(budget().budget_sha256);
  });
});

describe('issue #282 — token and cost limits need provider-verified usage', () => {
  const tokenLimits: ProgramBudgetLimitV1 = { ...LIMITS, max_input_tokens: 1_000 };

  test('a hard token limit on an unverified provider path is rejected at preflight', () => {
    expect(() => budget({ authorization: authorization(tokenLimits), metric_support: SUPPORT_NONE }))
      .toThrow(/does not expose verified attributable usage/u);
    try {
      budget({ authorization: authorization(tokenLimits), metric_support: SUPPORT_NONE });
    } catch (error) {
      expect((error as AutomationBudgetError).code).toBe('automation_budget_metric_unenforceable');
    }
  });

  test('the same limit is accepted when the provider capability attests the metric', () => {
    const value = budget({ authorization: authorization(tokenLimits), metric_support: SUPPORT_TOKENS });
    expect(value.effective_limits.max_input_tokens).toBe(1_000);
    expect(value.metric_support.capability_sha256).toBe(SUPPORT_TOKENS.capability_sha256);
  });

  test('a token charge without provider attribution is refused', () => {
    const value = budget({ authorization: authorization(tokenLimits), metric_support: SUPPORT_TOKENS });
    const reserved: AutomationMetricVectorV1 = {
      ...emptyAutomationMetricVector(),
      agent_turns: 1,
      runner_invocations: 1,
      provider_failures: 1,
      input_tokens: 500,
    };
    const reservation = sealAutomationReservation({
      automation_run_id: value.automation_run_id,
      budget_sha256: value.budget_sha256,
      idempotency_key: 'op-1',
      operation: 'provider_invocation',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: 'codex',
      step_index: 1,
      reserved,
      reserved_at: '2026-09-03T00:00:10.000Z',
      deadline_at: value.deadline_at,
      previous_ledger_sha256: AUTOMATION_LEDGER_GENESIS,
    });
    const consumed = { ...reserved, input_tokens: 400 };
    expect(() => sealAutomationUsageEvent({
      budget: value,
      reservation,
      usage: { input_tokens: 400, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed,
      outcome: 'progress',
      resolution: 'observed',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:20.000Z',
    })).toThrow(/requires provider-authoritative attribution/u);

    expect(() => sealAutomationUsageEvent({
      budget: value,
      reservation,
      usage: { input_tokens: 400, output_tokens: null, cost_micros: null },
      usage_attribution: {
        provider: 'codex',
        capability_sha256: hex('a-different-capability-revision'),
        evidence_ref: 'evidence-blob:usage',
        evidence_sha256: hex('usage-bytes'),
      },
      consumed,
      outcome: 'progress',
      resolution: 'observed',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:20.000Z',
    })).toThrow(/capability revision does not match/u);
  });

  test('a charge can never exceed what was reserved', () => {
    const value = budget();
    const reserved = automationOperationReservation('acquisition', NO_TOKENS);
    const reservation = sealAutomationReservation({
      automation_run_id: value.automation_run_id,
      budget_sha256: value.budget_sha256,
      idempotency_key: 'op-1',
      operation: 'acquisition',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: null,
      step_index: 1,
      reserved,
      reserved_at: '2026-09-03T00:00:10.000Z',
      deadline_at: value.deadline_at,
      previous_ledger_sha256: AUTOMATION_LEDGER_GENESIS,
    });
    expect(() => sealAutomationUsageEvent({
      budget: value,
      reservation,
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: { ...reserved, successful_acquisitions: 2 },
      outcome: 'progress',
      resolution: 'observed',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:20.000Z',
    })).toThrow(/exceeds the reserved upper bound/u);
  });

  test('a usage event read back with a mutated event_id is rejected', () => {
    const value = budget();
    const reserved = automationOperationReservation('acquisition', NO_TOKENS);
    const reservation = sealAutomationReservation({
      automation_run_id: value.automation_run_id,
      budget_sha256: value.budget_sha256,
      idempotency_key: 'op-1',
      operation: 'acquisition',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: null,
      step_index: 1,
      reserved,
      reserved_at: '2026-09-03T00:00:10.000Z',
      deadline_at: value.deadline_at,
      previous_ledger_sha256: AUTOMATION_LEDGER_GENESIS,
    });
    const event = sealAutomationUsageEvent({
      budget: value,
      reservation,
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: reserved,
      outcome: 'progress',
      resolution: 'observed',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:20.000Z',
    });
    expect(validateAutomationUsageEvent(event)).toEqual(event);
    // The disk-read path is the one that matters: event_id must bind the event
    // content, not merely be a well-formed digest.
    expect(() => validateAutomationUsageEvent({ ...event, event_id: hex('a-different-event') }))
      .toThrow(/does not bind the event content/u);
  });
});

describe('issue #282 — the wall clock is a frozen absolute deadline', () => {
  test('the deadline is created once from the creation instant and the composed limit', () => {
    const value = budget();
    expect(value.deadline_at).toBe('2026-09-03T01:00:00.000Z');
  });

  test('the grant expiry clamps the deadline and is recorded as its source', () => {
    const value = budget({ authorization: authorization(LIMITS, '2026-09-03T00:10:00.000Z') });
    expect(value.deadline_at).toBe('2026-09-03T00:10:00.000Z');
    expect(value.effective_limits.max_wall_clock_seconds).toBe(600);
    const wall = value.limit_derivations.find((entry) => entry.metric === 'wall_clock_seconds');
    expect(wall?.selected_source).toBe('authorization_expiry');
  });

  test('expiry is decided against the frozen deadline, not process-local elapsed time', () => {
    const value = budget();
    const decision = evaluateAutomationReservation({
      budget: value,
      state: activeState(),
      expected_budget_sha256: value.budget_sha256,
      operation: 'acquisition',
      idempotency_key: 'op-late',
      reserved: automationOperationReservation('acquisition', NO_TOKENS),
      now: '2026-09-03T01:00:00.000Z',
    });
    expect(decision.decision).toBe('refused');
    if (decision.decision === 'refused') {
      expect(decision.refusal.refusal_code).toBe('budget_expired');
      expect(decision.refusal.metric).toBe('wall_clock_seconds');
    }
  });
});

describe('issue #282 — reserve-before-act refusals', () => {
  test('the next acquisition is refused before the acquisition limit is exceeded', () => {
    const value = budget();
    const state = activeState({
      consumed: { ...emptyAutomationMetricVector(), agent_turns: 2, successful_acquisitions: 2 },
    });
    const decision = evaluateAutomationReservation({
      budget: value,
      state,
      expected_budget_sha256: value.budget_sha256,
      operation: 'acquisition',
      idempotency_key: 'op-3',
      reserved: automationOperationReservation('acquisition', NO_TOKENS),
      now: '2026-09-03T00:05:00.000Z',
    });
    expect(decision.decision).toBe('refused');
    if (decision.decision === 'refused') {
      expect(decision.refusal.refusal_code).toBe('budget_limit_exceeded');
      expect(decision.refusal.metric).toBe('successful_acquisitions');
      expect(decision.refusal.limit).toBe(2);
      expect(decision.refusal.would_consume).toBe(3);
    }
  });

  test('the next dispatch is refused before the runner invocation limit is exceeded', () => {
    const value = budget();
    const state = activeState({
      consumed: { ...emptyAutomationMetricVector(), agent_turns: 6, runner_invocations: 6 },
    });
    const decision = evaluateAutomationReservation({
      budget: value,
      state,
      expected_budget_sha256: value.budget_sha256,
      operation: 'dispatch',
      idempotency_key: 'op-7',
      reserved: automationOperationReservation('dispatch', NO_TOKENS),
      now: '2026-09-03T00:05:00.000Z',
    });
    expect(decision.decision).toBe('refused');
    if (decision.decision === 'refused') expect(decision.refusal.metric).toBe('runner_invocations');
  });

  test('an open reservation blocks the next operation until it is resolved', () => {
    const value = budget();
    const decision = evaluateAutomationReservation({
      budget: value,
      state: activeState({ open_reservation_sha256s: [hex('open')] }),
      expected_budget_sha256: value.budget_sha256,
      operation: 'dispatch',
      idempotency_key: 'op-next',
      reserved: automationOperationReservation('dispatch', NO_TOKENS),
      now: '2026-09-03T00:05:00.000Z',
    });
    expect(decision.decision).toBe('refused');
    if (decision.decision === 'refused') expect(decision.refusal.refusal_code).toBe('reconciliation_required');
  });

  test('a decision taken against a stale budget revision is refused', () => {
    const value = budget();
    const decision = evaluateAutomationReservation({
      budget: value,
      state: activeState(),
      expected_budget_sha256: hex('an-older-revision'),
      operation: 'acquisition',
      idempotency_key: 'op-stale',
      reserved: automationOperationReservation('acquisition', NO_TOKENS),
      now: '2026-09-03T00:05:00.000Z',
    });
    expect(decision.decision).toBe('refused');
    if (decision.decision === 'refused') expect(decision.refusal.refusal_code).toBe('budget_revision_stale');
  });

  test('an exhausted run refuses without re-deriving a metric', () => {
    const value = budget();
    const decision = evaluateAutomationReservation({
      budget: value,
      state: activeState({ state: 'budget_exhausted' }),
      expected_budget_sha256: value.budget_sha256,
      operation: 'acquisition',
      idempotency_key: 'op-after-stop',
      reserved: automationOperationReservation('acquisition', NO_TOKENS),
      now: '2026-09-03T00:05:00.000Z',
    });
    expect(decision.decision).toBe('refused');
    if (decision.decision === 'refused') expect(decision.refusal.refusal_code).toBe('budget_exhausted');
  });

  test('the consecutive no-progress streak is enforced from the ordered ledger', () => {
    const value = budget();
    const decision = evaluateAutomationReservation({
      budget: value,
      state: activeState({ consecutive_no_progress_steps: 2 }),
      expected_budget_sha256: value.budget_sha256,
      operation: 'retry',
      idempotency_key: 'op-retry',
      reserved: automationOperationReservation('retry', NO_TOKENS),
      now: '2026-09-03T00:05:00.000Z',
    });
    expect(decision.decision).toBe('refused');
    if (decision.decision === 'refused') expect(decision.refusal.metric).toBe('consecutive_no_progress_steps');
  });

  test('a reservation inside every limit is granted', () => {
    const value = budget();
    expect(evaluateAutomationReservation({
      budget: value,
      state: activeState(),
      expected_budget_sha256: value.budget_sha256,
      operation: 'acquisition',
      idempotency_key: 'op-1',
      reserved: automationOperationReservation('acquisition', NO_TOKENS),
      now: '2026-09-03T00:05:00.000Z',
    }).decision).toBe('granted');
  });
});

describe('issue #282 — ledger folding and the stop receipt', () => {
  test('the no-progress streak resets on progress and accumulates otherwise', () => {
    const value = budget();
    const events = ['no_progress', 'progress', 'provider_failure', 'no_progress'].map((outcome, index) => {
      const reserved = automationOperationReservation('dispatch', NO_TOKENS);
      const reservation = sealAutomationReservation({
        automation_run_id: value.automation_run_id,
        budget_sha256: value.budget_sha256,
        idempotency_key: `op-${index}`,
        operation: 'dispatch',
        unit_kind: 'execute',
        unit_id: 'wp-1',
        attempt: 1,
        provider: 'codex',
        step_index: index + 1,
        reserved,
        reserved_at: '2026-09-03T00:00:10.000Z',
        deadline_at: value.deadline_at,
        previous_ledger_sha256: AUTOMATION_LEDGER_GENESIS,
      });
      return sealAutomationUsageEvent({
        budget: value,
        reservation,
        usage: { input_tokens: null, output_tokens: null, cost_micros: null },
        usage_attribution: null,
        consumed: { ...reserved, provider_failures: outcome === 'provider_failure' ? 1 : 0 },
        outcome: outcome as 'progress',
        resolution: 'observed',
        evidence_refs: [],
        observed_at: '2026-09-03T00:00:20.000Z',
      });
    });
    const folded = foldAutomationLedger(events);
    expect(folded.consecutive_no_progress_steps).toBe(2);
    expect(folded.last_completed_step_index).toBe(4);
    expect(folded.event_count).toBe(4);
    expect(folded.consumed.runner_invocations).toBe(4);
    expect(folded.consumed.provider_failures).toBe(1);
  });

  test('the ledger digest chain changes with every appended event', () => {
    const first = chainAutomationLedgerDigest(AUTOMATION_LEDGER_GENESIS, hex('event-1'));
    const second = chainAutomationLedgerDigest(first, hex('event-2'));
    expect(first).not.toBe(AUTOMATION_LEDGER_GENESIS);
    expect(second).not.toBe(first);
    expect(chainAutomationLedgerDigest(AUTOMATION_LEDGER_GENESIS, hex('event-1'))).toBe(first);
  });

  test('metric vectors add without inventing a value for an unmeasured metric', () => {
    const sum = addAutomationMetricVectors(
      { ...emptyAutomationMetricVector(), agent_turns: 1 },
      { ...emptyAutomationMetricVector(), agent_turns: 2, input_tokens: 5 },
    );
    expect(sum.agent_turns).toBe(3);
    expect(sum.input_tokens).toBe(5);
    expect(sum.output_tokens).toBeNull();
  });

  test('a stop receipt is stable and digest-bound', () => {
    const value = budget();
    const state = activeState({
      consumed: { ...emptyAutomationMetricVector(), agent_turns: 2, successful_acquisitions: 2 },
    });
    const decision = evaluateAutomationReservation({
      budget: value,
      state,
      expected_budget_sha256: value.budget_sha256,
      operation: 'acquisition',
      idempotency_key: 'op-3',
      reserved: automationOperationReservation('acquisition', NO_TOKENS),
      now: '2026-09-03T00:05:00.000Z',
    });
    if (decision.decision !== 'refused') throw new Error('expected a refusal');
    const receipt = sealAutomationStopReceipt({
      budget: value,
      refusal: decision.refusal,
      last_completed_step_index: 2,
      in_flight_authority: [{ authority_kind: 'claim', authority_id: 'claim-1', recovery: 'normal_recovery_required' }],
      ledger_sha256: hex('ledger'),
      issued_at: '2026-09-03T00:05:00.000Z',
    });
    expect(receipt.triggering_metric).toBe('successful_acquisitions');
    expect(receipt.limit).toBe(2);
    expect(receipt.consumed).toBe(2);
    expect(receipt.in_flight_authority[0]?.recovery).toBe('normal_recovery_required');
    expect(sealAutomationStopReceipt({
      budget: value,
      refusal: decision.refusal,
      last_completed_step_index: 2,
      in_flight_authority: [{ authority_kind: 'claim', authority_id: 'claim-1', recovery: 'normal_recovery_required' }],
      ledger_sha256: hex('ledger'),
      issued_at: '2026-09-03T00:05:00.000Z',
    }).stop_receipt_sha256).toBe(receipt.stop_receipt_sha256);
  });
});

describe('issue #282 — operator projection', () => {
  test('the slice reports every enforced metric and carries no provider identity', () => {
    const value = budget();
    const current = {
      protocol: 1 as const,
      kind: 'repo-harness-automation-budget-current' as const,
      automation_run_id: value.automation_run_id,
      budget_sha256: value.budget_sha256,
      state: 'active' as const,
      consumed: { ...emptyAutomationMetricVector(), agent_turns: 1, successful_acquisitions: 1 },
      open_reserved: emptyAutomationMetricVector(),
      consecutive_no_progress_steps: 0,
      last_completed_step_index: 1,
      next_step_index: 2,
      open_reservation_sha256s: [] as readonly string[],
      event_count: 1,
      ledger_sha256: hex('ledger'),
      stop_receipt_sha256: null,
      previous_current_sha256: null,
      updated_at: '2026-09-03T00:05:00.000Z',
      current_sha256: '',
    };
    // Seal through the same helper the store uses so the projection reads a real record.
    const record = sealAutomationBudgetCurrent(current);
    const slice = projectAutomationBudgetSlice({
      budget: value,
      current: record,
      stop_receipt: null,
      observed_at: '2026-09-03T00:05:00.000Z',
    });
    expect(slice.metrics.map((entry) => entry.metric)).toEqual([...AUTOMATION_ENFORCEMENT_ORDER]);
    const acquisitions = slice.metrics.find((entry) => entry.metric === 'successful_acquisitions');
    expect(acquisitions).toEqual({
      metric: 'successful_acquisitions',
      enforced: true,
      limit: 2,
      consumed: 1,
      reserved: 0,
      remaining: 1,
    });
    const wall = slice.metrics.find((entry) => entry.metric === 'wall_clock_seconds');
    expect(wall?.consumed).toBe(300);
    expect(slice.attention_owner).toBe('agent');
    expect(JSON.stringify(slice)).not.toContain('codex');
    expect(JSON.stringify(slice)).not.toContain('evidence');
    expect(slice.slice_sha256).toMatch(/^[0-9a-f]{64}$/u);
  });
});
