import * as revisionAdmission from '../../src/effects/automation/campaign-revision-admission';
import * as campaignRuntime from '../../src/effects/automation/campaign-runtime';
import { afterAll, afterEach, expect, test, spyOn } from 'bun:test';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { historicalPlanningFixture, installHistoricalBoundDispatch, installHistoricalAttempt, installHistoricalFinal } from '../helpers/historical-campaign-lifecycle';
import { fixtureTemplate } from '../helpers/repo-fixture';
import { ensureCampaignAuthoringBudget, readAutomationBudgetStatus, appendAutomationUsage, readAutomationUsageForResult } from '../../src/effects/automation/budget-store';
import { bindCampaignWorker, createCampaignWorkerHandoff } from '../../src/effects/automation/campaign-worker';
import { recoverCampaignDispatch } from '../../src/effects/automation/campaign-recovery';
import { readTaskAutomationAttemptCurrent } from '../../src/effects/engineers/automation-attempt-store';
import { readPlanningRecord } from '../../src/effects/automation/campaign-planning-store';
import { issueBatchGroupStoreRoot } from '../../src/effects/automation/issue-batch-store';
import { canonicalMessageBytes, canonicalMessageDigest } from '../../src/core/messages/mechanics';
import { processSprintDependencies, releaseSprintCommand } from '../../src/effects/state/coordination-sprint';
import { readLease } from '../../src/effects/state/coordination-lease-store';
import { campaignRuntimeRecordKey } from '../../src/core/automation/campaign-runtime';
import { campaignContainerDirectory } from '../../src/effects/automation/campaign-container';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
const roots: string[] = [];
const templates = fixtureTemplate(historicalPlanningFixture);
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
afterAll(() => templates.dispose());
async function acquired() {
  const f = await templates.materialize(); roots.push(f.root, f.home);
  const result = installHistoricalBoundDispatch(f);
  return { ...f, result, worktree: result.envelope.worktree_path };
}
function workerInput(f: Awaited<ReturnType<typeof acquired>>) {
  return { selector: f.result.worker_handoff, worktree: f.worktree, contract: f.result.envelope.plan.contract_path,
    worker_command: 'worker', verifier_command: 'verifier', env: f.env };
}
function budgetStatus(f: Awaited<ReturnType<typeof acquired>>) {
  const budget = ensureCampaignAuthoringBudget({ repo_root: f.root, authorization: f.authorization, env: f.env }).budget;
  return readAutomationBudgetStatus(f.root, budget.automation_run_id, f.env).current;
}

test('pre-journal preparation failure can retry without extending its deadline or charging an attempt', async () => {
  const f = await acquired(); const before = budgetStatus(f);
  const admission = spyOn(revisionAdmission, 'requireCampaignActiveAdmission').mockImplementation(() => {});
  const calls: number[] = [];
  const prepare = spyOn(campaignRuntime, 'prepareCampaignCodexInvocation').mockImplementation(async input => {
    calls.push(input.deadline_ms);
    throw new Error('Docker context transport unavailable before journal creation');
  });
  const previousHome = process.env.REPO_HARNESS_HOME;
  process.env.REPO_HARNESS_HOME = f.home;
  try {
    const worker = bindCampaignWorker({ ...workerInput(f), provider: 'codex-exec' });
    const deadline = Date.now() + 30000;
    await expect(worker.prepareChild('worker', 'prompt.md', deadline)).rejects.toThrow('transport unavailable');
    const recordKey = campaignRuntimeRecordKey(f.result.worker_handoff.dispatch_id, 'worker', 'preparation');
    const original = readPlanningRecord<campaignRuntime.CampaignCodexPreparation>(f.root, f.intent, recordKey);
    expect(original).not.toBeNull();
    await expect(worker.prepareChild('worker', 'prompt.md', deadline + 30000)).rejects.toThrow('transport unavailable');
    expect(calls).toEqual([deadline, deadline]);
    expect(readPlanningRecord<campaignRuntime.CampaignCodexPreparation>(f.root, f.intent, recordKey)).toEqual(original);
    expect(budgetStatus(f)).toEqual(before);
    expect(readPlanningRecord(f.root, f.intent, canonicalMessageDigest({ dispatch: f.result.worker_handoff.dispatch_id, part: 'launch' }).slice(7))).toBeNull();
    expect(readPlanningRecord(f.root, f.intent, campaignRuntimeRecordKey(f.result.worker_handoff.dispatch_id, 'worker', 'intent'))).toBeNull();
    await expect(worker.prepareChild('worker', 'prompt.md', deadline - 1)).rejects.toThrow('deadline');
    expect(calls).toHaveLength(2);
  } finally {
    admission.mockRestore(); prepare.mockRestore();
    if (previousHome === undefined) delete process.env.REPO_HARNESS_HOME; else process.env.REPO_HARNESS_HOME = previousHome;
  }
});

