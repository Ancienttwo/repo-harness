import { afterEach, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createAdoptionRepository } from '../helpers/campaign-adoption-repository';
import { adoptIssueBatch } from '../../src/effects/automation/issue-batch-adoption';
import { makeSnapshot } from '../helpers/issue-batch-adoption-fixture';
import { buildExternalSourceProjection } from '../../src/core/external-sources/projection';
import { buildProviderIssueObservation } from '../../src/core/external-sources/issue-observation';
import { writeProviderIssueObservation, writeExternalSourceRefreshReceipt } from '../../src/effects/external-sources/store';
import { runCampaignPlanningStep } from '../../src/effects/automation/campaign-planning';
import { collectRepoTaskOffers } from '../../src/effects/fleet/acquire';
import { readRepoHarnessRegistryStrictSnapshot } from '../../src/effects/repo-registry';
import { canonicalMessageDigest, messageSha256 } from '../../src/core/messages/mechanics';
import { appendDevelopmentCampaignEvent, readDevelopmentCampaignStatus } from '../../src/effects/automation/development-campaign-store';
import { issueBatchGroupStoreRoot } from '../../src/effects/automation/issue-batch-store';
import { campaignTaskPlanProof } from '../../src/effects/automation/campaign-planning-proof';
import { readCanonicalTaskPlanProof } from '../../src/effects/state/coordination-canonical-source';
import type { CampaignPlanningJob } from '../../src/core/automation/campaign-planning';
const roots: string[] = [];
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); });
const CAP = 'capability.runtime-harness.fixture';
const inventory = readFileSync(join(import.meta.dir, '../fixtures/repair-campaign/protected-capabilities.json'), 'utf8');
const sprint = 'plans/sprints/repair.sprint.md';
const planPath = 'plans/plan-repair.md';
const contractPath = 'tasks/contracts/repair.contract.md';
function git(root: string, args: string[]) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
async function fixture(kind: 'bugfix' | 'test_gap' = 'bugfix', capability = CAP) {
  const f = await createAdoptionRepository('active', 1, capability, { issue_kind: kind }, { 'tests/fixtures/repair-campaign/protected-capabilities.json': inventory });
  roots.push(f.root, f.home);
  const adopted = await adoptIssueBatch(f.input, f.deps);
  git(f.root, ['merge', '--ff-only', adopted.publication!.materialized_commit]);
  mkdirSync(join(f.root, '.ai/harness/sprint'), { recursive: true });
  writeFileSync(join(f.root, '.ai/harness/sprint/active-sprint'), sprint);
  writeFileSync(join(f.home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{ id: f.intent.repository_id, path: f.root, accessMode: 'read_write', source: 'manual', registeredAt: '2026-09-05T00:00:00Z', lastSeenAt: '2026-09-05T00:00:00Z' }] }));
  let snapshot = makeSnapshot(f.intent, undefined, { primary_capability: capability, issue_kind: kind });
  const refresh = () => {
    const observations = snapshot.observations.map(o => writeProviderIssueObservation(f.root, o));
    writeExternalSourceRefreshReceipt(f.root, snapshot.receipt);
    return { receipt: snapshot.receipt, projection: buildExternalSourceProjection({ registered_repository_id: f.intent.repository_id, observations, receipts: [snapshot.receipt] }) };
  };
  const input = { repo_root: f.root, campaign_id: f.intent.campaign_id, group_number: 1, intent_sha256: f.intent.intent_sha256, host: 'codex' as const, session_id: 'local-1', env: f.env };
  const preflight = (root: string, contract: string) => {
    const run = spawnSync('bun', [join(import.meta.dir, '../../scripts/contract-run.ts'), 'preflight', '--repo', root, '--contract', contract, '--json'], { encoding: 'utf8' });
    if (!run.stdout) throw new Error(run.stderr);
    return JSON.parse(run.stdout).brief_preflight;
  };
  const deps = { refresh, preflight };
  let stepNumber = 0;
  const offers = () => { const registry = readRepoHarnessRegistryStrictSnapshot({ env: f.env }); return collectRepoTaskOffers(registry.repos[0]!, registry, { env: f.env })!.offers; };
  return { ...f, get input() { return { ...input, idempotency_key: `step-${++stepNumber}` }; }, deps, offers, changeSource(onlyFirst = false, state: 'open' | 'closed' = 'open') { snapshot = { ...snapshot, observations: snapshot.observations.map((o, index) => { if (onlyFirst && index !== 0) return o; const { protocol, kind, source_revision, observation_sha256, ...raw } = o; return buildProviderIssueObservation({ ...raw, state, body: `${o.body}\nEdited`, observed_at: '2026-09-06T01:00:00Z' }); }) }; } };
}
function capture(f: Awaited<ReturnType<typeof fixture>>, job: CampaignPlanningJob, kind: 'bugfix' | 'test_gap' = 'bugfix') {
  mkdirSync(join(f.root, 'tasks/contracts'), { recursive: true }); mkdirSync(join(f.root, 'tasks/evidence'), { recursive: true });
  writeFileSync(join(f.root, 'tests/guard.test.ts'), 'test guard');
  writeFileSync(join(f.root, 'tasks/evidence/pre.txt'), 'tests/guard.test.ts\nPRE_FIX_EXIT=1\n');
  const plan = ['# Plan: repair', '> **Status**: Approved', `> **Source Ref**: ${job.source_ref}`, '> **Artifact Level**: work-package', '> **Promotion Reason**: verification_boundary', '> **Verification Boundary**: exact local plan proof', '> **Rollback Surface**: revert repair', `> **Task Contract**: ${contractPath}`, '', '## Promotion Gate', ...['Merge/PR unit','Rollback surface','Verification boundary','Review/acceptance boundary','High-risk surface','Why not checklist row'].map(k => `- **${k}**: exact repair boundary`), '', '## Evidence Contract', ...['State/progress path','Verification evidence','Evaluator rubric','Stop condition','Rollback surface'].map(k => `- **${k}**: bounded repair fixture`) ].join('\n');
  writeFileSync(join(f.root, planPath), plan);
  writeFileSync(join(f.root, contractPath), `# Contract\n> **Plan**: ${planPath}\n> **Task Profile**: ${kind === 'bugfix' ? 'bugfix' : 'code-change'}\n\n## Goal\nRepair the observed empty-input behavior.\n\n## Why\nMissing validation lets the defect recur.\n\n## Scope\n- In scope: local empty-input guard.\n- Out of scope: other behavior.\n\n## Allowed Paths\n\n\`\`\`yaml\nallowed_paths:\n  - src/index.ts\n  - tests/guard.test.ts\n\`\`\`\n\n## Root Cause Evidence\n- root_cause: src/index.ts:1 accepts empty input.\n- repro: bun test tests/guard.test.ts\n- regression_guard: tests/guard.test.ts\n- pre_fix_failure_artifact: tasks/evidence/pre.txt\n\n## Exit Criteria\n\`\`\`yaml\nexit_criteria:\n  tests_pass:\n    - path: tests/guard.test.ts\n\`\`\`\n`);
  return { job_sha256: job.job_sha256, outcome: 'plan_ready' as const, explanation: 'The local evidence justifies a bounded repair.', surfaces: { paths: ['src/index.ts', 'tests/guard.test.ts'], cli_commands: [], mcp_tools: [], public_exports: [], protocol_kinds: [], capability_nodes: [] }, characterization: null };
}
function job(f: Awaited<ReturnType<typeof fixture>>): CampaignPlanningJob {
  const step = runCampaignPlanningStep(f.input, f.deps);
  expect('job' in step, JSON.stringify(step)).toBe(true);
  return (step as { job: CampaignPlanningJob }).job;
}
test('canonical materialization -> local handoff -> evidence binding -> real TaskOffer, then evidence drift removes readiness', async () => {
  const f = await fixture();
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
  const j = job(f); expect(job(f)).toEqual(j);
  const result = capture(f, j);
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
  const step = runCampaignPlanningStep({ ...f.input, result }, f.deps);
  expect('outcome' in step && step.outcome, JSON.stringify(step)).toBe('plan_ready');
  expect(f.offers()[0]!.execution_readiness).toBe('execution_ready');
  expect(runCampaignPlanningStep({ ...f.input, result }, f.deps)).toEqual(step);
  writeFileSync(join(f.root, 'tasks/evidence/pre.txt'), 'changed evidence');
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
});
test('wrong host/session and feature additions fail closed without readiness', async () => {
  const f = await fixture();
  expect(() => runCampaignPlanningStep({ ...f.input, host: 'claude' }, f.deps)).toThrow('authorized local parent');
  const j = job(f);
  expect(() => runCampaignPlanningStep({ ...f.input, session_id: 'other' }, f.deps)).toThrow('another local parent');
  const result = capture(f, j);
  expect(() => runCampaignPlanningStep({ ...f.input, result: { ...result, surfaces: { ...result.surfaces, cli_commands: ['new-command'] } } }, f.deps)).toThrow('repair planning adds');
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
});
test('protected capability cannot receive an automated planning job', async () => {
  const f = await fixture('bugfix', 'capability.runtime-harness.development-campaign');
  expect(() => job(f)).toThrow('protected capability');
});
test('missing Root Cause Evidence cannot become ready; source edit stales a job', async () => {
  const f = await fixture(); const j = job(f); const result = capture(f, j);
  writeFileSync(join(f.root, 'tasks/evidence/pre.txt'), 'no pre-fix failure');
  expect(() => runCampaignPlanningStep({ ...f.input, result }, f.deps)).toThrow('Root Cause Evidence');
  f.changeSource();
  expect(runCampaignPlanningStep(f.input, f.deps)).toMatchObject({ outcome: 'source_stale' });
});
test('test-gap requires characterization artifact proving the old-test gap', async () => {
  const f = await fixture('test_gap'); const j = job(f); const result = capture(f, j, 'test_gap');
  expect(() => runCampaignPlanningStep({ ...f.input, result }, f.deps)).toThrow('old-test gap');
  const artifact = 'bun test tests/old.ts\nbun test tests/guard.test.ts\nOLD_TESTS_EXIT=0\nFALSIFIER_EXIT=1\n';
  writeFileSync(join(f.root, 'tasks/evidence/gap.txt'), artifact);
  const characterization = { current_behavior: 'The existing behavior is characterized by a new empty-input guard.', regression_guard: 'tests/guard.test.ts', old_tests_command: 'bun test tests/old.ts', falsifier_command: 'bun test tests/guard.test.ts', old_tests_exit: 0, falsifier_exit: 1, artifact: { path: 'tasks/evidence/gap.txt', sha256: messageSha256(artifact) } };
  expect(runCampaignPlanningStep({ ...f.input, result: { ...result, characterization } }, f.deps)).toMatchObject({ outcome: 'plan_ready' });
});
test('deleting the canonical manifest cannot bypass admission', async () => {
  const f = await fixture(); const j = job(f); capture(f, j);
  git(f.root, ['rm', `tasks/campaigns/${f.intent.campaign_id}/group-1.issues.json`]); git(f.root, ['commit', '-qm', 'remove manifest']);
  const proof = readCanonicalTaskPlanProof(f.root, { sprintPath: sprint, taskCell: j.source_ref.slice(`sprint:${sprint}#`.length) });
  expect(campaignTaskPlanProof(f.root, j.task_id, j.task_revision, proof, f.env).ok).toBe(false);
});
test.each(['off', 'shadow'] as const)('current %s policy prevents planning writes and readiness', async mode => {
  const f = await fixture();
  const path = join(f.root, '.ai/harness/policy.json'); const p = JSON.parse(readFileSync(path, 'utf8'));
  p.development_campaign = mode === 'off' ? { version: 1, mode } : { ...p.development_campaign, mode };
  writeFileSync(path, JSON.stringify(p)); git(f.root, ['add', '.ai/harness/policy.json']); git(f.root, ['commit', '-qm', mode]);
  let refreshes = 0; const deps = { ...f.deps, refresh: () => { refreshes++; throw new Error('shadow must not refresh'); } };
  if (mode === 'off') expect(() => runCampaignPlanningStep(f.input, deps)).toThrow('disabled');
  else {
    expect(runCampaignPlanningStep(f.input, deps)).toMatchObject({ action: 'planning_required', dry_run: true });
    expect(runCampaignPlanningStep({ ...f.input, session_id: 'different-dry-run' }, deps)).toMatchObject({ dry_run: true });
  }
  expect(refreshes).toBe(0);
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
});
test.each(['not_reproducible', 'feature_route_required', 'human_attention_required', 'source_stale', 'planning_failed'] as const)('closed outcome %s cannot authorize execution', async outcome => {
  const f = await fixture(); const j = job(f);
  const result = { job_sha256: j.job_sha256, outcome, explanation: 'Local investigation requires this terminal outcome.', surfaces: null, characterization: null };
  expect(runCampaignPlanningStep({ ...f.input, result }, f.deps)).toMatchObject({ outcome });
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
  expect(() => runCampaignPlanningStep({ ...f.input, result: { ...result, explanation: 'Conflicting result' } }, f.deps)).toThrow('different immutable content');
});
test('protected paths and Task revision changes reject planning before readiness', async () => {
  const f = await fixture(); const j = job(f); const result = capture(f, j);
  expect(() => runCampaignPlanningStep({ ...f.input, result: { ...result, surfaces: { ...result.surfaces, paths: ['src/core/state/coordination-identity.ts'] } } }, f.deps)).toThrow('protected planned path');
  const text = readFileSync(join(f.root, sprint), 'utf8'); writeFileSync(join(f.root, sprint), text.replace('local plan and module acceptance required', 'changed acceptance requirement'));
  git(f.root, ['add', sprint]); git(f.root, ['commit', '-qm', 'edit task revision']);
  expect(() => runCampaignPlanningStep(f.input, f.deps)).toThrow('Task revision');
});
test('protection snapshot drift and a different configured offer target cannot reuse admission', async () => {
  const f = await fixture(); const j = job(f); const result = capture(f, j);
  expect(runCampaignPlanningStep({ ...f.input, result }, f.deps)).toMatchObject({ outcome: 'plan_ready' });
  const proof = readCanonicalTaskPlanProof(f.root, { sprintPath: sprint, taskCell: j.source_ref.slice(`sprint:${sprint}#`.length) });
  git(f.root, ['branch', 'other-target']);
  expect(campaignTaskPlanProof(f.root, j.task_id, j.task_revision, proof, f.env, 'other-target').ok).toBe(false);
  expect(campaignTaskPlanProof(f.root, j.task_id, j.task_revision, proof, f.env, 'main').ok).toBe(true);
  const path = 'tests/fixtures/repair-campaign/protected-capabilities.json';
  const inventory = JSON.parse(readFileSync(join(f.root, path), 'utf8')); inventory.capabilities = [];
  writeFileSync(join(f.root, path), JSON.stringify(inventory)); git(f.root, ['add', path]); git(f.root, ['commit', '-qm', 'relax protection']);
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
  expect(() => runCampaignPlanningStep(f.input, f.deps)).toThrow('protection snapshot');
});

