import { createHash, randomUUID } from 'crypto';
import { appendFileSync, mkdirSync } from 'fs';
import { performance } from 'perf_hooks';
import { join } from 'path';
import type {
  HookEventTelemetryMetric,
  HookEventTelemetryRecord,
  HookEventTelemetryStep,
} from '../../core/loop/loop-event-protocol';
import type { HookEvent, RouteHost, RouteId } from './route-registry';

export const HOOK_EVENT_TELEMETRY_PROTOCOL = 'loop-engine-hook-event/v1' as const;
export const HOOK_EVENT_TELEMETRY_PATH = '.ai/harness/runs/hook-events.jsonl';

const METRICS: readonly HookEventTelemetryMetric[] = [
  'runtime_entries',
  'state_resolutions',
  'child_processes',
  'files_read',
  'files_written',
  'durable_writes',
  'write_transactions',
  'full_projection_writes',
  'event_writes',
  'elapsed_ms',
];

const ALWAYS_COMPLETE: readonly HookEventTelemetryMetric[] = [
  'runtime_entries',
  'child_processes',
  'elapsed_ms',
];

interface HostPayloadMetadata {
  readonly session_id?: unknown;
  readonly run_id?: unknown;
  readonly turn_id?: unknown;
}

export interface HookEventTelemetryStepInput {
  readonly name: string;
  readonly execution: HookEventTelemetryStep['execution'];
  readonly startedAt: Date;
  readonly elapsedMs: number;
  readonly exitCode: number;
  readonly outputBytes: number | null;
  readonly blocked?: boolean;
}

export interface HookEventTelemetryFinalResult {
  readonly exitCode: number;
  readonly reason: string;
  readonly blocked?: boolean;
}

export interface HookEventTelemetryAccumulator {
  recordStateResolution(): void;
  recordDirectChildProcess(): void;
  recordStep(step: HookEventTelemetryStepInput): void;
  recordFilesRead(paths: readonly string[]): void;
  recordFilesWritten(paths: readonly string[]): void;
  recordDurableWrite(path: string): void;
  recordWriteTransaction(): void;
  recordFullProjectionWrite(path: string): void;
  recordEventWrite(path: string): void;
  markMetricsComplete(metrics: readonly HookEventTelemetryMetric[]): void;
  markOpaqueStep(name: string): void;
  finalize(result: HookEventTelemetryFinalResult): HookEventTelemetryRecord;
}

export interface CreateHookEventTelemetryInput {
  readonly repoRoot: string;
  readonly event: HookEvent;
  readonly routeId: RouteId;
  readonly input?: string | Buffer;
  readonly env?: NodeJS.ProcessEnv;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function hostFromEnv(env: NodeJS.ProcessEnv): RouteHost | null {
  return env.HOOK_HOST === 'claude' || env.HOOK_HOST === 'codex' ? env.HOOK_HOST : null;
}

function payloadMetadata(input: string | Buffer | undefined): HostPayloadMetadata {
  if (input === undefined) return {};
  const text = input.toString().trim();
  if (!text.startsWith('{')) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed as HostPayloadMetadata : {};
  } catch {
    return {};
  }
}

function firstString(...values: readonly unknown[]): string | null {
  for (const value of values) {
    const resolved = stringField(value);
    if (resolved !== null) return resolved;
  }
  return null;
}

function roundMs(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}

