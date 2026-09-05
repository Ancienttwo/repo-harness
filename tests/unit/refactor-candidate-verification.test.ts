import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { sealProgramAuthorization } from '../../src/core/automation/budget';
import { buildRefactorProgram } from '../../src/core/refactor/program';
import { buildRefactorProgramDefinition } from '../../src/core/refactor/program-state';
import { renderBacklogRow, SPRINT_BACKLOG_SCHEMA_HEADER } from '../../src/core/state/sprint-backlog-rows';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { RefactorProviderError } from '../../src/core/refactor/provider-contract';
import { verifyRefactorCandidate } from '../../src/effects/refactor/candidate-verification';
import { appendRefactorProgramEvent, createRefactorProgram } from '../../src/effects/refactor/program-store';
import { activateRefactorFixture } from '../helpers/refactor-activation-fixture';

const roots: string[] = []; const D = (value: string | Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`; const H = (value: string) => createHash('sha256').update(value).digest('hex'); const TASK = 'e'.repeat(64); const NOW = '2026-09-04T05:00:00.000Z';
const limits = { max_agent_turns: 10, max_successful_acquisitions: 3, max_runner_invocations: 10, max_provider_failures: 3, max_consecutive_no_progress_steps: 2, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null } as const;

function fixture(duplicateTask = false) {
  const root = mkdtempSync(join(tmpdir(), 'refactor-candidate-')); roots.push(root); const home = mkdtempSync(join(tmpdir(), 'refactor-candidate-home-')); roots.push(home);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root }); execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root }); execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  const sprintPath = 'plans/sprints/refactor.sprint.md'; const contractPath = 'tasks/contracts/refactor.contract.md'; mkdirSync(join(root, 'plans', 'sprints'), { recursive: true }); mkdirSync(join(root, 'tasks', 'contracts'), { recursive: true }); mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  const row = renderBacklogRow(2, { index: '1', id: TASK, status: '[ ]', task: 'Refactor module', mode: 'contract', acceptance: 'All gates pass', plan: 'plans/plan-refactor.md' });
  writeFileSync(join(root, sprintPath), `# Sprint\n> **Status**: Approved\n${SPRINT_BACKLOG_SCHEMA_HEADER}\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---:|---|:---:|---|---|---|---|\n${row}\n`); writeFileSync(join(root, contractPath), '# Contract\n'); writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({ refactor: { mode: 'active' } })}\n`);
  if (duplicateTask) writeFileSync(join(root, 'plans/sprints/sibling.sprint.md'), readFileSync(join(root, sprintPath)));
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'candidate'], { cwd: root }); const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); const env = { ...process.env, REPO_HARNESS_HOME: home }; activateRefactorFixture(root, 'repo_0123456789abcdef', head, 'active_module');
  const authorization = sealProgramAuthorization({ authorization_id: 'authorization-verify', repository_id: 'repo_0123456789abcdef', target_ref: 'refs/heads/main', target_revision: head, work_graph_revision: H('graph'), allowed_work_package_ids: ['rf-module'], allowed_risk_tiers: ['low'], merge_mode: 'disabled', allowed_merge_method: 'squash', max_repair_cycles: 2, budget: limits, contract_scope: 'contract_less', contract_path: null, campaign: null, issued_by: 'owner', issued_at: NOW, expires_at: '2027-09-04T00:00:00.000Z' }); mintProgramAuthorization({ repo_root: root, authorization, env });
  const program = buildRefactorProgram({ programId: 'rf-verify', baseMainSha: head, providerStage: 'scan', statisticsSnapshotDigest: D('stats'), assessmentDigest: D('assessment'), proposalDigest: D('proposal'), proposalAuthor: { kind: 'developer', source: 'manual' }, scale: 'module', routeReasonCodes: ['single-node-scope'], majorChangeReasons: [], route: 'module_refactor', affectedNodeIds: ['runtime.refactor'], bindings: [{ recommendationId: 'recommendation.verify', recommendationDigest: D('recommendation'), candidateAlias: 'C01', workPackageId: 'rf-module', taskRef: `${sprintPath}#${TASK}`, executionBoundary: 'module' }] });
  const definition = buildRefactorProgramDefinition({ program_id: 'rf-verify', authorization_id: authorization.authorization_id, authorization_sha256: authorization.authorization_sha256, repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: head, base_main_sha: head, created_at: NOW }); let current = createRefactorProgram({ repo_root: root, program: definition, idempotency_key: 'create', env }).current;
  for (const [index, operation] of (['begin_scan', 'observe', 'begin_authoring', 'assess', 'begin_route', 'begin_materialize', 'begin_plan', 'begin_execute'] as const).entries()) current = appendRefactorProgramEvent({ repo_root: root, program_id: 'rf-verify', expected_current_sha256: current.current_sha256, idempotency_key: `step-${index}`, operation, evidence_refs: operation === 'begin_plan' ? [head, program.programDigest] : [], observed_at: NOW, env }).current;
  return { root, home, env, head, current, program, contractPath, contractSha: D(readFileSync(join(root, contractPath))) };
}

afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('Module 8 candidate verification order', () => {
  test('rejects candidate-head task IDs duplicated in another live Sprint before verification effects', async () => {
    const f = fixture(true); const calls: string[] = [];
    await expect(verifyRefactorCandidate({ repo_root: f.root, program: f.program, recommendation_id: 'recommendation.verify', candidate_head_sha: f.head, candidate_worktree_digest: D('worktree'), task_id: TASK, contract_path: f.contractPath, cutover_locator: '.ai/harness/checks/cutover.json', authority_home: f.home, expected_current_sha256: f.current.current_sha256, idempotency_key: 'verify', observed_at: NOW, env: f.env }, {
      verify_contract: () => { calls.push('contract'); throw new Error('verification must not start'); },
    })).rejects.toThrow('shared by live canonical sprints');
    expect(calls).toEqual([]);
  });

  test('rejects Program semantics that differ from the immutable materialized identity', async () => {
    const f = fixture();
    const altered = buildRefactorProgram({ ...f.program, affectedNodeIds: ['workflow.materialization'] });
    await expect(verifyRefactorCandidate({ repo_root: f.root, program: altered, recommendation_id: 'recommendation.verify', candidate_head_sha: f.head, candidate_worktree_digest: D('worktree'), task_id: TASK, contract_path: f.contractPath, cutover_locator: '.ai/harness/checks/cutover.json', authority_home: f.home, expected_current_sha256: f.current.current_sha256, idempotency_key: 'verify', observed_at: NOW, env: f.env })).rejects.toThrow('immutable materialized Program');
  });

  test('runs contract, closure, provider, then acceptance and seals immutable evidence', async () => {
    const f = fixture(); const order: string[] = [];
    const receipt = await verifyRefactorCandidate({ repo_root: f.root, program: f.program, recommendation_id: 'recommendation.verify', candidate_head_sha: f.head, candidate_worktree_digest: D('worktree'), task_id: TASK, contract_path: f.contractPath, cutover_locator: '.ai/harness/checks/cutover.json', authority_home: f.home, expected_current_sha256: f.current.current_sha256, idempotency_key: 'verify', observed_at: NOW, env: f.env }, {
      verify_contract: () => { order.push('contract'); return { reportBytes: Buffer.from('contract-pass') }; },
      verify_cutover: () => { order.push('closure'); return { status: 'closed', contractSha256: f.contractSha.slice(7), headSha: f.head, closureSha256: H('closure') } as never; },
      verify_candidate: () => { order.push('provider'); return { disposition: 'resolved', evidence: { recommendationId: 'recommendation.verify', verifiedHeadSha: f.head } } as never; },
      verify_acceptance: async () => { order.push('acceptance'); const value = { contract_sha256: f.contractSha, target_revision: f.head, disposition: 'external_pass' }; return { receipt: value as never, bytes: Buffer.from(JSON.stringify(value)) }; },
    });
    expect(order).toEqual(['contract', 'closure', 'provider', 'acceptance']); expect(receipt.candidateVerify).toBe('passed'); expect(Object.keys(receipt)).not.toContain('status');
  });

  test('closure failure prevents provider and acceptance, while unavailable Stage 2 never relaxes the other gates', async () => {
    const failed = fixture(); const failedOrder: string[] = [];
    await expect(verifyRefactorCandidate({ repo_root: failed.root, program: failed.program, recommendation_id: 'recommendation.verify', candidate_head_sha: failed.head, candidate_worktree_digest: D('worktree'), task_id: TASK, contract_path: failed.contractPath, cutover_locator: '.ai/harness/checks/cutover.json', authority_home: failed.home, expected_current_sha256: failed.current.current_sha256, idempotency_key: 'verify', observed_at: NOW, env: failed.env }, { verify_contract: () => { failedOrder.push('contract'); return { reportBytes: Buffer.from('ok') }; }, verify_cutover: () => { failedOrder.push('closure'); return { status: 'residue' } as never; }, verify_candidate: () => { failedOrder.push('provider'); throw new Error('forbidden'); }, verify_acceptance: async () => { failedOrder.push('acceptance'); throw new Error('forbidden'); } })).rejects.toThrow('Cutover Closure');
    expect(failedOrder).toEqual(['contract', 'closure']);
    const unavailable = fixture(); const order: string[] = [];
    const receipt = await verifyRefactorCandidate({ repo_root: unavailable.root, program: unavailable.program, recommendation_id: 'recommendation.verify', candidate_head_sha: unavailable.head, candidate_worktree_digest: D('worktree'), task_id: TASK, contract_path: unavailable.contractPath, cutover_locator: '.ai/harness/checks/cutover.json', authority_home: unavailable.home, expected_current_sha256: unavailable.current.current_sha256, idempotency_key: 'verify', observed_at: NOW, env: unavailable.env }, { verify_contract: () => { order.push('contract'); return { reportBytes: Buffer.from('ok') }; }, verify_cutover: () => { order.push('closure'); return { status: 'closed', contractSha256: unavailable.contractSha.slice(7), headSha: unavailable.head, closureSha256: H('closure') } as never; }, verify_candidate: () => { order.push('provider'); throw new RefactorProviderError('refactor_provider_version_mismatch', 'unavailable'); }, verify_acceptance: async () => { order.push('acceptance'); const value = { contract_sha256: unavailable.contractSha, target_revision: unavailable.head, disposition: 'external_pass' }; return { receipt: value as never, bytes: Buffer.from('acceptance') }; } });
    expect(order).toEqual(['contract', 'closure', 'provider', 'acceptance']); expect(receipt.candidateVerify).toBe('verify_stage_unavailable'); expect(receipt.candidateVerifyResultSha256).toBeNull();
  });
});
