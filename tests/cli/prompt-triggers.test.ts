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
} from '../../src/cli/hook/prompt-triggers';
import { runPromptGuardVerdictFromPrompt } from '../../src/cli/commands/prompt-guard-decision';

function ctx(prompt: string, pendingFresh = false) {
  return buildPromptIntentContext(prompt, pendingFresh);
}

describe('prompt trigger facts', () => {
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
