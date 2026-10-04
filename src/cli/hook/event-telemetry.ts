import { createHash, randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import type {
  HookEventTelemetryEffectObservation,
  HookEventTelemetryMetric,
  HookEventTelemetryRecord,
  HookEventTelemetryStep,
} from '../../core/loop/loop-event-protocol';
import { getRoute, type HookEvent, type RouteHost, type RouteId } from './route-registry';
import { resolveRunIdentity } from './run-identity';
import { appendHookEventLog, readHookEventLog } from '../../effects/hook-event-log';

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

/**
 * Metrics whose zero/one value is trustworthy without an explicit observer.
 *
 * `child_processes` counts *direct route-runtime children* -- a dispatch that
 * spawns its route instead of running a typed handler in process. It is not a
 * count of every fork under the handler: the Git and Bun plumbing inside
 * session-context, mutation-observed and friends is handler business logic and
 * is deliberately excluded. `recordDirectChildProcess` therefore has no
 * call site by design -- it is the sentinel that would go non-zero if a route
 * ever regressed to the retired `run-hook.sh` shape, which is why
 * `tests/hook-runtime.test.ts` ("typed handlers do not ... spawn a route
 * child") and `tests/hook-runtime-characterization.test.ts` both pin it to 0.
 * Wiring it into the internal spawn sites would not close a measurement gap; it
 * would destroy the invariant those tests assert. See
 * `docs/researches/20260721-hrd09-legacy-retirement-evidence.md`.
 */
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
  readonly effectObservation?: HookEventTelemetryEffectObservation;
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
    appendHookEventLog(join(repoRoot, HOOK_EVENT_TELEMETRY_PATH), `${JSON.stringify(record)}\n`, repoRoot);
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
      // Unified resolution order (payload.run_id -> HOOK_RUN_ID -> CODEX_RUN_ID
      // -> CLAUDE_RUN_ID -> session-state lookup by session_id -> null) lives
      // once in run-identity.ts; every consumption point calls it rather than
      // maintaining its own copy of the chain. session_id's own chain is
      // unchanged -- resolveRunIdentity computes it identically.
      const runIdentity = resolveRunIdentity(options.repoRoot, payload, env);
      const unsigned = {
        protocol: HOOK_EVENT_TELEMETRY_PROTOCOL,
        kind: 'hook_event' as const,
        event_id: eventId,
        started_at: startedAt.toISOString(),
        completed_at: completedAt.toISOString(),
        host: hostFromEnv(env),
        session_id: runIdentity.sessionId,
        run_id: runIdentity.runId,
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
        effect_observation: result.effectObservation,
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
        effect_observation: unsigned.effect_observation,
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
  if (!isEffectObservation(record.effect_observation)) return false;
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

function isEffectObservation(value: unknown): value is HookEventTelemetryEffectObservation | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const observation = value as Partial<HookEventTelemetryEffectObservation>;
  const states = ['none_committed', 'unknown_partial', 'committed_partial', 'committed_complete'];
  const cardinals = ['zero-or-one', 'bounded-sequence'];
  const recoveries = ['retry-converges', 'reconcile-required'];
  return typeof observation.contract_id === 'string'
    && observation.contract_id.trim().length > 0
    && observation.boundary === 'durable-emission'
    && typeof observation.cardinality === 'string'
    && cardinals.includes(observation.cardinality)
    && typeof observation.recovery === 'string'
    && recoveries.includes(observation.recovery)
    && typeof observation.state === 'string'
    && states.includes(observation.state)
    && Array.isArray(observation.committed_phases)
    && observation.committed_phases.every((phase) => typeof phase === 'string' && phase.length > 0)
    && new Set(observation.committed_phases).size === observation.committed_phases.length
    && (observation.last_committed_phase === null
      || (typeof observation.last_committed_phase === 'string'
        && observation.committed_phases.includes(observation.last_committed_phase)));
}

export interface EventLogReadResult {
  records: HookEventTelemetryRecord[];
  sampleCount: number;
  invalidRecordCount: number;
  malformedRecordCount: number;
  mixedProtocol: boolean;
  duplicateEventIdCount: number;
  missing: boolean;
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isValidHookEventTelemetryRecord(value: unknown): value is HookEventTelemetryRecord {
  if (!isHookEventTelemetryRecord(value)) return false;
  const candidate = value as HookEventTelemetryRecord;
  if (!isValidTimestamp(candidate.started_at) || !isValidTimestamp(candidate.completed_at)) return false;
  if (!(candidate.host === null || candidate.host === "claude" || candidate.host === "codex")) return false;
  if (!(candidate.session_id === null || typeof candidate.session_id === "string")) return false;
  if (!(candidate.run_id === null || typeof candidate.run_id === "string")) return false;
  if (!(candidate.turn_id === null || typeof candidate.turn_id === "string")) return false;
  if (!getRoute(candidate.event, candidate.route_id)) return false;
  if (!isStringArray(candidate.measurement.complete_metrics) || !isStringArray(candidate.measurement.incomplete_metrics) ||
    !isStringArray(candidate.measurement.opaque_steps)) return false;
  for (const step of candidate.steps) {
    if (!step || typeof step.name !== "string" || step.name.length === 0 ||
      (step.execution !== "in_process" && step.execution !== "subprocess") ||
      !isValidTimestamp(step.started_at) || !finiteNonNegative(step.elapsed_ms) || !Number.isInteger(step.exit_code) ||
      !(step.output_bytes === null || finiteNonNegative(step.output_bytes))) return false;
  }
  return true;
}

export function readHookEventTelemetry(repo: string, eventsPath = HOOK_EVENT_TELEMETRY_PATH): EventLogReadResult {
  const path = resolve(repo, eventsPath);
  const lines = path === resolve(repo, HOOK_EVENT_TELEMETRY_PATH)
    ? readHookEventLog(path, repo)
    : existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/).filter(line => line.trim()) : null;
  if (lines === null) return { records: [], sampleCount: 0, invalidRecordCount: 0, malformedRecordCount: 0, mixedProtocol: false, duplicateEventIdCount: 0, missing: true };
  const records: HookEventTelemetryRecord[] = [];
  const protocols = new Set<string>();
  const eventIds = new Set<string>();
  let invalidRecordCount = 0;
  let malformedRecordCount = 0;
  let duplicateEventIdCount = 0;
  let sampleCount = 0;
  for (const line of lines) {
    sampleCount += 1;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { invalidRecordCount += 1; malformedRecordCount += 1; continue; }
    const protocol = parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).protocol === "string"
      ? (parsed as Record<string, unknown>).protocol as string : "<missing>";
    protocols.add(protocol);
    if (!isValidHookEventTelemetryRecord(parsed)) { invalidRecordCount += 1; continue; }
    if (eventIds.has(parsed.event_id)) duplicateEventIdCount += 1;
    eventIds.add(parsed.event_id);
    records.push(parsed);
  }
  return {
    records,
    sampleCount,
    invalidRecordCount,
    malformedRecordCount,
    mixedProtocol: protocols.size > 1 || protocols.size === 1 && !protocols.has(HOOK_EVENT_TELEMETRY_PROTOCOL),
    duplicateEventIdCount,
    missing: false,
  };
}
