import { createHash } from 'crypto';
import { describe, expect, test } from 'bun:test';

import { buildRefactorProgram } from '../../src/core/refactor/program';
import { projectRefactorMaterialization, type RefactorMaterializationUnitV1 } from '../../src/core/refactor/materialization';

const D = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const TASK = 'a'.repeat(64);
const SPRINT = 'plans/sprints/refactor.sprint.md';
const retry = { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } as const;

function fixture(scale: 'module' | 'insufficient_evidence' = 'module') {
  const program = buildRefactorProgram({
    programId: 'rf-1', baseMainSha: 'a'.repeat(40), providerStage: 'scan', statisticsSnapshotDigest: D('stats'), assessmentDigest: D('assessment'), proposalDigest: D('proposal'), proposalAuthor: { kind: 'agent', source: 'gpt_pro' }, scale,
    routeReasonCodes: scale === 'module' ? ['single-node-scope'] : ['code-facts-missing'], majorChangeReasons: [], route: scale === 'module' ? 'module_refactor' : 'proof_required', affectedNodeIds: ['runtime.refactor'],
    bindings: [{ recommendationId: 'rec-1', recommendationDigest: D('rec'), candidateAlias: 'C01', workPackageId: 'rf-1-runtime', taskRef: `${SPRINT}#${TASK}`, executionBoundary: 'module' }],
  });
  const artifacts = [{ path: 'plans/policies/rf-1.json', bytes: 'accept' }, { path: 'plans/rollback/rf-1.json', bytes: 'rollback' }];
  const units: RefactorMaterializationUnitV1[] = [{ recommendationId: 'rec-1', architectureNodeId: 'runtime.refactor', taskId: TASK, taskText: 'Refactor runtime module', acceptanceText: 'Module gate passes', planPath: 'plans/plan-rf-1.md', planBytes: '# Plan\n', kind: 'implementation', primaryCapability: 'capability.runtime-harness.refactor-program', dependsOnWorkPackageIds: [], priority: 50, requiredAcceptance: [{ gate: 'module' as const, policy_id: 'rf-1', policy_ref: artifacts[0].path, policy_revision: D(artifacts[0].bytes) }], rollbackBoundary: { kind: 'work_package' as const, boundary_id: 'rf-1-runtime', boundary_ref: artifacts[1].path, boundary_revision: D(artifacts[1].bytes) }, retryPolicy: retry }];
  return { repositoryId: 'repo_0123456789abcdef', sprintPath: SPRINT, sprintSchema: 2 as const, firstRowIndex: 1, maximumModulesPerProgram: 10, program, units, artifacts };
}

describe('Refactor Module 6 materialization contract', () => {
  test('projects one bound module through canonical row and Work Graph contracts', () => {
    const output = projectRefactorMaterialization(fixture());
    expect(output.rows).toEqual([`| 1 | ${TASK} | [ ] | Refactor runtime module | contract | Module gate passes | plans/plan-rf-1.md |`]);
    expect(output.workGraph.work_packages[0].concurrency.key).toBe('runtime.refactor');
    expect(output.workGraph.work_packages[0].execution_surface).toBe('contract');
    expect(output.workGraph.work_packages[0].rollback_boundary.boundary_id).toBe('rf-1-runtime');
  });

  test('materializes insufficient evidence only as investigation work', () => {
    const proof = fixture('insufficient_evidence');
    proof.units[0] = { ...proof.units[0], kind: 'investigation' };
    expect(projectRefactorMaterialization(proof).workGraph.work_packages).toHaveLength(1);
    const implementation = fixture('insufficient_evidence');
    expect(() => projectRefactorMaterialization(implementation)).toThrow('only materialize investigation');
  });

  test('projects cross-module dependencies and serializes writers by architecture node', () => {
    const value = fixture(); const secondTask = 'c'.repeat(64);
    value.program = buildRefactorProgram({ ...value.program, scale: 'cross_module', routeReasonCodes: ['multi-node-scope'], route: 'cross_module_refactor', affectedNodeIds: ['runtime.refactor', 'workflow.materialization'], bindings: [
      { ...value.program.bindings[0], executionBoundary: 'cross_module_stage' },
      { recommendationId: 'rec-2', recommendationDigest: D('rec-2'), candidateAlias: 'C02', workPackageId: 'rf-1-workflow', taskRef: `${SPRINT}#${secondTask}`, executionBoundary: 'cross_module_stage' },
    ] });
    value.artifacts.push({ path: 'plans/policies/rf-2.json', bytes: 'accept-2' }, { path: 'plans/rollback/rf-2.json', bytes: 'rollback-2' });
    value.units.push({ ...value.units[0], recommendationId: 'rec-2', architectureNodeId: 'workflow.materialization', taskId: secondTask, taskText: 'Refactor workflow module', planPath: 'plans/plan-rf-2.md', planBytes: '# Plan 2\n', dependsOnWorkPackageIds: ['rf-1-runtime'], requiredAcceptance: [{ gate: 'module', policy_id: 'rf-2', policy_ref: 'plans/policies/rf-2.json', policy_revision: D('accept-2') }], rollbackBoundary: { kind: 'work_package', boundary_id: 'rf-1-workflow', boundary_ref: 'plans/rollback/rf-2.json', boundary_revision: D('rollback-2') } });
    const output = projectRefactorMaterialization(value);
    expect(output.workGraph.work_packages[1].depends_on[0].work_package_id).toBe('rf-1-runtime');
    expect(output.workGraph.work_packages.map((entry) => entry.concurrency.key)).toEqual(['runtime.refactor', 'workflow.materialization']);
  });

  test('rejects limits, stale artifacts, and binding drift', () => {
    const over = { ...fixture(), maximumModulesPerProgram: 0 };
    expect(() => projectRefactorMaterialization(over)).toThrow('maximumModulesPerProgram is invalid');
    const stale = fixture(); stale.artifacts[0] = { ...stale.artifacts[0], bytes: 'changed' };
    expect(() => projectRefactorMaterialization(stale)).toThrow('not bound to exact artifact bytes');
    const drift = fixture(); drift.units[0] = { ...drift.units[0], architectureNodeId: 'runtime.other' };
    expect(() => projectRefactorMaterialization(drift)).toThrow('unaffected architecture node');
  });
});