test('one evidence file cannot impersonate both regression guard and pre-fix artifact', async () => {
  const f = await fixture(); const j = job(f); const result = capture(f, j);
  const path = join(f.root, contractPath);
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('tests/guard.test.ts', 'tasks/evidence/pre.txt'));
  writeFileSync(join(f.root, 'tasks/evidence/pre.txt'), 'tasks/evidence/pre.txt\nPRE_FIX_EXIT=1\n');
  expect(() => runCampaignPlanningStep({ ...f.input, result: { ...result, surfaces: { ...result.surfaces, paths: ['src/index.ts', 'tasks/evidence/pre.txt'] } } }, f.deps)).toThrow('distinct files');
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
});

test('same step key replays without provider reads and conflicting inputs fail closed', async () => {
  const f = await fixture(); const input = f.input; let calls = 0;
  const deps = { ...f.deps, refresh: () => { calls++; return f.deps.refresh(); } };
  const initial = runCampaignPlanningStep(input, deps);
  for (let i = 0; i < 10; i++) expect(runCampaignPlanningStep(input, deps)).toEqual({ ...initial, replayed: true });
  expect(calls).toBe(1);
  const j = (initial as { job: CampaignPlanningJob }).job;
  expect(() => runCampaignPlanningStep({ ...input, result: { job_sha256: j.job_sha256, outcome: 'not_reproducible', explanation: 'Refuted locally', surfaces: null, characterization: null } }, deps)).toThrow('different request');
  expect(calls).toBe(1);
});
test('closed planning result does not starve the next adopted slot', async () => {
  const f = await fixture(); const first = job(f);
  const result = { job_sha256: first.job_sha256, outcome: 'not_reproducible', explanation: 'Current behavior refutes the reported defect.', surfaces: null, characterization: null };
  expect(runCampaignPlanningStep({ ...f.input, result }, f.deps)).toMatchObject({ outcome: 'not_reproducible' });
  const second = job(f);
  expect(second.task_id).not.toBe(first.task_id);
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
});

