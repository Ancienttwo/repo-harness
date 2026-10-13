import { describe, expect, test } from 'bun:test';
import {
  budgetSessionContext,
  SESSION_CONTEXT_TOKEN_BUDGET,
  type SessionContextSection,
} from '../src/cli/hook/session-context-budget';

function section(overrides: Partial<SessionContextSection> & Pick<SessionContextSection, 'id' | 'content'>): SessionContextSection {
  return { priority: 3, mandatory: false, source: `source/${overrides.id}.md`, ...overrides };
}

describe('global SessionStart context budget', () => {
  test('an optional section alone is emitted; no actionable flag gates it', () => {
    expect(budgetSessionContext([section({ id: 'resume', content: 'continue the widget work' })]))
      .toBe('continue the widget work');
  });

  test('orders by priority and drops empty sections', () => {
    const context = budgetSessionContext([
      section({ id: 'later', priority: 5, content: 'second' }),
      section({ id: 'empty', priority: 1, content: '   ' }),
      section({ id: 'state', priority: 1, content: 'first', mandatory: true }),
    ]);
    expect(context).toBe('first\nsecond');
  });

  test('keeps mandatory state and replaces lower-priority overflow with a pointer to its source', () => {
    const context = budgetSessionContext([
      section({ id: 'blockers', priority: 1, content: 'BLOCKER: scope escape', mandatory: true }),
      section({ id: 'tooling', priority: 6, content: 'x'.repeat(20_000), source: 'docs/tooling.md' }),
    ]);
    expect(context).toBe('BLOCKER: scope escape\n[ContextRef:tooling] docs/tooling.md');
  });

  test('an earlier large section becomes a pointer while a later small one still fits', () => {
    const context = budgetSessionContext([
      section({ id: 'state', priority: 1, content: '[HarnessState] {}', mandatory: true }),
      section({ id: 'resume', priority: 2, content: 'r'.repeat(SESSION_CONTEXT_TOKEN_BUDGET * 4), source: '.ai/harness/handoff/resume.md' }),
      section({ id: 'active-sprint', priority: 3, content: '# Active Sprint' }),
    ]);
    expect(context).toBe('[HarnessState] {}\n[ContextRef:resume] .ai/harness/handoff/resume.md\n# Active Sprint');
  });

  test('a mandatory section over the budget is kept verbatim', () => {
    const large = `[HarnessState] ${JSON.stringify({ allowed_paths: Array.from({ length: 2_000 }, (_, index) => `src/${index}/**`) })}`;
    const context = budgetSessionContext([
      section({ id: 'effective-state', priority: 1, content: large, mandatory: true }),
      section({ id: 'resume', priority: 5, content: 'resume body', source: '.ai/harness/handoff/resume.md' }),
    ]);
    expect(context).toBe(`${large}\n[ContextRef:resume] .ai/harness/handoff/resume.md`);
  });

  test('the same input always renders the same context', () => {
    const sections = [section({ id: 'task', priority: 1, content: 'task=one', mandatory: true })];
    expect(budgetSessionContext(sections)).toBe('task=one');
    expect(budgetSessionContext(sections)).toBe('task=one');
  });
});
