import { readFileSync } from 'fs';
import {
  classifyPromptGuardIntent,
  decidePromptGuardAction,
  PROMPT_GUARD_ACTIONS,
  PROMPT_GUARD_PLAN_STATES,
  type PromptGuardAction,
  type PromptGuardIntentFacts,
  type PromptGuardPlanState,
  type PromptGuardState,
} from '../hook/prompt-guard-decision';
import {
  buildPromptIntentContext,
  deriveDoneOutcome,
  derivePendingOrchestrationKind,
  derivePlanStartSlug,
  derivePlanStartTitle,
  isAgenticPackagingIntent,
  isBugFixIntent,
  isBugOrHuntIntent,
  isCodegraphRouteIntent,
  isDoneIntent,
  isEmbeddedApprovedPlanIntent,
  isExecutionApprovalIntent,
  isHealthRouteIntent,
  isImplementIntent,
  isNextSliceOrStatusAdvisoryIntent,
  isNontrivialCodeTaskIntent,
  isPassiveWorktreeStatusIntent,
  isPlanCreationIntent,
  isPlanDiscussionContinuationIntent,
  isPlanExecutionProjectionIntent,
  isPlanShapedMarkdownIntent,
  isPlainFeaturePlanStartIntent,
  isRetrospectiveCompletionReportIntent,
  isReviewReleaseAdvisoryIntent,
  isReviewReleaseIntent,
  isSpaDayIntent,
  isThinkPlanStartIntent,
  isTriggerQuestionPrompt,
  shouldEmitBddFeatureAdvice,
  shouldEmitTddBugFixAdvice,
  shouldEmitUxFeatureGuardAdvice,
  type PromptIntentContext,
} from '../hook/prompt-intents';

function envBool(name: string): boolean {
  return process.env[name] === '1' || process.env[name] === 'true';
}

function envEnum<T extends readonly string[]>(
  name: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  const value = process.env[name];
  if (value && allowed.includes(value)) return value;
  return fallback;
}

function readFactsFromEnv(): PromptGuardIntentFacts {
  return {
    done: envBool('PROMPT_GUARD_DONE_INTENT'),
    planStart: envBool('PROMPT_GUARD_PLAN_START_INTENT'),
    implement: envBool('PROMPT_GUARD_IMPLEMENT_INTENT'),
    planningDiscussion: envBool('PROMPT_GUARD_PLANNING_DISCUSSION_INTENT'),
    reviewRelease: envBool('PROMPT_GUARD_REVIEW_RELEASE_INTENT'),
    passiveWorktreeStatus: envBool('PROMPT_GUARD_PASSIVE_WORKTREE_STATUS_INTENT'),
    passiveCompletionReport: envBool('PROMPT_GUARD_PASSIVE_COMPLETION_REPORT_INTENT'),
    passiveNextSliceReport: envBool('PROMPT_GUARD_PASSIVE_NEXT_SLICE_REPORT_INTENT'),
    embeddedApprovedPlan: envBool('PROMPT_GUARD_EMBEDDED_APPROVED_PLAN_INTENT'),
    planShapedMarkdown: envBool('PROMPT_GUARD_PLAN_SHAPED_MARKDOWN_INTENT'),
    bugOrHunt: envBool('PROMPT_GUARD_BUG_OR_HUNT_INTENT'),
    planExecutionProjection: envBool('PROMPT_GUARD_PLAN_EXECUTION_PROJECTION_INTENT'),
  };
}

function readStateFromEnv(): PromptGuardState {
  return {
    spec: envEnum('PROMPT_GUARD_SPEC_STATE', ['present', 'missing'] as const, 'missing'),
    plan: envEnum(
      'PROMPT_GUARD_PLAN_STATE',
      PROMPT_GUARD_PLAN_STATES,
      'none',
    ) as PromptGuardPlanState,
    pending: envEnum(
      'PROMPT_GUARD_PENDING_STATE',
      ['none', 'fresh', 'stale'] as const,
      'none',
    ),
    worktree: envEnum(
      'PROMPT_GUARD_WORKTREE_STATE',
      ['current', 'linked_target', 'foreign_marker'] as const,
      'current',
    ),
    contract: envEnum(
      'PROMPT_GUARD_CONTRACT_STATE',
      ['present', 'missing'] as const,
      'missing',
    ),
    contractPath: envEnum(
      'PROMPT_GUARD_CONTRACT_PATH_STATE',
      ['present', 'missing'] as const,
      'missing',
    ),
    evidence: envEnum(
      'PROMPT_GUARD_EVIDENCE_STATE',
      ['unchecked', 'complete', 'incomplete'] as const,
      'unchecked',
    ),
  };
}

export function runPromptGuardDecisionFromEnv(): PromptGuardAction {
  const intent = classifyPromptGuardIntent(readFactsFromEnv());
  return decidePromptGuardAction(intent, readStateFromEnv());
}

export interface PromptGuardVerdict {
  readonly protocol: 1;
  readonly action: PromptGuardAction;
  readonly intent: string;
  readonly facts: Record<string, 0 | 1>;
  readonly derived: {
    readonly done_outcome: string;
    readonly plan_start_title: string;
    readonly plan_start_slug: string;
    readonly pending_kind: string;
  };
}

