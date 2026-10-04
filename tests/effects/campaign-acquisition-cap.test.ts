import { fixtureTemplate } from '../helpers/repo-fixture';
import { afterAll, test, expect } from 'bun:test';
import { rmSync } from 'node:fs';
import { createAdoptionRepository } from '../helpers/campaign-adoption-repository';
import { ensureCampaignAuthoringBudget, reserveCampaignAuthoringBudget, reserveAutomationBudget, appendAutomationUsage, readAutomationBudgetStatus, AutomationBudgetStoreError } from '../../src/effects/automation/budget-store';

const templates = fixtureTemplate(createAdoptionRepository);
afterAll(() => templates.dispose());

test('campaign at acquisition cap rejects new acquisition without stopping acquired work', async () => {
  const f = await templates.materialize('active', 2, undefined, {}, {}, { max_successful_acquisitions: 1 });
  f.resetCalls();
  try {
    const { budget } = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env });
    const common = { repo_root: f.root, automation_run_id: budget.automation_run_id, expected_budget_sha256: budget.budget_sha256, unit_kind: 'execute' as const, unit_id: 'acquired-task', attempt: 1, provider: null, env: f.env };
    const acquisition = reserveAutomationBudget({ ...common, idempotency_key: 'acquire-1', operation: 'acquisition' });
    const charged = appendAutomationUsage({ repo_root: f.root, reservation: acquisition, outcome: 'progress', evidence_refs: [], env: f.env });
    expect(charged.current.consumed.successful_acquisitions).toBe(1);
    expect(charged.current.state).toBe('active');
    expect(charged.stop_receipt).toBeNull();
    const before = readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env);
    let error: unknown;
    try { reserveAutomationBudget({ ...common, idempotency_key: 'acquire-2', operation: 'acquisition' }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AutomationBudgetStoreError);
    expect((error as AutomationBudgetStoreError).refusal?.metric).toBe('successful_acquisitions');
    const refused = readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env);
    expect(refused.current.current_sha256).toBe(before.current.current_sha256);
    expect(refused.stop_receipt).toBeNull();
    for (const key of ['worker', 'verifier']) {
      const reservation = reserveAutomationBudget({ ...common, idempotency_key: key, operation: 'dispatch_attempt' });
      const result = appendAutomationUsage({ repo_root: f.root, reservation, outcome: 'progress', evidence_refs: [], env: f.env });
      expect(result.current.state).toBe('active');
      expect(result.current.consumed.successful_acquisitions).toBe(1);
    }
    const provider = reserveCampaignAuthoringBudget({ repo_root: f.root, automation_run_id: budget.automation_run_id,
      expected_budget_sha256: budget.budget_sha256, campaign_id: f.intent.campaign_id, group_number: 1,
      intent_sha256: f.intent.intent_sha256, operation: 'fill_missing', idempotency_key: 'completion-observation', env: f.env });
    const observed = appendAutomationUsage({ repo_root: f.root, reservation: provider.reservation, outcome: 'progress', evidence_refs: [], env: f.env });
    expect(observed.current.state).toBe('active');
    const final = readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env);
    expect(final.drift).toBe('none');
    expect(final.current.open_reservation_sha256s).toEqual([]);
    expect(final.budget.budget_sha256).toBe(budget.budget_sha256);
  } finally { rmSync(f.root, { recursive: true, force: true }); rmSync(f.home, { recursive: true, force: true }); }
});


test('campaign acquisition cap does not suppress runner exhaustion or reopen its stop receipt', async () => {
  const f = await templates.materialize('active', 2, undefined, {}, {}, { max_successful_acquisitions: 1, max_runner_invocations: 3 });
  f.resetCalls();
  try {
    const { budget } = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env });
    const common = { repo_root: f.root, automation_run_id: budget.automation_run_id, expected_budget_sha256: budget.budget_sha256, unit_kind: 'execute' as const, unit_id: 'acquired-task', attempt: 1, provider: null, env: f.env };
    for (const operation of ['acquisition', 'dispatch_attempt'] as const) {
      const reservation = reserveAutomationBudget({ ...common, idempotency_key: operation, operation });
      appendAutomationUsage({ repo_root: f.root, reservation, outcome: 'progress', evidence_refs: [], env: f.env });
    }
    const stopped = readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env);
    expect(stopped.current.state).toBe('budget_exhausted');
    expect(stopped.stop_receipt?.triggering_metric).toBe('runner_invocations');
    expect(stopped.current.consumed.successful_acquisitions).toBe(1);
    expect(() => reserveAutomationBudget({ ...common, idempotency_key: 'after-stop', operation: 'dispatch_attempt' })).toThrow('budget_exhausted');
    expect(readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env).stop_receipt).toEqual(stopped.stop_receipt);
  } finally { rmSync(f.root, { recursive: true, force: true }); rmSync(f.home, { recursive: true, force: true }); }
});
