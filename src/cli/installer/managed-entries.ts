/**
 * Host adapter "managed entry" helpers — shared between Codex and Claude
 * targets because the entry shape is identical:
 *
 *   { matcher?: string, hooks: [{ type: 'command', command: string }] }
 *
 * The `MANAGED_TAG` substring inside each command string identifies entries
 * the repo-harness installer wrote, so install can be idempotent and uninstall
 * can remove only its own entries (leaving sibling user hooks intact —
 * verified for Claude in Phase 0: `~/.claude/settings.json` already had a
 * non-repo-harness `rtk hook claude` entry that must survive install).
 *
 * Command shape includes the `command -v repo-harness || exit 0` shim
 * (Codex consult constraint #5: CLI-missing fallback — adapter must not
 * fail when CLI is uninstalled or not on PATH).
 */

import { routesForHost, type Route, type RouteHost } from '../hook/route-registry';

export const MANAGED_TAG = 'repo-harness hook';

export interface HookCommand {
  type: 'command';
  command: string;
  timeout: number;
}

export interface HookEntry {
  matcher?: string;
  hooks: HookCommand[];
}

export type HooksByEvent = Record<string, HookEntry[]>;
export type HookHost = RouteHost;

export function buildHookCommand(route: Route, host: HookHost): string {
  return `repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; export HOOK_REPO_ROOT="$repo"; if command -v repo-harness-hook >/dev/null 2>&1; then HOOK_HOST=${host} repo-harness-hook ${route.event} --route ${route.routeId} && exit 0; fi; command -v repo-harness >/dev/null 2>&1 || exit 0; HOOK_HOST=${host} exec repo-harness hook ${route.event} --route ${route.routeId}`;
}

export function buildHookEntry(route: Route, host: HookHost): HookEntry {
  const entry: HookEntry = {
    hooks: [{ type: 'command', command: buildHookCommand(route, host), timeout: 30 }],
  };
  if (route.matcher !== undefined) entry.matcher = route.matcher;
  return entry;
}

export function isManagedEntry(entry: HookEntry): boolean {
  if (!entry || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some((h) => typeof h?.command === 'string' && h.command.includes(MANAGED_TAG));
}

export function buildManagedHooks(host: HookHost): HooksByEvent {
  const out: HooksByEvent = {};
  for (const route of routesForHost(host)) {
    if (!out[route.event]) out[route.event] = [];
    out[route.event].push(buildHookEntry(route, host));
  }
  return out;
}

export function stripManagedEntries(existing: HooksByEvent | undefined): HooksByEvent {
  if (!existing) return {};
  const out: HooksByEvent = {};
  for (const [event, entries] of Object.entries(existing)) {
    const kept = (entries ?? []).filter((e) => !isManagedEntry(e));
    if (kept.length > 0) out[event] = kept;
  }
  return out;
}

export function mergeHooks(existing: HooksByEvent, managed: HooksByEvent): HooksByEvent {
  const out: HooksByEvent = { ...existing };
  for (const [event, managedEntries] of Object.entries(managed)) {
    out[event] = [...(out[event] ?? []), ...managedEntries];
  }
  return out;
}
