/**
 * Host adapter "managed entry" helpers — shared between Codex and Claude
 * targets because the entry shape is identical:
 *
 *   { matcher?: string, hooks: [{ type: 'command', command: string }] }
 *
 * The `MANAGED_TAG` prefix inside each command string identifies entries
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
import type { InstallProfile } from './install-profile';
import {
  isRepoHarnessManagedHookCommand,
  stripRepoHarnessManagedHooks,
} from '../../core/adoption/managed-hook-config';

export const MANAGED_TAG = 'repo-harness-managed-hook-v1';

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

export type ManagedHookProjectionMismatchKind =
  | 'missing'
  | 'unexpected'
  | 'duplicate'
  | 'field-mismatch';

export type ManagedHookProjectionField = 'event' | 'matcher' | 'type' | 'command' | 'timeout';

/** One actionable difference between a host adapter and the route projection. */
export interface ManagedHookProjectionMismatch {
  readonly kind: ManagedHookProjectionMismatchKind;
  /** Expected route event when a route can be identified; actual event for unknown entries. */
  readonly event: string;
  readonly routeId?: string;
  readonly field?: ManagedHookProjectionField;
  readonly expected?: unknown;
  readonly actual?: unknown;
  /** Event key containing the actual entry when it differs from the expected route event. */
  readonly actualEvent?: string;
  readonly actualIndex?: number;
}

export interface ManagedHookProjectionReport {
  readonly status: 'consistent' | 'drift';
  readonly expectedEntryCount: number;
  /** Number of repo-harness-owned hook commands observed in the host config. */
  readonly managedEntryCount: number;
  readonly mismatches: readonly ManagedHookProjectionMismatch[];
}

export function buildHookCommand(route: Route, host: HookHost): string {
  return `: ${MANAGED_TAG}; repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; export HOOK_REPO_ROOT="$repo"; if command -v repo-harness-hook >/dev/null 2>&1; then HOOK_HOST=${host} exec repo-harness-hook ${route.event} --route ${route.routeId}; fi; command -v repo-harness >/dev/null 2>&1 || exit 0; HOOK_HOST=${host} exec repo-harness hook ${route.event} --route ${route.routeId}`;
}

export function buildHookEntry(route: Route, host: HookHost): HookEntry {
  const entry: HookEntry = {
    hooks: [{ type: 'command', command: buildHookCommand(route, host), timeout: route.event === 'Stop' && route.routeId === 'default' ? 150 : 30 }],
  };
  if (route.matcher !== undefined) entry.matcher = route.matcher;
  return entry;
}

