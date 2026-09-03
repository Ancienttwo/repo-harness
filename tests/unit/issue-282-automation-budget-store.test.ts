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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { spawnSync as spawnCli } from 'child_process';
import {
  automationDigest,
  automationOperationReservation,
  buildAutomationBudget,
  emptyAutomationMetricVector,
  sealAutomationBudgetCurrent,
  sealAutomationMetricSupport,
  sealProgramAuthorization,
  validateAutomationBudgetCurrent,
  type AutomationBudgetV1,
  parseContractDelegationBudget,
  type AutomationContractLimitsV1,
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
  type AppendAutomationUsageInput,
  type PublishAutomationBudgetInput,
  type ReconcileAutomationReservationInput,
  type ReserveAutomationBudgetInput,
  readAutomationBudget,
} from '../../src/effects/automation/budget-store';
import { __setAutomationClockForTests } from '../../src/effects/automation/budget-store.internal';

const hex = (seed: string): string => createHash('sha256').update(seed, 'utf8').digest('hex');
process.env.REPO_HARNESS_TEST_CLOCK_SEAM = '1';
/**
 * The store owns the clock, so a fixture cannot pass a time in beside an
 * operation; it installs one through the closed test seam instead. The default
 * clock advances a second per read, which is all the ordering these fixtures
 * need, and `at()` pins it for the few assertions about a specific instant.
 */
let fixtureClockMs = Date.parse('2026-09-03T00:00:01.000Z');
let fixtureAutoAdvance = true;
__setAutomationClockForTests(() => {
  const value = new Date(fixtureClockMs);
  if (fixtureAutoAdvance) fixtureClockMs += 1_000;
  return value;
});
const at = (iso: string): void => { fixtureClockMs = Date.parse(iso); fixtureAutoAdvance = false; };
const resumeAutoClock = (): void => { fixtureAutoAdvance = true; };

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
  readonly contract?: { readonly path: string; readonly sha256: string; readonly limits: AutomationContractLimitsV1 };
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
      contract_scope: options.contract === undefined ? 'contract_less' : 'task_contract',
      contract_path: options.contract?.path ?? null,
      issued_by: 'ancienttwo',
      issued_at: '2026-09-03T00:00:00.000Z',
      expires_at: '2026-09-04T00:00:00.000Z',
    }),
    contract_sha256: options.contract?.sha256 ?? null,
    contract_limits: options.contract?.limits ?? null,
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
function acquire(repo: string, run: string, budget: AutomationBudgetV1, key: string, when: string) {
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
  });
  const commit = appendAutomationUsage({
    repo_root: repo,
    reservation,
    outcome: 'progress',
    evidence_refs: [{ ref: `repo:acquisition/${key}`, sha256: hex(key) }],
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
    const status = publishAutomationBudget({ repo_root: repo, budget });
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
    const first = publishAutomationBudget({ repo_root: repo, budget });
    const second = publishAutomationBudget({ repo_root: repo, budget });
    expect(second.current.current_sha256).toBe(first.current.current_sha256);
  });
});

describe('issue #282 — reserve, append, and single charging', () => {
  test('a reservation is charged once no matter how often the key is replayed', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'replay' });
    publishAutomationBudget({ repo_root: repo, budget });
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
    });
    expect(replayed.reservation_sha256).toBe(first.reservation_sha256);
    expect(replayed.step_index).toBe(1);

    const charge = chargeFor(reserved, true);
    const commit = appendAutomationUsage({
      repo_root: repo,
      reservation: first,
      outcome: 'progress',
      evidence_refs: [],
    });
    const replayedCommit = appendAutomationUsage({
      repo_root: repo,
      reservation: first,
      outcome: 'progress',
      evidence_refs: [],
    });
    expect(replayedCommit.event.event_sha256).toBe(commit.event.event_sha256);
    const status = readAutomationBudgetStatus(repo, budget.automation_run_id);
    expect(status.current.event_count).toBe(1);
    expect(status.current.consumed.successful_acquisitions).toBe(1);
    expect(status.current.consumed.agent_turns).toBe(1);
    expect(status.current.ledger_sha256).not.toBe('0'.repeat(64));
  });

  test('a replay that reports a different outcome is a conflict, not a second event', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'conflict' });
    publishAutomationBudget({ repo_root: repo, budget });
    const { reservation } = acquire(repo, 'conflict', budget, 'op-1', '2026-09-03T00:00:10.000Z');
    // The charge is derived, so the only thing a replay can contradict is the
    // outcome the host observed -- and that still cannot be rewritten.
    expect(() => appendAutomationUsage({
      repo_root: repo,
      reservation,
      outcome: 'no_progress',
      evidence_refs: [],
    })).toThrow(/already exists with a different charge/u);
  });

  test('a hard token limit is refused at publish while no provider usage authority is wired', () => {
    const repo = repoFixture();
    const budget = makeBudget({
      run: 'tokens',
      tokens: true,
      limits: { ...BASE_LIMITS, max_input_tokens: 1_000 },
    });
    expect(() => publishAutomationBudget({ repo_root: repo, budget }))
      .toThrow(/is not enforceable/u);

    // Claiming provider-verified metrics without a provider authority behind
    // them is refused for the same reason.
    const claimed = makeBudget({ run: 'tokens-claimed', tokens: true });
    expect(() => publishAutomationBudget({ repo_root: repo, budget: claimed }))
      .toThrow(/reads no provider usage authority/u);
  });
});

