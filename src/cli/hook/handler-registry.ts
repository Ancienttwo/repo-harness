import { buildSessionStartSections, ensureSessionRunIdentity } from './session-context';
import { pendingPostEditJournalSection, runMutationObserved } from './mutation-observed';
import { runMutationGuard } from './mutation-guard';
import { runStopHandler } from './stop-handler';
import { runPromptHandler } from './prompt-handler';
import { runSubagentHandler } from './subagent-handler';
import { runCommandObserved } from './command-observed';
import { runTraceObserver } from './trace-observer';
import { getRoute, ROUTES, type HookEvent, type HookHandlerId, type Route, type RouteId } from './route-registry';
import type { HookEffectContract, HookHandlerContext, HookHandlerResult, TypedHookHandler } from './handler-contract';
import { architectureProjectionQueueState } from '../../effects/architecture/projection-jobs';

const MUTATION_OBSERVED_EFFECT_CONTRACT: HookEffectContract = Object.freeze({
  contractId: 'mutation-observed.durable-journal.v1',
  boundary: 'durable-emission',
  cardinality: 'zero-or-one',
  recovery: 'retry-converges',
  completeMetrics: [
    'state_resolutions',
    'files_written',
    'durable_writes',
    'write_transactions',
    'full_projection_writes',
    'event_writes',
  ] as const,
  phases: ['journal'] as const,
});

const STOP_EFFECT_CONTRACT: HookEffectContract = Object.freeze({
  contractId: 'stop.recovery-projection.v1',
  boundary: 'durable-emission',
  cardinality: 'bounded-sequence',
  recovery: 'retry-converges',
  completeMetrics: [
    'files_written',
    'durable_writes',
    'write_transactions',
  ] as const,
  phases: ['handoff', 'resume', 'event', 'run-summary'] as const,
});

function result(value: { readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly reason?: string }): HookHandlerResult {
  return value;
}

const handlers: Readonly<Record<HookHandlerId, TypedHookHandler>> = Object.freeze({
  'session-context': {
    id: 'session-context',
    run(context: HookHandlerContext): HookHandlerResult {
      ensureSessionRunIdentity(context.repoRoot, context.input, context.env, context.now);
      const sections = [];
      const stateSection = context.collector.getSessionEffectiveState();
      if (stateSection) sections.push(stateSection);
      const pending = pendingPostEditJournalSection(context.repoRoot);
      if (pending) sections.push(pending);
      try {
        const projectionQueue = architectureProjectionQueueState(context.repoRoot);
        if (projectionQueue.pending > 0 || projectionQueue.running > 0 || projectionQueue.deadLetters > 0) {
          sections.push({
            id: 'architecture-projection-queue',
            priority: 4 as const,
            content: `[ArchitectureProjection] pending=${projectionQueue.pending} running=${projectionQueue.running} dead-letter=${projectionQueue.deadLetters}${projectionQueue.oldestPendingJobId ? ` oldest-pending=${projectionQueue.oldestPendingJobId}` : ''}${projectionQueue.oldestDeadLetterJobId ? ` oldest-dead-letter=${projectionQueue.oldestDeadLetterJobId}` : ''}.`,
            mandatory: false,
            actionable: true,
            reference: projectionQueue.oldestDeadLetterJobId
              ? `repo-harness architecture-projection retry-dead-letter --job-id ${projectionQueue.oldestDeadLetterJobId} --json`
              : 'repo-harness architecture-projection drain --json',
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sections.push({
          id: 'architecture-projection-queue-error',
          priority: 1 as const,
          content: `[ArchitectureProjection] queue state unavailable: ${message.slice(0, 300)}.`,
          mandatory: true,
          actionable: true,
          reference: 'repo-harness architecture-projection drain --json',
        });
      }
      sections.push(...buildSessionStartSections(
        context.collector,
        context.env,
        context.now.getTime(),
        context.dependencies.observeSessionContextDiagnostic,
      ));
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
    effectContract: MUTATION_OBSERVED_EFFECT_CONTRACT,
    run(context: HookHandlerContext): HookHandlerResult {
      return result(runMutationObserved({
        collector: context.collector,
        input: context.input,
        env: context.env,
        observeJournalWrite: context.dependencies.observeJournalWrite,
        afterJournalWrite: context.dependencies.afterEffectCommit
          ? () => context.dependencies.afterEffectCommit?.('journal')
          : undefined,
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
    effectContract: STOP_EFFECT_CONTRACT,
    run(context: HookHandlerContext): HookHandlerResult {
      return result(runStopHandler({
        collector: context.collector,
        input: context.input,
        env: context.env,
        dependencies: {
          now: () => context.now,
          observeProjectionWrite: context.dependencies.observeProjectionWrite,
          observeProjectionTransaction: context.dependencies.observeProjectionTransaction,
          afterProjectionWrite: context.dependencies.afterEffectCommit
            ? (target) => context.dependencies.afterEffectCommit?.(target.kind)
            : undefined,
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
