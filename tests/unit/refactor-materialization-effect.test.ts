import { afterAll, describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { sealProgramAuthorization } from '../../src/core/automation/budget';
import { buildRefactorProgram } from '../../src/core/refactor/program';
import { buildRefactorProgramDefinition } from '../../src/core/refactor/program-state';
import { mintProgramAuthorization } from '../../src/effects/automation/grant-store';
import { materializeRefactorProgram } from '../../src/effects/refactor/materialization';
import { appendRefactorProgramEvent, createRefactorProgram, readRefactorProgramStatus } from '../../src/effects/refactor/program-store';
import { activateRefactorFixture } from '../helpers/refactor-activation-fixture';

const roots: string[] = [];
const D = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
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
  const authorization = sealProgramAuthorization({ authorization_id: 'authorization-rf', repository_id: 'repo_0123456789abcdef', target_ref: 'refs/heads/main', target_revision: revision, work_graph_revision: H('graph'), allowed_work_package_ids: ['rf-runtime'], allowed_risk_tiers: ['low'], merge_mode: 'disabled', allowed_merge_method: 'squash', max_repair_cycles: 2, budget: limits, contract_scope: 'contract_less', contract_path: null, issued_by: 'ancienttwo', issued_at: OBSERVED, expires_at: '2027-09-04T00:00:00.000Z' });
  mintProgramAuthorization({ repo_root: root, authorization, env });
  const definition = buildRefactorProgramDefinition({ program_id: 'rf-1', authorization_id: authorization.authorization_id, authorization_sha256: authorization.authorization_sha256, repository_id: authorization.repository_id, target_ref: authorization.target_ref, target_revision: revision, base_main_sha: revision, created_at: OBSERVED });
  let current = createRefactorProgram({ repo_root: root, program: definition, idempotency_key: 'create', env }).current;
  for (const [index, operation] of (['begin_scan', 'observe', 'begin_authoring', 'assess', 'begin_route'] as const).entries()) current = appendRefactorProgramEvent({ repo_root: root, program_id: 'rf-1', expected_current_sha256: current.current_sha256, idempotency_key: `step-${index}`, operation, observed_at: `2026-09-04T02:0${index + 1}:00.000Z`, env }).current;
  const sprint = 'plans/sprints/rf-1.sprint.md'; const program = buildRefactorProgram({ programId: 'rf-1', baseMainSha: revision, providerStage: 'scan', statisticsSnapshotDigest: D('stats'), assessmentDigest: D('assessment'), proposalDigest: D('proposal'), proposalAuthor: { kind: 'agent', source: 'gpt_pro' }, scale: 'module', routeReasonCodes: ['single-node-scope'], majorChangeReasons: [], route: 'module_refactor', affectedNodeIds: ['runtime.refactor'], bindings: [{ recommendationId: 'rec-1', recommendationDigest: D('rec'), candidateAlias: 'C01', workPackageId: 'rf-runtime', taskRef: `${sprint}#${TASK}`, executionBoundary: 'module' }] });
  const artifacts = [{ path: 'plans/policies/rf-runtime.json', bytes: 'acceptance\n' }, { path: 'plans/rollback/rf-runtime.json', bytes: 'rollback\n' }];
  const request = { repo_root: root, expected_current_sha256: current.current_sha256, idempotency_key: 'materialize', observed_at: '2026-09-04T02:10:00.000Z', program, sprint_path: sprint, sprint_title: 'Refactor rf-1', program_path: 'plans/refactors/rf-1.refactor-program.v1.json', units: [{ recommendationId: 'rec-1', architectureNodeId: 'runtime.refactor', taskId: TASK, taskText: 'Refactor runtime', acceptanceText: 'Module acceptance passes', planPath: 'plans/plan-rf-runtime.md', planBytes: '# Plan\n', kind: 'implementation' as const, primaryCapability: 'capability.runtime-harness.refactor-program', dependsOnWorkPackageIds: [], priority: 50, requiredAcceptance: [{ gate: 'module' as const, policy_id: 'rf-runtime', policy_ref: artifacts[0].path, policy_revision: D(artifacts[0].bytes) }], rollbackBoundary: { kind: 'work_package' as const, boundary_id: 'rf-runtime', boundary_ref: artifacts[1].path, boundary_revision: D(artifacts[1].bytes) }, retryPolicy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'] as const, backoff: { kind: 'exponential' as const, initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' as const } }], artifacts, env, now: () => '2026-09-04T02:10:00.000Z', recommendation_authority_reader: () => [{ recommendationId: 'rec-1', recommendationDigest: D('rec') }] };
  return { root, env, request };
}

afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