describe('issue #282 — refusing before the limit and publishing the stop receipt', () => {
  test('the acquisition after the limit is refused and the run is stopped', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'stop' });
    publishAutomationBudget({ repo_root: repo, budget });
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
    publishAutomationBudget({ repo_root: repo, budget });
    expect(budget.deadline_at).toBe('2026-09-03T00:01:00.000Z');
    at('2026-09-03T00:02:00.000Z');
    let refusal: AutomationBudgetStoreError | null = null;
    try {
      acquire(repo, 'deadline', budget, 'op-late', '2026-09-03T00:02:00.000Z');
    } catch (error) {
      refusal = error as AutomationBudgetStoreError;
    }
    // Reading past the frozen deadline already seals the receipt, so the verb
    // refuses against a stopped run rather than re-deriving the expiry.
    expect(refusal?.refusal?.refusal_code).toBe('budget_exhausted');
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).stop_receipt?.triggering_metric)
      .toBe('wall_clock_seconds');
  });
});

describe('issue #282 — crash between reservation and usage append', () => {
  test('an unresolved reservation blocks the next operation and is never assumed to be free', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'crash' });
    publishAutomationBudget({ repo_root: repo, budget });
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
      outcome: 'no_progress',
      reason: 'controller crashed after the provider call started',
      evidence_refs: [],
    })).toThrow(/requires exact evidence/u);

    const resolved = reconcileAutomationReservation({
      repo_root: repo,
      reservation,
      resolution: 'reconciled_reserved',
      outcome: 'no_progress',
      reason: 'controller crashed after the provider call started',
      evidence_refs: [{ ref: 'repo:evidence/process-exit', sha256: hex('process-exit') }],
    });
    expect(resolved.event.resolution).toBe('reconciled_reserved');
    expect(resolved.current.consumed.runner_invocations).toBe(1);
    expect(resolved.current.consumed.provider_failures).toBe(1);
    expect(resolved.current.open_reservation_sha256s).toEqual([]);

    // Spending resumes only once the interrupted reservation is resolved.
    const next = acquire(repo, 'crash', budget, 'op-after', '2026-09-03T00:00:40.000Z');
    expect(next.commit.current.consumed.successful_acquisitions).toBe(1);
  });

  test('the reconciliation charge is derived from the resolution, never declared', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'reconcile-charge' });
    publishAutomationBudget({ repo_root: repo, budget });
    const reservation = reserveAutomationBudget({
      repo_root: repo,
      automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256,
      idempotency_key: 'op-never-started',
      operation: 'provider_invocation',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: 'codex',
    });
    const resolved = reconcileAutomationReservation({
      repo_root: repo,
      reservation,
      resolution: 'reconciled_not_started',
      outcome: 'no_progress',
      reason: 'the provider process never launched',
      evidence_refs: [{ ref: 'repo:evidence/launch-failure', sha256: hex('launch-failure') }],
    });
    // Proven not to have started, so it costs nothing -- and the caller had no
    // way to say otherwise.
    expect(resolved.event.consumed.agent_turns).toBe(0);
    expect(resolved.event.consumed.runner_invocations).toBe(0);
    expect(resolved.event.consumed.provider_failures).toBe(0);
    expect(resolved.current.consumed.runner_invocations).toBe(0);
    expect(resolved.current.open_reservation_sha256s).toEqual([]);
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
    publishAutomationBudget({ repo_root: repo, budget });

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
    });
    expect(replayed.reservation_sha256).toBe(orphan.reservation_sha256);

    const commit = appendAutomationUsage({
      repo_root: repo,
      reservation: replayed,
      outcome: 'progress',
      evidence_refs: [{ ref: 'repo:evidence/recovered', sha256: hex('recovered') }],
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
    publishAutomationBudget({ repo_root: repo, budget });
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
    });
    const path = currentPath(repo, budget.automation_run_id);
    const beforeAppend = readFileSync(path, 'utf8');
    appendAutomationUsage({
      repo_root: repo,
      reservation,
      outcome: 'progress',
      evidence_refs: [],
    });
    // The process dies after the event is durable but before the projection lands.
    writeFileSync(path, beforeAppend);
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).current.consumed.successful_acquisitions).toBe(0);

    const replayed = appendAutomationUsage({
      repo_root: repo,
      reservation,
      outcome: 'progress',
      evidence_refs: [],
    });
    expect(replayed.current.consumed.successful_acquisitions).toBe(1);
    expect(replayed.current.event_count).toBe(1);
    expect(replayed.current.open_reservation_sha256s).toEqual([]);
  });

  test('an already-used key cannot reopen an exhausted run', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'exhausted-replay', limits: { ...BASE_LIMITS, max_successful_acquisitions: 1 } });
    publishAutomationBudget({ repo_root: repo, budget });
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
    publishAutomationBudget({ repo_root: repo, budget });
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