test.each(['version', 'worker'] as const)('an existing %s journal blocks preparation retry before any provider call', async phase => {
  const f = await acquired();
  const admission = spyOn(revisionAdmission, 'requireCampaignActiveAdmission').mockImplementation(() => {});
  const prepare = spyOn(campaignRuntime, 'prepareCampaignCodexInvocation').mockRejectedValue(new Error('pre-journal failure'));
  const previousHome = process.env.REPO_HARNESS_HOME;
  process.env.REPO_HARNESS_HOME = f.home;
  try {
    const worker = bindCampaignWorker({ ...workerInput(f), provider: 'codex-exec' });
    const deadline = Date.now() + 30000;
    await expect(worker.prepareChild('worker', 'prompt.md', deadline)).rejects.toThrow('pre-journal failure');
    const stored = readPlanningRecord<campaignRuntime.CampaignCodexPreparation>(f.root, f.intent,
      campaignRuntimeRecordKey(f.result.worker_handoff.dispatch_id, 'worker', 'preparation'))!;
    const common = resolveGitCommonDirectory(f.worktree);
    const directory = campaignContainerDirectory(common, phase === 'version' ? { ...stored.identity, phase } : stored.identity);
    mkdirSync(directory);
    await expect(worker.prepareChild('worker', 'prompt.md', deadline)).rejects.toThrow('journal');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(existsSync(directory)).toBe(true);
  } finally {
    admission.mockRestore(); prepare.mockRestore();
    if (previousHome === undefined) delete process.env.REPO_HARNESS_HOME; else process.env.REPO_HARNESS_HOME = previousHome;
  }
});

test('historical Claim cannot authorize a new handoff, launch, reservation or attempt', async () => {
  const f = await acquired(); const before = budgetStatus(f);
  expect(() => createCampaignWorkerHandoff(f.executeInput, f.result.acquired)).toThrow('trusted exact revision readback');
  expect(() => bindCampaignWorker(workerInput(f))).toThrow('trusted exact revision readback');
  expect(budgetStatus(f)).toEqual(before);
  expect(readTaskAutomationAttemptCurrent(f.root, f.result.acquired.offer.work_package_id, f.result.acquired.offer.work_package_revision)).toBeNull();
  expect(readPlanningRecord(f.root, f.intent, canonicalMessageDigest({ dispatch: f.result.worker_handoff.dispatch_id, part: 'launch' }).slice(7))).toBeNull();
});

test('real contract-run refuses before executing either child', async () => {
  const f = await acquired();
  writeFileSync(join(f.worktree, 'selector.json'), JSON.stringify(f.result.worker_handoff));
  const before = budgetStatus(f);
  const run = spawnSync(process.execPath, [join(import.meta.dir, '../../scripts/contract-run.ts'), 'run', '--repo', f.worktree,
    '--contract', f.result.envelope.plan.contract_path, '--campaign-handoff', 'selector.json', '--worker-command', 'touch forbidden-worker',
    '--verifier-command', 'touch forbidden-verifier', '--out', '.ai/harness/refused', '--json'], { cwd: f.worktree, env: f.env, encoding: 'utf8' });
  expect(run.status, run.stdout + run.stderr).not.toBe(0);
  expect(run.stdout + run.stderr).toContain('trusted exact revision readback');
  expect(existsSync(join(f.worktree, 'forbidden-worker'))).toBe(false);
  expect(existsSync(join(f.worktree, 'forbidden-verifier'))).toBe(false);
  expect(budgetStatus(f)).toEqual(before);
});

