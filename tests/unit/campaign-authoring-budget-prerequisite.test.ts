import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { mkdtempSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';

import {
  buildAutomationBudget,
  sealProgramAuthorization,
  type ProgramAuthorizationV1,
} from '../../src/core/automation/budget';
import {
  AutomationBudgetStoreError,
  appendAutomationUsage,
  ensureCampaignAuthoringBudget,
  publishAutomationBudget,
  readAutomationBudgetStatus,
  readCampaignAuthoringBudgetTerminal,
  reconcileAutomationReservation,
  reserveAutomationBudget,
  reserveCampaignAuthoringBudget,
  sealCampaignAuthoringBudget,
  verifyCampaignAuthoringBudgetTerminal,
} from '../../src/effects/automation/budget-store';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';

const hex = (seed: string): string => createHash('sha256').update(seed, 'utf8').digest('hex');
const intent = (seed: string): string => `sha256:${hex(seed)}`;
const roots = new Set<string>();

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixture(): { readonly repo: string; readonly env: NodeJS.ProcessEnv } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'campaign-authoring-budget-')));
  roots.add(root);
  const repo = join(root, 'repo');
  const init = spawnSync('git', ['init', '-q', repo], { encoding: 'utf8' });
  if (init.status !== 0) throw new Error(init.stderr);
  return { repo, env: { ...process.env, REPO_HARNESS_HOME: join(root, 'home') } };
}

function authorization(rounds = 2, runnerInvocations = 8): ProgramAuthorizationV1 {
  const issued = new Date(Date.now() - 60_000);
  const expires = new Date(Date.now() + 3_600_000);
  return sealProgramAuthorization({
    authorization_id: `campaign-authorization-${rounds}-${runnerInvocations}`,
    repository_id: 'campaign-budget-repo',
    target_ref: 'refs/heads/main',
    target_revision: hex('campaign-target'),
    work_graph_revision: hex('campaign-work-graph'),
    allowed_work_package_ids: [],
    allowed_risk_tiers: ['low'],
    merge_mode: 'disabled',
    allowed_merge_method: 'squash',
    max_repair_cycles: 2,
    budget: {
      max_agent_turns: 20,
      max_successful_acquisitions: 2,
      max_runner_invocations: runnerInvocations,
      max_provider_failures: 4,
      max_consecutive_no_progress_steps: 4,
      max_repair_cycles: 2,
      max_wall_clock_seconds: 1800,
      max_input_tokens: null,
      max_output_tokens: null,
      max_cost_micros: null,
    },
    contract_scope: 'contract_less',
    contract_path: null,
    campaign: {
      campaign_id: 'campaign-budget-test',
      group_count: 3,
      issues_per_group: 10,
      allowed_issue_kinds: ['bugfix', 'test_gap'],
      max_parallel_tasks: 3,
      max_authoring_rounds_per_group: rounds,
      issue_author: 'gpt_pro',
      local_parent_host: 'codex',
      chrome_profile_directory: 'Profile-1',
      require_fresh_main_audit: true,
    },
    issued_by: 'ancienttwo',
    issued_at: issued.toISOString(),
    expires_at: expires.toISOString(),
  });
}

function setup(rounds = 2, runnerInvocations = 8) {
  const { repo, env } = fixture();
  const grant = authorization(rounds, runnerInvocations);
  mintProgramAuthorization({ repo_root: repo, authorization: grant, env });
  const status = ensureCampaignAuthoringBudget({ repo_root: repo, authorization: grant, env });
  return { repo, env, grant, status };
}

function reserve(input: ReturnType<typeof setup>, key: string, operation: 'initial' | 'fill_missing' | 'edit_issue' | 'challenge') {
  return reserveCampaignAuthoringBudget({
    repo_root: input.repo,
    automation_run_id: input.status.budget.automation_run_id,
    expected_budget_sha256: input.status.budget.budget_sha256,
    campaign_id: 'campaign-budget-test',
    group_number: 1,
    intent_sha256: intent('group-1'),
    operation,
    idempotency_key: key,
    env: input.env,
  });
}

