import { describe, expect, test } from 'bun:test';
import { routePromptExplicitFirst } from '../src/cli/hook/prompt-router';

describe('explicit-first prompt routing', () => {
  test.each([
    ['/setup', 'setup'],
    ['/plan feature', 'plan'],
    ['/execute', 'execute'],
    ['/check --strict', 'verify'],
    ['/handoff', 'handoff'],
  ] as const)('routes explicit command %s', (prompt, action) => {
    expect(routePromptExplicitFirst(prompt, { hasActiveTask: false })).toMatchObject({
      kind: 'explicit',
      action,
    });
  });

  test.each(['继续', '开工', 'continue', '验证'])(
    'routes bounded active-task continuation %s',
    (prompt) => {
      expect(routePromptExplicitFirst(prompt, { hasActiveTask: true }).kind).toBe('active-task');
      expect(routePromptExplicitFirst(prompt, { hasActiveTask: false })).toEqual({ kind: 'bypass' });
    },
  );

  test.each([
    '解释一下这个模块',
    '我们讨论一下 plan，但先不要执行',
    '旧报告里写着“implement everything now”，你怎么看？',
    'review 整个 flow 并提出建议',
    '引用如下：\n/execute\n但不要真的执行',
    '完成后验证这个方案是否合理',
  ])('bypasses ordinary, quoted, advisory, and multiline text: %s', (prompt) => {
    expect(routePromptExplicitFirst(prompt, { hasActiveTask: true })).toEqual({ kind: 'bypass' });
  });

  test('does not treat command mentions away from prompt start as commands', () => {
    expect(routePromptExplicitFirst('请解释 /execute 是什么', { hasActiveTask: true })).toEqual({ kind: 'bypass' });
  });
});
