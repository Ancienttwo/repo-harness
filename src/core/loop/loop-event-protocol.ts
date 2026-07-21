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

/** Runtime measurement names carried by one host-event telemetry record. */
export type HookEventTelemetryMetric =
  | 'runtime_entries'
  | 'state_resolutions'
  | 'child_processes'
  | 'files_read'
  | 'files_written'
  | 'durable_writes'
  | 'write_transactions'
  | 'full_projection_writes'
  | 'event_writes'
  | 'elapsed_ms';

/** One ordered unit of work performed while handling a host event. */
export interface HookEventTelemetryStep {
  readonly name: string;
  readonly execution: 'in_process' | 'subprocess';
  readonly started_at: string;
  readonly elapsed_ms: number;
  readonly exit_code: number;
  readonly output_bytes: number | null;
}

/**
 * One event-level runtime authority record. The JSON projection intentionally
 * uses snake_case because it is consumed by shell-adjacent reports and
 * committed evidence. `measurement.complete` means every declared metric is
 * complete; subset consumers inspect `complete_metrics` instead of treating
 * an opaque legacy step as all-or-none.
 */
export interface HookEventTelemetryRecord {
  readonly protocol: 'loop-engine-hook-event/v1';
  readonly kind: 'hook_event';
  readonly event_id: string;
  readonly started_at: string;
  readonly completed_at: string;
  readonly host: RouteHost | null;
  readonly session_id: string | null;
  readonly run_id: string | null;
  readonly turn_id: string | null;
  readonly event: HookEvent;
  readonly route_id: RouteId;
  readonly exit_code: number;
  readonly blocked: boolean;
  readonly result_reason: string;
  readonly runtime_entries: 1;
  readonly steps: readonly HookEventTelemetryStep[];
  readonly metrics: {
    readonly state_resolutions: number;
    readonly child_processes: number;
    readonly files_read: number;
    readonly files_written: number;
    readonly durable_writes: number;
    readonly write_transactions: number;
    readonly full_projection_writes: number;
    readonly event_writes: number;
    readonly elapsed_ms: number;
  };
  readonly measurement: {
    readonly complete: boolean;
    readonly complete_metrics: readonly HookEventTelemetryMetric[];
    readonly incomplete_metrics: readonly HookEventTelemetryMetric[];
    readonly opaque_steps: readonly string[];
  };
  readonly fingerprint: `sha256:${string}`;
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
