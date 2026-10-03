import { fixtureTemplate } from '../helpers/repo-fixture';
import { AUTOMATION_TEST_CLOCK_SEAM_ENV, __resetAutomationClockForTests, __setAutomationClockForTests } from '../../src/effects/automation/budget-store.internal';
import { afterAll, afterEach, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { historicalPlanningFixture, installHistoricalBoundDispatch, installHistoricalAttempt, prepareHistoricalCodexInvocation, installHistoricalChild, installHistoricalFinal } from '../helpers/historical-campaign-lifecycle';
import { assertStoppedAdoptedResumeEligible, readAdoptedResumeSource } from '../../src/effects/automation/campaign-authoring-resume';
import { readSettledFailedCampaignDispatches, bindCampaignWorker } from '../../src/effects/automation/campaign-worker';
import { retireCampaignDispatch } from '../../src/effects/automation/campaign-recovery';
import { createDevelopmentCampaign, appendDevelopmentCampaignEvent, readDevelopmentCampaignStatus } from '../../src/effects/automation/development-campaign-store';
import { ensureCampaignAuthoringBudget, reserveAutomationBudget, appendAutomationUsage, readAutomationBudgetStatus } from '../../src/effects/automation/budget-store';
import { processSprintDependencies, releaseSprintCommand } from '../../src/effects/state/coordination-sprint';
import { readLease } from '../../src/effects/state/coordination-lease-store';
import { campaignRuntimeRecordKey } from '../../src/core/automation/campaign-runtime';
import { canonicalMessageDigest } from '../../src/core/messages/mechanics';
import { issueBatchGroupStoreRoot, readIssueBatchAdoptionArtifact } from '../../src/effects/automation/issue-batch-store';

import { sealProgramAuthorization } from '../../src/core/automation/budget';
import { buildDevelopmentCampaignDefinition } from '../../src/core/automation/development-campaign';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { startIssueBatchAuthoring } from '../../src/effects/automation/gpt-pro-issue-authoring';
import { observeVerifiedFixtureRevision } from '../helpers/campaign-adoption-repository';
import { campaignBrowserMetadata } from '../helpers/campaign-browser-session';

const roots: string[] = [];
const templates = fixtureTemplate(historicalPlanningFixture);
afterAll(() => templates.dispose());
afterEach(() => { for (const root of roots.splice(0).reverse()) rmSync(root, { recursive: true, force: true }); });
const sha = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
async function fixture(mode = 'settled') {
  const f = await templates.materialize(false, false, undefined, true, {}, false, false, true);
  roots.push(f.root, f.home);
  const d = installHistoricalBoundDispatch(f); roots.push(d.envelope.worktree_path);
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env }).budget;
  const reservation = reserveAutomationBudget({ repo_root: f.root, automation_run_id: budget.automation_run_id,
    expected_budget_sha256: budget.budget_sha256, idempotency_key: 'fixture-acquisition', operation: 'acquisition', unit_kind: 'execute', unit_id: 'fixture', attempt: 1, provider: null, env: f.env });
  appendAutomationUsage({ repo_root: f.root, reservation, outcome: 'progress', evidence_refs: [], env: f.env });
  mkdirSync(join(f.root, '.codex/agents'), { recursive: true });
  for (const profile of ['fast-worker', 'gatekeeper']) writeFileSync(join(f.root, `.codex/agents/${profile}.toml`), readFileSync(join(import.meta.dir, `../../.codex/agents/${profile}.toml`)));
  const attempt = installHistoricalAttempt(f, d);
  const worktree = d.envelope.worktree_path;
  for (const role of ['worker', 'verifier'] as const) {
    writeFileSync(join(worktree, `${role}.prompt`), 'Model-free settled execution fixture');
    const invocation = await prepareHistoricalCodexInvocation({ repo_root: f.root, worktree, prompt_path: `${role}.prompt`, deadline_ms: Date.now() + 60000,
      identity: { dispatch_id: d.worker_handoff.dispatch_id, role, task_id: d.envelope.task_id, task_revision: d.envelope.task_revision,
        claim_id: d.envelope.claim_id, lease_generation: d.envelope.generation, binding_generation: d.acquired.offer.binding_generation } });
    roots.push(invocation.container.directory, invocation.probe.container.directory);
    const text = role === 'worker' ? 'external environment blocked' : JSON.stringify({ verdict: 'fail', review: 'Required environment unavailable' });
    const stdout = [{ type: 'thread.started', thread_id: 'model-free' }, { type: 'item.completed', item: { id: 'result', type: 'agent_message', text } },
      { type: 'turn.completed', usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 } }].map(v => JSON.stringify(v)).join('\n') + '\n';
    writeFileSync(join(worktree, `${role}.out`), stdout); writeFileSync(join(worktree, `${role}.err`), '');
    const terminal = installHistoricalChild(f, d, invocation, { role, command: `codex-exec:${role}`, stdout_path: `${role}.out`, stderr_path: `${role}.err`,
      exit_code: 0, output_complete: true, output_sha256: { stdout: sha(stdout), stderr: sha('') }, termination_cause: 'completed', started: true });
    expect(terminal.runtime_effect_inactive, JSON.stringify(terminal)).toBe(true);
  }
  writeFileSync(join(worktree, 'blocked.txt'), 'environment blocked');
  writeFileSync(join(worktree, 'final.json'), JSON.stringify({ outcome: mode === 'completed' ? 'completed' : 'external_blocked', evidence_paths: ['blocked.txt'] }));
  installHistoricalFinal(f, d, attempt, 'final.json', mode !== 'unsettled', mode === 'completed' ? { status: 'pass', failure_class: null } : { status: 'fail', failure_class: 'verifier_rejected' });
  if (mode !== 'unretired') retireCampaignDispatch({ selector: d.worker_handoff, host: f.executeInput.host, session_id: f.executeInput.session_id, env: f.env });
  if (mode !== 'held') expect(releaseSprintCommand({ claimId: d.envelope.claim_id }, processSprintDependencies(f.root)).exitCode).toBe(0);
  const status = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env);
  appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: f.intent.campaign_id, expected_current_sha256: status.current.current_sha256,
    operation: 'stop', idempotency_key: 'fixture-stop', observed_at: new Date().toISOString(), env: f.env });
  return { ...f, d, budget, attempt, worktree };
}

