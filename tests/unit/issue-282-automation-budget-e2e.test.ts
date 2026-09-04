/**
 * End-to-end: a controller-shaped driver stops before the next claim (issue #282).
 *
 * The driver here is deliberately not the unattended controller (issue #279).
 * It is the smallest caller that uses the enforcement API the way a controller
 * must -- reserve, act, append, and treat a refusal as the end of the run --
 * which is what makes "stop before the next claim" an observable property of
 * this ledger rather than a promise about a loop that does not exist yet.
 */
import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  automationOperationReservation,
  buildAutomationBudget,
  sealAutomationMetricSupport,
  sealProgramAuthorization,
  type AutomationBudgetV1,
  type AutomationOperationKind,
  type ProgramBudgetLimitV1,
} from '../../src/core/automation/budget';
import type { AutomationBudgetBoardSliceV1 } from '../../src/core/automation/projection';
import {
  AutomationBudgetStoreError,
  appendAutomationUsage,
  publishAutomationBudget,
  readAutomationBudgetBoardSlice,
  readAutomationBudgetStatus,
  reserveAutomationBudget,
} from '../../src/effects/automation/budget-store';
import type { AutomationBudgetStatusV1 } from '../../src/effects/automation/budget-store';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { __setAutomationClockForTests } from '../../src/effects/automation/budget-store.internal';

const ROOT = join(import.meta.dir, '..', '..');
const CLI = join(ROOT, 'src/cli/index.ts');
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
// The grant store is account-level, so every fixture gets its own harness home
// outside the repository; a shared one would leak grants between fixtures.
const FIXTURE_HOME = realpathSync(mkdtempSync(join(tmpdir(), 'automation-budget-home-')));
process.env.REPO_HARNESS_HOME = FIXTURE_HOME;

/** Grants are operator-minted; a fixture mints before it publishes. */
function mintFor(repo: string, budget: AutomationBudgetV1): void {
  mintProgramAuthorization({ repo_root: repo, authorization: budget.authorization });
}

function publishBudget(repo: string, budget: AutomationBudgetV1): AutomationBudgetStatusV1 {
  mintFor(repo, budget);
  return publishAutomationBudget({ repo_root: repo, budget });
}

afterAll(() => {
  for (const dir of [...FIXTURES, FIXTURE_HOME]) rmSync(dir, { recursive: true, force: true });
});

function repoFixture(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'automation-budget-e2e-')));
  FIXTURES.add(dir);
  const init = spawnSync('git', ['init', '-q', dir], { encoding: 'utf-8' });
  if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);
  return dir;
}

/** A recursive content digest of every foreign authority under the common directory. */
function foreignAuthorityDigest(repo: string): string {
  const root = join(repo, '.git', 'repo-harness');
  const hash = createHash('sha256');
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (prefix === '' && entry.name === 'automation-budget') continue;
      const path = join(dir, entry.name);
      const key = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        hash.update(`d:${key}\n`);
        walk(path, key);
        continue;
      }
      hash.update(`f:${key}:${readFileSync(path, 'utf8')}\n`);
    }
  };
  if (existsSync(root)) walk(root, '');
  return hash.digest('hex');
}

const LIMITS: ProgramBudgetLimitV1 = Object.freeze({
  max_agent_turns: 40,
  max_successful_acquisitions: 3,
  max_runner_invocations: 40,
  max_provider_failures: 40,
  max_consecutive_no_progress_steps: 40,
  max_repair_cycles: 40,
  max_wall_clock_seconds: 3600,
  max_input_tokens: null,
  max_output_tokens: null,
  max_cost_micros: null,
});

