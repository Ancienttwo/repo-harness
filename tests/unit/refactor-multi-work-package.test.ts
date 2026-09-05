import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { refactorResolutionEvidenceDigest, type RecommendationV3, type RefactorResolutionEvidenceV1, type RefactorVerificationRequestV1 } from 'archctx-contracts';

import { sealProgramAuthorization } from '../../src/core/automation/budget';
import { buildRefactorProgram } from '../../src/core/refactor/program';
import { buildRefactorProgramDefinition } from '../../src/core/refactor/program-state';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { materializeRefactorProgram, type MaterializeRefactorProgramInput } from '../../src/effects/refactor/materialization';
import { appendRefactorProgramEvent, createRefactorProgram, readRefactorProgramStatus } from '../../src/effects/refactor/program-store';
import { activateRefactorFixture } from '../helpers/refactor-activation-fixture';

import { buildRefactorExecutionBinding } from '../../src/core/refactor/execution-binding';
import { projectRefactorBoard } from '../../src/core/refactor/board';
import { type RefactorVerifyResultV1 } from '../../src/core/refactor/provider-contract';
import { verifyRefactorCandidate } from '../../src/effects/refactor/candidate-verification';
import { appendRefactorExecutionBinding, readRefactorExecutionBindings } from '../../src/effects/refactor/execution-binding-store';
import { rebuildRefactorBoard, resolveRefactorPostMerge, type RefactorPostMergeItemV1 } from '../../src/effects/refactor/post-merge-resolution';

