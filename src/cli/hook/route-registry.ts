/**
 * Route registry — single source of truth for hook events × routes × scripts.
 *
 * The (event, route-id, matcher) tuple is the **public contract** that host
 * adapters (`~/.codex/hooks.json`, `~/.claude/settings.json`) bind to. Script
 * names are an internal implementation detail — Phase 2 sealed hooks will
 * replace them with bundled implementations without changing the tuple.
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
  /** Repo-local `.ai/hooks/<script>` names, in execution order. */
  readonly scripts: readonly string[];
}

export const ROUTES: readonly Route[] = Object.freeze([
  Object.freeze({
    event: 'SessionStart' as const,
    routeId: 'default' as const,
    // HRD-04: session-start-context.sh, minimal-change-context.sh, and
    // security-sentinel.sh are retired; this route's context assembly is now
    // the in-process session-context builder (src/cli/hook/session-context.ts),
    // invoked directly by runHook() -- there is no script left to name here.
    // An empty list (rather than a stale 3-name array) is what keeps
    // consumers that treat `scripts` as "files that must exist on disk"
    // (doctor's repo-hook-scripts check, the adopt/sync tooling) reporting
    // truthfully instead of a permanent false "missing script" drift signal
    // (same reasoning as HRD-03's PreToolUse.edit precedent below).
    scripts: Object.freeze([]),
  }),
  Object.freeze({
    event: 'PreToolUse' as const,
    routeId: 'edit' as const,
    matcher: 'Edit|Write',
    // HRD-03: worktree-guard.sh and pre-edit-guard.sh are retired; this
    // route's decision surface is now the in-process mutation-guard handler
    // (src/cli/hook/mutation-guard.ts), invoked directly by runHook() --
    // there is no script left to name here. An empty list (rather than a
    // stale ['worktree-guard.sh', 'pre-edit-guard.sh']) is what keeps
    // consumers that treat `scripts` as "files that must exist on disk"
    // (doctor's repo-hook-scripts check, the adopt/sync tooling) reporting
    // truthfully instead of a permanent false "missing script" drift signal.
    scripts: Object.freeze([]),
  }),
  Object.freeze({
    event: 'PreToolUse' as const,
    routeId: 'subagent' as const,
    matcher: 'Task|Agent|SendUserMessage',
    scripts: Object.freeze(['subagent-return-channel-guard.sh']),
  }),
  Object.freeze({
    event: 'PostToolUse' as const,
    routeId: 'edit' as const,
    matcher: 'Edit|Write',
    // HRD-05: post-edit-guard.sh and minimal-change-observer.sh are retired;
    // this route's write-amplification hot path is now the in-process
    // mutation-observed journal handler (src/cli/hook/mutation-observed.ts),
    // invoked directly by runHook() -- there is no script left to name here.
    // An empty list (rather than a stale two-name array) is what keeps
    // consumers that treat `scripts` as "files that must exist on disk"
    // (doctor's repo-hook-scripts check, the adopt/sync tooling) reporting
    // truthfully instead of a permanent false "missing script" drift signal
    // (same reasoning as HRD-03/HRD-04's precedents above).
    scripts: Object.freeze([]),
  }),
  Object.freeze({
    event: 'PostToolUse' as const,
    routeId: 'bash' as const,
    matcher: 'Bash',
    scripts: Object.freeze(['post-bash.sh']),
  }),
  Object.freeze({
    event: 'PostToolUse' as const,
    routeId: 'always' as const,
    scripts: Object.freeze(['post-tool-observer.sh']),
  }),
  Object.freeze({
    event: 'UserPromptSubmit' as const,
    routeId: 'default' as const,
    scripts: Object.freeze(['prompt-guard.sh']),
  }),
  Object.freeze({
    event: 'UserPromptSubmit' as const,
    routeId: 'delegation' as const,
    hosts: Object.freeze(['codex'] as const),
    scripts: Object.freeze(['codex-delegation-advisor.sh']),
  }),
  Object.freeze({
    event: 'SubagentStart' as const,
    routeId: 'context' as const,
    hosts: Object.freeze(['codex'] as const),
    scripts: Object.freeze(['subagent-start-context.sh']),
  }),
  Object.freeze({
    event: 'SubagentStop' as const,
    routeId: 'quality' as const,
    hosts: Object.freeze(['codex'] as const),
    scripts: Object.freeze(['subagent-stop-quality.sh']),
  }),
  Object.freeze({
    event: 'Stop' as const,
    routeId: 'default' as const,
    // HRD-06: Stop orchestration is owned by the in-process stop-handler.
    scripts: Object.freeze([]),
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
