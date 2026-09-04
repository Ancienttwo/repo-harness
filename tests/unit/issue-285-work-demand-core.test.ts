import { describe, expect, test } from 'bun:test';

import {
  WorkDemandError,
  assertWorkDemandActor,
  buildAcceptedWorkDemandProjection,
  buildMaterializedWorkDemandReceipt,
  buildWorkDemand,
  nextWorkDemandState,
  validateWorkDemand,
  type WorkDemandActorV1,
  type WorkDemandCurrentV1,
} from '../../src/core/engineers/work-demand';

const D = (c: string) => `sha256:${c.repeat(64)}`;
const TASK = '1'.repeat(64);
const FENCE = { engineer_id: 'engineer:capability.runtime.source', binding_id: '11111111-1111-4111-8111-111111111111', binding_generation: 1, engineer_contract_revision: D('a') };
const HUMAN: WorkDemandActorV1 = { kind: 'human', principal_ref: 'human:owner' };

function demand() {
  return buildWorkDemand({
    repository_id: 'repo_0123456789abcdef', demand_id: '22222222-2222-4222-8222-222222222222', idempotency_key: 'demand-one',
    source_engineer: FENCE, source_capability_id: 'capability.runtime.source', target_capability_id: 'capability.runtime.target',
    target_engineer_id: 'engineer:capability.runtime.target', problem: 'The current contract cannot change the target module.',
    desired_outcome: 'Expose one reviewed target behavior.', contract_escape_reason: 'The target capability is outside the current contract.',
    resource_refs: [{ kind: 'file', ref: 'src/source.ts', sha256: D('b') }], requested_urgency: 'normal',
    dependency_hints: ['existing-api'], created_at: '2026-09-04T00:00:00.000Z',
  });
}

function current(state: WorkDemandCurrentV1['state']): WorkDemandCurrentV1 {
  const subject = demand();
  return { protocol: 1, kind: 'repo-harness-work-demand-current', demand_id: subject.demand_id, demand_sha256: subject.demand_sha256,
    revision: 1, state, current_event_sha256: D('c'), accepted_projection: null, materialization_receipt: null,
    previous_current_digest: null, current_digest: D('d') };
}

function definition() {
  return {
    work_package_id: 'demand-work', task_id: TASK, primary_capability: 'capability.runtime.target', depends_on: [], priority: 50,
    concurrency: { scope: 'repo', key: 'capability.runtime.target' }, execution_surface: 'contract', integration_group: null,
    required_acceptance: [{ gate: 'module', policy_id: 'module-default', policy_ref: 'plans/policies/module.json', policy_revision: D('e') }],
    retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } as const,
    rollback_boundary: { kind: 'work_package', boundary_id: 'repo_0123456789abcdef:demand-work', boundary_ref: 'plans/rollback/demand-work.json', boundary_revision: D('f') },
  } as const;
}

describe('issue #285 WorkDemand core authority', () => {
  test('builds one digest-bound bounded proposal and rejects semantic drift', () => {
    const subject = demand();
    expect(validateWorkDemand(subject)).toEqual(subject);
    expect(() => validateWorkDemand({ ...subject, desired_outcome: 'forged' })).toThrow(WorkDemandError);
    expect(() => buildWorkDemand({ ...subject, source_capability_id: 'capability.runtime.other' } as any)).toThrow('does not own');
  });

  test('keeps requested urgency and dependency hints advisory until Human acceptance', () => {
    const subject = demand();
    const projection = buildAcceptedWorkDemandProjection({ demand_id: subject.demand_id, demand_sha256: subject.demand_sha256,
      accepted_from_current_digest: D('d'), sprint_path: 'plans/sprints/demo.sprint.md', expected_sprint_commit: 'a'.repeat(40),
      expected_work_graph_revision: null, task_id: TASK, task_text: 'Implement reviewed behavior', task_mode: 'contract',
      acceptance_text: 'Target tests pass', work_package: definition(), planning_required: true });
    expect(projection).not.toHaveProperty('requested_urgency');
    expect(projection.work_package.priority).toBe(50);
    expect(projection.work_package_revision).toMatch(/^sha256:/);
  });

  test('only the exact requester may propose/submit and only Human authority may accept', () => {
    const subject = demand();
    const engineer: WorkDemandActorV1 = { kind: 'engineer', principal: FENCE };
    expect(() => assertWorkDemandActor(subject, 'submit', engineer)).not.toThrow();
    expect(() => assertWorkDemandActor(subject, 'accept', engineer)).toThrow('Human');
    expect(() => assertWorkDemandActor(subject, 'accept', HUMAN)).not.toThrow();
    expect(() => assertWorkDemandActor(subject, 'submit', { kind: 'engineer', principal: { ...FENCE, binding_generation: 2 } })).toThrow('exact requester');
  });

  test('exposes only the closed lifecycle and materialization stays distinct from integration', () => {
    expect(nextWorkDemandState(null, 'propose')).toBe('proposed');
    expect(nextWorkDemandState(current('proposed'), 'submit')).toBe('under_review');
    expect(nextWorkDemandState(current('under_review'), 'accept')).toBe('accepted');
    expect(nextWorkDemandState(current('accepted'), 'begin_materialization')).toBe('materializing');
    expect(nextWorkDemandState(current('materializing'), 'materialize')).toBe('materialized');
    expect(nextWorkDemandState(current('materialized'), 'integrate')).toBe('integrated');
    expect(() => nextWorkDemandState(current('proposed'), 'materialize')).toThrow('invalid');
  });

  test('materialization receipt proves work creation without becoming a claim', () => {
    const subject = demand();
    const receipt = buildMaterializedWorkDemandReceipt({ demand_id: subject.demand_id, demand_sha256: subject.demand_sha256,
      projection_sha256: D('2'), repository_id: subject.repository_id, sprint_path: 'plans/sprints/demo.sprint.md', task_id: TASK,
      work_package_id: 'demand-work', work_package_revision: D('3'), materialized_commit: 'b'.repeat(40) });
    expect(receipt.receipt_sha256).toMatch(/^sha256:/);
    expect(receipt).not.toHaveProperty('claim_id');
    expect(receipt).not.toHaveProperty('lease_generation');
  });
});
