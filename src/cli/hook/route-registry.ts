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
  | 'Stop';

/** Stable route id within an event. Public contract — never rename without coordinated adapter migration. */
export type RouteId = 'default' | 'edit' | 'subagent' | 'bash' | 'always';

export interface Route {
  readonly event: HookEvent;
  readonly routeId: RouteId;
  /**
   * Tool matcher written to host adapter `matcher` field. Undefined means
   * no matcher — fires for all tools at this event.
   */
  readonly matcher?: string;
  /** Repo-local `.ai/hooks/<script>` names, in execution order. */
  readonly scripts: readonly string[];
}

export const ROUTES: readonly Route[] = Object.freeze([
  Object.freeze({
    event: 'SessionStart' as const,
    routeId: 'default' as const,
    scripts: Object.freeze(['session-start-context.sh', 'security-sentinel.sh']),
  }),
  Object.freeze({
    event: 'PreToolUse' as const,
    routeId: 'edit' as const,
    matcher: 'Edit|Write',
    scripts: Object.freeze(['worktree-guard.sh', 'pre-edit-guard.sh']),
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
    scripts: Object.freeze(['post-edit-guard.sh']),
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
    event: 'Stop' as const,
    routeId: 'default' as const,
    scripts: Object.freeze(['stop-orchestrator.sh']),
  }),
]);

export function getRoute(event: HookEvent, routeId: RouteId): Route | undefined {
  return ROUTES.find((r) => r.event === event && r.routeId === routeId);
}

export function listRoutesForEvent(event: HookEvent): readonly Route[] {
  return ROUTES.filter((r) => r.event === event);
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
