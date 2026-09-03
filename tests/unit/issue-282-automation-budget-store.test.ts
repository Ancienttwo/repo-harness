/**
 * The persistence boundaries of the automation budget ledger (issue #282),
 * over a real Git common directory. Nothing here is mocked: every hazard in
 * this file -- create-once immutability, the crash window between a reservation
 * and its usage append, and revision invalidation -- is a filesystem-ordering
 * hazard that a fake filesystem would prove nothing about.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { spawnSync as spawnCli } from 'child_process';
import {
  automationOperationReservation,
  buildAutomationBudget,
  emptyAutomationMetricVector,
  sealAutomationBudgetCurrent,
  sealAutomationMetricSupport,
  sealProgramAuthorization,
  validateAutomationBudgetCurrent,
  type AutomationBudgetV1,
  type AutomationMetricVectorV1,
  type ProgramBudgetLimitV1,
} from '../../src/core/automation/budget';
import {
  AutomationBudgetStoreError,
  appendAutomationUsage,
  publishAutomationBudget,
  readAutomationBudgetBoardSlice,
  readAutomationBudgetStatus,
  reconcileAutomationReservation,
  requireUnattendedAutomationRunBudget,
  reserveAutomationBudget,
  AUTOMATION_BUDGET_STORE_RELATIVE_ROOT,
} from '../../src/effects/automation/budget-store';

const hex = (seed: string): string => createHash('sha256').update(seed, 'utf8').digest('hex');
const FIXTURES = new Set<string>();

afterAll(() => {
  for (const dir of FIXTURES) rmSync(dir, { recursive: true, force: true });
});

function repoFixture(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'automation-budget-store-')));
  FIXTURES.add(dir);
  const init = spawnSync('git', ['init', '-q', dir], { encoding: 'utf-8' });
  if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);
  return dir;
}

const BASE_LIMITS: ProgramBudgetLimitV1 = Object.freeze({
  max_agent_turns: 20,
  max_successful_acquisitions: 2,
  max_runner_invocations: 8,
  max_provider_failures: 4,
  max_consecutive_no_progress_steps: 3,
  max_repair_cycles: 4,
  max_wall_clock_seconds: 3600,
  max_input_tokens: null,
  max_output_tokens: null,
  max_cost_micros: null,
});

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

interface BudgetOptions {
  readonly run: string;
  readonly limits?: ProgramBudgetLimitV1;
  readonly revision?: number;
  readonly supersedes?: string | null;
  readonly tokens?: boolean;
  readonly createdAt?: string;
}

function makeBudget(options: BudgetOptions): AutomationBudgetV1 {
  const limits = options.limits ?? BASE_LIMITS;
  return buildAutomationBudget({
    automation_run_id: hex(options.run),
    goal_id: hex(`${options.run}-goal`),
    goal_revision: hex(`${options.run}-goal-revision`),
    repository_id: 'repo-harness',
    engineer_id: null,
    claim_id: null,
    authorization: sealProgramAuthorization({
      authorization_id: `authorization-${options.run}`,
      repository_id: 'repo-harness',
      target_ref: 'refs/heads/main',
      target_revision: hex('target'),
      work_graph_revision: hex('work-graph'),
      allowed_work_package_ids: ['wp-1'],
      allowed_risk_tiers: ['low'],
      merge_mode: 'disabled',
      allowed_merge_method: 'squash',
      max_repair_cycles: limits.max_repair_cycles,
      budget: limits,
      issued_by: 'ancienttwo',
      issued_at: '2026-09-03T00:00:00.000Z',
      expires_at: '2026-09-04T00:00:00.000Z',
    }),
    contract_sha256: null,
    contract_limits: null,
    metric_support: options.tokens === true ? SUPPORT_TOKENS : SUPPORT_NONE,
    unattended: true,
    created_by: 'ancienttwo',
    created_at: options.createdAt ?? '2026-09-03T00:00:00.000Z',
    supersedes_sha256: options.supersedes ?? null,
    revision: options.revision ?? 1,
  });
}

function currentPath(repo: string, runId: string): string {
  return join(repo, '.git', AUTOMATION_BUDGET_STORE_RELATIVE_ROOT, 'runs', runId, 'current.json');
}

const CLI_ROOT = join(import.meta.dir, '..', '..');
const CLI_ENTRY = join(CLI_ROOT, 'src/cli/index.ts');

const NO_TOKENS = { input_tokens: null, output_tokens: null, cost_micros: null } as const;

function chargeFor(reserved: AutomationMetricVectorV1, successful: boolean): AutomationMetricVectorV1 {
  return { ...reserved, successful_acquisitions: successful ? reserved.successful_acquisitions : 0 };
}

/** One full controller step: reserve, act, append the authoritative result. */
function acquire(repo: string, run: string, budget: AutomationBudgetV1, key: string, at: string) {
  const reserved = automationOperationReservation('acquisition', NO_TOKENS);
  const reservation = reserveAutomationBudget({
    repo_root: repo,
    automation_run_id: budget.automation_run_id,
    expected_budget_sha256: budget.budget_sha256,
    idempotency_key: key,
    operation: 'acquisition',
    unit_kind: 'execute',
    unit_id: 'wp-1',
    attempt: 1,
    provider: null,
    reserved,
    reserved_at: at,
  });
  const commit = appendAutomationUsage({
    repo_root: repo,
    reservation,
    usage: { input_tokens: null, output_tokens: null, cost_micros: null },
    usage_attribution: null,
    consumed: chargeFor(reserved, true),
    outcome: 'progress',
    evidence_refs: [{ ref: `repo:acquisition/${key}`, sha256: hex(key) }],
    observed_at: at,
  });
  return { reservation, commit };
}

