import { buildSessionStartSections } from './session-context';
import { runMutationGuard } from './mutation-guard';
import { runStopHandler } from './stop-handler';
import { runReturnChannel } from './return-channel';
import { runSubagentContext } from './subagent-context';
import type { HookHandlerId, Route } from './route-registry';
import type { HookHandlerContext, HookHandlerResult, TypedHookHandler } from './handler-contract';
import type { SessionContextSection } from './session-context-budget';
import { collectAgentNotice } from './agent-notice';

/**
 * A text handler's result. Successful stdout is the model-facing advisory, so
 * it becomes additionalContext; stderr stays operator text. A failed run has
 * no model-facing output, so both streams become operator text.
 */
function textResult(value: { readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly reason?: string; readonly systemMessage?: string }): HookHandlerResult {
  const additionalContext = value.exitCode === 0 ? value.stdout.trimEnd() : '';
  const diagnostics = value.exitCode === 0 ? value.stderr : `${value.stderr}${value.stdout}`;
  return {
    exitCode: value.exitCode,
    ...(additionalContext ? { additionalContext } : {}),
    ...(value.exitCode === 0 && value.systemMessage ? { systemMessage: value.systemMessage } : {}),
    ...(diagnostics ? { diagnostics } : {}),
    ...(value.reason ? { reason: value.reason } : {}),
  };
}

function runSessionContext(context: HookHandlerContext): HookHandlerResult {
  const resolution = context.collector.getEffectiveState();
  const sections: SessionContextSection[] = buildSessionStartSections(context.repoRoot, resolution, context.now.getTime());
  const notice = resolution.ok ? collectAgentNotice(context.repoRoot, () => resolution.state.capability_ownership, { env: context.env }) : {};
  if (notice.content) sections.push({ id: 'architecture-debt', priority: 2, mandatory: false, content: notice.content, source: 'repo-harness architecture-debt --json', systemMessage: notice.systemMessage });
  const systemMessage = sections.map((section) => section.systemMessage).filter(Boolean).join('\n');
  return { exitCode: 0, sessionContexts: sections, ...(systemMessage ? { systemMessage } : {}), ...(notice.diagnostics ? { diagnostics: notice.diagnostics } : {}), ...(resolution.ok ? {} : { reason: 'context-unavailable' }) };
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
  'agent-notice': {
    id: 'agent-notice',
    run: (context: HookHandlerContext) => {
      if (context.identity.host !== 'codex') return { exitCode: 0 };
      const notice = collectAgentNotice(context.repoRoot, () => {
        const resolution = context.collector.getEffectiveState();
        if (!resolution.ok) throw new Error(resolution.reason_code);
        return resolution.state.capability_ownership;
      }, { env: context.env });
      return { exitCode: 0, ...(notice.content ? { additionalContext: notice.content } : {}), ...(notice.diagnostics ? { diagnostics: notice.diagnostics } : {}) };
    },
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