describe('Module 6 atomic Refactor Program materialization', () => {
  test('publishes program, Sprint, Plan, policies, rollback and Work Graph in one commit', () => {
    const f = fixture(); const result = materializeRefactorProgram(f.request); const head = execFileSync('git', ['rev-parse', 'main'], { cwd: f.root, encoding: 'utf8' }).trim();
    expect(head).toBe(result.materialized_commit); expect(readRefactorProgramStatus(f.root, 'rf-1', f.env).current.state).toBe('planning');
    const changed = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', head], { cwd: f.root, encoding: 'utf8' }).trim().split('\n').sort();
    expect(changed).toEqual(['plans/plan-rf-runtime.md', 'plans/policies/rf-runtime.json', 'plans/refactors/rf-1.refactor-program.v1.json', 'plans/rollback/rf-runtime.json', 'plans/sprints/rf-1.sprint.md', 'plans/sprints/rf-1.work-graph.v1.json']);
    expect(JSON.parse(execFileSync('git', ['show', `${head}:plans/sprints/rf-1.work-graph.v1.json`], { cwd: f.root, encoding: 'utf8' })).work_packages[0].concurrency.key).toBe('runtime.refactor');
    expect(materializeRefactorProgram(f.request).materialized_commit).toBe(head);
  });

  test('recovers idempotently after the ref CAS and leaves no partial tree before it', () => {
    const f = fixture(); expect(() => materializeRefactorProgram({ ...f.request, crash_hook: (boundary) => { if (boundary === 'after_ref_cas') throw new Error('crash'); } })).toThrow('cannot create atomic');
    expect(readRefactorProgramStatus(f.root, 'rf-1', f.env).current.state).toBe('materializing');
    const recovered = materializeRefactorProgram(f.request); expect(recovered.current.state).toBe('planning');
    expect(execFileSync('git', ['show', `${recovered.materialized_commit}:plans/plan-rf-runtime.md`], { cwd: f.root, encoding: 'utf8' })).toBe('# Plan\n');
  });

  test('rejects unaccepted recommendations and work packages outside the operator grant', () => {
    const unaccepted = fixture();
    expect(() => materializeRefactorProgram({ ...unaccepted.request, recommendation_authority_reader: () => [] })).toThrow('recommendation is not accepted');
    const unauthorized = fixture();
    const program = buildRefactorProgram({ ...unauthorized.request.program, bindings: [{ ...unauthorized.request.program.bindings[0]!, workPackageId: 'not-authorized' }] });
    expect(() => materializeRefactorProgram({ ...unauthorized.request, program })).toThrow('work package is not authorized');
  });

  test('does not advance the target ref when creation crashes before CAS', () => {
    const f = fixture(); const before = execFileSync('git', ['rev-parse', 'main'], { cwd: f.root, encoding: 'utf8' }).trim();
    expect(() => materializeRefactorProgram({ ...f.request, crash_hook: (boundary) => { if (boundary === 'before_ref_cas') throw new Error('crash'); } })).toThrow('cannot create atomic');
    expect(execFileSync('git', ['rev-parse', 'main'], { cwd: f.root, encoding: 'utf8' }).trim()).toBe(before);
  });

  test('rejects an exact child whose transaction bytes were changed', () => {
    const f = fixture();
    expect(() => materializeRefactorProgram({ ...f.request, crash_hook: (boundary) => { if (boundary === 'after_ref_cas') throw new Error('crash'); } })).toThrow('cannot create atomic');
    const index = join(f.root, '.git', 'malicious-index'); const indexEnv = { ...process.env, GIT_INDEX_FILE: index };
    execFileSync('git', ['read-tree', 'main'], { cwd: f.root, env: indexEnv });
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: f.root, input: '# altered\n', encoding: 'utf8' }).trim();
    execFileSync('git', ['update-index', '--cacheinfo', '100644', blob, 'plans/plan-rf-runtime.md'], { cwd: f.root, env: indexEnv });
    const tree = execFileSync('git', ['write-tree'], { cwd: f.root, env: indexEnv, encoding: 'utf8' }).trim();
    const parent = execFileSync('git', ['rev-parse', 'main^1'], { cwd: f.root, encoding: 'utf8' }).trim();
    const malicious = execFileSync('git', ['commit-tree', tree, '-p', parent, '-m', 'alter transaction'], { cwd: f.root, env: { ...indexEnv, GIT_AUTHOR_NAME: 'Fixture', GIT_AUTHOR_EMAIL: 'fixture@example.com', GIT_COMMITTER_NAME: 'Fixture', GIT_COMMITTER_EMAIL: 'fixture@example.com' }, encoding: 'utf8' }).trim();
    execFileSync('git', ['update-ref', 'refs/heads/main', malicious], { cwd: f.root });
    expect(() => materializeRefactorProgram(f.request)).toThrow('target moved outside this materialization transaction');
  });
});