describe('issue #282 — publication and the store boundary', () => {
  test('an unattended run without a budget is refused, not run unlimited', () => {
    const repo = repoFixture();
    expect(() => requireUnattendedAutomationRunBudget(repo, hex('never-published')))
      .toThrow(/requires a concrete enforceable budget/u);
  });

  test('publication seeds an active ledger under the Git common directory', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'publish' });
    const status = publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    expect(status.current.state).toBe('active');
    expect(status.current.event_count).toBe(0);
    expect(status.current.next_step_index).toBe(1);
    expect(status.current.ledger_sha256).toBe('0'.repeat(64));
    expect(existsSync(join(repo, '.git', 'repo-harness', 'automation-budget', 'v1', 'runs', budget.automation_run_id, 'current.json'))).toBe(true);
    expect(readdirSync(join(repo, '.git', 'repo-harness'))).toEqual(['automation-budget']);
    expect(requireUnattendedAutomationRunBudget(repo, budget.automation_run_id).budget.budget_sha256).toBe(budget.budget_sha256);
  });

  test('republishing the same revision is idempotent', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'republish' });
    const first = publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    const second = publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:02.000Z' });
    expect(second.current.current_sha256).toBe(first.current.current_sha256);
  });
});

describe('issue #282 — reserve, append, and single charging', () => {
  test('a reservation is charged once no matter how often the key is replayed', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'replay' });
    publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    const reserved = automationOperationReservation('acquisition', NO_TOKENS);
    const first = reserveAutomationBudget({
      repo_root: repo,
      automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256,
      idempotency_key: 'op-1',
      operation: 'acquisition',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: null,
      reserved,
      reserved_at: '2026-09-03T00:00:10.000Z',
    });
    const replayed = reserveAutomationBudget({
      repo_root: repo,
      automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256,
      idempotency_key: 'op-1',
      operation: 'acquisition',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: null,
      reserved,
      reserved_at: '2026-09-03T00:00:11.000Z',
    });
    expect(replayed.reservation_sha256).toBe(first.reservation_sha256);
    expect(replayed.step_index).toBe(1);

    const charge = chargeFor(reserved, true);
    const commit = appendAutomationUsage({
      repo_root: repo,
      reservation: first,
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: charge,
      outcome: 'progress',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:20.000Z',
    });
    const replayedCommit = appendAutomationUsage({
      repo_root: repo,
      reservation: first,
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: charge,
      outcome: 'progress',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:30.000Z',
    });
    expect(replayedCommit.event.event_sha256).toBe(commit.event.event_sha256);
    const status = readAutomationBudgetStatus(repo, budget.automation_run_id);
    expect(status.current.event_count).toBe(1);
    expect(status.current.consumed.successful_acquisitions).toBe(1);
    expect(status.current.consumed.agent_turns).toBe(1);
    expect(status.current.ledger_sha256).not.toBe('0'.repeat(64));
  });

  test('a replay that claims a different charge is a conflict, not a second event', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'conflict' });
    publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    const { reservation } = acquire(repo, 'conflict', budget, 'op-1', '2026-09-03T00:00:10.000Z');
    expect(() => appendAutomationUsage({
      repo_root: repo,
      reservation,
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: { ...emptyAutomationMetricVector(), agent_turns: 1, successful_acquisitions: 0 },
      outcome: 'progress',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:40.000Z',
    })).toThrow(/already exists with a different charge/u);
  });

  test('a token charge without provider attribution is refused at append', () => {
    const repo = repoFixture();
    const budget = makeBudget({
      run: 'tokens',
      tokens: true,
      limits: { ...BASE_LIMITS, max_input_tokens: 1_000 },
    });
    publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    const reserved = automationOperationReservation('provider_invocation', { input_tokens: 500, output_tokens: null, cost_micros: null });
    const reservation = reserveAutomationBudget({
      repo_root: repo,
      automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256,
      idempotency_key: 'op-tokens',
      operation: 'provider_invocation',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: 'codex',
      reserved,
      reserved_at: '2026-09-03T00:00:10.000Z',
    });
    expect(() => appendAutomationUsage({
      repo_root: repo,
      reservation,
      usage: { input_tokens: 400, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: { ...reserved, input_tokens: 400, provider_failures: 0 },
      outcome: 'progress',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:20.000Z',
    })).toThrow(/requires provider-authoritative attribution/u);

    const commit = appendAutomationUsage({
      repo_root: repo,
      reservation,
      usage: { input_tokens: 400, output_tokens: null, cost_micros: null },
      usage_attribution: {
        provider: 'codex',
        capability_sha256: SUPPORT_TOKENS.capability_sha256,
        evidence_ref: 'evidence-blob:usage',
        evidence_sha256: hex('usage-bytes'),
      },
      consumed: { ...reserved, input_tokens: 400, provider_failures: 0 },
      outcome: 'progress',
      evidence_refs: [{ ref: 'evidence-blob:usage', sha256: hex('usage-bytes') }],
      observed_at: '2026-09-03T00:00:20.000Z',
    });
    expect(commit.current.consumed.input_tokens).toBe(400);
  });
});