const roots: string[] = [];
const D = (value: string | Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const H = (value: string) => createHash('sha256').update(value).digest('hex');
const TASK = 'b'.repeat(64);
const OBSERVED = '2026-09-04T02:00:00.000Z';
const limits = { max_agent_turns: 10, max_successful_acquisitions: 3, max_runner_invocations: 10, max_provider_failures: 3, max_consecutive_no_progress_steps: 2, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null } as const;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'refactor-materialize-')); roots.push(root);
  const home = mkdtempSync(join(tmpdir(), 'refactor-materialize-home-')); roots.push(home);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root }); execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root }); execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true }); writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({ refactor: { mode: 'active' } })}\n`);
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: root });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); const env = { ...process.env, REPO_HARNESS_HOME: home }; activateRefactorFixture(root, 'repo_0123456789abcdef', revision, 'active_cross_module');
  const authorization = sealProgramAuthorization({ authorization_id: 'authorization-rf', repository_id: 'repo_0123456789abcdef', target_ref: 'refs/heads/main', target_revision: revision, work_graph_revision: H('graph'), allowed_work_package_ids: ['rf-runtime', 'rf-workflow'], allowed_risk_tiers: ['low'], merge_mode: 'disabled', allowed_merge_method: 'squash', max_repair_cycles: 2, budget: limits, contract_scope: 'contract_less', contract_path: null, campaign: null, issued_by: 'ancienttwo', issued_at: OBSERVED, expires_at: '2027-09-04T00:00:00.000Z' });
  mintProgramAuthorization({ repo_root: root, authorization, env });
  const definition = buildRefactorProgramDefinition({ program_id: 'rf-1', authorization_id: authorization.authorization_id, authorization_sha256: authorization.authorization_sha256, repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: revision, base_main_sha: revision, created_at: OBSERVED });
  let current = createRefactorProgram({ repo_root: root, program: definition, idempotency_key: 'create', env }).current;
  for (const [index, operation] of (['begin_scan', 'observe', 'begin_authoring', 'assess', 'begin_route'] as const).entries()) current = appendRefactorProgramEvent({ repo_root: root, program_id: 'rf-1', expected_current_sha256: current.current_sha256, idempotency_key: `step-${index}`, operation, observed_at: `2026-09-04T02:0${index + 1}:00.000Z`, env }).current;
  const sprint = 'plans/sprints/rf-1.sprint.md'; const program = buildRefactorProgram({ programId: 'rf-1', baseMainSha: revision, providerStage: 'scan', statisticsSnapshotDigest: D('stats'), assessmentDigest: D('assessment'), proposalDigest: D('proposal'), proposalAuthor: { kind: 'developer', source: 'manual' }, scale: 'cross_module', routeReasonCodes: ['multi-node-scope'], majorChangeReasons: [], route: 'cross_module_refactor', affectedNodeIds: ['runtime.refactor', 'workflow.refactor'], bindings: [{ recommendationId: 'rec-1', recommendationDigest: D('rec'), candidateAlias: 'C01', workPackageId: 'rf-runtime', taskRef: `${sprint}#${TASK}`, executionBoundary: 'cross_module_stage' }] });
  const artifacts = [{ path: 'plans/policies/rf-runtime.json', bytes: 'acceptance\n' }, { path: 'plans/rollback/rf-runtime.json', bytes: 'rollback\n' }];
  const recommendation: RecommendationV3 = { schemaVersion: 'archcontext.recommendation/v3', recommendationId: 'rec-1', runId: 'run-1', fingerprint: D('rec'), subject: 'runtime.refactor', status: 'accepted', confidence: 'high', enforcement: 'checkpoint', risk: 'low', uncertainty: 'low', evidenceBindingIds: [], explanation: [], authoredBy: { kind: 'developer', id: 'owner', source: 'manual' }, subjectSelectorId: 'runtime.refactor', relations: {}, createdAt: OBSERVED, updatedAt: OBSERVED, category: 'refactor_proposal', payload: { assessmentDigest: D('assessment'), proposalDigest: D('proposal'), scale: 'cross_module', affectedNodeIds: ['runtime.refactor', 'workflow.refactor'], majorChangeReasons: [], baselineSnapshotDigest: D('stats'), targetOutcomes: [], killList: [] } };
  const request: MaterializeRefactorProgramInput = { repo_root: root, expected_current_sha256: current.current_sha256, idempotency_key: 'materialize', observed_at: '2026-09-04T02:10:00.000Z', program, sprint_path: sprint, sprint_title: 'Refactor rf-1', program_path: 'plans/refactors/rf-1.refactor-program.v1.json', units: [{ recommendationId: 'rec-1', architectureNodeId: 'runtime.refactor', taskId: TASK, taskText: 'Refactor runtime', acceptanceText: 'Module acceptance passes', planPath: 'plans/plan-rf-runtime.md', planBytes: '# Plan\n', kind: 'implementation' as const, primaryCapability: 'capability.runtime-harness.refactor-program', dependsOnWorkPackageIds: [], priority: 50, requiredAcceptance: [{ gate: 'module' as const, policy_id: 'rf-runtime', policy_ref: artifacts[0].path, policy_revision: D(artifacts[0].bytes) }], rollbackBoundary: { kind: 'work_package' as const, boundary_id: 'rf-runtime', boundary_ref: artifacts[1].path, boundary_revision: D(artifacts[1].bytes) }, retryPolicy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'] as const, backoff: { kind: 'exponential' as const, initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' as const } }], artifacts, env, now: () => '2026-09-04T02:10:00.000Z', recommendation_authority_reader: () => [recommendation] };
  const secondTask = 'c'.repeat(64);
  const fullProgram = buildRefactorProgram({ ...program, bindings: [program.bindings[0]!, { ...program.bindings[0]!, workPackageId: 'rf-workflow', taskRef: `${sprint}#${secondTask}` }] });
  const secondRollback = { path: 'plans/rollback/rf-workflow.json', bytes: 'rollback workflow\n' };
  const fullRequest: MaterializeRefactorProgramInput = { ...request, program: fullProgram,
    units: [...request.units, { ...request.units[0]!, architectureNodeId: 'workflow.refactor', taskId: secondTask, taskText: 'Refactor workflow', planPath: 'plans/plan-rf-workflow.md', planBytes: '# Workflow Plan\n', dependsOnWorkPackageIds: ['rf-runtime'], rollbackBoundary: { kind: 'work_package', boundary_id: 'rf-workflow', boundary_ref: secondRollback.path, boundary_revision: D(secondRollback.bytes) } }],
    artifacts: [...artifacts, secondRollback],
  };
  return { root, home, env, request: fullRequest, recommendation };
}


afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function measurement(request: RefactorVerificationRequestV1, disposition: RefactorResolutionEvidenceV1['disposition']): RefactorVerifyResultV1 {
  const basis = { schemaVersion: 'archcontext.refactor-resolution-evidence/v1' as const, recommendationId: request.recommendationId, recommendationDigest: D('opaque-provider-id'), beforeSnapshotDigest: D('before'), afterSnapshotDigest: D('after'), verifiedHeadSha: request.expectedHeadSha!, verifiedWorktreeDigest: request.expectedWorktreeDigest!, expectedOutcomes: [{ outcomeId: 'no-cycle', metric: 'repositorySummary.crossModuleCycleCount', subjectSelectorId: 'runtime.refactor', nodeId: null, operator: 'equals' as const, value: 0, required: true }], observedOutcomes: [{ outcomeId: 'no-cycle', observedValue: disposition === 'resolved' ? 0 : 1, satisfied: disposition === 'resolved', direction: disposition === 'resolved' ? 'improved' as const : 'unchanged' as const }], residuals: [], executionEvidenceRefs: request.executionEvidenceRefs ?? [], disposition, verifiedAt: OBSERVED };
  const evidence = { ...basis, resolutionDigest: refactorResolutionEvidenceDigest({ ...basis, resolutionDigest: D('placeholder') }) };
  return { schemaVersion: 'archcontext.runtime-refactor-verify/v1', repository: { repositoryId: 'repo.test', storageRepositoryId: 'storage.test' }, worktree: { workspaceId: 'workspace.test', storageWorkspaceId: 'storage.test', branch: 'main', headSha: request.expectedHeadSha!, worktreeDigest: request.expectedWorktreeDigest! }, recommendationId: request.recommendationId, disposition, evidence };
}
async function executeFixture() {
  const f = fixture(); const materialized = materializeRefactorProgram(f.request);
  expect(materializeRefactorProgram(f.request).materialized_commit).toBe(materialized.materialized_commit);
  git(f.root, 'reset', '--hard', materialized.materialized_commit); // Disposable repository, materializer publishes via ref CAS.
  const graph = JSON.parse(readFileSync(join(f.root, 'plans/sprints/rf-1.work-graph.v1.json'), 'utf8'));
  expect(graph.work_packages.map((wp: { work_package_id: string }) => wp.work_package_id)).toEqual(['rf-runtime', 'rf-workflow']);
  expect(graph.work_packages[1].depends_on[0].work_package_id).toBe('rf-runtime');
  appendRefactorProgramEvent({ repo_root: f.root, program_id: 'rf-1', expected_current_sha256: materialized.current.current_sha256, idempotency_key: 'execute', operation: 'begin_execute', observed_at: '2026-09-04T02:20:00.000Z', env: f.env });
  const items: RefactorPostMergeItemV1[] = [];
  for (const [index, unit] of f.request.units.entries()) {
    git(f.root, 'checkout', '-qb', `task-${index}`);
    const contractPath = `tasks/contracts/task-${index}.md`; mkdirSync(join(f.root, 'tasks/contracts'), { recursive: true }); writeFileSync(join(f.root, contractPath), `# Contract ${index}\n`);
    git(f.root, 'add', contractPath); git(f.root, 'commit', '-qm', `task ${index}`); const head = git(f.root, 'rev-parse', 'HEAD');
    const request = { repo_root: f.root, program: f.request.program, recommendation_id: 'rec-1', candidate_head_sha: head, candidate_worktree_digest: D(`candidate-${index}`), task_id: unit.taskId, contract_path: contractPath, cutover_locator: `.ai/harness/checks/closure-${index}.json`, authority_home: f.home, expected_current_sha256: readRefactorProgramStatus(f.root, 'rf-1', f.env).current.current_sha256, idempotency_key: `verify-${index}`, observed_at: '2026-09-04T02:20:00.000Z', env: f.env };
    const contractSha = D(readFileSync(join(f.root, contractPath)));
    const deps = {
      verify_contract: () => ({ reportBytes: Buffer.from(`contract-pass-${index}`) }),
      verify_cutover: () => ({ status: 'closed', contractSha256: contractSha.slice(7), headSha: head, closureSha256: H(`closure-${index}`) }) as never,
      verify_candidate: (r: RefactorVerificationRequestV1) => measurement(r, index === 0 ? 'not_improved' : 'partially_resolved'),
      verify_acceptance: async () => ({ receipt: { contract_sha256: contractSha, target_revision: head, disposition: 'external_pass' } as never, bytes: Buffer.from(`acceptance-${index}`) }),
    };
    if (index === 0) {
      for (const disposition of ['stale', 'regressed'] as const) await expect(verifyRefactorCandidate(request, { ...deps, verify_candidate: (r) => measurement(r, disposition) })).rejects.toThrow('measurement');
      await expect(verifyRefactorCandidate({ ...request, task_id: 'e'.repeat(64) }, deps)).rejects.toThrow('not bound');
    }
    const candidate = await verifyRefactorCandidate(request, deps); expect(candidate.candidateVerify).toBe('passed');
    git(f.root, 'checkout', '-q', 'main'); git(f.root, 'merge', '--ff-only', `task-${index}`); git(f.root, 'commit', '--allow-empty', '-qm', `merge receipt ${index}`);
    const binding = buildRefactorExecutionBinding({ recommendationId: 'rec-1', recommendationDigest: D('rec'), taskId: unit.taskId, taskRevision: candidate.taskRevision, planPath: unit.planPath, planSha256: D(unit.planBytes), contractPath, contractSha256: contractSha, cutoverClosureSha256: candidate.cutoverClosureSha256, acceptanceReceiptSha256: candidate.acceptanceReceiptSha256, pullRequestNumber: index + 1, pullRequestHeadSha: head, mergeCommitSha: git(f.root, 'rev-parse', 'HEAD') });
    items.push({ binding, candidateVerification: candidate, acceptanceReceiptLocator: `.repo-harness/acceptance-${index}.json`, mergeReceiptLocator: `.repo-harness/merge-${index}.json`, mergeReceiptSha256: D(`merge-${index}`) });
  }
  const finalMain = git(f.root, 'rev-parse', 'HEAD');
  const post = { repo_root: f.root, program: f.request.program, final_main_sha: finalMain, final_worktree_digest: D('final'), items, expected_current_sha256: readRefactorProgramStatus(f.root, 'rf-1', f.env).current.current_sha256, idempotency_key: 'post', observed_at: '2026-09-04T02:20:00.000Z', env: f.env };
  return { ...f, items, post, finalMain };
}

