/** UserPromptSubmit emits bounded advice. It never projects approval artifacts or authorizes an effect. */
import { routePromptExplicitFirst } from './prompt-router';
import { payloadString, type HookPayload } from './hook-input';
import type { HookHandlerResult } from './handler-contract';

export interface PromptHandlerInput {
  readonly payload: HookPayload;
}

const OPERATION_BOUNDARIES = '[OperationBoundaries] Main merge requires explicit current-task authorization and current automated checks; only merged clean inactive worktrees/branches may be deleted automatically. Other deletion, credential/permission settings and release/production effects require the user.';

export function runPromptHandler(opts: PromptHandlerInput): HookHandlerResult {
  const route = routePromptExplicitFirst(payloadString(opts.payload, 'prompt'));
  if (route.kind === 'bypass') return { exitCode: 0 };
  return { exitCode: 0, additionalContext: OPERATION_BOUNDARIES };
}