describe('issue #282 — refusing before the limit and publishing the stop receipt', () => {
  test('the acquisition after the limit is refused and the run is stopped', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'stop' });
    publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    acquire(repo, 'stop', budget, 'op-1', '2026-09-03T00:00:10.000Z');
    const second = acquire(repo, 'stop', budget, 'op-2', '2026-09-03T00:00:20.000Z');
    // The limit is reached by the second acquisition, so the receipt is published
    // at that point rather than waiting for a third attempt to be refused.
    expect(second.commit.stop_receipt?.triggering_metric).toBe('successful_acquisitions');
    expect(second.commit.current.state).toBe('budget_exhausted');

    let refusal: AutomationBudgetStoreError | null = null;
    try {
      acquire(repo, 'stop', budget, 'op-3', '2026-09-03T00:00:30.000Z');
    } catch (error) {
      refusal = error as AutomationBudgetStoreError;
    }
    expect(refusal?.code).toBe('automation_budget_refused');
    expect(refusal?.refusal?.refusal_code).toBe('budget_exhausted');

    const status = readAutomationBudgetStatus(repo, budget.automation_run_id);
    expect(status.current.consumed.successful_acquisitions).toBe(2);
    expect(status.stop_receipt).not.toBeNull();
    expect(status.stop_receipt?.limit).toBe(2);
    const slice = readAutomationBudgetBoardSlice(repo, budget.automation_run_id, '2026-09-03T00:00:40.000Z');
    expect(slice.state).toBe('budget_exhausted');
    expect(slice.attention_owner).toBe('user');
    expect(slice.stop_receipt?.stop_receipt_sha256).toBe(status.stop_receipt!.stop_receipt_sha256);
  });

  test('the frozen deadline stops the run even when no counted metric is near its limit', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'deadline', limits: { ...BASE_LIMITS, max_wall_clock_seconds: 60 } });
    publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    expect(budget.deadline_at).toBe('2026-09-03T00:01:00.000Z');
    let refusal: AutomationBudgetStoreError | null = null;
    try {
      acquire(repo, 'deadline', budget, 'op-late', '2026-09-03T00:02:00.000Z');
    } catch (error) {
      refusal = error as AutomationBudgetStoreError;
    }
    expect(refusal?.refusal?.refusal_code).toBe('budget_expired');
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).stop_receipt?.triggering_metric)
      .toBe('wall_clock_seconds');
  });
});