test('stopped adopted failed execution is eligible without changing its counters, claim or dispatch', async () => {
  const f = await fixture();
  const before = readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env);
  expect(before.current.consumed.successful_acquisitions).toBe(1);
  expect(() => assertStoppedAdoptedResumeEligible(f.root, f.intent, f.env)).not.toThrow();
  expect(readSettledFailedCampaignDispatches(f.root, f.intent, 1, f.env)).toHaveLength(1);
  expect(readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env)).toEqual(before);
  expect(readLease(f.root, f.d.envelope.task_id).classification).toBe('available');
  expect(() => bindCampaignWorker({ selector: f.d.worker_handoff, worktree: f.worktree, contract: f.d.envelope.plan.contract_path,
    worker_command: 'codex-exec:worker', verifier_command: 'codex-exec:verifier', provider: 'codex-exec', env: f.env })).toThrow();
}, 60000);

for (const mode of ['unretired', 'held', 'completed', 'missing-final', 'missing-terminal', 'unsettled', 'altered-output', 'inventory'] as const) test(`settled resume rejects ${mode}`, async () => {
  const f = await fixture(mode);
  if (mode === 'missing-final') rmSync(join(issueBatchGroupStoreRoot(f.root, f.intent.campaign_id, 1), 'planning', canonicalMessageDigest({ dispatch: f.d.worker_handoff.dispatch_id, part: 'final' }).slice(7) + '.json'));
  if (mode === 'missing-terminal') rmSync(join(issueBatchGroupStoreRoot(f.root, f.intent.campaign_id, 1), 'planning', campaignRuntimeRecordKey(f.d.worker_handoff.dispatch_id, 'verifier', 'terminal') + '.json'));
  if (mode === 'altered-output') writeFileSync(join(f.worktree, 'worker.out'), 'substituted');
  if (mode === 'inventory') {
    const reservation = reserveAutomationBudget({ repo_root: f.root, automation_run_id: f.budget.automation_run_id,
      expected_budget_sha256: f.budget.budget_sha256, idempotency_key: 'unaccounted-acquisition', operation: 'acquisition', unit_kind: 'execute', unit_id: 'fixture', attempt: 1, provider: null, env: f.env });
    appendAutomationUsage({ repo_root: f.root, reservation, outcome: 'progress', evidence_refs: [], env: f.env });
  }
  expect(() => assertStoppedAdoptedResumeEligible(f.root, f.intent, f.env)).toThrow();
  expect(readIssueBatchAdoptionArtifact(f.root, f.intent, 'continuation')).toBeNull();
}, 60000);


