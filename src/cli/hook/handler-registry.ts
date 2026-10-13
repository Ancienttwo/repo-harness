import { buildSessionStartSections } from './session-context';
import { pendingPostEditJournalSection, runMutationObserved } from './mutation-observed';
import { runMutationGuard } from './mutation-guard';
import { runStopHandler } from './stop-handler';
import { runPromptHandler } from './prompt-handler';
import { runSubagentHandler } from './subagent-handler';
import { runCommandObserved } from './command-observed';
import { runTraceObserver } from './trace-observer';
import { runTaskInboxHandler } from './task-inbox-handler';
import type { HookHandlerId, Route } from './route-registry';
import type { HookHandlerContext, HookHandlerResult, TypedHookHandler } from './handler-contract';
import type { SessionContextSection } from './session-context-budget';

/**
 * A text handler's result. Successful stdout is the model-facing advisory, so
 * it becomes additionalContext; stderr stays operator text. A failed run has
 * no model-facing output, so both streams become operator text.
 */
function textResult(value: { readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly reason?: string }): HookHandlerResult {
  const additionalContext = value.exitCode === 0 ? value.stdout.trimEnd() : '';
  const diagnostics = value.exitCode === 0 ? value.stderr : `${value.stderr}${value.stdout}`;
  return {
    exitCode: value.exitCode,
    ...(additionalContext ? { additionalContext } : {}),
    ...(diagnostics ? { diagnostics } : {}),
    ...(value.reason ? { reason: value.reason } : {}),
  };
}

function runSessionContext(context: HookHandlerContext): HookHandlerResult {
  const resolution = context.collector.getEffectiveState();
  const sections: SessionContextSection[] = buildSessionStartSections(context.repoRoot, resolution, context.now.getTime());
  const pending = pendingPostEditJournalSection(context.repoRoot);
  if (pending) sections.push(pending);
  return { exitCode: 0, sessionContexts: sections, ...(resolution.ok ? {} : { reason: 'context-unavailable' }) };
}

const handlers: Readonly<Record<HookHandlerId, TypedHookHandler>> = Object.freeze({
  'session-context': { id: 'session-context', run: runSessionContext },
  'mutation-guard': {
    id: 'mutation-guard',
    run: (context: HookHandlerContext) => textResult(runMutationGuard({
      collector: context.collector,
      payload: context.payload,
      identity: context.identity,
    })),
  },
  subagent: {
    id: 'subagent',
    run: (context: HookHandlerContext) => runSubagentHandler({
      event: context.event as 'PreToolUse' | 'UserPromptSubmit' | 'SubagentStart' | 'SubagentStop',
      repoRoot: context.repoRoot,
      payload: context.payload,
      identity: context.identity,
      env: context.env,
      now: () => context.now,
    }),
  },
  'mutation-observed': {
    id: 'mutation-observed',
    run: (context: HookHandlerContext) => textResult(runMutationObserved({
      collector: context.collector,
      payload: context.payload,
      identity: context.identity,
    })),
  },
  'command-observed': {
    id: 'command-observed',
    run: (context: HookHandlerContext) => textResult(runCommandObserved({
      repoRoot: context.repoRoot,
      payload: context.payload,
      identity: context.identity,
      env: context.env,
    })),
  },
  'trace-observer': {
    id: 'trace-observer',
    run: (context: HookHandlerContext) => textResult(runTraceObserver({
      repoRoot: context.repoRoot,
      payload: context.payload,
      identity: context.identity,
      env: context.env,
    })),
  },
  prompt: {
    id: 'prompt',
    run: (context: HookHandlerContext) => runPromptHandler({ payload: context.payload }),
  },
  'task-inbox': {
    id: 'task-inbox',
    run: (context: HookHandlerContext) => runTaskInboxHandler({
      repoRoot: context.repoRoot,
      now: () => context.now,
    }),
  },
  // A route that stays installed for the trust transition (#698) but has no
  // work left. It writes nothing and always exits 0.
  'retired-observer': {
    id: 'retired-observer',
    run: () => ({ exitCode: 0, reason: 'retired-route' }),
  },
  stop: {
    id: 'stop',
    run: (context: HookHandlerContext) => textResult(runStopHandler({
      collector: context.collector,
      payload: context.payload,
      identity: context.identity,
      env: context.env,
      dependencies: { now: () => context.now },
    })),
  },
});

export function getHandlerForRoute(route: Route): TypedHookHandler {
  return handlers[route.handler];
}
