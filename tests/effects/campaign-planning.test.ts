import { fixtureTemplate } from '../helpers/repo-fixture';
import { afterAll, afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { historicalPlanningFixture } from '../helpers/historical-campaign-lifecycle';
import { runCampaignPlanningStep } from '../../src/effects/automation/campaign-planning';
import { campaignTaskPlanProof, planningResultKey, rejectProtectedPlanning, requireCampaignPlanningAuthority, validateAdmissionEvidence, type PlanningAdmission } from '../../src/effects/automation/campaign-planning-proof';
import { readPlanningRecord } from '../../src/effects/automation/campaign-planning-store';
import { readCanonicalTaskPlanProof } from '../../src/effects/state/coordination-canonical-source';
import { collectRepoTaskOffers } from '../../src/effects/fleet/acquire';
import { readRepoHarnessRegistryStrictSnapshot } from '../../src/effects/repo-registry';
import { canonicalMessageDigest } from '../../src/core/messages/mechanics';
import type { CampaignPlanningJob } from '../../src/core/automation/campaign-planning';
import { appendDevelopmentCampaignEvent, readDevelopmentCampaignStatus } from '../../src/effects/automation/development-campaign-store';
import { issueBatchGroupStoreRoot } from '../../src/effects/automation/issue-batch-store';
const roots: string[] = [];
const templates = fixtureTemplate(historicalPlanningFixture);
afterAll(() => templates.dispose());
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
async function fixture(planningOnly = false) {
  const f = await templates.materialize(false, false, undefined, true, {}, false, planningOnly);
  roots.push(f.root, f.home);
  const authority = requireCampaignPlanningAuthority(f.root, f.intent, f.env);
  const task = authority.manifest.slots[0]!.task_id;
  const job = readPlanningRecord<CampaignPlanningJob>(f.root, f.intent, task)!;
  const registry = readRepoHarnessRegistryStrictSnapshot({ env: f.env });
  return { ...f, job, admission: readPlanningRecord<PlanningAdmission>(f.root, f.intent, planningResultKey(task)),
    offers: () => collectRepoTaskOffers(registry.repos[0]!, registry, { env: f.env })!.offers };
}
const noEffects = { preflight: () => { throw new Error('unexpected preflight'); }, refresh: () => { throw new Error('unexpected provider read'); } };

test('historical plan proof remains valid but cannot advertise current execution readiness', async () => {
  const f = await fixture();
  const proof = readCanonicalTaskPlanProof(f.root, { sprintPath: f.job.sprint_path, taskCell: f.job.source_ref.slice(`sprint:${f.job.sprint_path}#`.length) });
  expect(campaignTaskPlanProof(f.root, f.job.task_id, f.job.task_revision, proof, f.env, 'main').ok).toBe(true);
  expect(campaignTaskPlanProof(f.root, f.job.task_id, f.job.task_revision, proof, f.env, 'other-target').ok).toBe(false);
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
  expect(f.offers()[0]!.plan).toBeNull();
  expect(() => runCampaignPlanningStep(f.executeInput, noEffects)).toThrow('trusted exact revision readback');
  expect(() => runCampaignPlanningStep({ ...f.executeInput, result: f.admission!.result }, noEffects)).toThrow('trusted exact revision readback');
});

test.each(['not_reproducible', 'source_stale', 'feature_route_required', 'human_attention_required', 'planning_failed'] as const)('previously issued job can close as %s without admitting another job', async outcome => {
  const f = await fixture(true);
  const result = { job_sha256: f.job.job_sha256, outcome, explanation: 'Historical job closed by its exact local parent.', surfaces: null, characterization: null };
  const input = { ...f.executeInput, result };
  expect(runCampaignPlanningStep(input, noEffects)).toMatchObject({ outcome, task_id: f.job.task_id, replayed: false });
  expect(runCampaignPlanningStep(input, noEffects)).toMatchObject({ outcome, replayed: true });
  expect(() => runCampaignPlanningStep({ ...input, session_id: 'foreign' }, noEffects)).toThrow('another local parent');
  expect(() => runCampaignPlanningStep({ ...f.executeInput, idempotency_key: 'next' }, noEffects)).toThrow('trusted exact revision readback');
});

test('terminal closure requires an exact issued job and request; interrupted closure cannot execute twice', async () => {
  const f = await fixture(true);
  const result = { job_sha256: f.job.job_sha256, outcome: 'not_reproducible', explanation: 'Locally refuted.', surfaces: null, characterization: null };
  expect(() => runCampaignPlanningStep({ ...f.executeInput, idempotency_key: 'forged', result: { ...result, job_sha256: `sha256:${'a'.repeat(64)}` } }, noEffects)).toThrow('no persisted planning job');
  const input = { ...f.executeInput, result };
  runCampaignPlanningStep(input, noEffects);
  expect(() => runCampaignPlanningStep({ ...input, result: { ...result, explanation: 'different' } }, noEffects)).toThrow('different request');
  const key = canonicalMessageDigest({ record: 'step-response', key: input.idempotency_key }).slice(7);
  rmSync(join(issueBatchGroupStoreRoot(f.root, f.intent.campaign_id, 1), 'planning', `${key}.json`));
  expect(() => runCampaignPlanningStep(input, noEffects)).toThrow('interrupted');
});

test('historical admission still checks exact guard evidence and declared contract scope', async () => {
  const f = await fixture(); const a = f.admission!;
  expect(() => validateAdmissionEvidence(f.root, a)).not.toThrow();
  expect(() => validateAdmissionEvidence(f.root, { ...a, evidence: [a.evidence[0]!, a.evidence[0]!] })).toThrow('distinct files');
  expect(() => validateAdmissionEvidence(f.root, { ...a, result: { ...a.result, surfaces: { ...a.result.surfaces!, paths: ['src/foreign.ts'] } } })).toThrow('Allowed Paths');
  writeFileSync(join(f.root, a.evidence[0]!.path), 'changed evidence');
  expect(() => validateAdmissionEvidence(f.root, a)).toThrow('evidence bytes changed');
  const proof = readCanonicalTaskPlanProof(f.root, { sprintPath: f.job.sprint_path, taskCell: f.job.source_ref.slice(`sprint:${f.job.sprint_path}#`.length) });
  expect(campaignTaskPlanProof(f.root, f.job.task_id, f.job.task_revision, proof, f.env).ok).toBe(false);
});

test('historical protection rejects directory scope, authority inputs and removed capabilities', async () => {
  const f = await fixture();
  const reject = (capability: string, paths: string[]) => rejectProtectedPlanning(f.root, 'main', capability, paths);
  expect(() => reject('capability.runtime-harness.fixture', ['src'])).toThrow('directory scope');
  for (const path of ['.ai/harness/campaign-protection.json', '.archcontext/model/nodes/capability.yaml']) {
    expect(() => reject('capability.runtime-harness.fixture', [path])).toThrow('guard authority input');
  }
  expect(() => reject('capability.runtime-harness.removed', ['src/index.ts'])).toThrow('no longer registered');
  const path = '.ai/harness/campaign-protection.json';
  const inventory = JSON.parse(readFileSync(join(f.root, path), 'utf8')); inventory.capabilities = [{ capability_id: 'capability.runtime-harness.fixture' }];
  writeFileSync(join(f.root, path), JSON.stringify(inventory));
  execFileSync('git', ['add', path], { cwd: f.root }); execFileSync('git', ['commit', '-qm', 'changed protection'], { cwd: f.root });
  const proof = readCanonicalTaskPlanProof(f.root, { sprintPath: f.job.sprint_path, taskCell: f.job.source_ref.slice(`sprint:${f.job.sprint_path}#`.length) });
  expect(campaignTaskPlanProof(f.root, f.job.task_id, f.job.task_revision, proof, f.env).ok).toBe(false);
});

test.each(['stop', 'require_reconciliation'] as const)('historical proof remains revoked by campaign %s', async operation => {
  const f = await fixture();
  const status = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env);
  appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: f.intent.campaign_id, expected_current_sha256: status.current.current_sha256, idempotency_key: operation, operation, observed_at: new Date().toISOString(), env: f.env });
  expect(() => runCampaignPlanningStep(f.executeInput, noEffects)).toThrow('campaign lifecycle');
  const proof = readCanonicalTaskPlanProof(f.root, { sprintPath: f.job.sprint_path, taskCell: f.job.source_ref.slice(`sprint:${f.job.sprint_path}#`.length) });
  expect(campaignTaskPlanProof(f.root, f.job.task_id, f.job.task_revision, proof, f.env).ok).toBe(false);
});