describe('issue #282 — the store owns the clock', () => {
  /**
   * A caller-supplied time is a claim, not a fact. Backdating it past a frozen
   * deadline used to buy a reservation the deadline had already refused, so no
   * decision reads one: the input carries no timestamp at all and the store
   * stamps its own records.
   */
  test('a backdated caller timestamp cannot buy a reservation past the frozen deadline', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'clock', limits: { ...BASE_LIMITS, max_wall_clock_seconds: 60 } });
    publishAutomationBudget({ repo_root: repo, budget });
    expect(budget.deadline_at).toBe('2026-09-03T00:01:00.000Z');

    let refusal: AutomationBudgetStoreError | null = null;
    try {
      reserveAutomationBudget({
        repo_root: repo,
        automation_run_id: budget.automation_run_id,
        expected_budget_sha256: budget.budget_sha256,
        idempotency_key: 'op-backdated',
        operation: 'acquisition',
        unit_kind: 'execute',
        unit_id: 'wp-1',
        attempt: 1,
        provider: null,
        // The store clock is well past the deadline; the caller claims otherwise.
        reserved_at: '2026-09-03T00:00:10.000Z',
      } as Parameters<typeof reserveAutomationBudget>[0]);
    } catch (error) {
      refusal = error as AutomationBudgetStoreError;
    }
    expect(refusal?.code).toBe('automation_budget_refused');
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).stop_receipt?.triggering_metric)
      .toBe('wall_clock_seconds');
  });

  test('a clock that runs backwards over a durable record is refused', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'clock-regression' });
    publishAutomationBudget({ repo_root: repo, budget });
    at('2026-09-03T00:10:00.000Z');
    acquire(repo, 'clock-regression', budget, 'op-1', '2026-09-03T00:10:00.000Z');

    at('2026-09-03T00:05:00.000Z');
    let refusal: AutomationBudgetStoreError | null = null;
    try {
      acquire(repo, 'clock-regression', budget, 'op-2', '2026-09-03T00:05:00.000Z');
    } catch (error) {
      refusal = error as AutomationBudgetStoreError;
    }
    expect(refusal?.code).toBe('automation_budget_clock_regression');
    expect(refusal?.refusal?.refusal_code).toBe('clock_regression');
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).current.consumed.successful_acquisitions).toBe(1);
  });
});

