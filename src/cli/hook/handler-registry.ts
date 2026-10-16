import { buildSessionStartSections } from './session-context';
import { runMutationGuard } from './mutation-guard';
import { runStopHandler } from './stop-handler';
import { runReturnChannel } from './return-channel';
import { runSubagentContext } from './subagent-context';
import { runCommandObserved } from './command-observed';
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
  return { exitCode: 0, sessionContexts: sections, ...(resolution.ok ? {} : { reason: 'context-unavailable' }) };
}

const handlers: Readonly<Record<HookHandlerId, TypedHookHandler>> = Object.freeze({
  'session-context': { id: 'session-context', run: runSessionContext },
  'mutation-guard': {
    id: 'mutation-guard',
    run: (context: HookHandlerContext) => textResult(runMutationGuard({
      repoRoot: context.repoRoot,
      payload: context.payload,
      identity: context.identity,
    })),
  },
  'return-channel': {
    id: 'return-channel',
    run: (context: HookHandlerContext) => runReturnChannel({
      collector: context.collector,
      payload: context.payload,
    }),
  },
  'subagent-context': {
    id: 'subagent-context',
    run: (context: HookHandlerContext) => runSubagentContext({
      collector: context.collector,
      payload: context.payload,
      identity: context.identity,
      env: context.env,
      now: () => context.now,
    }),
  },
  'command-observed': {
    id: 'command-observed',
    run: (context: HookHandlerContext) => textResult(runCommandObserved({
      repoRoot: context.repoRoot,
      payload: context.payload,
    })),
  },
  'task-inbox': {
    id: 'task-inbox',
    run: (context: HookHandlerContext) => runTaskInboxHandler({
      collector: context.collector,
      now: () => context.now,
    }),
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
