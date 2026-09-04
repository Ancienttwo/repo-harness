import { describe, expect, test } from 'bun:test';
import {
  ARCHITECTURE_MAJOR_CHANGE_REASON_CODES,
  REFACTOR_SCALES,
  type ArchitectureMajorChangeReasonCode,
  type RefactorScale,
} from 'archctx-contracts';
import {
  projectRefactorWorkflowRoute,
  validateRefactorWorkflowRouteProjection,
  RefactorWorkflowRouteError,
} from '../../src/core/refactor/workflow-route';

function subsets<T>(values: readonly T[]): T[][] {
  return Array.from({ length: 2 ** values.length }, (_, mask) => values.filter((_, index) => (mask & (1 << index)) !== 0));
}

describe('Module 5 RefactorWorkflowRoute projection', () => {
  test('exhaustively preserves the conservative scale boundary across every major-reason subset', () => {
    const scales: readonly (RefactorScale | null)[] = [...REFACTOR_SCALES, null];
    for (const scale of scales) {
      for (const reasons of subsets(ARCHITECTURE_MAJOR_CHANGE_REASON_CODES)) {
        const result = projectRefactorWorkflowRoute(scale, [], reasons);
        if (scale === 'architecture') expect(['architecture_intervention', 'proof_required', 'no_action']).toContain(result.route);
        if (scale === 'cross_module') expect(result.route).not.toBe('module_refactor');
        if (scale === 'insufficient_evidence') expect(result.route).toBe('proof_required');
      }
    }
  });

  test('maps the closed scale vocabulary and preserves reason codes byte-for-byte', () => {
    const reasonCodes = ['caller-coverage-unknown', 'code-facts-missing'] as const;
    expect(projectRefactorWorkflowRoute('module', reasonCodes, []).route).toBe('module_refactor');
    expect(projectRefactorWorkflowRoute('cross_module', reasonCodes, []).route).toBe('cross_module_refactor');
    expect(projectRefactorWorkflowRoute('architecture', reasonCodes, ['ownership-changed']).route).toBe('architecture_intervention');
    expect(projectRefactorWorkflowRoute('model_adoption_required', reasonCodes, []).route).toBe('proof_required');
    expect(projectRefactorWorkflowRoute(null, reasonCodes, []).route).toBe('no_action');
    expect(projectRefactorWorkflowRoute('module', reasonCodes, []).routeReasonCodes).toEqual(reasonCodes);
  });

  test('rejects hand-authored downgrades, extra fields, unknown reasons, and duplicates', () => {
    expect(() => validateRefactorWorkflowRouteProjection('cross_module', [], [], { route: 'module_refactor', routeReasonCodes: [] })).toThrow(RefactorWorkflowRouteError);
    expect(() => validateRefactorWorkflowRouteProjection('architecture', [], ['relation-changed'], { route: 'module_refactor', routeReasonCodes: [] })).toThrow('does not match');
    expect(() => validateRefactorWorkflowRouteProjection('module', [], [], { route: 'module_refactor', routeReasonCodes: [], extra: true } as never)).toThrow('exactly');
    expect(() => projectRefactorWorkflowRoute('module', ['not-real'] as never, [])).toThrow('unknown');
    expect(() => projectRefactorWorkflowRoute('module', [], ['not-real'] as unknown as ArchitectureMajorChangeReasonCode[])).toThrow('unknown');
    expect(() => projectRefactorWorkflowRoute('module', ['caller-coverage-unknown', 'caller-coverage-unknown'], [])).toThrow('duplicate');
  });
});
