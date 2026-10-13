/** UserPromptSubmit emits bounded advice. It never projects approval artifacts or authorizes an effect. */
import { buildPromptIntentContext, isDoneIntent, isBugOrHuntIntent, isReviewReleaseIntent, isPlanCreationIntent } from './prompt-intents';
import { routePromptExplicitFirst } from './prompt-router';
import { payloadString, type HookPayload } from './hook-input';
import type { HookHandlerResult } from './handler-contract';

export interface PromptHandlerInput {
  readonly payload: HookPayload;
}

export function runPromptHandler(opts: PromptHandlerInput): HookHandlerResult {
  const prompt = payloadString(opts.payload, 'prompt') || payloadString(opts.payload, 'user_message');
  const route = routePromptExplicitFirst(prompt, { hasActiveTask: false });
  const context = buildPromptIntentContext(prompt, false);
  if (route.kind === 'bypass') return { exitCode: 0 };
  if (isDoneIntent(context)) {
    return { exitCode: 0, additionalContext: '[WorkflowObservation] Completion is observed. Report the actual changes, verification, risks and rollback in the PR; no plan, receipt or archive step is required.' };
  }
  const out: string[] = [];
  if (isReviewReleaseIntent(context)) out.push('[ReviewAdvice] Review is on demand for large changes, security/permissions or model uncertainty. Consume existing check evidence once; no re-gate loop.');
  else if (isBugOrHuntIntent(context)) out.push('[DiagnosisAdvice] Trace and reproduce the actual failure, then verify the affected behavior; no fixed pre-fix artifact is required.');
  else if (isPlanCreationIntent(context)) out.push('[PlanningAdvice] Capture an optional reference only when it helps. Ordinary work uses Goal/Scope/Verify/Rollback in the PR or delegation brief.');
  out.push('[OperationBoundaries] Main merge requires explicit current-task authorization and current automated checks; only merged clean inactive worktrees/branches may be deleted automatically. Other deletion, credential/permission settings and release/production effects require the user.');
  return { exitCode: 0, additionalContext: out.join('\n') };
}