test('one accepted recommendation materializes, verifies and resolves two sequential Work Packages exactly once', async () => {
  const f = await executeFixture(); let resolves = 0; const requests: RefactorVerificationRequestV1[] = [];
  const deps = { verify: (r: RefactorVerificationRequestV1) => { requests.push(r); return measurement(r, 'resolved'); }, resolve: () => { resolves++; }, recommendations: () => [{ ...f.recommendation, status: resolves ? 'resolved' as const : 'accepted' as const }] };
  const result = await resolveRefactorPostMerge({ ...f.post, items: [...f.items].reverse() }, deps);
  expect(requests).toHaveLength(1); expect(resolves).toBe(1); expect(requests[0]!.expectedHeadSha).toBe(f.finalMain);
  expect(requests[0]!.executionEvidenceRefs).toHaveLength(8);
  expect(requests[0]!.executionEvidenceRefs!.filter((r) => r.kind === 'task_contract').map((r) => r.locator)).toEqual(f.items.map((item) => item.binding.contractPath));
  expect(result.stage).toBe('resolved'); expect(result.board.cards.map((card) => card.workPackageId)).toEqual(['rf-runtime', 'rf-workflow']);
  expect(result.board.cards.map((card) => card.executionBindingSha256)).toEqual(f.items.map((item) => item.binding.bindingSha256));
  expect(readRefactorProgramStatus(f.root, 'rf-1', f.env).current.state).toBe('complete');
  // A concurrent caller may still hold the pre-merge current after the winner completes.
  expect(() => appendRefactorProgramEvent({ repo_root: f.root, program_id: 'rf-1', expected_current_sha256: f.post.expected_current_sha256,
    idempotency_key: 'post:merge', operation: 'begin_merge', evidence_refs: f.items.map((item) => item.binding.bindingSha256),
    observed_at: f.post.observed_at, owned_target_revision: f.finalMain, env: f.env })).not.toThrow();

  expect((await resolveRefactorPostMerge(f.post, deps)).board).toEqual(result.board); expect(requests).toHaveLength(1); expect(resolves).toBe(1);
  expect(rebuildRefactorBoard({ repo_root: f.root, program: f.request.program, head_sha: f.finalMain, env: f.env }, deps).board).toEqual(result.board);
});

