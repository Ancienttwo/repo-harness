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
  | 'UserPromptSubmit'
  | 'SubagentStart'
  | 'Stop';

export type RouteHost = 'claude' | 'codex' | 'pi';

/**
 * Hosts that read a JSON hook adapter file written by the installer
 * (`~/.claude/settings.json`, `~/.codex/hooks.json`). Pi has no adapter file:
 * the repo-harness Pi extension calls the hook runtime directly.
 */
export type AdapterHost = Exclude<RouteHost, 'pi'>;

/** Stable route id within an event. Public contract — never rename without coordinated adapter migration. */
export type RouteId =
  | 'default'
  | 'edit'
  | 'bash'
  | 'subagent'
  | 'inbox'
  | 'context';

/** The in-process authority bound to a public route. */
export type HookHandlerId =
  | 'session-context'
  | 'mutation-guard'
  | 'bash-mutation-guard'
  | 'return-channel'
  | 'subagent-context'
  | 'agent-notice'
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
  /**
   * A handler crash exits 2, so the host blocks the tool call. Only an
   * admission route sets this: exit 2 on Stop or UserPromptSubmit would trap
   * the user. Installer projections do not read this field.
   */
  readonly failClosed?: true;
  /** The minimal install profile also installs this route. The full profile installs every route. */
  readonly minimalProfile?: true;
}

export const ROUTES: readonly Route[] = Object.freeze([
  Object.freeze({
    event: 'SessionStart' as const,
    routeId: 'default' as const,
    // HRD-04: context assembly is owned by the in-process session-context
    // handler and is invoked directly by the runtime.
    handler: 'session-context',
    minimalProfile: true as const,
  }),
  Object.freeze({
    event: 'PreToolUse' as const,
    routeId: 'edit' as const,
    matcher: 'Edit|Write',
    // HRD-03: mutation decisions are owned by the in-process guard handler.
    handler: 'mutation-guard',
    failClosed: true as const,
    minimalProfile: true as const,
  }),
  Object.freeze({
    event: 'PreToolUse' as const,
    routeId: 'subagent' as const,
    matcher: 'Agent',
    hosts: ['claude'] as const,
    handler: 'return-channel',
  }),
  Object.freeze({
    event: 'PreToolUse' as const,
    routeId: 'bash' as const,
    matcher: 'Bash',
    hosts: ['claude'] as const,
    handler: 'bash-mutation-guard',
    // A tripwire is advisory on unparsed input or failure; a known path denial exits 2.
    minimalProfile: true as const,
  }),
  Object.freeze({
    event: 'UserPromptSubmit' as const,
    routeId: 'inbox' as const,
    // Preserve the installed tuple. Only Codex delivers notice text here.
    handler: 'agent-notice',
    hosts: ['claude', 'codex'] as const,
    minimalProfile: true as const,
  }),
  Object.freeze({
    event: 'SubagentStart' as const,
    routeId: 'context' as const,
    hosts: Object.freeze(['codex'] as const),
    handler: 'subagent-context',
  }),
  Object.freeze({
    event: 'Stop' as const,
    routeId: 'default' as const,
    // HRD-06: Stop orchestration is owned by the in-process stop-handler.
    handler: 'stop',
    minimalProfile: true as const,
  }),
]);

/** Host argv can still name a retired event or route; such a tuple has no route. */
export function getRoute(event: string, routeId: string): Route | undefined {
  return ROUTES.find((r) => r.event === event && r.routeId === routeId);
}

export function routeSupportsHost(route: Route, host: RouteHost): boolean {
  return route.hosts === undefined || route.hosts.includes(host);
}

export function routesForHost(host: RouteHost): readonly Route[] {
  return ROUTES.filter((route) => routeSupportsHost(route, host));
}