export function isManagedEntry(entry: HookEntry): boolean {
  if (!entry || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some((hook) => isRepoHarnessManagedHookCommand(hook?.command));
}

function routeInProfile(route: Route, profile: InstallProfile): boolean {
  if (profile === 'full') return true;
  const key = `${route.event}.${route.routeId}`;
  const minimal = new Set([
    'SessionStart.default',
    'UserPromptSubmit.default',
    'UserPromptSubmit.inbox',
    'PreToolUse.edit',
    'PostToolUse.edit',
    'PostToolUse.bash',
    'PostToolUse.always',
    'Stop.default',
  ]);
  return minimal.has(key);
}

export function buildManagedHooks(host: HookHost, profile: InstallProfile = 'full'): HooksByEvent {
  const out: HooksByEvent = {};
  for (const route of routesForHost(host).filter((candidate) => routeInProfile(candidate, profile))) {
    if (!out[route.event]) out[route.event] = [];
    out[route.event].push(buildHookEntry(route, host));
  }
  return out;
}

interface ExpectedManagedHook {
  readonly event: string;
  readonly routeId: string;
  readonly matcher?: string;
  readonly entry: HookEntry;
}

interface ActualManagedHook {
  readonly event: string;
  readonly matcher: unknown;
  readonly type: unknown;
  readonly command: unknown;
  readonly timeout: unknown;
  readonly route: { readonly event: string; readonly routeId: string } | null;
  readonly index: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Stable, ownership-scoped hook projection for hashes and receipts. A block
 * may contain user commands beside a managed command; only the latter belongs
 * to repo-harness state, so sibling commands must never affect its digest.
 */
export function canonicalManagedHookProjection(value: unknown): HooksByEvent {
  if (!isRecord(value)) return {};
  const projection: HooksByEvent = {};
  for (const [event, entries] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    if (!Array.isArray(entries)) continue;
    const managedEntries: HookEntry[] = [];
    for (const entry of entries) {
      if (!isRecord(entry) || !Array.isArray(entry.hooks)) continue;
      const hooks = entry.hooks.filter((hook) => isManagedEntry({ hooks: [hook] } as HookEntry));
      if (hooks.length === 0) continue;
      managedEntries.push({
        ...(entry.matcher === undefined ? {} : { matcher: entry.matcher as string }),
        hooks: hooks.map((hook) => ({
          type: isRecord(hook) ? hook.type : undefined,
          command: isRecord(hook) ? hook.command : undefined,
          timeout: isRecord(hook) ? hook.timeout : undefined,
        })) as HookCommand[],
      });
    }
    if (managedEntries.length > 0) projection[event] = managedEntries;
  }
  return projection;
}

function routeFromManagedCommand(command: unknown): { event: string; routeId: string } | null {
  if (typeof command !== 'string') return null;
  const match = command.match(
    /(?:repo-harness-hook|repo-harness\s+hook)\s+(SessionStart|PreToolUse|PostToolUse|UserPromptSubmit|SubagentStart|SubagentStop|Stop)\s+--route\s+([A-Za-z0-9_-]+)/,
  );
  return match ? { event: match[1], routeId: match[2] } : null;
}

function projectionRouteKey(event: string, routeId: string): string {
  return `${event}\0${routeId}`;
}

function actualManagedHooks(value: unknown): ActualManagedHook[] {
  if (!isRecord(value)) return [];
  const out: ActualManagedHook[] = [];
  let index = 0;
  for (const [event, entries] of Object.entries(value)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!isRecord(entry) || !Array.isArray(entry.hooks)) continue;
      // Keep ownership on the shared isManagedEntry predicate; a host block
      // may contain both a managed command and user-authored commands.
      if (!isManagedEntry(entry as unknown as HookEntry)) continue;
      const matcher = entry.matcher;
      for (const hook of entry.hooks) {
        if (!isManagedEntry({ hooks: [hook] } as HookEntry)) continue;
        const command = isRecord(hook) ? hook.command : undefined;
        out.push({
          event,
          matcher,
          type: isRecord(hook) ? hook.type : undefined,
          command,
          timeout: isRecord(hook) ? hook.timeout : undefined,
          route: routeFromManagedCommand(command),
          index: index++,
        });
      }
    }
  }
  return out;
}

function addFieldMismatch(
  mismatches: ManagedHookProjectionMismatch[],
  expected: ExpectedManagedHook,
  actual: ActualManagedHook,
  field: ManagedHookProjectionField,
  expectedValue: unknown,
  actualValue: unknown,
): void {
  if (Object.is(expectedValue, actualValue)) return;
  mismatches.push({
    kind: 'field-mismatch',
    event: expected.event,
    routeId: expected.routeId,
    field,
    expected: expectedValue,
    actual: actualValue,
    ...(actual.event === expected.event ? {} : { actualEvent: actual.event }),
    actualIndex: actual.index,
  });
}

/**
 * Compare only repo-harness-owned commands in a host's `hooks` object.
 * Unmanaged sibling commands and blocks are intentionally ignored, while
 * every managed command must map to exactly one current route projection.
 */