test('rejects missing, duplicated or crossed task evidence before aggregate measurement', async () => {
  const f = await executeFixture(); let verifies = 0; const deps = { verify: (r: RefactorVerificationRequestV1) => { verifies++; return measurement(r, 'resolved'); }, recommendations: () => [f.recommendation] };
  await expect(resolveRefactorPostMerge({ ...f.post, items: f.items.slice(0, 1) }, deps)).rejects.toThrow('every Program binding');
  await expect(resolveRefactorPostMerge({ ...f.post, items: [f.items[0]!, f.items[0]!] }, deps)).rejects.toThrow('exactly cover');
  const crossed = { ...f.items[1]!, candidateVerification: f.items[0]!.candidateVerification };
  await expect(resolveRefactorPostMerge({ ...f.post, items: [crossed, f.items[0]!] }, deps)).rejects.toThrow('does not match');
  expect(verifies).toBe(0); expect(readRefactorExecutionBindings(f.root, 'rf-1')).toHaveLength(0);
  expect(() => appendRefactorExecutionBinding({ repo_root: f.root, program: f.request.program, candidate_verification: f.items[0]!.candidateVerification, binding: buildRefactorExecutionBinding({ ...f.items[0]!.binding, taskId: 'e'.repeat(64) }), env: f.env })).toThrow('does not belong');
});

test('aggregate lifecycle retry reuses measurement independent of input order and rejects changed refs', async () => {
  const f = await executeFixture(); let verifies = 0; let resolves = 0;
  const deps = { verify: (r: RefactorVerificationRequestV1) => { verifies++; return measurement(r, 'resolved'); }, resolve: () => { if (++resolves === 1) throw new Error('interrupted lifecycle'); }, recommendations: () => [{ ...f.recommendation, status: resolves > 1 ? 'resolved' as const : 'accepted' as const }] };
  await expect(resolveRefactorPostMerge(f.post, deps)).rejects.toThrow('interrupted lifecycle');
  await expect(resolveRefactorPostMerge({ ...f.post, items: [{ ...f.items[0]!, mergeReceiptSha256: D('wrong') }, f.items[1]!] }, deps)).rejects.toThrow('exact final main and execution evidence');
  expect((await resolveRefactorPostMerge({ ...f.post, items: [...f.items].reverse() }, deps)).stage).toBe('resolved'); expect(verifies).toBe(1); expect(resolves).toBe(2);
});

test('Board distinguishes partial execution and refuses a resolution missing any mapped task', async () => {
  const f = await executeFixture(); const input = { program: f.request.program, measuredHeadSha: f.finalMain, recommendations: [f.recommendation], bindings: [f.items[0]!.binding], resolutions: [] };
  const board = projectRefactorBoard(input); expect(board.cards.map((card) => card.execution)).toEqual(['merged', 'awaiting_execution']);
  const evidence = measurement({ schemaVersion: 'archcontext.refactor-verification-request/v1', recommendationId: 'rec-1', expectedHeadSha: f.finalMain, expectedWorktreeDigest: D('final'), executionEvidenceRefs: [] }, 'resolved').evidence!;
  expect(() => projectRefactorBoard({ ...input, resolutions: [evidence] })).toThrow('exact board head');
  expect(() => projectRefactorBoard({ ...input, bindings: [f.items[0]!.binding, f.items[0]!.binding] })).toThrow('duplicate execution binding');
});
