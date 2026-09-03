/**
 * Cross-process reservation contention (issue #282).
 *
 * The reservation is only a compare-and-set if a second controller process
 * cannot slip between the ledger read and the reservation write, so this file
 * runs real concurrent processes against one real Git common directory. A
 * same-process test would be serialized by the event loop and would prove
 * nothing about the hazard.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildAutomationBudget,
  sealAutomationMetricSupport,
  sealProgramAuthorization,
  type AutomationBudgetV1,
  type ProgramBudgetLimitV1,
} from '../../src/core/automation/budget';
import {
  publishAutomationBudget,
  readAutomationBudgetStatus,
} from '../../src/effects/automation/budget-store';

const ROOT = join(import.meta.dir, '..', '..');
const at = (iso: string) => () => new Date(iso);
const hex = (seed: string): string => createHash('sha256').update(seed, 'utf8').digest('hex');
const FIXTURES = new Set<string>();

afterAll(() => {
  for (const dir of FIXTURES) rmSync(dir, { recursive: true, force: true });
});

function repoFixture(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'automation-budget-race-')));
  FIXTURES.add(dir);
  const init = spawnSync('git', ['init', '-q', dir], { encoding: 'utf-8' });
  if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);
  return dir;
}

const LIMITS: ProgramBudgetLimitV1 = Object.freeze({
  max_agent_turns: 16,
  max_successful_acquisitions: 1,
  max_runner_invocations: 16,
  max_provider_failures: 16,
  max_consecutive_no_progress_steps: 16,
  max_repair_cycles: 16,
  max_wall_clock_seconds: 3600,
  max_input_tokens: null,
  max_output_tokens: null,
  max_cost_micros: null,
});

function makeBudget(run: string, limits: ProgramBudgetLimitV1): AutomationBudgetV1 {
  return buildAutomationBudget({
    automation_run_id: hex(run),
    goal_id: hex(`${run}-goal`),
    goal_revision: hex(`${run}-goal-revision`),
    repository_id: 'repo-harness',
    engineer_id: null,
    claim_id: null,
    authorization: sealProgramAuthorization({
      authorization_id: `authorization-${run}`,
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
    metric_support: sealAutomationMetricSupport({
      provider: 'codex',
      capability_sha256: hex('capability-no-usage'),
      verified_metrics: [],
      observed_at: '2026-09-03T00:00:00.000Z',
    }),
    unattended: true,
    created_by: 'ancienttwo',
    created_at: '2026-09-03T00:00:00.000Z',
    supersedes_sha256: null,
    revision: 1,
  });
}

/**
 * One controller process: reserve an acquisition, act, append. A reservation
 * that another process already holds is contention, not a verdict, so the
 * worker retries it; anything else is the budget's own answer and is reported
 * verbatim.
 */
const WORKER_SOURCE = `
import { automationOperationReservation } from '${join(ROOT, 'src/core/automation/budget')}';
import {
  AutomationBudgetStoreError,
  appendAutomationUsage,
  reserveAutomationBudget,
} from '${join(ROOT, 'src/effects/automation/budget-store')}';

const [repo, runId, budgetSha, key, startAt] = process.argv.slice(2);
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const reserved = automationOperationReservation('acquisition', { input_tokens: null, output_tokens: null, cost_micros: null });
// One fixed instant for every worker: the store refuses a clock that runs
// backwards over its own records, and racing processes have no ordering.

function report(value) {
  process.stdout.write(JSON.stringify(value) + '\\n');
  process.exit(0);
}

const barrier = Number(startAt) - Date.now();
if (barrier > 0) sleep(barrier);

for (let attempt = 0; attempt < 400; attempt += 1) {
  try {
    const reservation = reserveAutomationBudget({
      repo_root: repo,
      automation_run_id: runId,
      expected_budget_sha256: budgetSha,
      idempotency_key: key,
      operation: 'acquisition',
      unit_kind: 'execute',
      unit_id: 'wp-1',
      attempt: 1,
      provider: null,
      reserved,
      clock: () => new Date('2026-09-03T00:10:00.000Z'),
    });
    appendAutomationUsage({
      repo_root: repo,
      reservation,
      usage: { input_tokens: null, output_tokens: null, cost_micros: null },
      usage_attribution: null,
      consumed: reserved,
      outcome: 'progress',
      evidence_refs: [],
      clock: () => new Date('2026-09-03T00:10:00.000Z'),
    });
    report({ outcome: 'granted', key, step_index: reservation.step_index });
  } catch (error) {
    const refusal = error instanceof AutomationBudgetStoreError ? error.refusal : null;
    const code = refusal === null ? (error && error.code) || 'unknown' : refusal.refusal_code;
    if (code === 'reconciliation_required' || code === 'automation_budget_store_conflict') {
      sleep(5 + (attempt % 7));
      continue;
    }
    report({ outcome: 'refused', key, code, metric: refusal === null ? null : refusal.metric });
  }
}
report({ outcome: 'exhausted_retries', key });
`;

