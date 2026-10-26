// Pure summary of hook telemetry and guard denials for the setup snapshot.
// Callers supply the raw log lines; this module has no filesystem access.
// Telemetry carries only fixed codes, so counts copy no free text. Denial
// reasons are machine-state text and pass through `publicAgentConfigText`.

import { publicAgentConfigText } from '../operator/agent-config';
import {
  SETUP_HOOK_DENIAL_LIMIT,
  SETUP_HOOK_EVENTS,
  SETUP_HOOK_USAGE_WINDOW_HOURS,
  SETUP_HOSTS,
  type SetupHookDenial,
  type SetupHookEventName,
  type SetupHookRouteUsage,
  type SetupHookUsage,
} from './types';
import type { SetupRawRoute } from './projection';

const GUARD = /^[A-Za-z][A-Za-z0-9]{0,63}$/u;
/** Cut before redaction so a cut never splits a path the filter must see. */
const REASON_LIMIT = 512;

export interface HookUsageInput {
  readonly telemetry_lines: Iterable<string>;
  /** `HOOK_EVENT_TELEMETRY_PROTOCOL`; the hook layer owns it, so core never copies it. */
  readonly telemetry_protocol: string;
  readonly failure_lines: readonly string[];
  readonly routes: readonly SetupRawRoute[];
  readonly now_ms: number;
}

function record(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

/** Epoch ms of a timestamp inside the window, else null. */
function inWindow(value: unknown, now: number): number | null {
  if (typeof value !== 'string') return null;
  const at = Date.parse(value);
  return Number.isFinite(at) && at <= now && at > now - SETUP_HOOK_USAGE_WINDOW_HOURS * 3_600_000 ? at : null;
}

export function summarizeHookUsage(input: HookUsageInput): SetupHookUsage {
  const now = input.now_ms;
  const key = (host: string, event: string, routeId: string) => `${host}\0${event}\0${routeId}`;
  const declared = new Map<string, { usage: SetupHookRouteUsage; last: number }>();
  for (const route of input.routes) {
    if (!(SETUP_HOOK_EVENTS as readonly string[]).includes(route.event)) continue;
    for (const host of SETUP_HOSTS) {
      if (route.hosts !== undefined && !route.hosts.includes(host)) continue;
      declared.set(key(host, route.event, route.routeId), {
        usage: { host, event: route.event as SetupHookEventName, route_id: route.routeId, calls: 0, blocked: 0, last_blocked_at: null },
        last: -Infinity,
      });
    }
  }
  for (const line of input.telemetry_lines) {
    const r = record(line);
    if (r === null || r.protocol !== input.telemetry_protocol) continue;
    const at = inWindow(r.started_at, now);
    if (at === null || typeof r.host !== 'string' || typeof r.event !== 'string' || typeof r.route_id !== 'string') continue;
    const entry = declared.get(key(r.host, r.event, r.route_id));
    if (entry === undefined) continue;
    entry.usage.calls += 1;
    if (r.blocked === true) {
      entry.usage.blocked += 1;
      if (at > entry.last) {
        entry.last = at;
        entry.usage.last_blocked_at = new Date(at).toISOString();
      }
    }
  }

  const denials: { at: number; denial: SetupHookDenial }[] = [];
  for (const line of input.failure_lines) {
    const r = record(line);
    if (r === null || r.action !== 'block' || typeof r.guard !== 'string' || !GUARD.test(r.guard) || typeof r.reason !== 'string') continue;
    const at = typeof r.ts === 'string' ? Date.parse(r.ts) : Number.NaN;
    if (!Number.isFinite(at) || at > now) continue;
    denials.push({ at, denial: { at: new Date(at).toISOString(), guard: r.guard, reason: publicAgentConfigText(r.reason.slice(0, REASON_LIMIT)) } });
  }
  denials.sort((a, b) => b.at - a.at);

  return {
    window_hours: SETUP_HOOK_USAGE_WINDOW_HOURS,
    routes: [...declared.values()].map(entry => entry.usage).filter(usage => usage.calls > 0),
    recent_denials: denials.slice(0, SETUP_HOOK_DENIAL_LIMIT).map(entry => entry.denial),
  };
}