describe('issue #282 — immutable records publish atomically', () => {
  /**
   * A record becomes visible only after its bytes are durable, so "the file
   * exists" means "its content is complete". The only artifact a crash can now
   * leave is a temporary file, which no scan counts and no reader parses.
   */
  test('a leftover temporary artifact is garbage that blocks nothing', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'atomic' });
    publishAutomationBudget({ repo_root: repo, budget });
    const runRoot = join(repo, '.git', AUTOMATION_BUDGET_STORE_RELATIVE_ROOT, 'runs', budget.automation_run_id);
    writeFileSync(join(runRoot, 'reservations', '.abc.json.tmp-1-2-3'), '{"trunc');
    writeFileSync(join(runRoot, 'events', '.def.json.tmp-4-5-6'), '');

    const first = acquire(repo, 'atomic', budget, 'op-1', '2026-09-03T00:10:00.000Z');
    expect(first.commit.current.consumed.successful_acquisitions).toBe(1);
    const status = readAutomationBudgetStatus(repo, budget.automation_run_id);
    expect(status.drift).toBe('none');

    for (const directory of ['reservations', 'events'] as const) {
      for (const entry of readdirSync(join(runRoot, directory))) {
        if (!entry.endsWith('.json')) continue;
        const raw = readFileSync(join(runRoot, directory, entry), 'utf8');
        expect(raw.length).toBeGreaterThan(0);
        expect(() => JSON.parse(raw)).not.toThrow();
      }
    }
  });
});

describe('issue #282 — exhaustion is sealed deterministically', () => {
  /**
   * `commitUsage` writes the charge and then seals the receipt. A crash between
   * the two leaves counts that agree with each other and a run that is over but
   * says it is active, which no directory count can reveal.
   */
  test('consumption that reached a hard limit without a receipt is sealed on the next read', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'unsealed', limits: { ...BASE_LIMITS, max_successful_acquisitions: 1 } });
    publishAutomationBudget({ repo_root: repo, budget });
    const stopped = acquire(repo, 'unsealed', budget, 'op-1', '2026-09-03T00:10:00.000Z');
    expect(stopped.commit.stop_receipt).not.toBeNull();

    // Rewind to the instant between the charge and the receipt: same counts,
    // no receipt, projection still active.
    const path = currentPath(repo, budget.automation_run_id);
    const adopted = validateAutomationBudgetCurrent(JSON.parse(readFileSync(path, 'utf8')));
    writeFileSync(path, `${JSON.stringify(sealAutomationBudgetCurrent({
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
    }))}\n`);
    rmSync(join(repo, '.git', AUTOMATION_BUDGET_STORE_RELATIVE_ROOT, 'runs', budget.automation_run_id, 'stop-receipt.json'));

    const clock = at('2026-09-03T00:11:00.000Z');
    expect(readAutomationBudgetStatus(repo, budget.automation_run_id).drift).toBe('unsealed_exhaustion');
    const slice = readAutomationBudgetBoardSlice(repo, budget.automation_run_id, '2026-09-03T00:11:00.000Z');
    expect(slice.state).toBe('budget_exhausted');
    expect(slice.projection_stale).toBe(true);
    expect(slice.attention_owner).toBe('user');

    let refusal: AutomationBudgetStoreError | null = null;
    try {
      acquire(repo, 'unsealed', budget, 'op-2', '2026-09-03T00:11:00.000Z');
    } catch (error) {
      refusal = error as AutomationBudgetStoreError;
    }
    expect(refusal?.refusal?.refusal_code).toBe('budget_exhausted');
    const sealed = readAutomationBudgetStatus(repo, budget.automation_run_id);
    expect(sealed.drift).toBe('none');
    expect(sealed.current.state).toBe('budget_exhausted');
    expect(sealed.stop_receipt?.triggering_metric).toBe('successful_acquisitions');
  });
});

describe('issue #282 — effective limits are re-derived, not trusted', () => {
  /**
   * The digest only proves an object is self-consistent. A forged budget that
   * raises a limit and recomputes its own digest is refused because every
   * enforced number is recomputed from the grant and the task contract.
   */
  test('a self-consistent budget with a raised limit is refused at publish and at read', () => {
    const repo = repoFixture();
    const honest = makeBudget({ run: 'forged' });
    const { budget_sha256: _digest, ...body } = honest;
    const forgedBody = {
      ...body,
      effective_limits: { ...honest.effective_limits, max_runner_invocations: honest.effective_limits.max_runner_invocations + 40 },
    };
    const forged = { ...forgedBody, budget_sha256: automationDigest(forgedBody) } as typeof honest;
    // The forgery is internally perfect: its digest binds its own bytes.
    expect(forged.budget_sha256).not.toBe(honest.budget_sha256);

    expect(() => publishAutomationBudget({ repo_root: repo, budget: forged }))
      .toThrow(/is not the strictest value its authorities allow/u);

    // And it cannot be smuggled in by writing it straight into the store either.
    publishAutomationBudget({ repo_root: repo, budget: honest });
    writeFileSync(
      join(repo, '.git', AUTOMATION_BUDGET_STORE_RELATIVE_ROOT, 'budgets', `${forged.budget_sha256}.json`),
      `${JSON.stringify(forged)}\n`,
    );
    expect(() => readAutomationBudget(repo, forged.budget_sha256))
      .toThrow(/is not the strictest value its authorities allow/u);
  });
});