describe('campaign authoring budget prerequisite', () => {
  test('reads and reconciles the unchanged generic reservation wire kind', () => {
    const input = setup();
    const generic = reserveAutomationBudget({
      repo_root: input.repo,
      automation_run_id: input.status.budget.automation_run_id,
      expected_budget_sha256: input.status.budget.budget_sha256,
      idempotency_key: 'generic-acquisition',
      operation: 'acquisition',
      unit_kind: 'execute',
      unit_id: 'generic-work-package',
      attempt: 1,
      provider: null,
      env: input.env,
    });
    expect(generic.kind).toBe('repo-harness-automation-reservation');
    expect(Object.hasOwn(generic, 'campaign_context')).toBe(false);
    reconcileAutomationReservation({
      repo_root: input.repo,
      reservation: generic,
      resolution: 'reconciled_not_started',
      reason: 'the generic operation was proven not to have started',
      outcome: 'no_progress',
      evidence_refs: [{ ref: `controller-run:${input.status.budget.automation_run_id}`, sha256: hex('generic-not-started') }],
      env: input.env,
    });
    expect(readAutomationBudgetStatus(input.repo, input.status.budget.automation_run_id, input.env).current.open_reservation_sha256s)
      .toEqual([]);
  });

  test('admits bounded authoring, reports replay, seals exact evidence, and leaves challenge globally budgeted', () => {
    const input = setup();
    expect(ensureCampaignAuthoringBudget({ repo_root: input.repo, authorization: input.grant, env: input.env }).budget.automation_run_id)
      .toBe(input.status.budget.automation_run_id);

    expect(() => reserveAutomationBudget({
      repo_root: input.repo,
      automation_run_id: input.status.budget.automation_run_id,
      expected_budget_sha256: input.status.budget.budget_sha256,
      idempotency_key: 'generic-provider-bypass',
      operation: 'provider_invocation',
      unit_kind: 'execute',
      unit_id: 'campaign-budget-test:group:1',
      attempt: 1,
      provider: 'gpt-pro',
      env: input.env,
    })).toThrow('requires the campaign reservation kind');

    const first = reserve(input, 'authoring-initial', 'initial');
    expect(first.disposition).toBe('reserved');
    expect(reserve(input, 'authoring-initial', 'initial').disposition).toBe('replayed');
    expect(() => reserve(input, 'authoring-while-open', 'fill_missing')).toThrow('reconciliation_required');
    appendAutomationUsage({ repo_root: input.repo, reservation: first.reservation, outcome: 'completed', evidence_refs: [], env: input.env });

    const second = reserve(input, 'authoring-fill', 'fill_missing');
    appendAutomationUsage({ repo_root: input.repo, reservation: second.reservation, outcome: 'completed', evidence_refs: [], env: input.env });
    expect(() => reserve(input, 'authoring-over-cap', 'edit_issue')).toThrow('round limit is exhausted');

    const challenge = reserve(input, 'challenge-after-exhaustion', 'challenge');
    appendAutomationUsage({ repo_root: input.repo, reservation: challenge.reservation, outcome: 'completed', evidence_refs: [], env: input.env });

    const terminal = sealCampaignAuthoringBudget({
      repo_root: input.repo,
      automation_run_id: input.status.budget.automation_run_id,
      expected_budget_sha256: input.status.budget.budget_sha256,
      campaign_id: 'campaign-budget-test',
      group_number: 1,
      intent_sha256: intent('group-1'),
      reason: 'authoring_exhausted',
      env: input.env,
    });
    expect(terminal.completed_authoring_rounds).toBe(2);
    expect(verifyCampaignAuthoringBudgetTerminal({
      repo_root: input.repo,
      automation_run_id: input.status.budget.automation_run_id,
      expected_budget_sha256: input.status.budget.budget_sha256,
      campaign_id: 'campaign-budget-test',
      group_number: 1,
      intent_sha256: intent('group-1'),
      terminal,
      env: input.env,
    })).toEqual(terminal);
    expect(() => reserve(input, 'authoring-after-seal', 'edit_issue')).toThrow('permanently sealed');
    expect(readCampaignAuthoringBudgetTerminal({
      repo_root: input.repo,
      automation_run_id: input.status.budget.automation_run_id,
      expected_budget_sha256: input.status.budget.budget_sha256,
      campaign_id: 'campaign-budget-test',
      group_number: 1,
      intent_sha256: intent('group-1'),
      env: input.env,
    })).toEqual(terminal);
    const laterChallenge = reserve(input, 'challenge-after-seal', 'challenge');
    appendAutomationUsage({ repo_root: input.repo, reservation: laterChallenge.reservation, outcome: 'completed', evidence_refs: [], env: input.env });
    expect(() => readCampaignAuthoringBudgetTerminal({
      repo_root: input.repo,
      automation_run_id: input.status.budget.automation_run_id,
      expected_budget_sha256: input.status.budget.budget_sha256,
      campaign_id: 'campaign-budget-test',
      group_number: 1,
      intent_sha256: intent('group-1'),
      env: input.env,
    })).toThrow('stale automation ledger');
  });

  test('not-started reconciliation releases one replacement admission for the original request key', async () => {
    const input = setup(1);
    const pending = reserve(input, 'not-started-round', 'initial');
    expect(() => sealCampaignAuthoringBudget({
      repo_root: input.repo,
      automation_run_id: input.status.budget.automation_run_id,
      expected_budget_sha256: input.status.budget.budget_sha256,
      campaign_id: 'campaign-budget-test',
      group_number: 1,
      intent_sha256: intent('group-1'),
      reason: 'authoring_completed',
      env: input.env,
    })).toThrow('unresolved provider invocation');
    reconcileAutomationReservation({
      repo_root: input.repo,
      reservation: pending.reservation,
      resolution: 'reconciled_not_started',
      reason: 'provider process was proven not to have started',
      outcome: 'no_progress',
      evidence_refs: [{ ref: `provider-run:${input.status.budget.automation_run_id}`, sha256: hex('not-started-proof') }],
      env: input.env,
    });
    const storeModule = join(import.meta.dir, '..', '..', 'src', 'effects', 'automation', 'budget-store.ts');
    const invoke = () => Bun.spawn([
      process.execPath,
      '-e',
      `import { reserveCampaignAuthoringBudget } from ${JSON.stringify(storeModule)}; console.log(JSON.stringify(reserveCampaignAuthoringBudget(${JSON.stringify({
        repo_root: input.repo,
        automation_run_id: input.status.budget.automation_run_id,
        expected_budget_sha256: input.status.budget.budget_sha256,
        campaign_id: 'campaign-budget-test',
        group_number: 1,
        intent_sha256: intent('group-1'),
        operation: 'initial',
        idempotency_key: 'not-started-round',
      })})));`,
    ], { env: input.env, stdout: 'pipe', stderr: 'pipe' });
    const contenders = [invoke(), invoke()];
    expect(await Promise.all(contenders.map((process) => process.exited))).toEqual([0, 0]);
    const admissions = await Promise.all(contenders.map(async (process) => (
      JSON.parse(await new Response(process.stdout).text()) as ReturnType<typeof reserveCampaignAuthoringBudget>
    )));
    expect(admissions.map((admission) => admission.disposition).sort()).toEqual(['replayed', 'reserved']);
    expect(new Set(admissions.map((admission) => admission.reservation.reservation_sha256)).size).toBe(1);
    expect(admissions[0]!.reservation.attempt).toBe(2);
    expect(admissions[0]!.reservation.idempotency_key).not.toBe('not-started-round');
  });

  test('binds one deterministic run and one intent per campaign group', () => {
    const input = setup();
    const first = reserve(input, 'intent-binding', 'initial');
    appendAutomationUsage({ repo_root: input.repo, reservation: first.reservation, outcome: 'completed', evidence_refs: [], env: input.env });
    expect(() => reserveCampaignAuthoringBudget({
      repo_root: input.repo,
      automation_run_id: input.status.budget.automation_run_id,
      expected_budget_sha256: input.status.budget.budget_sha256,
      campaign_id: 'campaign-budget-test',
      group_number: 1,
      intent_sha256: intent('different-intent'),
      operation: 'fill_missing',
      idempotency_key: 'different-intent',
      env: input.env,
    })).toThrow('different issue-batch intent');

    const alternate = authorization(3);
    mintProgramAuthorization({ repo_root: input.repo, authorization: alternate, env: input.env });
    expect(() => ensureCampaignAuthoringBudget({ repo_root: input.repo, authorization: alternate, env: input.env }))
      .toThrow('deterministic authorization binding');
  });

  test('keeps a group sealed across revisions while rejecting the old terminal as current proof', () => {
    const input = setup(1);
    const admitted = reserve(input, 'revision-round', 'initial');
    appendAutomationUsage({ repo_root: input.repo, reservation: admitted.reservation, outcome: 'completed', evidence_refs: [], env: input.env });
    const terminal = sealCampaignAuthoringBudget({
      repo_root: input.repo,
      automation_run_id: input.status.budget.automation_run_id,
      expected_budget_sha256: input.status.budget.budget_sha256,
      campaign_id: 'campaign-budget-test',
      group_number: 1,
      intent_sha256: intent('group-1'),
      reason: 'authoring_exhausted',
      env: input.env,
    });
    const previous = input.status.budget;
    const revised = buildAutomationBudget({
      automation_run_id: previous.automation_run_id,
      goal_id: previous.goal_id,
      goal_revision: previous.goal_revision,
      repository_id: previous.repository_id,
      engineer_id: null,
      claim_id: null,
      authorization: previous.authorization,
      contract_sha256: null,
      contract_limits: null,
      metric_support: previous.metric_support,
      unattended: true,
      created_by: previous.created_by,
      created_at: new Date().toISOString(),
      supersedes_sha256: previous.budget_sha256,
      revision: 2,
    });
    publishAutomationBudget({ repo_root: input.repo, budget: revised, env: input.env });
    expect(() => readCampaignAuthoringBudgetTerminal({
      repo_root: input.repo,
      automation_run_id: revised.automation_run_id,
      expected_budget_sha256: revised.budget_sha256,
      campaign_id: 'campaign-budget-test',
      group_number: 1,
      intent_sha256: intent('group-1'),
      env: input.env,
    })).toThrow('stale budget revision');
    expect(() => reserveCampaignAuthoringBudget({
      repo_root: input.repo,
      automation_run_id: revised.automation_run_id,
      expected_budget_sha256: revised.budget_sha256,
      campaign_id: 'campaign-budget-test',
      group_number: 1,
      intent_sha256: intent('group-1'),
      operation: 'edit_issue',
      idempotency_key: 'revision-cannot-reopen',
      env: input.env,
    })).toThrow('permanently sealed');
    expect(terminal.budget_revision).toBe(1);
  });

  test('serializes two processes competing for the final group round', async () => {
    const input = setup(2);
    const first = reserve(input, 'race-primer', 'initial');
    appendAutomationUsage({ repo_root: input.repo, reservation: first.reservation, outcome: 'completed', evidence_refs: [], env: input.env });
    const storeModule = join(import.meta.dir, '..', '..', 'src', 'effects', 'automation', 'budget-store.ts');
    const invoke = (key: string) => Bun.spawn([
      process.execPath,
      '-e',
      `import { reserveCampaignAuthoringBudget } from ${JSON.stringify(storeModule)}; try { console.log(JSON.stringify(reserveCampaignAuthoringBudget(${JSON.stringify({
        repo_root: input.repo,
        automation_run_id: input.status.budget.automation_run_id,
        expected_budget_sha256: input.status.budget.budget_sha256,
        campaign_id: 'campaign-budget-test',
        group_number: 1,
        intent_sha256: intent('group-1'),
        operation: 'fill_missing',
        idempotency_key: key,
      })}))); } catch (error) { console.error(error.code ?? error.message); process.exit(1); }`,
    ], { env: input.env, stdout: 'pipe', stderr: 'pipe' });
    const contenders = [invoke('race-final-a'), invoke('race-final-b')];
    const exits = await Promise.all(contenders.map((process) => process.exited));
    const errors = await Promise.all(contenders.map((process) => new Response(process.stderr).text()));
    if (!exits.includes(0)) throw new Error(`both contenders failed: ${errors.join(' | ')}`);
    expect([...exits].sort()).toEqual([0, 1]);
    const winner = contenders[exits[0] === 0 ? 0 : 1];
    const output = await new Response(winner.stdout).text();
    const admission = JSON.parse(output) as ReturnType<typeof reserveCampaignAuthoringBudget>;
    expect(admission.disposition).toBe('reserved');
    appendAutomationUsage({ repo_root: input.repo, reservation: admission.reservation, outcome: 'completed', evidence_refs: [], env: input.env });
    expect(() => reserve(input, 'race-third', 'edit_issue')).toThrow('round limit is exhausted');
  });
});