export function compareManagedHooks(
  actual: unknown,
  expected: HooksByEvent,
): ManagedHookProjectionReport {
  const expectedHooks: ExpectedManagedHook[] = [];
  for (const [event, entries] of Object.entries(expected)) {
    for (const entry of entries) {
      const expectedCommand = entry.hooks.find((hook) => isManagedEntry({ hooks: [hook] }));
      const route = routeFromManagedCommand(expectedCommand?.command);
      expectedHooks.push({
        event,
        routeId: route?.routeId ?? '(unknown)',
        ...(entry.matcher === undefined ? {} : { matcher: entry.matcher }),
        entry,
      });
    }
  }

  const actualHooks = actualManagedHooks(actual);
  const expectedByKey = new Map<string, ExpectedManagedHook>();
  for (const hook of expectedHooks) {
    expectedByKey.set(projectionRouteKey(hook.event, hook.routeId), hook);
  }
  const actualByKey = new Map<string, ActualManagedHook[]>();
  const unexpected: ActualManagedHook[] = [];
  const routeUnknown: ActualManagedHook[] = [];
  for (const hook of actualHooks) {
    const route = hook.route;
    const key = route ? projectionRouteKey(route.event, route.routeId) : null;
    if (key === null) {
      // A command can be malformed or have been edited wholesale. Defer it
      // to the event/matcher pairing below so command drift is reported as a
      // field mismatch instead of an opaque missing + unexpected pair.
      routeUnknown.push(hook);
    } else if (!expectedByKey.has(key)) {
      unexpected.push(hook);
    } else {
      const group = actualByKey.get(key) ?? [];
      group.push(hook);
      actualByKey.set(key, group);
    }
  }

  // Route identity normally comes from the generated command itself. For a
  // command that no longer contains a route invocation, event + matcher is
  // the remaining host-visible identity. Pair one such command with the
  // first unclaimed expected route in that bucket, retaining an actionable
  // `command` mismatch while still reporting genuinely extra commands.
  for (const actual of routeUnknown) {
    const expected = expectedHooks.find((candidate) => {
      if (candidate.event !== actual.event || !Object.is(candidate.matcher, actual.matcher)) return false;
      const key = projectionRouteKey(candidate.event, candidate.routeId);
      return (actualByKey.get(key)?.length ?? 0) === 0;
    });
    if (!expected) {
      unexpected.push(actual);
      continue;
    }
    const key = projectionRouteKey(expected.event, expected.routeId);
    const group = actualByKey.get(key) ?? [];
    group.push(actual);
    actualByKey.set(key, group);
  }

  const mismatches: ManagedHookProjectionMismatch[] = [];
  for (const actual of unexpected) {
    mismatches.push({
      kind: 'unexpected',
      event: actual.event,
      ...(actual.route ? { routeId: actual.route.routeId } : {}),
      actual: actual.command,
      actualIndex: actual.index,
    });
  }

  for (const expected of expectedHooks) {
    const key = projectionRouteKey(expected.event, expected.routeId);
    const matches = actualByKey.get(key) ?? [];
    if (matches.length === 0) {
      mismatches.push({
        kind: 'missing',
        event: expected.event,
        routeId: expected.routeId,
      });
      continue;
    }

    const actual = matches[0];
    const expectedCommand = expected.entry.hooks.find((hook) => isManagedEntry({ hooks: [hook] }));
    addFieldMismatch(mismatches, expected, actual, 'event', expected.event, actual.event);
    addFieldMismatch(mismatches, expected, actual, 'matcher', expected.matcher, actual.matcher);
    addFieldMismatch(mismatches, expected, actual, 'type', expectedCommand?.type, actual.type);
    addFieldMismatch(mismatches, expected, actual, 'command', expectedCommand?.command, actual.command);
    addFieldMismatch(mismatches, expected, actual, 'timeout', expectedCommand?.timeout, actual.timeout);
    for (const duplicate of matches.slice(1)) {
      mismatches.push({
        kind: 'duplicate',
        event: expected.event,
        routeId: expected.routeId,
        actual: duplicate.command,
        actualIndex: duplicate.index,
      });
    }
  }

  return {
    status: mismatches.length === 0 ? 'consistent' : 'drift',
    expectedEntryCount: expectedHooks.length,
    managedEntryCount: actualHooks.length,
    mismatches,
  };
}

export function compareManagedHookProjection(
  actual: unknown,
  host: HookHost,
  profile: InstallProfile = 'full',
): ManagedHookProjectionReport {
  return compareManagedHooks(actual, buildManagedHooks(host, profile));
}

export function stripManagedEntries(existing: HooksByEvent | undefined): HooksByEvent {
  return stripRepoHarnessManagedHooks(existing).hooks as HooksByEvent;
}

export function mergeHooks(existing: HooksByEvent, managed: HooksByEvent): HooksByEvent {
  const out: HooksByEvent = { ...existing };
  for (const [event, managedEntries] of Object.entries(managed)) {
    out[event] = [...(out[event] ?? []), ...managedEntries];
  }
  return out;
}