test('stale Lease and altered selector or contract still fail before admission', async () => {
  const f = await acquired(); const input = workerInput(f);
  expect(() => bindCampaignWorker({ ...input, selector: { ...f.result.worker_handoff, dispatch_id: `sha256:${'0'.repeat(64)}` } })).toThrow('not stored');
  const path = join(f.worktree, input.contract); const original = readFileSync(path);
  writeFileSync(path, Buffer.concat([original, Buffer.from('\nUnauthorized contract change\n')]));
  expect(() => bindCampaignWorker(input)).toThrow('contract changed');
  writeFileSync(path, original);
  expect(() => bindCampaignWorker(input)).toThrow('trusted exact revision readback');
  expect(releaseSprintCommand({ claimId: f.result.envelope.claim_id }, processSprintDependencies(f.root)).exitCode).toBe(0);
  expect(() => bindCampaignWorker(input)).toThrow();
});

test('historical launch without final keeps its reservation and refuses replay or changed commands', async () => {
  const f = await acquired(); installHistoricalAttempt(f, f.result, null);
  const before = budgetStatus(f);
  expect(before.open_reservation_sha256s).toHaveLength(1);
  expect(() => bindCampaignWorker(workerInput(f))).toThrow('reconciliation');
  expect(() => bindCampaignWorker({ ...workerInput(f), worker_command: 'other' })).toThrow('changes its launch request');
  expect(budgetStatus(f)).toEqual(before);
});

test.each(['completed', 'not_reproducible', 'transient_failure'] as const)('persisted %s final settles once and replay cannot prepare, renew or spawn', async outcome => {
  const f = await acquired(); const attempt = installHistoricalAttempt(f, f.result, null);
  writeFileSync(join(f.worktree, 'final.json'), JSON.stringify({ outcome, evidence_paths: ['src/index.ts'] }));
  const final = installHistoricalFinal(f, f.result, attempt, 'final.json', false);
  expect(budgetStatus(f).open_reservation_sha256s).toHaveLength(1);
  const recovered = bindCampaignWorker(workerInput(f));
  expect(recovered.replay).toEqual(final);
  expect(budgetStatus(f).open_reservation_sha256s).toHaveLength(0);
  const settled = budgetStatus(f);
  expect(() => recovered.beforeChild('worker', 'worker')).toThrow('cannot spawn');
  await expect(recovered.prepareChild('worker', 'prompt.md', Date.now() + 1000)).rejects.toThrow('cannot prepare');
  expect(() => recovered.renew()).toThrow('cannot renew');
  expect(bindCampaignWorker(workerInput(f)).replay).toEqual(final);
  expect(budgetStatus(f)).toEqual(settled);
  expect(readTaskAutomationAttemptCurrent(f.root, f.result.acquired.offer.work_package_id, f.result.acquired.offer.work_package_revision)?.last_outcome).toBe(outcome);
});

test('historical settled transient final consumes its original charge, not recalculated policy', async () => {
  const f = await acquired(); const attempt = installHistoricalAttempt(f, f.result, null);
  writeFileSync(join(f.worktree, 'final.json'), JSON.stringify({ outcome: 'transient_failure', evidence_paths: ['src/index.ts'] }));
  const final = installHistoricalFinal(f, f.result, attempt, 'final.json', false);
  // This is the pre-BRC9 persisted charge for the same final and result identity.
  appendAutomationUsage({ repo_root: f.root, reservation: final.reservation, outcome: 'no_progress',
    evidence_refs: [{ ref: `campaign-worker:${f.result.worker_handoff.dispatch_id}:result`, sha256: final.result_sha256 }], env: f.env });
  const before = budgetStatus(f);
  expect(() => readAutomationUsageForResult({ repo_root: f.root, reservation: final.reservation,
    evidence_refs: [{ ref: `campaign-worker:${f.result.worker_handoff.dispatch_id}:result`, sha256: '0'.repeat(64) }], env: f.env })).toThrow('exact observed result');
  expect(bindCampaignWorker(workerInput(f)).replay).toEqual(final);
  expect(budgetStatus(f)).toEqual(before);
  expect(before.consumed.provider_failures).toBe(0);
});

