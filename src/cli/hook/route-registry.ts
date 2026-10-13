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

export type RouteHost = 'claude' | 'codex' | 'pi';

/** Stable route id within an event. Public contract — never rename without coordinated adapter migration. */
export type RouteId =
  | 'default'
  | 'edit'
  | 'subagent'
  | 'bash'
  | 'always'
  | 'delegation'
  | 'inbox'
  | 'context'
  | 'quality';

/** The in-process authority bound to a public route. */
export type HookHandlerId =
  | 'session-context'
  | 'mutation-guard'
  | 'return-channel'
  | 'delegation-advisor'
  | 'subagent-context'
  | 'subagent-quality'
  | 'command-observed'
  | 'prompt'
  | 'task-inbox'
  | 'stop'
  | 'retired-observer';

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
  /**
   * A handler crash exits 2, so the host blocks the tool call. Only an
   * admission route sets this: exit 2 on Stop or UserPromptSubmit would trap
   * the user. Installer projections do not read this field.
   */
  readonly failClosed?: true;
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
    failClosed: true as const,
  }),
  Object.freeze({
    event: 'PreToolUse' as const,
    routeId: 'subagent' as const,
    matcher: 'Task|Agent|SendUserMessage',
    hosts: ['claude', 'codex'] as const,
    handler: 'return-channel',
  }),
  Object.freeze({
    event: 'PostToolUse' as const,
    routeId: 'edit' as const,
    matcher: 'Edit|Write',
    // The post-edit journal is retired. The route stays installed until the
    // route-registry trust transition (#698) removes it.
    handler: 'retired-observer',
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
    // The trace observer is retired. The route stays installed until the
    // route-registry trust transition (#698) removes it.
    handler: 'retired-observer',
    hosts: ['claude', 'codex'] as const,
  }),
  Object.freeze({
    event: 'UserPromptSubmit' as const,
    routeId: 'default' as const,
    handler: 'prompt',
  }),
  Object.freeze({
    event: 'UserPromptSubmit' as const,
    routeId: 'inbox' as const,
    // Task messages are an independent turn-boundary route. Keeping this
    // separate from prompt classification prevents untrusted peer content
    // from becoming routing or authorization input.
    handler: 'task-inbox',
    hosts: ['claude', 'codex'] as const,
  }),
  Object.freeze({
    event: 'UserPromptSubmit' as const,
    routeId: 'delegation' as const,
    hosts: Object.freeze(['codex'] as const),
    handler: 'delegation-advisor',
  }),
  Object.freeze({
    event: 'SubagentStart' as const,
    routeId: 'context' as const,
    hosts: Object.freeze(['codex'] as const),
    handler: 'subagent-context',
  }),
  Object.freeze({
    event: 'SubagentStop' as const,
    routeId: 'quality' as const,
    hosts: Object.freeze(['codex'] as const),
    handler: 'subagent-quality',
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

export function routeSupportsHost(route: Route, host: RouteHost): boolean {
  return route.hosts === undefined || route.hosts.includes(host);
}

export function routesForHost(host: RouteHost): readonly Route[] {
  return ROUTES.filter((route) => routeSupportsHost(route, host));
}