test('planning cannot rewrite the guard authority inputs or target a removed capability', async () => {
  const f = await fixture(); const j = job(f); const result = capture(f, j);
  for (const path of ['tests/fixtures/repair-campaign/protected-capabilities.json', '.archcontext/model/nodes/capability.yaml']) {
    expect(() => runCampaignPlanningStep({ ...f.input, result: { ...result, surfaces: { ...result.surfaces, paths: [path] } } }, f.deps)).toThrow('guard authority input');
  }
  const other = await fixture();
  const path = '.archcontext/model/nodes/capability.yaml';
  const node = JSON.parse(readFileSync(join(other.root, path), 'utf8')); node.id = 'capability.runtime-harness.other';
  writeFileSync(join(other.root, path), JSON.stringify(node)); git(other.root, ['add', path]); git(other.root, ['commit', '-qm', 'remove adopted capability']);
  expect(() => job(other)).toThrow('no longer registered');
});

test('interrupted reserved step fails closed without another provider read', async () => {
  const f = await fixture(); const input = f.input; let calls = 0;
  const deps = { ...f.deps, refresh: () => { calls++; return f.deps.refresh(); } };
  runCampaignPlanningStep(input, deps);
  const key = canonicalMessageDigest({ record: 'step-response', key: input.idempotency_key }).slice(7);
  rmSync(join(issueBatchGroupStoreRoot(f.root, f.intent.campaign_id, 1), 'planning', `${key}.json`));
  expect(() => runCampaignPlanningStep(input, deps)).toThrow('step was interrupted');
  expect(calls).toBe(1);
});

