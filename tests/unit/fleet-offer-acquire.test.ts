import { describe, expect, test } from 'bun:test';
import {
  classifyTaskOffer,
  taskOfferRevision,
  type ClassifyTaskOfferInput,
} from '../../src/core/fleet/task-offer';
import { proveCanonicalTaskPlan } from '../../src/effects/state/coordination-canonical-source';

const PLAN = {
  plan_path: 'plans/plan-20260823-0202-fleet-offer-acquire.md',
  contract_path: 'tasks/contracts/20260823-0202-fleet-offer-acquire.contract.md',
  source_ref: 'sprint:plans/sprints/fleet.sprint.md#build the fleet offer',
  plan_sha256: 'sha256:plan',
  contract_sha256: 'sha256:contract',
} as const;

function input(overrides: Partial<ClassifyTaskOfferInput> = {}): ClassifyTaskOfferInput {
  return {
    repo_access_mode: 'read_write',
    row_status: '[ ]',
    mode: 'contract',
    lease_state: 'available',
    snapshot_consistency: 'stable',
    plan: PLAN,
    ...overrides,
  };
}

describe('TaskOfferV1 closed classification', () => {
  test('execution_ready requires the complete contract path', () => {
    expect(classifyTaskOffer(input())).toEqual({
      execution_readiness: 'execution_ready',
      blockers: [],
    });
  });

  test('planning_required is distinct from unsupported when the exact plan is absent', () => {
    const result = classifyTaskOffer(input({ plan: null, plan_failure: 'missing' }));
    expect(result.execution_readiness).toBe('planning_required');
    expect(result.blockers).toEqual([{ code: 'plan_missing', attention_owner: 'agent' }]);
  });

  test('inline rows are visible but never require a contract plan', () => {
    expect(classifyTaskOffer(input({ mode: 'inline', plan: null }))).toEqual({
      execution_readiness: 'inline_ready',
      blockers: [],
    });
  });

  test('unsupported wins over planning when an authority is unavailable', () => {
    const result = classifyTaskOffer(input({
      repo_access_mode: 'read_only',
      plan: null,
      plan_failure: 'missing',
    }));
    expect(result.execution_readiness).toBe('unsupported');
    expect(result.blockers).toEqual([
      { code: 'repo_read_only', attention_owner: 'user' },
      { code: 'plan_missing', attention_owner: 'agent' },
    ]);
  });

  test('every non-pending lease and torn snapshot is closed', () => {
    const result = classifyTaskOffer(input({
      row_status: '[x]',
      lease_state: 'bound',
      snapshot_consistency: 'changed_during_read',
    }));
    expect(result.execution_readiness).toBe('unsupported');
    expect(result.blockers.map((blocker) => blocker.code)).toEqual([
      'snapshot_changed_during_read',
      'row_not_pending',
      'lease_unavailable',
    ]);
  });

  test('revision is deterministic and field-boundary safe', () => {
    expect(taskOfferRevision(['a', 'b', null])).toBe(taskOfferRevision(['a', 'b', null]));
    expect(taskOfferRevision(['a|b', 'c'])).not.toBe(taskOfferRevision(['a', 'b|c']));
  });

  test('plan proof requires the exact canonical Source Ref and projectable contract', () => {
    const sprintPath = 'plans/sprints/offers.sprint.md';
    const taskCell = 'execute one task';
    const planPath = 'plans/plan-20260823-0202-offer.md';
    const plan = [
      '# Plan: offer',
      '',
      '> **Status**: Approved',
      `> **Source Ref**: sprint:${sprintPath}#${taskCell}`,
      '> **Artifact Level**: work-package',
      '> **Promotion Reason**: verification_boundary',
      '> **Verification Boundary**: focused offer tests',
      '> **Rollback Surface**: revert offer unit',
      '> **Task Contract**: tasks/contracts/offer.contract.md',
      '',
      '## Promotion Gate',
      '- **Merge/PR unit**: offer unit',
      '- **Rollback surface**: revert offer unit',
      '- **Verification boundary**: focused offer tests',
      '- **Review/acceptance boundary**: unit review',
      '- **High-risk surface**: authority joins',
      '- **Why not checklist row**: independent verification boundary',
      '',
      '## Evidence Contract',
      '- **State/progress path**: plan and contract',
      '- **Verification evidence**: focused tests',
      '- **Evaluator rubric**: review file',
      '- **Stop condition**: tests pass',
      '- **Rollback surface**: revert offer unit',
      '',
    ].join('\n');
    const contract = [
      '# Task Contract: offer',
      '',
      `> **Plan**: ${planPath}`,
      '',
      '## Allowed Paths',
      '```yaml',
      'allowed_paths:',
      '  - src/core/fleet/task-offer.ts',
      '```',
    ].join('\n');
    const proof = proveCanonicalTaskPlan({
      sprintPath,
      taskCell,
      planPath,
      planText: plan,
      contractText: contract,
    });
    expect(proof.ok).toBe(true);
    if (proof.ok) {
      expect(proof.proof.source_ref).toBe(`sprint:${sprintPath}#${taskCell}`);
      expect(proof.proof.projectable).toBe(true);
    }
    const mismatched = proveCanonicalTaskPlan({
      sprintPath,
      taskCell: 'other task',
      planPath,
      planText: plan,
      contractText: contract,
    });
    expect(mismatched).toMatchObject({ ok: false, code: 'plan_source_mismatch' });
  });
});