describe('issue #282 — the caller supplies no decision input', () => {
  /**
   * Structural proof. Time, the reserved vector and the charge are all
   * decisions, so none of them has a key on any public input: the compile-time
   * checks below fail the build if one is ever reintroduced.
   */
  type ForbiddenDecisionKey = 'clock' | 'now' | 'reserved_at' | 'observed_at' | 'published_at' | 'reconciled_at';
  type HasNo<T, K extends string> = Extract<keyof T, K> extends never ? true : false;

  const reserveHasNoTime: HasNo<ReserveAutomationBudgetInput, ForbiddenDecisionKey | 'reserved'> = true;
  const appendHasNoTime: HasNo<AppendAutomationUsageInput, ForbiddenDecisionKey | 'consumed' | 'usage' | 'usage_attribution'> = true;
  const reconcileHasNoTime: HasNo<ReconcileAutomationReservationInput, ForbiddenDecisionKey | 'consumed' | 'usage' | 'usage_attribution'> = true;
  const publishHasNoTime: HasNo<PublishAutomationBudgetInput, ForbiddenDecisionKey> = true;

  test('no public verb input carries a time, a reserved vector or a charge', () => {
    expect([reserveHasNoTime, appendHasNoTime, reconcileHasNoTime, publishHasNoTime]).toEqual([true, true, true, true]);
  });

  test('a caller that passes a decision input anyway cannot change the decision', () => {
    const repo = repoFixture();
    const budget = makeBudget({ run: 'ignored-inputs', limits: { ...BASE_LIMITS, max_successful_acquisitions: 1 } });
    publishAutomationBudget({ repo_root: repo, budget });
    const smuggled = {
      repo_root: repo,
      automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256,
      idempotency_key: 'op-smuggled',
      operation: 'acquisition' as const,
      unit_kind: 'execute' as const,
      unit_id: 'wp-1',
      attempt: 1,
      provider: null,
      // None of these are part of the contract; the store must ignore them.
      reserved: { ...emptyAutomationMetricVector(), agent_turns: 0, successful_acquisitions: 0 },
      clock: () => new Date('2020-01-01T00:00:00.000Z'),
      reserved_at: '2020-01-01T00:00:00.000Z',
    };
    for (const key of ['reserved', 'clock', 'reserved_at']) {
      expect(Object.keys(smuggled)).toContain(key);
    }
    const reservation = reserveAutomationBudget(smuggled as unknown as ReserveAutomationBudgetInput);
    // An acquisition costs one acquisition and one step, whatever was passed.
    expect(reservation.reserved.successful_acquisitions).toBe(1);
    expect(reservation.reserved.agent_turns).toBe(1);
    expect(Date.parse(reservation.reserved_at)).toBeGreaterThan(Date.parse('2026-09-03T00:00:00.000Z'));

    const commit = appendAutomationUsage({
      repo_root: repo,
      reservation,
      outcome: 'progress',
      evidence_refs: [],
    });
    expect(commit.current.consumed.successful_acquisitions).toBe(1);
    // One acquisition was authorized, so the run is now exhausted.
    expect(commit.current.state).toBe('budget_exhausted');
  });
});