test.each(['stop', 'require_reconciliation'] as const)('campaign lifecycle %s revokes planning and admitted readiness', async operation => {
  const f = await fixture(); const j = job(f); const result = capture(f, j);
  runCampaignPlanningStep({ ...f.input, result }, f.deps);
  expect(f.offers()[0]!.execution_readiness).toBe('execution_ready');
  const status = readDevelopmentCampaignStatus(f.root, f.intent.campaign_id, f.env);
  appendDevelopmentCampaignEvent({ repo_root: f.root, campaign_id: f.intent.campaign_id, expected_current_sha256: status.current.current_sha256, idempotency_key: operation, operation, observed_at: new Date().toISOString(), env: f.env });
  expect(() => runCampaignPlanningStep(f.input, f.deps)).toThrow('campaign lifecycle');
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
});
test('source drift on a closed slot cannot block later handoff or result admission', async () => {
  const f = await fixture(); const first = job(f);
  runCampaignPlanningStep({ ...f.input, result: { job_sha256: first.job_sha256, outcome: 'not_reproducible', explanation: 'Refuted locally', surfaces: null, characterization: null } }, f.deps);
  f.changeSource(true);
  const second = job(f);
  expect(second.task_id).not.toBe(first.task_id);
  expect(runCampaignPlanningStep({ ...f.input, result: capture(f, second) }, f.deps)).toMatchObject({ outcome: 'plan_ready' });
});
test('directory scope cannot bypass concrete-file protection checks', async () => {
  const f = await fixture(); const j = job(f); const result = capture(f, j);
  expect(() => runCampaignPlanningStep({ ...f.input, result: { ...result, surfaces: { ...result.surfaces, paths: ['src'] } } }, f.deps)).toThrow('directory scope');
});

