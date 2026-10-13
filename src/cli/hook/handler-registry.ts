import {
  buildSessionStartSections,
  projectEffectiveStateSessionSection,
  projectOwedCapabilitiesSessionSection,
  projectUnavailableStateSessionSection,
} from './session-context';
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
import { sweepManagedWorktrees } from '../../effects/state/coordination-worktree-topology';

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
  const sections: SessionContextSection[] = [];
  const sweep = sweepManagedWorktrees(context.repoRoot, context.sessionCwd, context.env, { deadlineMs: context.worktreeSweepDeadlineMs });
  if (sweep) sections.push({ id: 'worktree-sweep', priority: 1, content: sweep, mandatory: true, actionable: true });
  const resolution = context.collector.getEffectiveState();
  let unavailable = false;
  if (resolution.ok) {
    const stateSection = projectEffectiveStateSessionSection(resolution.state);
    if (stateSection) sections.push(stateSection);
    const owed = projectOwedCapabilitiesSessionSection(context.repoRoot, resolution.state);
    if (owed) sections.push(owed);
  } else {
    unavailable = true;
    context.observeSessionContextDiagnostic({
      provider_id: 'effective-state',
      reason_code: resolution.reason_code,
      error_hash: resolution.error_hash,
      required_action: 'repo-harness state resolve --json',
    });
    sections.push(projectUnavailableStateSessionSection(resolution));
  }
  const pending = pendingPostEditJournalSection(context.repoRoot);
  if (pending) sections.push(pending);
  sections.push(...buildSessionStartSections(
    context.collector,
    context.env,
    context.now.getTime(),
    context.observeSessionContextDiagnostic,
  ));
  return { exitCode: 0, sessionContexts: sections, ...(unavailable ? { reason: 'context-unavailable' } : {}) };
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