function writeRecord(repoRoot: string, record: HookEventTelemetryRecord): void {
  try {
    const runsDir = join(repoRoot, '.ai/harness/runs');
    mkdirSync(runsDir, { recursive: true });
    appendFileSync(join(repoRoot, HOOK_EVENT_TELEMETRY_PATH), `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } catch {
    // Runtime telemetry is non-authoritative and must never alter hook safety.
  }
}

export function createHookEventTelemetry(
  options: CreateHookEventTelemetryInput,
): HookEventTelemetryAccumulator {
  const env = options.env ?? process.env;
  const payload = payloadMetadata(options.input);
  const startedAt = new Date();
  const startedMonotonic = performance.now();
  const eventId = randomUUID();
  const steps: HookEventTelemetryStep[] = [];
  const filesRead = new Set<string>();
  const filesWritten = new Set<string>();
  const durableWrites = new Set<string>();
  const completeMetrics = new Set<HookEventTelemetryMetric>(ALWAYS_COMPLETE);
  const opaqueSteps = new Set<string>();
  let stateResolutions = 0;
  let childProcesses = 0;
  let writeTransactions = 0;
  let fullProjectionWrites = 0;
  let eventWrites = 0;
  let blocked = false;
  let finalized: HookEventTelemetryRecord | null = null;

  const accumulator: HookEventTelemetryAccumulator = {
    recordStateResolution(): void {
      stateResolutions += 1;
    },
    recordDirectChildProcess(): void {
      childProcesses += 1;
    },
    recordStep(step): void {
      steps.push({
        name: step.name,
        execution: step.execution,
        started_at: step.startedAt.toISOString(),
        elapsed_ms: roundMs(step.elapsedMs),
        exit_code: step.exitCode,
        output_bytes: step.outputBytes,
      });
      blocked ||= step.blocked === true;
    },
    recordFilesRead(paths): void {
      for (const path of paths) filesRead.add(path);
    },
    recordFilesWritten(paths): void {
      for (const path of paths) filesWritten.add(path);
    },
    recordDurableWrite(path): void {
      filesWritten.add(path);
      durableWrites.add(path);
    },
    recordWriteTransaction(): void {
      writeTransactions += 1;
    },
    recordFullProjectionWrite(path): void {
      filesWritten.add(path);
      durableWrites.add(path);
      fullProjectionWrites += 1;
    },
    recordEventWrite(path): void {
      filesWritten.add(path);
      durableWrites.add(path);
      eventWrites += 1;
    },
    markMetricsComplete(metrics): void {
      for (const metric of metrics) completeMetrics.add(metric);
    },
    markOpaqueStep(name): void {
      opaqueSteps.add(name);
    },
    finalize(result): HookEventTelemetryRecord {
      if (finalized) return finalized;
      const completedAt = new Date();
      const elapsedMs = roundMs(performance.now() - startedMonotonic);
      const incompleteMetrics = METRICS.filter((metric) => !completeMetrics.has(metric));
      const unsigned = {
        protocol: HOOK_EVENT_TELEMETRY_PROTOCOL,
        kind: 'hook_event' as const,
        event_id: eventId,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        host: hostFromEnv(env),
        session_id: firstString(
          payload.session_id,
          env.HOOK_SESSION_ID,
          env.CODEX_SESSION_ID,
          env.CLAUDE_SESSION_ID,
        ),
        run_id: firstString(payload.run_id, env.HOOK_RUN_ID, env.CODEX_RUN_ID, env.CLAUDE_RUN_ID),
        turn_id: firstString(payload.turn_id, env.HOOK_TURN_ID, env.CODEX_TURN_ID, env.CLAUDE_TURN_ID),
        event: options.event,
        route_id: options.routeId,
        exit_code: result.exitCode,
        blocked: blocked || result.blocked === true || result.exitCode !== 0,
        result_reason: result.reason,
        runtime_entries: 1 as const,
        steps,
        metrics: {
          state_resolutions: stateResolutions,
          child_processes: childProcesses,
          files_read: filesRead.size,
          files_written: filesWritten.size,
          durable_writes: durableWrites.size,
          write_transactions: writeTransactions,
          full_projection_writes: fullProjectionWrites,
          event_writes: eventWrites,
          elapsed_ms: elapsedMs,
        },
        measurement: {
          complete: incompleteMetrics.length === 0,
          complete_metrics: METRICS.filter((metric) => completeMetrics.has(metric)),
          incomplete_metrics: incompleteMetrics,
          opaque_steps: [...opaqueSteps],
        },
      };
      const semanticFingerprint = {
        event: options.event,
        route_id: options.routeId,
        exit_code: result.exitCode,
        blocked: unsigned.blocked,
        result_reason: result.reason,
        steps: steps.map((step) => ({
          name: step.name,
          execution: step.execution,
          exit_code: step.exit_code,
          output_bytes: step.output_bytes,
        })),
        metrics: {
          state_resolutions: stateResolutions,
          child_processes: childProcesses,
          files_read: filesRead.size,
          files_written: filesWritten.size,
          durable_writes: durableWrites.size,
          write_transactions: writeTransactions,
          full_projection_writes: fullProjectionWrites,
          event_writes: eventWrites,
        },
        measurement: unsigned.measurement,
      };
      finalized = {
        ...unsigned,
        fingerprint: `sha256:${createHash('sha256').update(JSON.stringify(semanticFingerprint)).digest('hex')}`,
      };
      writeRecord(options.repoRoot, finalized);
      return finalized;
    },
  };

  return accumulator;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Strict shape guard used by every event-telemetry consumer. */
export function isHookEventTelemetryRecord(value: unknown): value is HookEventTelemetryRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<HookEventTelemetryRecord>;
  if (
    record.protocol !== HOOK_EVENT_TELEMETRY_PROTOCOL ||
    record.kind !== 'hook_event' ||
    typeof record.event_id !== 'string' ||
    typeof record.started_at !== 'string' ||
    typeof record.completed_at !== 'string' ||
    typeof record.event !== 'string' ||
    typeof record.route_id !== 'string' ||
    !Number.isInteger(record.exit_code) ||
    typeof record.blocked !== 'boolean' ||
    typeof record.result_reason !== 'string' ||
    record.runtime_entries !== 1 ||
    !Array.isArray(record.steps) ||
    !record.metrics ||
    !record.measurement ||
    typeof record.fingerprint !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(record.fingerprint)
  ) return false;
  const metrics = record.metrics;
  return (
    finiteNonNegative(metrics.state_resolutions) &&
    finiteNonNegative(metrics.child_processes) &&
    finiteNonNegative(metrics.files_read) &&
    finiteNonNegative(metrics.files_written) &&
    finiteNonNegative(metrics.durable_writes) &&
    finiteNonNegative(metrics.write_transactions) &&
    finiteNonNegative(metrics.full_projection_writes) &&
    finiteNonNegative(metrics.event_writes) &&
    finiteNonNegative(metrics.elapsed_ms) &&
    typeof record.measurement.complete === 'boolean' &&
    Array.isArray(record.measurement.complete_metrics) &&
    Array.isArray(record.measurement.incomplete_metrics) &&
    Array.isArray(record.measurement.opaque_steps)
  );
}