test('a stale issued job can close without provider access and unblock the next slot', async () => {
  const f = await fixture(); const first = job(f);
  f.changeSource(true);
  expect(runCampaignPlanningStep(f.input, f.deps)).toMatchObject({ outcome: 'source_stale' });
  const result = { job_sha256: first.job_sha256, outcome: 'source_stale', explanation: 'Issue changed after handoff', surfaces: null, characterization: null };
  expect(runCampaignPlanningStep({ ...f.input, result }, { ...f.deps, refresh: () => { throw new Error('negative outcome must not refresh'); } })).toMatchObject({ outcome: 'source_stale' });
  expect(job(f).task_id).not.toBe(first.task_id);
  expect(f.offers()[0]!.execution_readiness).toBe('planning_required');
});

test('claimed admitted first slot allows the next handoff but stale evidence still fails closed', async () => {
  const f = await fixture(); const first = job(f);
  expect(runCampaignPlanningStep({ ...f.input, result: capture(f, first) }, f.deps)).toMatchObject({ outcome: 'plan_ready' });
  const claim = spawnSync('bun', [join(import.meta.dir, '../../src/cli/index.ts'), 'sprint', 'claim', '--task-id', first.task_id, '--expected-task-revision', first.task_revision, '--target-ref', 'main', '--sprint-path', sprint, '--session-id', 'claimed-first-slot'], { cwd: f.root, env: { ...process.env, ...f.env }, encoding: 'utf8' });
  expect(claim.status, claim.stderr || claim.stdout).toBe(0);
  const offer = f.offers().find(o => o.task_id === first.task_id)!;
  expect(offer.execution_readiness).toBe('unsupported');
  expect(offer.blockers.map(b => b.code)).toEqual(['lease_unavailable']);
  expect(offer.plan).not.toBeNull();
  expect(job(f).task_id).not.toBe(first.task_id);
  writeFileSync(join(f.root, 'tasks/evidence/pre.txt'), 'changed evidence');
  expect(f.offers().find(o => o.task_id === first.task_id)!.plan).toBeNull();
  expect(runCampaignPlanningStep(f.input, f.deps)).toMatchObject({ outcome: 'source_stale', task_id: first.task_id });
});

