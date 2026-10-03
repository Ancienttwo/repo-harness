/** UserPromptSubmit emits bounded advice. It never projects approval artifacts or authorizes an effect. */
import { buildPromptIntentContext, isDoneIntent, isBugOrHuntIntent, isReviewReleaseIntent, isPlanCreationIntent } from './prompt-intents';
import { routePromptExplicitFirst } from './prompt-router';
import { parseHookInput, type HookInputFs } from './hook-input';
import type { recordCircuitAttempt } from './circuit-breaker';

export interface PromptCommandResult { readonly exitCode: number; readonly stdout: string; readonly stderr: string }
export interface PromptHandlerFs extends HookInputFs {
  mkdirSync(path: string, options?: { readonly recursive?: boolean }): void;
  unlinkSync(path: string): void;
  writeFileSync(path: string, data: string): void;
}
export interface PromptHandlerDependencies {
  readonly fs?: PromptHandlerFs;
  readonly now?: () => Date;
  readonly runCommand?: (args: readonly string[], input?: string) => PromptCommandResult;
  readonly recordCircuit?: typeof recordCircuitAttempt;
}
export interface PromptHandlerInput {
  readonly repoRoot: string; readonly input?: string | Buffer; readonly prompt?: string;
  readonly env?: NodeJS.ProcessEnv; readonly dependencies?: PromptHandlerDependencies;
}
export interface PromptHandlerResult { readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly reason?: string }

export function runPromptHandler(opts: PromptHandlerInput): PromptHandlerResult {
  const parsed = parseHookInput(opts.input, { env: opts.env ?? process.env, repoRoot: opts.repoRoot });
  const prompt = opts.prompt ?? parsed.getPrompt();
  const stderr = parsed.warnings.length ? `${parsed.warnings.join('\n')}\n` : '';
  const route = routePromptExplicitFirst(prompt, { hasActiveTask: false });
  const context = buildPromptIntentContext(prompt, false);
  if (route.kind === 'bypass') return { exitCode: 0, stdout: '', stderr };
  if (isDoneIntent(context)) {
    return { exitCode: 0, stdout: '[WorkflowObservation] Completion is observed. Report the actual changes, verification, risks and rollback in the PR; no plan, receipt or archive step is required.\n', stderr };
  }
  const out: string[] = [];
  if (isReviewReleaseIntent(context)) out.push('[ReviewAdvice] Review is on demand for large changes, security/permissions or model uncertainty. Consume existing check evidence once; no re-gate loop.');
  else if (isBugOrHuntIntent(context)) out.push('[DiagnosisAdvice] Trace and reproduce the actual failure, then verify the affected behavior; no fixed pre-fix artifact is required.');
  else if (isPlanCreationIntent(context)) out.push('[PlanningAdvice] Capture an optional reference only when it helps. Ordinary work uses Goal/Scope/Verify/Rollback in the PR or delegation brief.');
  out.push('[OperationBoundaries] Main merge requires current automated checks; only merged clean inactive worktrees/branches may be deleted automatically. Other deletion, credential/permission settings and release/production effects require the user.');
  return { exitCode: 0, stdout: out.length ? `${out.join('\n')}\n` : '', stderr };
}
