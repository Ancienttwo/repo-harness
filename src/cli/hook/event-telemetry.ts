import { createHash, randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { join } from 'path';
import type { HookIdentity } from './hook-input';
import type { HookEvent, RouteHost, RouteId } from './route-registry';
import { appendHookEventLog } from '../../effects/hook-event-log';

export const HOOK_EVENT_TELEMETRY_PROTOCOL = 'loop-engine-hook-event/v2' as const;
export const HOOK_EVENT_TELEMETRY_PATH = '.ai/harness/runs/hook-events.jsonl';

/**
 * One record per handled hook event. Telemetry is not an authority: the
 * profile benchmark reads `elapsed_ms`, `blocked` and `fingerprint`, and no
 * hook decision reads it back.
 */
export interface HookEventTelemetryRecord {
  readonly protocol: typeof HOOK_EVENT_TELEMETRY_PROTOCOL;
  readonly event_id: string;
  readonly started_at: string;
  readonly completed_at: string;
  readonly host: RouteHost;
  readonly session_id: string | null;
  readonly run_id: string | null;
  readonly turn_id: string | null;
  readonly event: HookEvent;
  readonly route_id: RouteId;
  readonly exit_code: number;
  /** True only for exit 2 or a deny decision. */
  readonly blocked: boolean;
  /** `handler-failed` only for a throw; `blocked` for a policy block. */
  readonly reason: string;
  readonly elapsed_ms: number;
  readonly fingerprint: string;
}

export interface HookEventTelemetryResult {
  readonly identity: HookIdentity;
  readonly exitCode: number;
  readonly blocked: boolean;
  readonly reason: string;
}

export interface HookEventTelemetry {
  finalize(result: HookEventTelemetryResult): HookEventTelemetryRecord;
}

export interface CreateHookEventTelemetryInput {
  readonly repoRoot: string;
  readonly event: HookEvent;
  readonly routeId: RouteId;
}

function roundMs(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

export function createHookEventTelemetry(options: CreateHookEventTelemetryInput): HookEventTelemetry {
  const startedAt = new Date();
  const startedMonotonic = performance.now();
  return {
    finalize(result): HookEventTelemetryRecord {
      const unsigned = {
        protocol: HOOK_EVENT_TELEMETRY_PROTOCOL,
        event_id: randomUUID(),
        started_at: startedAt.toISOString(),
        completed_at: new Date().toISOString(),
        host: result.identity.host,
        session_id: result.identity.sessionId,
        run_id: result.identity.runId,
        turn_id: result.identity.turnId,
        event: options.event,
        route_id: options.routeId,
        exit_code: result.exitCode,
        blocked: result.blocked,
        reason: result.reason,
        elapsed_ms: roundMs(performance.now() - startedMonotonic),
      };
      const semanticFingerprint = {
        event: options.event,
        route_id: options.routeId,
        exit_code: result.exitCode,
        blocked: result.blocked,
        reason: result.reason,
      };
      const record: HookEventTelemetryRecord = {
        ...unsigned,
        fingerprint: `sha256:${createHash('sha256').update(JSON.stringify(semanticFingerprint)).digest('hex')}`,
      };
      try {
        appendHookEventLog(join(options.repoRoot, HOOK_EVENT_TELEMETRY_PATH), `${JSON.stringify(record)}\n`, options.repoRoot);
      } catch {
        // Runtime telemetry is non-authoritative and must never alter hook safety.
      }
      return record;
    },
  };
}
