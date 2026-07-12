import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { budgetSessionContext, SESSION_CONTEXT_TOKEN_BUDGET } from '../src/cli/hook/session-context-budget';

function withRepo(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-context-budget-'));
  try { run(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe('global SessionStart context budget', () => {
  test('emits zero tokens when there is no actionable state', () => withRepo((cwd) => {
    const result = budgetSessionContext(cwd, [{
      id: 'static-policy', priority: 6, content: 'generic advice', mandatory: false, actionable: false,
    }], 'session-1');
    expect(result.context).toBe('');
    expect(result.evidence.estimated_tokens).toBe(0);
  }));

  test('dedupes unchanged content within the same session only', () => withRepo((cwd) => {
    const sections = [{ id: 'task', priority: 2 as const, content: 'task=one', mandatory: true, actionable: true }];
    expect(budgetSessionContext(cwd, sections, 'session-1').context).toBe('task=one');
    expect(budgetSessionContext(cwd, sections, 'session-1').context).toBe('');
    expect(budgetSessionContext(cwd, sections, 'session-2').context).toBe('task=one');
  }));

  test('does not dedupe when routing or safety metadata changes', () => withRepo((cwd) => {
    const base = {
      id: 'effective-state',
      priority: 2 as const,
      content: '[HarnessState] {"task_id":"T-1","phase":"executing"}',
      mandatory: false,
      actionable: false,
      reference: 'repo-harness state resolve --json',
    };
    expect(budgetSessionContext(cwd, [base], 'session-metadata').context).toBe('');
    const activated = budgetSessionContext(cwd, [{ ...base, mandatory: true, actionable: true }], 'session-metadata');
    expect(activated.evidence.deduped).toBe(false);
    expect(activated.context).toContain('[HarnessState]');
  }));

  test('keeps mandatory state and replaces lower-priority overflow with evidence', () => withRepo((cwd) => {
    const result = budgetSessionContext(cwd, [
      { id: 'blockers', priority: 2, content: 'BLOCKER: scope escape', mandatory: true, actionable: true },
      { id: 'tooling', priority: 6, content: 'x'.repeat(20_000), mandatory: false, actionable: true, reference: 'docs/tooling.md' },
    ], 'session-1');
    expect(result.context).toContain('BLOCKER: scope escape');
    expect(result.context).toContain('[ContextRef:tooling] docs/tooling.md');
    expect(result.evidence.estimated_tokens).toBeLessThanOrEqual(SESSION_CONTEXT_TOKEN_BUDGET);
    expect(result.evidence.dropped_sections).toEqual([{ id: 'tooling', reason: 'budget' }]);
    const persisted = JSON.parse(readFileSync(join(cwd, '.ai/harness/state/session-context-budget.json'), 'utf-8'));
    expect(persisted).toEqual(result.evidence);
  }));

  test('field-compacts oversized effective state without losing critical entries', () => withRepo((cwd) => {
    const allowedPaths = Array.from({ length: 70 }, (_, index) => `src/capability-${index}/**`);
    const blockers = Array.from({ length: 40 }, (_, index) => `blocker-${index}: scope escape`);
    const failures = Array.from({ length: 40 }, (_, index) => `check-${index}: failed`);
    const state = {
      task_id: 'task-critical-context',
      phase: 'executing',
      state_version: 9,
      state_revision: 'sha256:state',
      workflow_profile: 'strict',
      next_action: 'fix the failed checks',
      blockers,
      allowed_paths: allowedPaths,
      checks: { status: 'fail', failures },
      security_boundaries: ['no scope escape', 'no destructive commands'],
      references: { plan: `plans/${'noncritical-'.repeat(2_000)}.md` },
    };
    const result = budgetSessionContext(cwd, [{
      id: 'effective-state', priority: 2, content: `[HarnessState] ${JSON.stringify(state)}`,
      mandatory: true, actionable: true, reference: 'repo-harness state resolve --json',
    }], 'session-field-compact');
    expect(result.evidence.estimated_tokens).toBeLessThanOrEqual(SESSION_CONTEXT_TOKEN_BUDGET);
    expect(result.evidence.within_budget).toBe(true);
    expect(result.context).toStartWith('[HarnessState] ');
    const compacted = JSON.parse(result.context.slice('[HarnessState] '.length));
    expect(compacted.task_id).toBe(state.task_id);
    expect(compacted.phase).toBe(state.phase);
    expect(compacted.next_action).toBe(state.next_action);
    expect(compacted.blockers).toEqual(blockers);
    expect(compacted.allowed_paths).toEqual(allowedPaths);
    expect(compacted.checks).toEqual(state.checks);
    expect(compacted.security_boundaries).toEqual(state.security_boundaries);
    expect(compacted.references).toBeUndefined();
    expect(compacted.context_compaction.omitted_fields).toEqual(['references']);
    expect(compacted.context_compaction.source_hash).toStartWith('sha256:');
    expect(result.evidence.dropped_sections).toEqual([{ id: 'effective-state', reason: 'mandatory-compacted' }]);
    expect(result.evidence.mandatory_overflows).toEqual([]);
  }));

  test('fails closed with structured evidence when critical entries cannot fit', () => withRepo((cwd) => {
    const allowedPaths = Array.from({ length: 500 }, (_, index) => `src/irreducible-capability-${index}/**`);
    const blockers = Array.from({ length: 300 }, (_, index) => `security blocker ${index}: scope escape forbidden`);
    const failures = Array.from({ length: 300 }, (_, index) => `required-check-${index}: failed`);
    const state = {
      task_id: 'task-overflow',
      phase: 'executing',
      next_action: 'resolve full state before editing',
      blockers,
      allowed_paths: allowedPaths,
      checks: { status: 'fail', failures },
      safety_boundaries: ['fail closed'],
    };
    const result = budgetSessionContext(cwd, [{
      id: 'effective-state', priority: 2, content: `[HarnessState] ${JSON.stringify(state)}`,
      mandatory: true, actionable: true, reference: 'repo-harness state resolve --json',
    }], 'session-critical-overflow');

    expect(result.evidence.estimated_tokens).toBeLessThanOrEqual(SESSION_CONTEXT_TOKEN_BUDGET);
    expect(result.evidence.within_budget).toBe(true);
    expect(result.context).toStartWith('[HarnessContextOverflow] ');
    const overflow = JSON.parse(result.context.slice('[HarnessContextOverflow] '.length));
    expect(overflow.fail_closed).toBe(true);
    expect(overflow.reason).toBe('critical-content-exceeds-budget');
    expect(overflow.task_id).toBe(state.task_id);
    expect(overflow.phase).toBe(state.phase);
    expect(overflow.next_action).toBe(state.next_action);
    expect(overflow.critical_fields.blockers.entry_count).toBe(blockers.length);
    expect(overflow.critical_fields.allowed_paths.entry_count).toBe(allowedPaths.length);
    expect(overflow.critical_fields.checks.estimated_tokens).toBeGreaterThan(0);
    expect(overflow.critical_fields.safety_boundaries.entry_count).toBe(1);
    expect(overflow.required_action).toBe('repo-harness state resolve --json');
    expect(result.evidence.dropped_sections).toEqual([{ id: 'effective-state', reason: 'mandatory-overflow' }]);
    expect(result.evidence.mandatory_overflows).toEqual([expect.objectContaining({
      id: 'effective-state',
      reason: 'critical-content-exceeds-budget',
      required_action: 'repo-harness state resolve --json',
    })]);
  }));

  test('reports every mandatory boundary when their combined projection cannot fit', () => withRepo((cwd) => {
    const section = (id: string, taskId: string) => ({
      id,
      priority: 2 as const,
      content: `[HarnessState] ${JSON.stringify({
        task_id: taskId,
        phase: 'executing',
        blockers: Array.from({ length: 150 }, (_, index) => `${id}-blocker-${index}: forbidden scope`),
        allowed_paths: Array.from({ length: 150 }, (_, index) => `${id}/path-${index}/**`),
        checks: { status: 'fail', failures: Array.from({ length: 100 }, (_, index) => `${id}-check-${index}`) },
      })}`,
      mandatory: true,
      actionable: true,
      reference: `repo-harness state resolve --json --section ${id}`,
    });
    const sections = Array.from({ length: 20 }, (_, index) => (
      section(`boundary-${index}`, `T-${index}`)
    ));
    const result = budgetSessionContext(cwd, sections, 'session-combined-overflow');
    expect(result.evidence.within_budget).toBe(true);
    expect(result.context).toStartWith('[HarnessContextOverflow] ');
    const overflow = JSON.parse(result.context.slice('[HarnessContextOverflow] '.length));
    expect(overflow.fail_closed).toBe(true);
    expect(overflow.reason).toBe('combined-mandatory-content-exceeds-budget');
    expect(result.evidence.dropped_sections).toEqual(sections.map(({ id }) => ({
      id,
      reason: 'mandatory-overflow',
    })));
    expect(result.evidence.mandatory_overflows.map(({ id }) => id)).toEqual(sections.map(({ id }) => id));
  }));
});