describe('issue #282 — crash between reservation and usage append', () => {
  test('an unresolved reservation blocks the next operation and is never assumed to be free', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'crash' });
    publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    const reserved = automationOperationReservation('provider_invocation', NO_TOKENS);
    const reservation = reserveAutomationBudget({
      repo_root: repo,
      automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256,
      idempotency_key: 'op-crashed',
      operation: 'provider_invocation',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: 'codex',
      reserved,
      reserved_at: '2026-09-03T00:00:10.000Z',
    });
    // The process dies here: the reservation is durable, the usage never lands.
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).current.open_reservation_sha256s)
      .toEqual([reservation.reservation_sha256]);

    let blocked: AutomationBudgetStoreError | null = null;
    try {
      acquire(repo, 'crash', budget, 'op-next', '2026-09-03T00:00:20.000Z');
    } catch (error) {
      blocked = error as AutomationBudgetStoreError;
    }
    expect(blocked?.refusal?.refusal_code).toBe('reconciliation_required');

    expect(() => reconcileAutomationReservation({
      repo_root: repo,
      reservation,
      resolution: 'reconciled_reserved',
      reason: 'controller crashed after the provider call started',
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: reserved,
      outcome: 'no_progress',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:30.000Z',
    })).toThrow(/requires exact evidence/u);

    expect(() => reconcileAutomationReservation({
      repo_root: repo,
      reservation,
      resolution: 'reconciled_not_started',
      reason: 'guessing the provider never ran',
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: reserved,
      outcome: 'no_progress',
      evidence_refs: [{ ref: 'repo:evidence/none', sha256: hex('none') }],
      observed_at: '2026-09-03T00:00:30.000Z',
    })).toThrow(/must charge nothing/u);

    const resolved = reconcileAutomationReservation({
      repo_root: repo,
      reservation,
      resolution: 'reconciled_reserved',
      reason: 'controller crashed after the provider call started',
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: reserved,
      outcome: 'no_progress',
      evidence_refs: [{ ref: 'repo:evidence/process-exit', sha256: hex('process-exit') }],
      observed_at: '2026-09-03T00:00:30.000Z',
    });
    expect(resolved.event.resolution).toBe('reconciled_reserved');
    expect(resolved.current.consumed.runner_invocations).toBe(1);
    expect(resolved.current.consumed.provider_failures).toBe(1);
    expect(resolved.current.open_reservation_sha256s).toEqual([]);

    // Spending resumes only once the interrupted reservation is resolved.
    const next = acquire(repo, 'crash', budget, 'op-after', '2026-09-03T00:00:40.000Z');
    expect(next.commit.current.consumed.successful_acquisitions).toBe(1);
  });
});