test.each(['open', 'closed'] as const)('pre-handoff source drift (%s) exposes an exact job for explicit closure before the next slot', async state => {
  const f = await fixture();
  f.changeSource(true, state);
  const input = f.input;
  const stale = runCampaignPlanningStep(input, f.deps);
  expect(stale).toMatchObject({ outcome: 'source_stale' });
  expect('job' in stale, JSON.stringify(stale)).toBe(true);
  const first = (stale as { job: CampaignPlanningJob }).job;
  const adopted = makeSnapshot(f.intent, undefined, { primary_capability: CAP, issue_kind: 'bugfix' }).observations[0]!;
  expect(first.observation_sha256).toBe(adopted.observation_sha256);
  expect(first.source_revision).toBe(adopted.source_revision);
  expect(runCampaignPlanningStep(input, { ...f.deps, refresh: () => { throw new Error('replay must not refresh'); } })).toEqual({ ...stale, replayed: true });
  expect(runCampaignPlanningStep(f.input, f.deps)).toMatchObject({ outcome: 'source_stale', job: first });
  expect(runCampaignPlanningStep({ ...f.input, result: capture(f, first) }, f.deps)).toMatchObject({ outcome: 'source_stale' });
  expect(f.offers().find(o => o.task_id === first.task_id)!.execution_readiness).toBe('planning_required');
  const terminal = { job_sha256: first.job_sha256, outcome: 'source_stale', explanation: 'Issue changed before planning; close this adopted source.', surfaces: null, characterization: null };
  expect(() => runCampaignPlanningStep({ ...f.input, session_id: 'foreign', result: terminal }, f.deps)).toThrow('another local parent');
  expect(runCampaignPlanningStep({ ...f.input, result: terminal }, { ...f.deps, refresh: () => { throw new Error('closure must not refresh'); } })).toMatchObject({ outcome: 'source_stale', task_id: first.task_id });
  const second = job(f);
  expect(second.task_id).not.toBe(first.task_id);
  expect(runCampaignPlanningStep({ ...f.input, result: capture(f, second) }, f.deps)).toMatchObject({ outcome: 'plan_ready' });
});