function workerFile(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'automation-budget-worker-')));
  FIXTURES.add(dir);
  const file = join(dir, 'worker.ts');
  writeFileSync(file, WORKER_SOURCE);
  return file;
}

interface WorkerReport {
  readonly outcome: string;
  readonly key: string;
  readonly code?: string;
  readonly metric?: string | null;
  readonly step_index?: number;
}

async function race(repo: string, budget: AutomationBudgetV1, keys: readonly string[]): Promise<WorkerReport[]> {
  const worker = workerFile();
  const startAt = String(Date.now() + 400);
  const runs = keys.map((key) => new Promise<WorkerReport>((resolveWorker, rejectWorker) => {
    const child = spawn(
      process.execPath,
      [worker, repo, budget.automation_run_id, budget.budget_sha256, key, startAt],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] } as never,
    );
    let out = '';
    let err = '';
    child.stdout?.on('data', (chunk) => { out += String(chunk); });
    child.stderr?.on('data', (chunk) => { err += String(chunk); });
    child.on('error', rejectWorker);
    child.on('close', (code) => {
      const line = out.trim().split('\n').filter(Boolean).pop();
      if (code !== 0 || line === undefined) {
        rejectWorker(new Error(`worker ${key} failed (${code}): ${err || out}`));
        return;
      }
      resolveWorker(JSON.parse(line) as WorkerReport);
    });
  }));
  return Promise.all(runs);
}

describe('issue #282 — concurrent controllers cannot reserve past one limit', () => {
  test('four processes racing one remaining acquisition charge exactly one', async () => {
    const repo = repoFixture();
    const budget = makeBudget('race-one', LIMITS);
    publishAutomationBudget({ repo_root: repo, budget, clock: at('2026-09-03T00:00:01.000Z') });

    const reports = await race(repo, budget, ['op-a', 'op-b', 'op-c', 'op-d']);
    const granted = reports.filter((entry) => entry.outcome === 'granted');
    const refused = reports.filter((entry) => entry.outcome === 'refused');
    expect(granted).toHaveLength(1);
    expect(refused).toHaveLength(3);
    for (const entry of refused) {
      expect(['budget_limit_exceeded', 'budget_exhausted']).toContain(entry.code!);
    }

    const status = readAutomationBudgetStatus(repo, budget.automation_run_id);
    expect(status.current.consumed.successful_acquisitions).toBe(1);
    expect(status.current.event_count).toBe(1);
    expect(status.current.state).toBe('budget_exhausted');
    expect(status.stop_receipt?.triggering_metric).toBe('successful_acquisitions');
  }, 60_000);

  test('concurrent reservations inside the limit never lose an append or reuse a step index', async () => {
    const repo = repoFixture();
    const budget = makeBudget('race-many', { ...LIMITS, max_successful_acquisitions: 4, max_agent_turns: 8 });
    publishAutomationBudget({ repo_root: repo, budget, clock: at('2026-09-03T00:00:01.000Z') });

    const reports = await race(repo, budget, ['op-1', 'op-2', 'op-3', 'op-4']);
    expect(reports.filter((entry) => entry.outcome === 'granted')).toHaveLength(4);
    const steps = reports.map((entry) => entry.step_index).sort();
    expect(steps).toEqual([1, 2, 3, 4]);

    const status = readAutomationBudgetStatus(repo, budget.automation_run_id);
    expect(status.current.event_count).toBe(4);
    expect(status.current.consumed.successful_acquisitions).toBe(4);
    expect(status.current.consumed.agent_turns).toBe(4);
    expect(status.current.next_step_index).toBe(5);
  }, 60_000);
});