describe('issue #282 — a durable reservation the current projection does not list', () => {
  /**
   * The crash window this closes: the reservation record is fsynced at
   * `writeExclusive`, and `current.json` is renamed after it. A process that
   * dies between the two leaves a durable reservation that the projection does
   * not list. Nothing may treat that as free headroom, and the interrupted
   * operation must still be chargeable exactly once.
   */
  test('an unlisted reservation blocks a different key and stays chargeable exactly once', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'orphan', limits: { ...BASE_LIMITS, max_successful_acquisitions: 1 } });
    publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });

    const path = currentPath(repo, budget.automation_run_id);
    const beforeReserve = readFileSync(path, 'utf8');
    const reserved = automationOperationReservation('acquisition', NO_TOKENS);
    const orphan = reserveAutomationBudget({
      repo_root: repo,
      automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256,
      idempotency_key: 'op-crashed',
      operation: 'acquisition',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: null,
      reserved,
      reserved_at: '2026-09-03T00:00:10.000Z',
    });
    // The process dies here: the reservation is durable, the projection is not.
    writeFileSync(path, beforeReserve);
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).current.open_reservation_sha256s).toEqual([]);

    let blocked: AutomationBudgetStoreError | null = null;
    try {
      acquire(repo, 'orphan', budget, 'op-different', '2026-09-03T00:00:20.000Z');
    } catch (error) {
      blocked = error as AutomationBudgetStoreError;
    }
    expect(blocked?.refusal?.refusal_code).toBe('reconciliation_required');
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).current.consumed.successful_acquisitions).toBe(0);

    const replayed = reserveAutomationBudget({
      repo_root: repo,
      automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256,
      idempotency_key: 'op-crashed',
      operation: 'acquisition',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: null,
      reserved,
      reserved_at: '2026-09-03T00:00:30.000Z',
    });
    expect(replayed.reservation_sha256).toBe(orphan.reservation_sha256);

    const commit = appendAutomationUsage({
      repo_root: repo,
      reservation: replayed,
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: chargeFor(reserved, true),
      outcome: 'progress',
      evidence_refs: [{ ref: 'repo:evidence/recovered', sha256: hex('recovered') }],
      observed_at: '2026-09-03T00:00:40.000Z',
    });
    expect(commit.current.consumed.successful_acquisitions).toBe(1);
    expect(commit.current.event_count).toBe(1);
    expect(commit.current.open_reservation_sha256s).toEqual([]);
    // The single authorized acquisition is now spent, so the run is exhausted.
    expect(commit.stop_receipt?.triggering_metric).toBe('successful_acquisitions');
  });

  /**
   * The mirror window: the usage event is fsynced before `current.json` is
   * renamed. A crash between them leaves a charge on disk that the projection
   * has not folded in; replaying the append must land that charge rather than
   * return the stored event against a stale projection.
   */
  test('a durable usage event the current projection has not folded in is still charged once', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'unfolded' });
    publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    const reserved = automationOperationReservation('acquisition', NO_TOKENS);
    const reservation = reserveAutomationBudget({
      repo_root: repo,
      automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256,
      idempotency_key: 'op-1',
      operation: 'acquisition',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: null,
      reserved,
      reserved_at: '2026-09-03T00:00:10.000Z',
    });
    const path = currentPath(repo, budget.automation_run_id);
    const beforeAppend = readFileSync(path, 'utf8');
    appendAutomationUsage({
      repo_root: repo,
      reservation,
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: chargeFor(reserved, true),
      outcome: 'progress',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:20.000Z',
    });
    // The process dies after the event is durable but before the projection lands.
    writeFileSync(path, beforeAppend);
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).current.consumed.successful_acquisitions).toBe(0);

    const replayed = appendAutomationUsage({
      repo_root: repo,
      reservation,
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: chargeFor(reserved, true),
      outcome: 'progress',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:30.000Z',
    });
    expect(replayed.current.consumed.successful_acquisitions).toBe(1);
    expect(replayed.current.event_count).toBe(1);
    expect(replayed.current.open_reservation_sha256s).toEqual([]);
  });

  test('an already-used key cannot reopen an exhausted run', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'exhausted-replay', limits: { ...BASE_LIMITS, max_successful_acquisitions: 1 } });
    publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    acquire(repo, 'exhausted-replay', budget, 'op-1', '2026-09-03T00:00:10.000Z');
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).current.state).toBe('budget_exhausted');

    // The replay branch is only reachable with a key that already has a stored
    // reservation; an exhausted run must refuse it too.
    let refusal: AutomationBudgetStoreError | null = null;
    try {
      reserveAutomationBudget({
        repo_root: repo,
        automation_run_id: budget.automation_run_id,
        expected_budget_sha256: budget.budget_sha256,
        idempotency_key: 'op-1',
        operation: 'acquisition',
        unit_kind: 'execute',
        unit_id: 'wp-1',
        attempt: 1,
        provider: null,
        reserved: automationOperationReservation('acquisition', NO_TOKENS),
        reserved_at: '2026-09-03T00:00:20.000Z',
      });
    } catch (error) {
      refusal = error as AutomationBudgetStoreError;
    }
    expect(refusal?.code).toBe('automation_budget_refused');
    expect(refusal?.refusal?.refusal_code).toBe('budget_exhausted');
  });
});