function makeBudget(run: string): AutomationBudgetV1 {
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
      max_repair_cycles: LIMITS.max_repair_cycles,
      budget: LIMITS,
      contract_scope: 'contract_less',
      contract_path: null, campaign: null,
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

const NO_TOKENS = { input_tokens: null, output_tokens: null, cost_micros: null } as const;

interface ControllerTrace {
  readonly claims: readonly string[];
  readonly dispatches: readonly string[];
  readonly stopped_because: string | null;
  readonly stopped_before: AutomationOperationKind | null;
}

/**
 * The controller shape: every side effect is preceded by a reservation, and a
 * typed refusal ends the run instead of being retried or downgraded.
 */
function driveController(repo: string, budget: AutomationBudgetV1, rounds: number, startRound = 1): ControllerTrace {
  const claims: string[] = [];
  const dispatches: string[] = [];
  for (let round = startRound; round < startRound + rounds; round += 1) {
    for (const operation of ['acquisition', 'dispatch'] as const) {
      const key = `${operation}-${round}`;
      const when = `2026-09-03T00:${String(round).padStart(2, '0')}:0${operation === 'acquisition' ? 0 : 5}.000Z`;
      const reserved = automationOperationReservation(operation, NO_TOKENS);
      let reservation;
      try {
        reservation = reserveAutomationBudget({
          repo_root: repo,
          automation_run_id: budget.automation_run_id,
          expected_budget_sha256: budget.budget_sha256,
          idempotency_key: key,
          operation,
          unit_kind: 'execute',
          unit_id: 'wp-1',
          attempt: 1,
          provider: operation === 'dispatch' ? 'codex' : null,
        });
      } catch (error) {
        if (!(error instanceof AutomationBudgetStoreError) || error.refusal === null) throw error;
        return Object.freeze({
          claims: Object.freeze(claims),
          dispatches: Object.freeze(dispatches),
          stopped_because: error.refusal.refusal_code,
          stopped_before: operation,
        });
      }
      // The side effect only happens after the reservation is granted.
      if (operation === 'acquisition') claims.push(key);
      else dispatches.push(key);
      appendAutomationUsage({
        repo_root: repo,
        reservation,
        outcome: 'progress',
        evidence_refs: [{ ref: `repo:step/${key}`, sha256: hex(key) }],
      });
    }
  }
  return Object.freeze({
    claims: Object.freeze(claims),
    dispatches: Object.freeze(dispatches),
    stopped_because: null,
    stopped_before: null,
  });
}

describe('issue #282 — end-to-end stop before the next claim', () => {
  test('the controller performs exactly the authorized acquisitions and then stops', () => {
    const repo = repoFixture();
    // A foreign authority already exists under the same common directory; the
    // budget must never touch it, even while stopping the run.
    const foreign = join(repo, '.git', 'repo-harness', 'coordination', 'v1', 'leases', hex('task'));
    mkdirSync(foreign, { recursive: true });
    writeFileSync(join(foreign, 'owner.json'), '{"claim_id":"claim-1"}\n');
    const before = foreignAuthorityDigest(repo);

    const budget = makeBudget('e2e');
    publishBudget(repo, budget);

    const trace = driveController(repo, budget, 10);
    expect(trace.claims).toHaveLength(3);
    expect(trace.stopped_before).toBe('dispatch');
    expect(trace.stopped_because).toBe('budget_exhausted');

    const status = readAutomationBudgetStatus(repo, budget.automation_run_id);
    expect(status.current.state).toBe('budget_exhausted');
    expect(status.current.consumed.successful_acquisitions).toBe(3);
    expect(status.stop_receipt?.triggering_metric).toBe('successful_acquisitions');
    expect(status.stop_receipt?.limit).toBe(3);
    expect(status.stop_receipt?.consumed).toBe(3);

    // A second controller starting fresh is refused before its first claim. It
    // starts later on the wall clock: the store refuses a clock that runs
    // backwards over its own records, so a fresh run cannot rewind time.
    const after = driveController(repo, budget, 1, 20);
    expect(after.claims).toHaveLength(0);
    expect(after.stopped_before).toBe('acquisition');
    expect(after.stopped_because).toBe('budget_exhausted');

    // Exhaustion never released, stole, or otherwise touched a foreign authority.
    expect(foreignAuthorityDigest(repo)).toBe(before);
    expect(readFileSync(join(foreign, 'owner.json'), 'utf8')).toBe('{"claim_id":"claim-1"}\n');
    const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf-8' });
    expect(dirty.stdout.trim()).toBe('');
  }, 60_000);

  test('the operator CLI projects the same stop receipt the board reads', () => {
    const repo = repoFixture();
    const budget = makeBudget('e2e-cli');
    publishBudget(repo, budget);
    driveController(repo, budget, 10);

    const result = spawnSync(
      process.execPath,
      [CLI, 'automation', 'budget', 'show', '--repo', repo, '--run', budget.automation_run_id],
      { cwd: ROOT, encoding: 'utf-8' },
    );
    expect(result.status).toBe(0);
    const projected = JSON.parse(result.stdout) as AutomationBudgetBoardSliceV1;
    const direct = readAutomationBudgetBoardSlice(repo, budget.automation_run_id);
    // The CLI takes no observation time, so its slice is read on the child
    // process's own store clock. Everything the ledger decides is identical;
    // only the wall-clock row, which is a function of when it was read, is not.
    for (const field of ['automation_run_id', 'budget_sha256', 'state', 'ledger_sha256', 'attention_owner', 'projection_stale'] as const) {
      expect(projected[field]).toEqual(direct[field]);
    }
    expect(projected.stop_receipt).toEqual(direct.stop_receipt);
    expect(projected.metrics.filter((entry) => entry.metric !== 'wall_clock_seconds'))
      .toEqual(direct.metrics.filter((entry) => entry.metric !== 'wall_clock_seconds'));
    expect(projected.state).toBe('budget_exhausted');
    expect(projected.stop_receipt?.triggering_metric).toBe('successful_acquisitions');
    expect(projected.attention_owner).toBe('user');

    const listed = spawnSync(
      process.execPath,
      [CLI, 'automation', 'budget', 'list', '--repo', repo],
      { cwd: ROOT, encoding: 'utf-8' },
    );
    expect(listed.status).toBe(0);
    expect(JSON.parse(listed.stdout).runs).toEqual([budget.automation_run_id]);

    const missing = spawnSync(
      process.execPath,
      [CLI, 'automation', 'budget', 'show', '--repo', repo, '--run', hex('no-such-run')],
      { cwd: ROOT, encoding: 'utf-8' },
    );
    expect(missing.status).not.toBe(0);
    expect(JSON.parse(missing.stderr).error).toBe('automation_budget_store_not_found');
  }, 60_000);
});