describe('issue #282 — the task contract is read, not summarised', () => {
  const CONTRACT_PATH = 'tasks/contracts/fixture.contract.md';
  const CONTRACT_BODY = [
    '# Task Contract: fixture',
    '',
    '## Delegation Contract',
    '',
    '```yaml',
    'delegation:',
    '  budget:',
    '    tokens: null',
    '    runner_invocations: 2',
    '    wall_time_minutes: null',
    '```',
    '',
  ].join('\n');

  function withContract(repo: string): { readonly path: string; readonly sha256: string; readonly limits: AutomationContractLimitsV1 } {
    mkdirSync(join(repo, 'tasks', 'contracts'), { recursive: true });
    writeFileSync(join(repo, CONTRACT_PATH), CONTRACT_BODY);
    return {
      path: CONTRACT_PATH,
      sha256: createHash('sha256').update(CONTRACT_BODY, 'utf8').digest('hex'),
      limits: parseContractDelegationBudget(CONTRACT_BODY, CONTRACT_PATH),
    };
  }

  test('a budget bound to a real contract composes from the contract bytes', () => {
    const repo = repoFixture();
    const contract = withContract(repo);
    const budget = makeBudget({ run: 'contract-bound', contract });
    expect(budget.effective_limits.max_runner_invocations).toBe(2);
    const published = publishAutomationBudget({ repo_root: repo, budget });
    expect(published.budget.contract_sha256).toBe(contract.sha256);
  });

  test('a grant that names a contract the repository does not have is refused', () => {
    const repo = repoFixture();
    const contract = withContract(repo);
    const budget = makeBudget({ run: 'contract-missing', contract });
    rmSync(join(repo, CONTRACT_PATH));
    expect(() => publishAutomationBudget({ repo_root: repo, budget })).toThrow(/is missing/u);
  });

  test('a summary that claims looser limits than the contract is refused', () => {
    const repo = repoFixture();
    const contract = withContract(repo);
    const forged = makeBudget({
      run: 'contract-forged',
      contract: { ...contract, limits: { ...contract.limits, runner_invocations: 40 } },
    });
    // The forgery is self-consistent and its digest binds it; only re-reading
    // the contract's own bytes catches it.
    expect(forged.effective_limits.max_runner_invocations).toBe(8);
    expect(() => publishAutomationBudget({ repo_root: repo, budget: forged }))
      .toThrow(/do not match the delegation budget/u);
  });

  test('a contract-less run must be granted explicitly', () => {
    const repo = repoFixture();
    const contract = withContract(repo);
    const budget = makeBudget({ run: 'contract-less-forged', contract });
    const grantless = {
      ...budget,
      authorization: { ...budget.authorization, contract_scope: 'contract_less' as const, contract_path: null },
    };
    expect(() => publishAutomationBudget({ repo_root: repo, budget: grantless }))
      .toThrow(/digest does not bind|contract-less grant cannot carry/u);
  });
});

describe('issue #282 — a limit increase needs a new authorized revision', () => {
  test('a revision must supersede the exact current digest and invalidates stale decisions', () => {
    const repo = repoFixture();
    const first = makeBudget({ run: 'revision' });
    publishAutomationBudget({ repo_root: repo, budget: first });
    acquire(repo, 'revision', first, 'op-1', '2026-09-03T00:00:10.000Z');

    const wider: ProgramBudgetLimitV1 = { ...BASE_LIMITS, max_successful_acquisitions: 5 };
    expect(() => publishAutomationBudget({
      repo_root: repo,
      budget: makeBudget({ run: 'revision', limits: wider, revision: 2, supersedes: hex('not-the-current-digest') }),
    })).toThrow(/must supersede the exact current revision/u);

    expect(() => publishAutomationBudget({
      repo_root: repo,
      budget: makeBudget({ run: 'revision', limits: wider, revision: 3, supersedes: first.budget_sha256 }),
    })).toThrow(/increment the revision counter by one/u);

    const second = makeBudget({ run: 'revision', limits: wider, revision: 2, supersedes: first.budget_sha256 });
    const published = publishAutomationBudget({ repo_root: repo, budget: second });
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
    publishAutomationBudget({ repo_root: repo, budget: first });
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
    });

    const wider: ProgramBudgetLimitV1 = { ...BASE_LIMITS, max_successful_acquisitions: 5 };
    expect(() => publishAutomationBudget({
      repo_root: repo,
      budget: makeBudget({ run: 'revision-inflight', limits: wider, revision: 2, supersedes: first.budget_sha256 }),
    })).toThrow(/in-flight operation/u);

    // Resolving the in-flight operation unblocks the revision.
    appendAutomationUsage({
      repo_root: repo,
      reservation,
      outcome: 'progress',
      evidence_refs: [],
    });
    const second = makeBudget({ run: 'revision-inflight', limits: wider, revision: 2, supersedes: first.budget_sha256 });
    const published = publishAutomationBudget({ repo_root: repo, budget: second });
    expect(published.current.state).toBe('active');
    expect(published.current.consumed.successful_acquisitions).toBe(1);
  });
});
