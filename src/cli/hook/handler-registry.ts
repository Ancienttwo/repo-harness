import { buildSessionStartSections } from './session-context';
import { pendingPostEditJournalSection, runMutationObserved } from './mutation-observed';
import { runMutationGuard } from './mutation-guard';
import { runStopHandler } from './stop-handler';
import { runPromptHandler } from './prompt-handler';
import { runSubagentHandler } from './subagent-handler';
import { runCommandObserved } from './command-observed';
import { runTraceObserver } from './trace-observer';
import { getRoute, ROUTES, type HookEvent, type HookHandlerId, type Route, type RouteId } from './route-registry';
import type { HookHandlerContext, HookHandlerResult, TypedHookHandler } from './handler-contract';

function result(value: { readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly reason?: string }): HookHandlerResult {
  return value;
}

const handlers: Readonly<Record<HookHandlerId, TypedHookHandler>> = Object.freeze({
  'session-context': {
    id: 'session-context',
    run(context: HookHandlerContext): HookHandlerResult {
      const sections = [];
      const stateSection = context.collector.getSessionEffectiveState();
      if (stateSection) sections.push(stateSection);
      const pending = pendingPostEditJournalSection(context.repoRoot);
      if (pending) sections.push(pending);
      sections.push(...buildSessionStartSections(context.collector, context.env, context.now.getTime()));
      return { exitCode: 0, stdout: '', stderr: '', sessionContexts: sections };
    },
  },
  'mutation-guard': {
    id: 'mutation-guard',
    run(context: HookHandlerContext): HookHandlerResult {
      return result(runMutationGuard({
        collector: context.collector,
        input: context.input,
        env: context.env,
      }));
    },
  },
  subagent: {
    id: 'subagent',
    run(context: HookHandlerContext): HookHandlerResult {
      return result(runSubagentHandler({
        event: context.event as 'PreToolUse' | 'UserPromptSubmit' | 'SubagentStart' | 'SubagentStop',
        repoRoot: context.repoRoot,
        input: context.input,
        env: context.env,
        now: () => context.now,
      }));
    },
  },
  'mutation-observed': {
    id: 'mutation-observed',
    run(context: HookHandlerContext): HookHandlerResult {
      return result(runMutationObserved({
        collector: context.collector,
        input: context.input,
        env: context.env,
        observeJournalWrite: context.dependencies.observeJournalWrite,
      }));
    },
  },
  'command-observed': {
    id: 'command-observed',
    run(context: HookHandlerContext): HookHandlerResult {
      return result(runCommandObserved({
        repoRoot: context.repoRoot,
        input: context.input,
        env: context.env,
      }));
    },
  },
  'trace-observer': {
    id: 'trace-observer',
    run(context: HookHandlerContext): HookHandlerResult {
      return result(runTraceObserver({
        repoRoot: context.repoRoot,
        input: context.input,
        env: context.env,
      }));
    },
  },
  prompt: {
    id: 'prompt',
    run(context: HookHandlerContext): HookHandlerResult {
      return result(runPromptHandler({
        repoRoot: context.repoRoot,
        input: context.input,
        env: context.env,
      }));
    },
  },
  stop: {
    id: 'stop',
    run(context: HookHandlerContext): HookHandlerResult {
      return result(runStopHandler({
        collector: context.collector,
        input: context.input,
        env: context.env,
        dependencies: {
          now: () => context.now,
          observeProjectionWrite: context.dependencies.observeProjectionWrite,
          observeProjectionTransaction: context.dependencies.observeProjectionTransaction,
        },
      }));
    },
  },
});

export function handlerIdForRoute(event: HookEvent, routeId: RouteId): HookHandlerId | undefined {
  return getRoute(event, routeId)?.handler;
}

export function getHandlerForRoute(route: Route): TypedHookHandler | undefined {
  return handlers[route.handler];
}

export function listHandlerBindings(): Readonly<Record<string, HookHandlerId>> {
  return Object.freeze(Object.fromEntries(
    ROUTES.map((route) => [`${route.event}.${route.routeId}`, route.handler]),
  ) as Record<string, HookHandlerId>);
}
