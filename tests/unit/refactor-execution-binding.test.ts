import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { sealProgramAuthorization } from '../../src/core/automation/budget';
import { buildRefactorCandidateVerificationReceipt } from '../../src/core/refactor/candidate-verification';
import { buildRefactorExecutionBinding, validateRefactorExecutionBinding } from '../../src/core/refactor/execution-binding';
import { buildRefactorProgram } from '../../src/core/refactor/program';
import { buildRefactorProgramDefinition } from '../../src/core/refactor/program-state';
import { renderBacklogRow, SPRINT_BACKLOG_SCHEMA_HEADER } from '../../src/core/state/sprint-backlog-rows';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { verifyRefactorCandidate } from '../../src/effects/refactor/candidate-verification';
import { appendRefactorExecutionBinding, readRefactorExecutionBindings } from '../../src/effects/refactor/execution-binding-store';
import { appendRefactorProgramEvent, createRefactorProgram } from '../../src/effects/refactor/program-store';
import { activateRefactorFixture } from '../helpers/refactor-activation-fixture';

const roots: string[] = []; const D = (value: string | Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`; const H = (value: string) => createHash('sha256').update(value).digest('hex'); const TASK = 'f'.repeat(64); const NOW = '2026-09-04T05:00:00.000Z';
const limits = { max_agent_turns: 10, max_successful_acquisitions: 3, max_runner_invocations: 10, max_provider_failures: 3, max_consecutive_no_progress_steps: 2, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null } as const;

async function fixture(squash = false) {
  const root = mkdtempSync(join(tmpdir(), 'refactor-binding-')); roots.push(root); const home = mkdtempSync(join(tmpdir(), 'refactor-binding-home-')); roots.push(home);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root }); execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root }); execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  execFileSync('git', ['commit', '--allow-empty', '-qm', 'base'], { cwd: root });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const sprintPath = 'plans/sprints/refactor.sprint.md'; const planPath = 'plans/plan.md'; const contractPath = 'tasks/contracts/task.md'; mkdirSync(join(root, 'plans', 'sprints'), { recursive: true }); mkdirSync(join(root, 'tasks', 'contracts'), { recursive: true }); mkdirSync(join(root, '.ai', 'harness'), { recursive: true });
  const row = renderBacklogRow(2, { index: '1', id: TASK, status: '[ ]', task: 'Refactor module', mode: 'contract', acceptance: 'All gates pass', plan: planPath });
  writeFileSync(join(root, sprintPath), `# Sprint\n> **Status**: Approved\n${SPRINT_BACKLOG_SCHEMA_HEADER}\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---:|---|:---:|---|---|---|---|\n${row}\n`); writeFileSync(join(root, planPath), '# Plan\n'); writeFileSync(join(root, contractPath), '# Contract\n'); writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({ refactor: { mode: 'active' } })}\n`);
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'candidate'], { cwd: root }); const candidateHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); const env = { ...process.env, REPO_HARNESS_HOME: home }; activateRefactorFixture(root, 'repo_0123456789abcdef', candidateHead, 'active_module');
  const authorization = sealProgramAuthorization({ authorization_id: 'authorization-binding', repository_id: 'repo_0123456789abcdef', target_ref: 'refs/heads/main', target_revision: candidateHead, work_graph_revision: H('graph'), allowed_work_package_ids: ['rf-binding'], allowed_risk_tiers: ['low'], merge_mode: 'disabled', allowed_merge_method: 'squash', max_repair_cycles: 2, budget: limits, contract_scope: 'contract_less', contract_path: null, campaign: null, issued_by: 'owner', issued_at: NOW, expires_at: '2027-09-04T00:00:00.000Z' }); mintProgramAuthorization({ repo_root: root, authorization, env });
  const program = buildRefactorProgram({ programId: 'rf-binding', baseMainSha: candidateHead, providerStage: 'scan', statisticsSnapshotDigest: D('stats'), assessmentDigest: D('assessment'), proposalDigest: D('proposal'), proposalAuthor: { kind: 'developer', source: 'manual' }, scale: 'module', routeReasonCodes: ['single-node-scope'], majorChangeReasons: [], route: 'module_refactor', affectedNodeIds: ['runtime.refactor'], bindings: [{ recommendationId: 'recommendation.binding', recommendationDigest: D('recommendation'), candidateAlias: 'C01', workPackageId: 'rf-binding', taskRef: `${sprintPath}#${TASK}`, executionBoundary: 'module' }] });
  const definition = buildRefactorProgramDefinition({ program_id: program.programId, authorization_id: authorization.authorization_id, authorization_sha256: authorization.authorization_sha256, repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: candidateHead, base_main_sha: candidateHead, created_at: NOW }); let current = createRefactorProgram({ repo_root: root, program: definition, idempotency_key: 'create', env }).current;
  for (const [index, operation] of (['begin_scan', 'observe', 'begin_authoring', 'assess', 'begin_route', 'begin_materialize', 'begin_plan', 'begin_execute'] as const).entries()) current = appendRefactorProgramEvent({ repo_root: root, program_id: program.programId, expected_current_sha256: current.current_sha256, idempotency_key: `step-${index}`, operation, evidence_refs: operation === 'begin_plan' ? [candidateHead, program.programDigest] : [], observed_at: NOW, env }).current;
  const candidate = await verifyRefactorCandidate({ repo_root: root, program, recommendation_id: 'recommendation.binding', candidate_head_sha: candidateHead, candidate_worktree_digest: D('worktree'), task_id: TASK, contract_path: contractPath, cutover_locator: '.ai/harness/checks/closure.json', authority_home: home, expected_current_sha256: current.current_sha256, idempotency_key: 'verify', observed_at: NOW, env }, {
    verify_contract: () => ({ reportBytes: Buffer.from('contract-pass') }), verify_cutover: () => ({ status: 'closed', contractSha256: D(readFileSync(join(root, contractPath))).slice(7), headSha: candidateHead, closureSha256: H('closure') }) as never,
    verify_candidate: () => ({ disposition: 'resolved', evidence: { recommendationId: 'recommendation.binding', verifiedHeadSha: candidateHead } }) as never, verify_acceptance: async () => { const value = { contract_sha256: D(readFileSync(join(root, contractPath))), target_revision: candidateHead, disposition: 'external_pass' }; return { receipt: value as never, bytes: Buffer.from('acceptance') }; },
  });
  if (squash) {
    execFileSync('git', ['branch', 'topic', candidateHead], { cwd: root });
    execFileSync('git', ['reset', '--hard', base], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['merge', '--squash', 'topic'], { cwd: root, stdio: 'ignore' });
  }
  execFileSync('git', ['commit', '--allow-empty', '-qm', 'merge'], { cwd: root }); const merge = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const binding = buildRefactorExecutionBinding({ recommendationId: 'recommendation.binding', recommendationDigest: D('recommendation'), taskId: TASK, taskRevision: candidate.taskRevision, planPath, planSha256: D('# Plan\n'), contractPath, contractSha256: D('# Contract\n'), cutoverClosureSha256: D('closure'), acceptanceReceiptSha256: D('acceptance'), pullRequestNumber: 42, pullRequestHeadSha: candidateHead, mergeCommitSha: merge }); return { root, env, candidateHead, merge, program, candidate, binding };
}

afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('Module 8 immutable execution binding', () => {
  test('uses the exact PRD field set with no lifecycle state', async () => {
    const f = await fixture(); expect(Object.keys(f.binding).sort()).toEqual(['acceptanceReceiptSha256', 'bindingSha256', 'contractPath', 'contractSha256', 'cutoverClosureSha256', 'mergeCommitSha', 'planPath', 'planSha256', 'pullRequestHeadSha', 'pullRequestNumber', 'recommendationDigest', 'recommendationId', 'taskId', 'taskRevision'].sort());
    expect(() => validateRefactorExecutionBinding({ ...f.binding, status: 'resolved' })).toThrow('fields are invalid');
  });

  test('rejects a caller-built receipt that the Program verifier never persisted', async () => {
    const f = await fixture(); const forged = buildRefactorCandidateVerificationReceipt({ ...f.candidate, contractVerificationSha256: D('forged-contract-verification') });
    expect(() => appendRefactorExecutionBinding({ repo_root: f.root, program: f.program, candidate_verification: forged, binding: f.binding, env: f.env })).toThrow('stored candidate verification');
  });

  test('appends and replays an exact receipt produced by candidate verification', async () => {
    const f = await fixture(); expect(appendRefactorExecutionBinding({ repo_root: f.root, program: f.program, candidate_verification: f.candidate, binding: f.binding, env: f.env })).toEqual(f.binding); expect(readRefactorExecutionBindings(f.root, f.program.programId)).toEqual([f.binding]);
    expect(appendRefactorExecutionBinding({ repo_root: f.root, program: f.program, candidate_verification: f.candidate, binding: f.binding, env: f.env })).toEqual(f.binding);
  });

  test('rejects another PR head even when that head is an ancestor of the merge', async () => {
    const f = await fixture(); execFileSync('git', ['commit', '--allow-empty', '-qm', 'another-pr-head'], { cwd: f.root }); const anotherHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.root, encoding: 'utf8' }).trim(); execFileSync('git', ['commit', '--allow-empty', '-qm', 'another-merge'], { cwd: f.root }); const anotherMerge = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.root, encoding: 'utf8' }).trim();
    const binding = buildRefactorExecutionBinding({ ...f.binding, pullRequestHeadSha: anotherHead, mergeCommitSha: anotherMerge });
    expect(() => appendRefactorExecutionBinding({ repo_root: f.root, program: f.program, candidate_verification: f.candidate, binding, env: f.env })).toThrow('candidate head');
  });

  test('rejects Program semantics that differ from the immutable materialized identity', async () => {
    const f = await fixture(); const altered = buildRefactorProgram({ ...f.program, affectedNodeIds: ['workflow.materialization'] });
    expect(() => appendRefactorExecutionBinding({ repo_root: f.root, program: altered, candidate_verification: f.candidate, binding: f.binding, env: f.env })).toThrow('immutable materialized Program');
  });
});

 test('accepts an absorbed squash with an exact persisted candidate receipt', async () => {
  const f = await fixture(true);
  expect(() => execFileSync('git', ['merge-base', '--is-ancestor', f.candidateHead, f.merge], { cwd: f.root, stdio: 'ignore' })).toThrow();
  expect(appendRefactorExecutionBinding({ repo_root: f.root, program: f.program, candidate_verification: f.candidate, binding: f.binding, env: f.env })).toEqual(f.binding);
});