test.each(['reservation', 'result'] as const)('recovery rejects altered %s authority before retirement or rebind', async field => {
  const f = await acquired(); const attempt = installHistoricalAttempt(f, f.result, null);
  writeFileSync(join(f.worktree, 'final.json'), JSON.stringify({ outcome: 'completed', evidence_paths: ['src/index.ts'] }));
  const final = installHistoricalFinal(f, f.result, attempt);
  const dispatch = f.result.worker_handoff.dispatch_id;
  const path = join(issueBatchGroupStoreRoot(f.root, f.intent.campaign_id, 1), 'planning', `${canonicalMessageDigest({ dispatch, part: 'final' }).slice(7)}.json`);
  const changed = field === 'result' ? { ...final, result_sha256: '0'.repeat(64) } : { ...final, reservation: { ...final.reservation, attempt: 999 } };
  const basis = { intent_sha256: f.intent.intent_sha256, record: changed };
  writeFileSync(path, `${canonicalMessageBytes({ ...basis, record_sha256: canonicalMessageDigest(basis) })}\n`);
  const before = readLease(f.root, f.result.envelope.task_id);
  expect(() => recoverCampaignDispatch({ selector: f.result.worker_handoff, host: f.executeInput.host, session_id: f.executeInput.session_id, env: f.env })).toThrow(field === 'reservation' ? 'automation reservation digest' : 'exact observed result');
  expect(readLease(f.root, f.result.envelope.task_id)).toEqual(before);
  expect(readPlanningRecord(f.root, f.intent, canonicalMessageDigest({ dispatch, part: 'retired' }).slice(7))).toBeNull();
});

// Historical fixtures deliberately cannot obtain new live admission. This unit probe
// isolates handoff persistence after that separate gate; refusal tests above keep it real.
test('new handoff consumes admitted proof even if projection changed worktree bytes', async () => {
  const f = await acquired();
  writeFileSync(join(f.worktree, f.result.envelope.plan.contract_path), 'template projection\n');
  const admission = spyOn(revisionAdmission, 'requireCampaignActiveAdmission').mockImplementation(() => {});
  try {
    expect(createCampaignWorkerHandoff(f.executeInput, f.result.acquired)).toEqual(f.result.worker_handoff);
  } finally { admission.mockRestore(); }
});

test('persisted handoff with an obsolete projected digest binds only its admitted proof', async () => {
  const f = await acquired();
  const dispatch = f.result.worker_handoff.dispatch_id;
  const handoffKey = canonicalMessageDigest({ dispatch, part: 'handoff' }).slice(7);
  const handoffPath = join(issueBatchGroupStoreRoot(f.root, f.intent.campaign_id, 1), 'planning', `${handoffKey}.json`);
  // Represent the already-persisted pre-fix record without changing its plan proof.
  const basis = { intent_sha256: f.intent.intent_sha256, record: { ...f.result.handoff, contract_sha256: '0'.repeat(64) } };
  writeFileSync(handoffPath, `${canonicalMessageBytes({ ...basis, record_sha256: canonicalMessageDigest(basis) })}\n`);
  const original = readFileSync(handoffPath, 'utf8');
  const attempt = installHistoricalAttempt(f, f.result, null);
  writeFileSync(join(f.worktree, 'final.json'), JSON.stringify({ outcome: 'completed', evidence_paths: ['src/index.ts'] }));
  const final = installHistoricalFinal(f, f.result, attempt);
  expect(bindCampaignWorker(workerInput(f)).replay).toEqual(final);
  expect(readFileSync(handoffPath, 'utf8')).toBe(original);
  writeFileSync(join(f.worktree, f.result.envelope.plan.contract_path), 'unauthorized drift\n');
  expect(() => bindCampaignWorker(workerInput(f))).toThrow('contract changed');
});
