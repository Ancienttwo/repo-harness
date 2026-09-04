import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { RecommendationV3 } from 'archctx-contracts';

import { sealProgramAuthorization } from '../../src/core/automation/budget';
import { buildRefactorProgram } from '../../src/core/refactor/program';
import { buildRefactorProgramDefinition } from '../../src/core/refactor/program-state';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { prepareRefactorArchitectureIntervention, verifyRefactorArchitectureApproval } from '../../src/effects/refactor/architecture-intervention';
import { materializeRefactorProgram } from '../../src/effects/refactor/materialization';
import { appendRefactorProgramEvent, createRefactorProgram } from '../../src/effects/refactor/program-store';
import { activateRefactorFixture } from '../helpers/refactor-activation-fixture';

const roots: string[] = []; const D = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`; const H = (value: string) => createHash('sha256').update(value).digest('hex');
const NOW = '2026-09-04T04:00:00.000Z';
const limits = { max_agent_turns: 10, max_successful_acquisitions: 3, max_runner_invocations: 10, max_provider_failures: 3, max_consecutive_no_progress_steps: 2, max_repair_cycles: 2, max_wall_clock_seconds: 3600, max_input_tokens: null, max_output_tokens: null, max_cost_micros: null } as const;

function recommendation(unresolvedTargets: string[] = []): RecommendationV3 {
  return { schemaVersion: 'archcontext.recommendation/v3', recommendationId: 'recommendation.arch', runId: 'run.arch', fingerprint: D('recommendation'), subject: 'runtime.refactor', status: 'accepted', confidence: 'high', enforcement: 'complete', risk: 'high', uncertainty: 'low', evidenceBindingIds: [], explanation: [], authoredBy: { kind: 'developer', id: 'owner', source: 'manual' }, subjectSelectorId: 'runtime.refactor', relations: {}, createdAt: NOW, updatedAt: NOW, category: 'refactor_proposal', payload: { assessmentDigest: D('assessment'), proposalDigest: D('proposal'), scale: 'architecture', affectedNodeIds: ['runtime.refactor'], majorChangeReasons: ['ownership-changed'], baselineSnapshotDigest: D('stats'), targetDelta: { interventionId: 'intervention-1', trigger: ['ownership consolidation'], thesis: 'One owner', targetState: { owners: { lifecycle: 'runtime.refactor' }, requiredRelations: ['runtime.refactor->workflow'], removedConcepts: ['dual-owner'] }, migrationState: { active: true, compatibilityContracts: [], temporaryRelations: [] }, completionCriteria: [], falsifiers: ['two owners remain'], benefitLedger: { benefits: ['single owner'], costs: ['migration'], rollbackPoint: 'before cutover' }, unresolvedTargets }, targetOutcomes: [], killList: [] } };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'refactor-architecture-')); roots.push(root); const home = mkdtempSync(join(tmpdir(), 'refactor-architecture-home-')); roots.push(home);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root }); execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root }); execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  mkdirSync(join(root, '.ai', 'harness'), { recursive: true }); writeFileSync(join(root, '.ai', 'harness', 'policy.json'), `${JSON.stringify({ refactor: { mode: 'active' } })}\n`); execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-qm', 'baseline'], { cwd: root });
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); const env = { ...process.env, REPO_HARNESS_HOME: home }; activateRefactorFixture(root, 'repo_0123456789abcdef', revision, 'active_module');
  const authorization = sealProgramAuthorization({ authorization_id: 'authorization-arch', repository_id: 'repo_0123456789abcdef', target_ref: 'refs/heads/main', target_revision: revision, work_graph_revision: H('graph'), allowed_work_package_ids: ['rf-architecture'], allowed_risk_tiers: ['low'], merge_mode: 'disabled', allowed_merge_method: 'squash', max_repair_cycles: 2, budget: limits, contract_scope: 'contract_less', contract_path: null, issued_by: 'owner', issued_at: NOW, expires_at: '2027-09-04T00:00:00.000Z' }); mintProgramAuthorization({ repo_root: root, authorization, env });
  const definition = buildRefactorProgramDefinition({ program_id: 'rf-arch', authorization_id: authorization.authorization_id, authorization_sha256: authorization.authorization_sha256, repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: revision, base_main_sha: revision, created_at: NOW });
  let current = createRefactorProgram({ repo_root: root, program: definition, idempotency_key: 'create', env }).current;
  for (const [index, operation] of (['begin_scan', 'observe', 'begin_authoring', 'assess', 'begin_route'] as const).entries()) current = appendRefactorProgramEvent({ repo_root: root, program_id: 'rf-arch', expected_current_sha256: current.current_sha256, idempotency_key: `step-${index}`, operation, observed_at: NOW, env }).current;
  const program = buildRefactorProgram({ programId: 'rf-arch', baseMainSha: revision, providerStage: 'scan', statisticsSnapshotDigest: D('stats'), assessmentDigest: D('assessment'), proposalDigest: D('proposal'), proposalAuthor: { kind: 'developer', source: 'manual' }, scale: 'architecture', routeReasonCodes: ['major-change-detected'], majorChangeReasons: ['ownership-changed'], route: 'architecture_intervention', affectedNodeIds: ['runtime.refactor'], bindings: [{ recommendationId: 'recommendation.arch', recommendationDigest: D('recommendation'), candidateAlias: 'C01', workPackageId: 'rf-architecture', taskRef: `plans/sprints/rf-arch.sprint.md#${'d'.repeat(64)}`, executionBoundary: 'architecture_intervention' }] });
  return { root, env, current, program };
}

afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('Module 7 architecture intervention gate', () => {
  test('projects every target-delta field and stops at the approval state', () => {
    const f = fixture(); const record = recommendation();
    const result = prepareRefactorArchitectureIntervention({ repo_root: f.root, program: f.program, expected_current_sha256: f.current.current_sha256, idempotency_key: 'approval', observed_at: NOW, env: f.env, recommendation_reader: () => [record] });
    expect(result.current.state).toBe('architecture_approval_required'); expect(result.intervention.targetDelta.interventionId).toBe('intervention-1'); expect(result.intervention.approvalReference).toStartWith('refactor.intervention.');
    expect(prepareRefactorArchitectureIntervention({ repo_root: f.root, program: f.program, expected_current_sha256: f.current.current_sha256, idempotency_key: 'approval', observed_at: NOW, env: f.env, recommendation_reader: () => [record] }).current.current_sha256).toBe(result.current.current_sha256);
  });

  test('unresolved targets and mismatched existing receipts fail closed', () => {
    const f = fixture(); const blocked = prepareRefactorArchitectureIntervention({ repo_root: f.root, program: f.program, expected_current_sha256: f.current.current_sha256, idempotency_key: 'approval', observed_at: NOW, env: f.env, recommendation_reader: () => [recommendation(['new-node'])] });
    expect(blocked.intervention.readiness).toBe('target_resolution_required');
    expect(() => verifyRefactorArchitectureApproval({ repo_root: f.root, program: f.program, expected_head_sha: f.program.baseMainSha, signal_id: D('signal'), recommendation_reader: () => [recommendation(['new-node'])], receipt_reader: () => { throw new Error('must not read'); } })).toThrow('target remains unresolved');
    const ready = recommendation();
    expect(() => verifyRefactorArchitectureApproval({ repo_root: f.root, program: f.program, expected_head_sha: f.program.baseMainSha, signal_id: D('signal'), recommendation_reader: () => [ready], receipt_reader: () => ({ approvalReference: 'another.event', acceptedChange: { affectedNodeIds: ['runtime.refactor'], reasonCodes: ['ownership-changed'] } }) as never })).toThrow('does not bind');
  });

  test('materializes only after the existing architecture acceptance receipt binds the intervention', () => {
    const f = fixture(); const record = recommendation();
    const prepared = prepareRefactorArchitectureIntervention({ repo_root: f.root, program: f.program, expected_current_sha256: f.current.current_sha256, idempotency_key: 'approval', observed_at: NOW, env: f.env, recommendation_reader: () => [record] });
    const policy = { path: 'plans/policies/rf-architecture.json', bytes: 'acceptance\n' }; const rollback = { path: 'plans/rollback/rf-architecture.json', bytes: 'rollback\n' };
    mkdirSync(join(f.root, 'docs', 'architecture', 'modules'), { recursive: true }); writeFileSync(join(f.root, 'docs', 'architecture', 'modules', 'accepted.md'), '# Accepted architecture\n');
    const receipt = { approvalReference: prepared.intervention.approvalReference, acceptedChange: { affectedNodeIds: ['runtime.refactor'], reasonCodes: ['ownership-changed'] }, result: { files: [{ path: 'docs/architecture/modules/accepted.md', action: 'create', outputDigest: D('# Accepted architecture\n') }] } } as never;
    const result = materializeRefactorProgram({ repo_root: f.root, expected_current_sha256: prepared.current.current_sha256, idempotency_key: 'materialize', observed_at: NOW, program: f.program,
      sprint_path: 'plans/sprints/rf-arch.sprint.md', sprint_title: 'Architecture refactor', program_path: 'plans/refactors/rf-arch.refactor-program.v1.json',
      units: [{ recommendationId: 'recommendation.arch', architectureNodeId: 'runtime.refactor', taskId: 'd'.repeat(64), taskText: 'Apply accepted architecture intervention', acceptanceText: 'Architecture acceptance and module checks pass', planPath: 'plans/plan-rf-architecture.md', planBytes: '# Architecture Plan\n', kind: 'implementation', primaryCapability: 'capability.runtime-harness.refactor-program', dependsOnWorkPackageIds: [], priority: 50, requiredAcceptance: [{ gate: 'module', policy_id: 'rf-architecture', policy_ref: policy.path, policy_revision: D(policy.bytes) }], rollbackBoundary: { kind: 'work_package', boundary_id: 'rf-architecture', boundary_ref: rollback.path, boundary_revision: D(rollback.bytes) }, retryPolicy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } }], artifacts: [policy, rollback], env: f.env,
      architecture_signal_id: D('signal'), architecture_recommendation_reader: () => [record], architecture_receipt_reader: () => receipt, now: () => NOW });
    expect(result.current.state).toBe('planning'); expect(execFileSync('git', ['show', `${result.materialized_commit}:docs/architecture/modules/accepted.md`], { cwd: f.root, encoding: 'utf8' })).toBe('# Accepted architecture\n');
  });
});
