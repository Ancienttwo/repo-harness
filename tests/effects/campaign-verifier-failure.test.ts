import { fixtureTemplate } from '../helpers/repo-fixture';
import { afterAll, afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { historicalPlanningFixture, installHistoricalBoundDispatch, installHistoricalAttempt, prepareHistoricalCodexInvocation, installHistoricalChild } from '../helpers/historical-campaign-lifecycle';
import { settleObservedCampaignFailure, bindCampaignWorker } from '../../src/effects/automation/campaign-worker';
import { retireCampaignDispatch } from '../../src/effects/automation/campaign-recovery';
import { assertStoppedAdoptedResumeEligible } from '../../src/effects/automation/campaign-authoring-resume';
import { ensureCampaignAuthoringBudget, reserveAutomationBudget, appendAutomationUsage, readAutomationBudgetStatus } from '../../src/effects/automation/budget-store';
import { readDevelopmentCampaignStatus, appendDevelopmentCampaignEvent } from '../../src/effects/automation/development-campaign-store';
import { processSprintDependencies, releaseSprintCommand } from '../../src/effects/state/coordination-sprint';
import { readLease } from '../../src/effects/state/coordination-lease-store';

const roots: string[] = [];
const templates = fixtureTemplate(historicalPlanningFixture);
afterAll(() => templates.dispose());
afterEach(() => { for (const root of roots.splice(0).reverse()) rmSync(root, { recursive: true, force: true }); });
const sha = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
async function fixture(mode = 'fail') {
  const f = await templates.materialize(false, false, undefined, true, {}, false, false, true);
  roots.push(f.root, f.home);
  const d = installHistoricalBoundDispatch(f); roots.push(d.envelope.worktree_path);
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env }).budget;
  const acquisition = reserveAutomationBudget({ repo_root: f.root, automation_run_id: budget.automation_run_id,
    expected_budget_sha256: budget.budget_sha256, idempotency_key: 'fixture-acquisition', operation: 'acquisition', unit_kind: 'execute', unit_id: 'fixture', attempt: 1, provider: null, env: f.env });
  appendAutomationUsage({ repo_root: f.root, reservation: acquisition, outcome: 'progress', evidence_refs: [], env: f.env });
  mkdirSync(join(f.root, '.codex/agents'), { recursive: true });
  for (const profile of ['fast-worker', 'gatekeeper']) writeFileSync(join(f.root, `.codex/agents/${profile}.toml`), readFileSync(join(import.meta.dir, `../../.codex/agents/${profile}.toml`)));
  installHistoricalAttempt(f, d);
  const worktree = d.envelope.worktree_path;
  for (const role of ['worker', 'verifier'] as const) {
    if (mode === `missing-${role}`) continue;
    writeFileSync(join(worktree, `${role}.prompt`), 'Model-free verifier failure fixture');
    const invocation = await prepareHistoricalCodexInvocation({ repo_root: f.root, worktree, prompt_path: `${role}.prompt`, deadline_ms: Date.now() + 60000,
      identity: { dispatch_id: d.worker_handoff.dispatch_id, role, task_id: d.envelope.task_id, task_revision: d.envelope.task_revision,
        claim_id: d.envelope.claim_id, lease_generation: d.envelope.generation, binding_generation: d.acquired.offer.binding_generation } });
    roots.push(invocation.container.directory, invocation.probe.container.directory);
    const text = role === 'worker' ? 'Cannot execute within the supplied scope.' : mode === 'malformed' ? 'fail' : JSON.stringify({ verdict: mode === 'pass' ? 'pass' : 'fail', review: 'The required change and verification are absent.' });
    const stdout = [{ type: 'thread.started', thread_id: 'model-free' }, { type: 'item.completed', item: { id: 'result', type: 'agent_message', text } },
      ...(mode === 'unknown' && role === 'worker' ? [] : [{ type: 'turn.completed', usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 } }])].map(v => JSON.stringify(v)).join('\n') + '\n';
    writeFileSync(join(worktree, `${role}.out`), stdout); writeFileSync(join(worktree, `${role}.err`), '');
    installHistoricalChild(f, d, invocation, { role, command: `codex-exec:${role}`, stdout_path: `${role}.out`, stderr_path: `${role}.err`,
      exit_code: 0, output_complete: true, output_sha256: { stdout: sha(stdout), stderr: sha('') }, termination_cause: 'completed', started: true });
  }
  retireCampaignDispatch({ selector: d.worker_handoff, host: f.executeInput.host, session_id: f.executeInput.session_id, env: f.env });
  return { ...f, d, budget, worktree };
}

test('exact verifier rejection settles a retired attempt without a worker result and permits only a fresh stopped continuation', async () => {
  const f = await fixture();
  const owner = readLease(f.root, f.d.envelope.task_id);
  const final = settleObservedCampaignFailure(f.d.worker_handoff, f.env);
  expect(final).not.toBeNull();
  expect(final!.contract_run).toEqual({ status: 'fail', failure_class: 'verifier_rejected' });
  expect(final!.outcome).toBe('permanent_failure');
  expect(existsSync(join(f.worktree, 'campaign-attempt-result.json'))).toBe(false);
  expect(readLease(f.root, f.d.envelope.task_id)).toEqual(owner);
  const budget = readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env);
  expect(budget.current.open_reservation_sha256s).toHaveLength(0);
  expect(budget.current.consumed.successful_acquisitions).toBe(1);
  expect(settleObservedCampaignFailure(f.d.worker_handoff, f.env)).toEqual(final);
  expect(readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env)).toEqual(budget);
  expect(bindCampaignWorker({ selector: f.d.worker_handoff, worktree: f.worktree, contract: f.d.envelope.plan.contract_path,
    worker_command: 'codex-exec:worker', verifier_command: 'codex-exec:verifier', provider: 'codex-exec', env: f.env }).replay).toEqual(final);
  const current = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env).current;
  appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: f.intent.campaign_id, expected_current_sha256: current.current_sha256,
    operation: 'stop', idempotency_key: 'fixture-stop', observed_at: new Date().toISOString(), env: f.env });
  expect(() => assertStoppedAdoptedResumeEligible(f.root, f.intent, f.env)).toThrow();
  expect(releaseSprintCommand({ claimId: f.d.envelope.claim_id }, processSprintDependencies(f.root)).exitCode).toBe(0);
  expect(() => assertStoppedAdoptedResumeEligible(f.root, f.intent, f.env)).not.toThrow();
  expect(readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env)).toEqual(budget);
}, 60000);

for (const mode of ['pass', 'missing-worker', 'missing-verifier', 'unknown', 'malformed', 'altered-worker', 'altered-verifier']) test(`verifier-only settlement refuses ${mode} without charging`, async () => {
  const f = await fixture(mode);
  if (mode.startsWith('altered-')) writeFileSync(join(f.worktree, `${mode.slice(8)}.out`), 'substituted output');
  const before = readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env);
  if (mode === 'malformed' || mode.startsWith('altered-')) expect(() => settleObservedCampaignFailure(f.d.worker_handoff, f.env)).toThrow();
  else expect(settleObservedCampaignFailure(f.d.worker_handoff, f.env)).toBeNull();
  expect(readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env)).toEqual(before);
}, 60000);