describe('issue #282 — a durable stop receipt the projection missed', () => {
  /**
   * The third durable record kind. `persistStopReceipt` writes
   * `stop-receipt.json` create-once and fsynced, then renames `current.json`. A
   * crash in that window leaves the receipt durable while the projection still
   * says the run is active, and the entry counts of `events/` and
   * `reservations/` are unchanged, so nothing in those two directories can
   * reveal it.
   */
  test('a receipt the projection has not adopted is adopted, not thrown on', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'stop-orphan', limits: { ...BASE_LIMITS, max_successful_acquisitions: 1 } });
    publishAutomationBudget({ repo_root: repo, budget, published_at: '2026-09-03T00:00:01.000Z' });
    const stopped = acquire(repo, 'stop-orphan', budget, 'op-1', '2026-09-03T00:00:10.000Z');
    expect(stopped.commit.stop_receipt).not.toBeNull();

    // Roll the projection back to the bytes `commitUsage` wrote just before the
    // receipt was adopted: same ledger, same counts, no receipt.
    const path = currentPath(repo, budget.automation_run_id);
    const adopted = validateAutomationBudgetCurrent(JSON.parse(readFileSync(path, 'utf8')));
    const preReceipt = sealAutomationBudgetCurrent({
      automation_run_id: adopted.automation_run_id,
      budget_sha256: adopted.budget_sha256,
      state: 'active',
      consumed: adopted.consumed,
      open_reserved: adopted.open_reserved,
      consecutive_no_progress_steps: adopted.consecutive_no_progress_steps,
      last_completed_step_index: adopted.last_completed_step_index,
      next_step_index: adopted.next_step_index,
      open_reservation_sha256s: adopted.open_reservation_sha256s,
      event_count: adopted.event_count,
      ledger_sha256: adopted.ledger_sha256,
      stop_receipt_sha256: null,
      previous_current_sha256: adopted.previous_current_sha256,
      updated_at: adopted.updated_at,
    });
    writeFileSync(path, `${JSON.stringify(preReceipt)}\n`);

    // The read-only surfaces must render durable truth rather than throw.
    const slice = readAutomationBudgetBoardSlice(repo, budget.automation_run_id, '2026-09-03T00:00:20.000Z');
    expect(slice.state).toBe('budget_exhausted');
    expect(slice.projection_stale).toBe(true);
    expect(slice.stop_receipt?.triggering_metric).toBe('successful_acquisitions');
    expect(slice.attention_owner).toBe('user');
    const shown = spawnCli(
      process.execPath,
      [CLI_ENTRY, 'automation', 'budget', 'show', '--repo', repo, '--run', budget.automation_run_id, '--observed-at', '2026-09-03T00:00:20.000Z'],
      { cwd: CLI_ROOT, encoding: 'utf-8' },
    );
    expect(shown.status).toBe(0);
    expect(JSON.parse(shown.stdout).state).toBe('budget_exhausted');

    // The next verb adopts the receipt and refuses; it never re-opens the run.
    let refusal: AutomationBudgetStoreError | null = null;
    try {
      acquire(repo, 'stop-orphan', budget, 'op-2', '2026-09-03T00:00:30.000Z');
    } catch (error) {
      refusal = error as AutomationBudgetStoreError;
    }
    expect(refusal?.refusal?.refusal_code).toBe('budget_exhausted');

    const status = readAutomationBudgetStatus(repo, budget.automation_run_id);
    expect(status.current.state).toBe('budget_exhausted');
    expect(status.current.stop_receipt_sha256).toBe(stopped.commit.stop_receipt!.stop_receipt_sha256);
    expect(status.current.consumed.successful_acquisitions).toBe(1);
    expect(status.drift).toBe('none');
    expect(readAutomationBudgetBoardSlice(repo, budget.automation_run_id, '2026-09-03T00:00:40.000Z').projection_stale).toBe(false);
  });
});