function bit(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function classifyFromContext(ctx: PromptIntentContext): PromptGuardIntentFacts {
  const planStart = isPlanCreationIntent(ctx) || isThinkPlanStartIntent(ctx);
  return {
    done: isDoneIntent(ctx),
    planStart,
    implement: isImplementIntent(ctx),
    planningDiscussion: isPlanDiscussionContinuationIntent(ctx),
    reviewRelease: isReviewReleaseAdvisoryIntent(ctx),
    passiveWorktreeStatus: isPassiveWorktreeStatusIntent(ctx),
    passiveCompletionReport: isRetrospectiveCompletionReportIntent(ctx),
    passiveNextSliceReport: isNextSliceOrStatusAdvisoryIntent(ctx),
    embeddedApprovedPlan: isEmbeddedApprovedPlanIntent(ctx),
    planShapedMarkdown: isPlanShapedMarkdownIntent(ctx),
    bugOrHunt: isBugOrHuntIntent(ctx),
    planExecutionProjection: isPlanExecutionProjectionIntent(ctx),
  };
}

/**
 * Full prompt-based decision: classify intents from the prompt text, combine
 * with the workflow state from PROMPT_GUARD_*_STATE env vars, and return the
 * verdict the shell layer renders. The shell keeps filesystem authority and
 * side effects; this owns every prompt-text classifier.
 */
export function runPromptGuardVerdictFromPrompt(prompt: string): PromptGuardVerdict {
  const state = readStateFromEnv();
  const ctx = buildPromptIntentContext(prompt, state.pending === 'fresh');
  const decisionFacts = classifyFromContext(ctx);
  const intent = classifyPromptGuardIntent(decisionFacts);
  const action = decidePromptGuardAction(intent, state);

  return {
    protocol: 1,
    action,
    intent,
    facts: {
      done: bit(decisionFacts.done),
      plan_start: bit(decisionFacts.planStart),
      implement: bit(decisionFacts.implement),
      execution_approval: bit(isExecutionApprovalIntent(ctx)),
      plan_execution_projection: bit(decisionFacts.planExecutionProjection),
      embedded_approved_plan: bit(decisionFacts.embeddedApprovedPlan),
      plan_shaped_markdown: bit(decisionFacts.planShapedMarkdown),
      bug_or_hunt: bit(decisionFacts.bugOrHunt),
      bug_fix: bit(isBugFixIntent(ctx)),
      review_release: bit(isReviewReleaseIntent(ctx)),
      review_release_advisory: bit(decisionFacts.reviewRelease),
      think_plan_start: bit(isThinkPlanStartIntent(ctx)),
      plan_creation: bit(isPlanCreationIntent(ctx)),
      plain_feature_plan_start: bit(isPlainFeaturePlanStartIntent(ctx)),
      plan_discussion_continuation: bit(decisionFacts.planningDiscussion),
      trigger_question: bit(isTriggerQuestionPrompt(ctx)),
      agentic_packaging: bit(isAgenticPackagingIntent(ctx)),
      codegraph_route: bit(isCodegraphRouteIntent(ctx)),
      nontrivial_code_task: bit(isNontrivialCodeTaskIntent(ctx)),
      health_route: bit(isHealthRouteIntent(ctx)),
      spa_day: bit(isSpaDayIntent(ctx)),
      tdd_bug_fix_advice: bit(shouldEmitTddBugFixAdvice(ctx)),
      bdd_feature_advice: bit(shouldEmitBddFeatureAdvice(ctx)),
      ux_feature_guard_advice: bit(shouldEmitUxFeatureGuardAdvice(ctx)),
    },
    derived: {
      done_outcome: deriveDoneOutcome(ctx),
      plan_start_title: derivePlanStartTitle(ctx),
      plan_start_slug: derivePlanStartSlug(ctx),
      pending_kind: derivePendingOrchestrationKind(ctx),
    },
  };
}

function readStdinIfPiped(): string {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * CLI entry shared by `repo-harness prompt-guard-decide` and the hook-entry
 * fast path. New-protocol callers pipe `{"prompt": "..."}` on stdin and get a
 * single-line verdict JSON. Legacy copied hooks call with empty stdin and
 * env-provided intent facts, and keep getting the bare action enum line.
 */
export function runPromptGuardDecideCli(): string {
  const input = readStdinIfPiped().trim();
  if (input.startsWith('{')) {
    try {
      const parsed = JSON.parse(input) as { prompt?: unknown };
      if (typeof parsed.prompt === 'string') {
        return JSON.stringify(runPromptGuardVerdictFromPrompt(parsed.prompt));
      }
    } catch {
      // fall through to the legacy env path
    }
  }
  return runPromptGuardDecisionFromEnv();
}

export function assertKnownPromptGuardAction(action: string): asserts action is PromptGuardAction {
  if (!PROMPT_GUARD_ACTIONS.includes(action as PromptGuardAction)) {
    throw new Error(`unknown prompt guard action: ${action}`);
  }
}
