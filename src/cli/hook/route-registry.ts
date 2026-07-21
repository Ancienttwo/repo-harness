/**
 * Route registry — single source of truth for hook events × routes × handlers.
 *
 * The (event, route-id, matcher) tuple is the **public contract** that host
 * adapters (`~/.codex/hooks.json`, `~/.claude/settings.json`) bind to. Handler
 * identities are stable internal authority names and do not alter the tuple.
 *
 * Derived from `.codex/hooks.json` reality verified Phase 0 canary
 * 2026-05-28 (see docs/architecture/global-hook-runtime.md and Codex consult
 * session 019e6df7-e7c9-70e2-8872-db9869420bd0). The matcher dimension was
 * the missing piece in the X (event-only) design — see
 * tasks/notes/hook-global-runtime.notes.md § Phase 1B Design Pivot.
 *
 * Order matters: it is the stable adapter entry order. Codex hashes adapter
 * entries by `(absolute-path, event-snake, i, j)`, so any reordering re-prompts
 * trust (verified Phase 0 Trust UX § Confirmed).
 */

export type HookEvent =
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'Stop';

export type RouteHost = 'claude' | 'codex';

/** Stable route id within an event. Public contract — never rename without coordinated adapter migration. */
export type RouteId =
  | 'default'
  | 'edit'
  | 'subagent'
  | 'bash'
  | 'always'
  | 'delegation'
  | 'context'
  | 'quality';

/** The in-process authority bound to a public route. */
export type HookHandlerId =
  | 'session-context'
  | 'mutation-guard'
  | 'subagent'
  | 'mutation-observed'
  | 'command-observed'
  | 'trace-observer'
  | 'prompt'
  | 'stop';

export interface Route {
  readonly event: HookEvent;
  readonly routeId: RouteId;
  /**
   * Tool matcher written to host adapter `matcher` field. Undefined means
   * no matcher — fires for all tools at this event.
   */
  readonly matcher?: string;
  /** Host adapters this route is installed into. Undefined means all supported hosts. */
  readonly hosts?: readonly RouteHost[];
  /** Exactly one typed in-process handler owns this route. */
  readonly handler: HookHandlerId;
}

export const ROUTES: readonly Route[] = Object.freeze([
  Object.freeze({
    event: 'SessionStart' as const,
    routeId: 'default' as const,
    // HRD-04: context assembly is owned by the in-process session-context
    // handler and is invoked directly by the runtime.
    handler: 'session-context',
  }),
  Object.freeze({
    event: 'PreToolUse' as const,
    routeId: 'edit' as const,
    matcher: 'Edit|Write',
    // HRD-03: mutation decisions are owned by the in-process guard handler.
    handler: 'mutation-guard',
  }),
  Object.freeze({
    event: 'PreToolUse' as const,
    routeId: 'subagent' as const,
    matcher: 'Task|Agent|SendUserMessage',
    handler: 'subagent',
  }),
  Object.freeze({
    event: 'PostToolUse' as const,
    routeId: 'edit' as const,
    matcher: 'Edit|Write',
    // HRD-05: the post-edit journal is owned by the in-process observer.
    handler: 'mutation-observed',
  }),
  Object.freeze({
    event: 'PostToolUse' as const,
    routeId: 'bash' as const,
    matcher: 'Bash',
    handler: 'command-observed',
  }),
  Object.freeze({
    event: 'PostToolUse' as const,
    routeId: 'always' as const,
    handler: 'trace-observer',
  }),
  Object.freeze({
    event: 'UserPromptSubmit' as const,
    routeId: 'default' as const,
    handler: 'prompt',
  }),
  Object.freeze({
    event: 'UserPromptSubmit' as const,
    routeId: 'delegation' as const,
    hosts: Object.freeze(['codex'] as const),
    handler: 'subagent',
  }),
  Object.freeze({
    event: 'SubagentStart' as const,
    routeId: 'context' as const,
    hosts: Object.freeze(['codex'] as const),
    handler: 'subagent',
  }),
  Object.freeze({
    event: 'SubagentStop' as const,
    routeId: 'quality' as const,
    hosts: Object.freeze(['codex'] as const),
    handler: 'subagent',
  }),
  Object.freeze({
    event: 'Stop' as const,
    routeId: 'default' as const,
    // HRD-06: Stop orchestration is owned by the in-process stop-handler.
    handler: 'stop',
  }),
]);

export function getRoute(event: HookEvent, routeId: RouteId): Route | undefined {
  return ROUTES.find((r) => r.event === event && r.routeId === routeId);
}

export function listRoutesForEvent(event: HookEvent): readonly Route[] {
  return ROUTES.filter((r) => r.event === event);
}

export function routeSupportsHost(route: Route, host: RouteHost): boolean {
  return route.hosts === undefined || route.hosts.includes(host);
}

export function routesForHost(host: RouteHost): readonly Route[] {
  return ROUTES.filter((route) => routeSupportsHost(route, host));
}

export function allEvents(): readonly HookEvent[] {
  const seen = new Set<HookEvent>();
  const out: HookEvent[] = [];
  for (const r of ROUTES) {
    if (!seen.has(r.event)) {
      seen.add(r.event);
      out.push(r.event);
    }
  }
  return out;
}