describe('issue #282 — a limit increase needs a new authorized revision', () => {
  test('a revision must supersede the exact current digest and invalidates stale decisions', () => {
    const repo = repoFixture();
    const first = makeBudget({ run: 'revision' });
    publishAutomationBudget({ repo_root: repo, budget: first, published_at: '2026-09-03T00:00:01.000Z' });
    acquire(repo, 'revision', first, 'op-1', '2026-09-03T00:00:10.000Z');

    const wider: ProgramBudgetLimitV1 = { ...BASE_LIMITS, max_successful_acquisitions: 5 };
    expect(() => publishAutomationBudget({
      repo_root: repo,
      budget: makeBudget({ run: 'revision', limits: wider, revision: 2, supersedes: hex('not-the-current-digest') }),
      published_at: '2026-09-03T00:00:20.000Z',
    })).toThrow(/must supersede the exact current revision/u);

    expect(() => publishAutomationBudget({
      repo_root: repo,
      budget: makeBudget({ run: 'revision', limits: wider, revision: 3, supersedes: first.budget_sha256 }),
      published_at: '2026-09-03T00:00:20.000Z',
    })).toThrow(/increment the revision counter by one/u);

    const second = makeBudget({ run: 'revision', limits: wider, revision: 2, supersedes: first.budget_sha256 });
    const published = publishAutomationBudget({ repo_root: repo, budget: second, published_at: '2026-09-03T00:00:20.000Z' });
    expect(published.current.budget_sha256).toBe(second.budget_sha256);
    expect(published.current.consumed.successful_acquisitions).toBe(1);

    let stale: AutomationBudgetStoreError | null = null;
    try {
      acquire(repo, 'revision', first, 'op-stale', '2026-09-03T00:00:30.000Z');
    } catch (error) {
      stale = error as AutomationBudgetStoreError;
    }
    expect(stale?.refusal?.refusal_code).toBe('budget_revision_stale');

    const resumed = acquire(repo, 'revision', second, 'op-2', '2026-09-03T00:00:40.000Z');
    expect(resumed.commit.current.consumed.successful_acquisitions).toBe(2);
  });

  /**
   * A revision must not be able to strand an in-flight operation. The ledger is
   * revision-independent, but a reservation carries the exact revision that
   * authorized it, so the publication waits for the run to be quiescent instead
   * of leaving a charge that can never land.
   */
  test('a revision is refused while an operation is still in flight', () => {
    const repo = repoFixture();
    const first = makeBudget({ run: 'revision-inflight' });
    publishAutomationBudget({ repo_root: repo, budget: first, published_at: '2026-09-03T00:00:01.000Z' });
    const reserved = automationOperationReservation('acquisition', NO_TOKENS);
    const reservation = reserveAutomationBudget({
      repo_root: repo,
      automation_run_id: first.automation_run_id,
      expected_budget_sha256: first.budget_sha256,
      idempotency_key: 'op-inflight',
      operation: 'acquisition',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: null,
      reserved,
      reserved_at: '2026-09-03T00:00:10.000Z',
    });

    const wider: ProgramBudgetLimitV1 = { ...BASE_LIMITS, max_successful_acquisitions: 5 };
    expect(() => publishAutomationBudget({
      repo_root: repo,
      budget: makeBudget({ run: 'revision-inflight', limits: wider, revision: 2, supersedes: first.budget_sha256 }),
      published_at: '2026-09-03T00:00:20.000Z',
    })).toThrow(/in-flight operation/u);

    // Resolving the in-flight operation unblocks the revision.
    appendAutomationUsage({
      repo_root: repo,
      reservation,
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: chargeFor(reserved, true),
      outcome: 'progress',
      evidence_refs: [],
      observed_at: '2026-09-03T00:00:30.000Z',
    });
    const second = makeBudget({ run: 'revision-inflight', limits: wider, revision: 2, supersedes: first.budget_sha256 });
    const published = publishAutomationBudget({ repo_root: repo, budget: second, published_at: '2026-09-03T00:00:40.000Z' });
    expect(published.current.state).toBe('active');
    expect(published.current.consumed.successful_acquisitions).toBe(1);
  });
});