test('actual author admission binds one fresh continuation after settled failure and preserves original Issue identities', async () => {
  const f = await fixture();
  const original = readAdoptedResumeSource(f.root, f.intent);
  const resume = { campaign_id: f.intent.campaign_id, group_number: f.intent.group_number, intent_sha256: f.intent.intent_sha256,
    source_session_ref: original.source_session_ref, issues: original.issues };
  const before = readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env);
  const readBinding = () => ({ path: 'fixture', binding: { profileDir: f.home, profileDirectory: 'Profile 1' } });
  const next = async (id: string) => {
    const authorization = sealProgramAuthorization({ ...f.authorization, authorization_id: id,
      target_revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.root, encoding: 'utf8' }).trim(),
      allowed_work_package_ids: [id], campaign: { ...f.authorization.campaign!, campaign_id: id } });
    mintProgramAuthorization({ repo_root: f.root, authorization, env: f.env });
    const campaign = buildDevelopmentCampaignDefinition({ campaign_id: id, authorization_id: id, authorization_sha256: authorization.authorization_sha256,
      repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: authorization.target_revision, created_at: new Date().toISOString() });
    const created = createDevelopmentCampaign({ repo_root: f.root, campaign, idempotency_key: 'start', env: f.env });
    appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: id, expected_current_sha256: created.current.current_sha256,
      idempotency_key: 'prepare', operation: 'prepare_group', observed_at: new Date().toISOString(), env: f.env });
    await observeVerifiedFixtureRevision({ root: f.root, authorization, env: f.env, readBinding });
    return { repo_root: f.root, campaign_id: id, group_number: 1, env: f.env, resume_from: resume };
  };
  let calls = 0;
  const deps = { readBinding, consult: async () => { calls++; return { sessionId: 'settled-resume-author', status: 'completed' as const,
    meta: campaignBrowserMetadata({ sessionId: 'settled-resume-author', repoRoot: f.root, profileDir: f.home, profileDirectory: 'Profile 1' }) }; } };
  const started = await startIssueBatchAuthoring(await next('settled-resume'), deps);
  expect(calls).toBe(1);
  expect(readIssueBatchAdoptionArtifact(f.root, started.intent, 'resume-source')?.issues).toEqual(original.issues);
  expect(readIssueBatchAdoptionArtifact(f.root, f.intent, 'continuation')?.intent_sha256).toBe(started.intent.intent_sha256);
  await expect(startIssueBatchAuthoring(await next('competing-resume'), deps)).rejects.toThrow();
  expect(calls).toBe(1);
  expect(readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env)).toEqual(before);
}, 60000);


test('settlement proof lookup never repairs predecessor budget after its deadline', async () => {
  const f = await fixture();
  const previous = process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV];
  process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV] = '1';
  __setAutomationClockForTests(() => new Date(Date.parse(f.budget.deadline_at) + 60_000));
  try {
    const before = readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env);
    expect(before.drift).toBe('unsealed_exhaustion');
    expect(readSettledFailedCampaignDispatches(f.root, f.intent, 1, f.env)).toHaveLength(1);
    expect(readAutomationBudgetStatus(f.root, f.budget.automation_run_id, f.env)).toEqual(before);
    expect(() => assertStoppedAdoptedResumeEligible(f.root, f.intent, f.env)).toThrow('reconciled');
  } finally {
    __resetAutomationClockForTests();
    if (previous === undefined) delete process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV];
    else process.env[AUTOMATION_TEST_CLOCK_SEAM_ENV] = previous;
  }
}, 60000);
