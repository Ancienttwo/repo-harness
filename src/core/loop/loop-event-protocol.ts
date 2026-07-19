/**
 * Host-neutral Loop Event protocol -- pure typed data, zero consumers.
 *
 * HRD-02..09 will replace the per-event shell script fan-out
 * (`src/cli/hook/runtime.ts` `runHook()` spawning `.ai/hooks/*.sh`) with
 * in-process handlers, one package at a time. This module establishes the
 * typed contract those handlers will eventually produce -- `LoopEvent` (what
 * happened) and `LoopEventResult` (what the runtime decided) -- plus the
 * total mapping from today's 11 public routes onto the 8 `LoopEvent` kinds,
 * per audit §6 (`plans/sprints/20260715-harness-loop-audit-and-optimization.md:1239-1298`).
 *
 * No production file imports this module yet, and this module performs no
 * I/O, environment access, or process execution -- only type-only imports
 * from `route-registry.ts`. See
 * tasks/notes/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.notes.md
 * for the route -> kind rationale, especially the three least-obvious cells
 * named by the contract's Falsifier (`PostToolUse.always`,
 * `SubagentStart.context`, `SubagentStop.quality`).
 */
import type { HookEvent, RouteHost, RouteId } from '../../cli/hook/route-registry';

/**
 * One host-observed occurrence in the harness loop. Exactly 8 kinds -- see
 * the module docstring for the audit source.
 */
export type LoopEvent =
  | { readonly type: 'session_started'; readonly host: RouteHost; readonly sessionId: string }
  | {
      readonly type: 'prompt_submitted';
      readonly host: RouteHost;
      readonly sessionId: string;
      readonly prompt: string;
    }
  | {
      readonly type: 'mutation_requested';
      readonly host: RouteHost;
      readonly sessionId: string;
      readonly operation: 'edit' | 'write';
      readonly targetPaths: readonly string[];
    }
  | {
      readonly type: 'mutation_observed';
      readonly host: RouteHost;
      readonly sessionId: string;
      readonly changedPaths: readonly string[];
    }
  | {
      readonly type: 'command_observed';
      readonly host: RouteHost;
      readonly sessionId: string;
      readonly command: string;
      readonly exitCode: number;
      readonly outputRef?: string;
    }
  | {
      readonly type: 'subagent_started';
      readonly host: RouteHost;
      readonly sessionId: string;
      readonly agentId: string;
    }
  | {
      readonly type: 'subagent_stopped';
      readonly host: RouteHost;
      readonly sessionId: string;
      readonly agentId: string;
      readonly report: string;
    }
  | { readonly type: 'session_stopping'; readonly host: RouteHost; readonly sessionId: string };

/** The discriminant of `LoopEvent`, i.e. one of its 8 `type` values. */
export type LoopEventKind = LoopEvent['type'];

/** One structured reason contributing to a `LoopEventResult` decision verdict. */
export interface DecisionReason {
  readonly code: string;
  readonly message: string;
}

/** A typed pointer to the next action a caller should take. */
export interface ActionRef {
  readonly action: string;
  readonly detail?: string;
}

/** One side effect the runtime intends to perform for this decision. */
export interface PlannedEffect {
  readonly kind: string;
  readonly description: string;
}

/** What the runtime decided for one `LoopEvent`. */
export interface LoopEventResult {
  readonly protocol: 1;
  readonly eventId: string;
  readonly decision: {
    readonly verdict: 'allow' | 'block' | 'advise' | 'noop';
    readonly reasons: readonly DecisionReason[];
    readonly nextAction: ActionRef | null;
  };
  readonly effects: readonly PlannedEffect[];
  readonly telemetry: {
    readonly stateResolutions: number;
    readonly childProcesses: number;
    readonly filesRead: number;
    readonly filesWritten: number;
    readonly elapsedMs: number;
  };
}

/** One (event, routeId) route tuple mapped onto the `LoopEvent` kind that models it. */
export interface LoopRouteTuple {
  readonly event: HookEvent;
  readonly routeId: RouteId;
  readonly kind: LoopEventKind;
}

/**
 * Total map from every one of the 11 public route tuples
 * (`src/cli/hook/route-registry.ts` `ROUTES`) onto the `LoopEvent` kind that
 * models it. Not injective: 11 routes onto 8 kinds means several routes
 * necessarily share a kind (e.g. both `UserPromptSubmit` routes are
 * `prompt_submitted`; `PreToolUse.subagent` and `SubagentStart.context` are
 * both `subagent_started`).
 * Each entry's `event`/`routeId` is typechecked against the registry's own
 * `HookEvent`/`RouteId` unions, catching a misspelled tuple at compile time.
 * `tests/loop-event-protocol.test.ts` cross-checks the full list (count, no
 * duplicates, exact key match) against the live `ROUTES` export, so a
 * dropped or extra tuple fails a test, not silently -- this module holds no
 * runtime reference to `ROUTES` itself, only route-registry.ts's types, to
 * stay a zero-consumer, pure module.
 */
export const routeToLoopEvent: readonly LoopRouteTuple[] = [
  { event: 'SessionStart', routeId: 'default', kind: 'session_started' },
  { event: 'PreToolUse', routeId: 'edit', kind: 'mutation_requested' },
  { event: 'PreToolUse', routeId: 'subagent', kind: 'subagent_started' },
  { event: 'PostToolUse', routeId: 'edit', kind: 'mutation_observed' },
  { event: 'PostToolUse', routeId: 'bash', kind: 'command_observed' },
  { event: 'PostToolUse', routeId: 'always', kind: 'command_observed' },
  { event: 'UserPromptSubmit', routeId: 'default', kind: 'prompt_submitted' },
  { event: 'UserPromptSubmit', routeId: 'delegation', kind: 'prompt_submitted' },
  { event: 'SubagentStart', routeId: 'context', kind: 'subagent_started' },
  { event: 'SubagentStop', routeId: 'quality', kind: 'subagent_stopped' },
  { event: 'Stop', routeId: 'default', kind: 'session_stopping' },
];
