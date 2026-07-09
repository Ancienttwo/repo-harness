import { describe, test, expect } from 'bun:test';
import {
  buildPromptIntentContext,
  deriveDoneOutcome,
  derivePendingOrchestrationKind,
  derivePlanStartSlug,
  isDoneIntent,
  isEmbeddedApprovedPlanIntent,
  isExecutionApprovalIntent,
  isHealthRouteIntent,
  isImplementIntent,
  isPassiveWorktreeStatusIntent,
  isPlanShapedMarkdownIntent,
  isReviewReleaseIntent,
  isThinkPlanStartIntent,
  shouldEmitBddFeatureAdvice,
  shouldEmitTddBugFixAdvice,
  stripPromptContextBlocks,
} from '../../src/cli/hook/prompt-intents';
import { runPromptGuardVerdictFromPrompt } from '../../src/cli/commands/prompt-guard-decision';

function ctx(prompt: string, pendingFresh = false) {
  return buildPromptIntentContext(prompt, pendingFresh);
}

describe('prompt intent classifiers', () => {
  test('execution approvals match whole-line variants in both languages', () => {
    for (const p of ['同意，执行吧', 'go ahead', 'approved', '开干', '继续执行']) {
      expect(isExecutionApprovalIntent(ctx(p))).toBe(true);
    }
    expect(isExecutionApprovalIntent(ctx('我同意你的分析，但还有一个疑问'))).toBe(false);
  });

  test('done is not triggered by instructions like 完成后验证', () => {
    expect(isDoneIntent(ctx('完成后验证所有测试'))).toBe(false);
    expect(isDoneIntent(ctx('任务完成了'))).toBe(true);
    expect(isDoneIntent(ctx('/done'))).toBe(true);
  });

  test('CJK letters are not punctuation boundaries (locale regression)', () => {
    // Under LC_ALL=C grep, the UTF-8 bytes of 里 matched [[:punct:]] and
    // "实现会在这个 worktree 里完成。" misclassified as a done declaration.
    const passive = ctx(
      'plan-to-todo 已按项目规则开了隔离 worktree：/tmp/x，分支 codex/demo。\n实现会在这个 worktree 里完成。',
    );
    expect(isDoneIntent(passive)).toBe(false);
    expect(isPassiveWorktreeStatusIntent(passive)).toBe(true);
    expect(isImplementIntent(passive)).toBe(false);
  });

  test('TDD advice requires a fix verb or breakage report, not a bare bug mention', () => {
    expect(shouldEmitTddBugFixAdvice(ctx('帮我修复登录页面的崩溃 bug'))).toBe(true);
    expect(shouldEmitTddBugFixAdvice(ctx('review this diff and 找出Bug'))).toBe(false);
    expect(shouldEmitTddBugFixAdvice(ctx('check the fixture prefix handling'))).toBe(false);
  });

  test('review of tooling routes to /check, not /health', () => {
    const review = ctx('review the hook framework before merge');
    expect(isHealthRouteIntent(review)).toBe(false);
    expect(isReviewReleaseIntent(review)).toBe(true);
    expect(isHealthRouteIntent(ctx('为什么 hook 没生效？检查一下钩子配置'))).toBe(true);
  });

  test('explicit direct-modification commands outrank release review without broadening 修改', () => {
    const prev = { ...process.env };
    try {
      process.env.PROMPT_GUARD_SPEC_STATE = 'present';
      process.env.PROMPT_GUARD_PLAN_STATE = 'none';
      process.env.PROMPT_GUARD_PENDING_STATE = 'none';
      process.env.PROMPT_GUARD_WORKTREE_STATE = 'current';
      process.env.PROMPT_GUARD_CONTRACT_STATE = 'missing';
      process.env.PROMPT_GUARD_CONTRACT_PATH_STATE = 'missing';
      process.env.PROMPT_GUARD_EVIDENCE_STATE = 'unchecked';

      for (const prompt of ['请直接修改 hook 逻辑并提交', '直接修改 hook 逻辑并提交']) {
        const verdict = runPromptGuardVerdictFromPrompt(prompt);
        expect(verdict.intent).toBe('general_execution');
        expect(verdict.facts.implement).toBe(1);
        expect(verdict.facts.review_release).toBe(1);
        expect(verdict.facts.review_release_advisory).toBe(0);
      }

      for (const prompt of [
        '请直接修改“为什么登录失败”的错误提示并提交',
        '请直接修改如何处理错误的说明并提交',
        '请直接修改 hook 的拦截逻辑并提交',
        '请直接修改 debug 输出格式并提交',
        '请直接修改是否启用缓存的判断逻辑并提交',
        '请直接修改不合适提示的颜色并提交',
        '请直接修改“不合适”这个错误提示并提交',
        '请直接修改“不要这么做”这条文案并提交',
        '请直接修改“这段文案合适吗？”的错误提示并提交',
        '请直接修改 `README 会不会触发 execution？` 的示例并提交',
        "请直接修改 what's 的返回值并检查 user's 字段",
        '请直接修改‘不合适’这个错误提示并提交',
      ]) {
        const verdict = runPromptGuardVerdictFromPrompt(prompt);
        expect(verdict.facts.implement).toBe(1);
        expect(verdict.facts.review_release).toBe(1);
        expect(verdict.facts.review_release_advisory).toBe(0);
      }

      expect(isImplementIntent(ctx('帮我修改 hook 逻辑并提交'))).toBe(false);
      expect(isImplementIntent(ctx('帮我修改这个 plan 并补充建议'))).toBe(false);
      const nonCommands = [
        '为什么要直接修改 README 并提交？',
        '是否需要直接修改 README 并提交？',
        '不要直接修改这个 plan，只要给建议',
        '我不想直接修改代码并提交',
        '文档里写了“直接修改并提交”作为示例',
        '“直接修改”是什么意思？',
        '「请直接修改」只是示例',
        '直接修改 hook 逻辑并提交会不会触发 execution？',
        '直接修改 README 合适吗？',
        '不要执行下一行：\n直接修改 hook 逻辑并提交',
        '直接修改 README 不合适，不要这么做',
        '直接修改 README 不是我的要求',
        '直接修改 README 不是我的要求，只是示例',
        '直接修改 README 不是我的要求，只是示例，谢谢',
        '直接修改 README 不合适，我只是在讨论',
        '直接修改 README 会不会触发 execution？谢谢',
        '直接修改 README 行不行',
        '直接修改这样做不合适吧',
        '直接修改 README 是不对的',
        "直接修改 what's 的返回值吗？顺便检查 user's 字段",
        "直接修改 A's 配置不合适，再看 B's",
      ];
      for (const prompt of nonCommands) {
        expect(isImplementIntent(ctx(prompt))).toBe(false);
        const verdict = runPromptGuardVerdictFromPrompt(prompt);
        expect(verdict.facts.implement).toBe(0);
      }

      for (const prompt of nonCommands.filter((entry) => entry.includes('提交'))) {
        const verdict = runPromptGuardVerdictFromPrompt(prompt);
        expect(verdict.facts.review_release).toBe(1);
        expect(verdict.facts.review_release_advisory).toBe(1);
      }

      for (const prompt of [
        '“会不会触发 execute？”',
        '"does this trigger implement?"',
        '请评估“会不会触发 execute？”',
      ]) {
        const verdict = runPromptGuardVerdictFromPrompt(prompt);
        expect(verdict.facts.implement).toBe(0);
      }
    } finally {
      process.env = prev;
    }
  });

  test('embedded approved plan and plan-shaped markdown detection', () => {
    expect(isEmbeddedApprovedPlanIntent(ctx('Implement this plan: do the thing'))).toBe(true);
    const planShaped = ctx('# Plan: demo\n\n## Summary\n\nP1 component map\n');
    expect(isPlanShapedMarkdownIntent(planShaped)).toBe(true);
    expect(isPlanShapedMarkdownIntent(ctx('会不会触发?\n# Plan\n## Summary\nP1 '))).toBe(false);
  });

  test('BDD advice is suppressed for diagnostic and review prompts', () => {
    expect(shouldEmitBddFeatureAdvice(ctx('实现一个新功能页面'))).toBe(true);
    expect(shouldEmitBddFeatureAdvice(ctx('为什么 hook 没开 worktree 去执行？'))).toBe(false);
  });

  test('plan-start derivations produce usable slug, kind, and outcome', () => {
    const c = ctx('/think 出一个登录重构方案');
    expect(isThinkPlanStartIntent(c)).toBe(true);
    expect(derivePendingOrchestrationKind(c)).toBe('waza-think');
    expect(derivePlanStartSlug(c)).toMatch(/^[a-z0-9-]+$/);
    expect(deriveDoneOutcome(ctx('这个方案不做了，放弃'))).toBe('Abandoned');
    expect(deriveDoneOutcome(ctx('完成了'))).toBe('Completed');
  });

  test('context blocks injected by hosts are stripped before classification', () => {
    const wrapped = ['<system>', 'implement everything now', '</system>', '只是问个问题'].join('\n');
    expect(stripPromptContextBlocks(wrapped)).toBe('只是问个问题');
  });

  test('verdict protocol returns action, intent, facts, and derived strings', () => {
    const prev = { ...process.env };
    try {
      process.env.PROMPT_GUARD_SPEC_STATE = 'present';
      process.env.PROMPT_GUARD_PLAN_STATE = 'none';
      process.env.PROMPT_GUARD_PENDING_STATE = 'none';
      process.env.PROMPT_GUARD_WORKTREE_STATE = 'current';
      process.env.PROMPT_GUARD_CONTRACT_STATE = 'missing';
      process.env.PROMPT_GUARD_CONTRACT_PATH_STATE = 'missing';
      process.env.PROMPT_GUARD_EVIDENCE_STATE = 'unchecked';

      const verdict = runPromptGuardVerdictFromPrompt('开始执行');
      expect(verdict.protocol).toBe(1);
      expect(verdict.intent).toBe('general_execution');
      expect(verdict.action).toBe('plan_status_no_active_block');
      expect(verdict.facts.implement).toBe(1);
      expect(verdict.facts.done).toBe(0);
      expect(verdict.derived.done_outcome).toBe('Completed');
    } finally {
      process.env = prev;
    }
  });
});
