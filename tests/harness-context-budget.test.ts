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
});
