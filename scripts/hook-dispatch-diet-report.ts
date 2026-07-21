#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { spawnSync } from "child_process";
import { performance } from "perf_hooks";
import { getRoute, ROUTES, type HookEvent, type RouteId } from "../src/cli/hook/route-registry";
import {
  HOOK_EVENT_TELEMETRY_PATH,
  HOOK_EVENT_TELEMETRY_PROTOCOL,
  isHookEventTelemetryRecord,
} from "../src/cli/hook/event-telemetry";
import type { HookEventTelemetryMetric, HookEventTelemetryRecord } from "../src/core/loop/loop-event-protocol";

export const DEFAULT_OUT = ".ai/harness/runs/loop-engine-08-hook-diet-report.json";
export const DEFAULT_EVENT_LOG = HOOK_EVENT_TELEMETRY_PATH;
export const EVENT_TELEMETRY_PROTOCOL = HOOK_EVENT_TELEMETRY_PROTOCOL;
export const DIET_REPORT_PROTOCOL = "loop-engine-hook-diet-report/v2" as const;
export const PREVIOUS_DISPATCH_COUNT = 13;
export const CORE_DISPATCH_TARGET_MAX = 8;
export const CODEX_SUBAGENT_LIFECYCLE_ROUTE_ALLOWANCE = 3;
export const TARGET_DISPATCH_MAX = CORE_DISPATCH_TARGET_MAX + CODEX_SUBAGENT_LIFECYCLE_ROUTE_ALLOWANCE;
export const DEFAULT_BASELINE_MS = 250;
export const SESSION_START_CONTEXT_TOKEN_SLO = 1500;

type EventMetric = HookEventTelemetryMetric;
const EVENT_METRICS: readonly EventMetric[] = [
  "state_resolutions", "child_processes", "files_read", "files_written", "durable_writes",
  "write_transactions", "full_projection_writes", "event_writes", "elapsed_ms",
];
const REQUIRED_TARGET_ROUTES = {
  preEdit: { event: "PreToolUse" as const, route_id: "edit" as const },
  postEdit: { event: "PostToolUse" as const, route_id: "edit" as const },
  stop: { event: "Stop" as const, route_id: "default" as const },
};

export type HookEventRecord = HookEventTelemetryRecord;

export interface MetricSummary {
  sample_count: number;
  complete_sample_count: number;
  coverage: number;
  p50: number | null;
  p95: number | null;
}

export interface RuntimeRouteEvidence {
  event: HookEvent;
  route_id: RouteId;
  sample_count: number;
  complete_sample_count: number;
  coverage: number;
  metrics: Record<string, MetricSummary>;
}

export interface RuntimeTargetResult {
  metric: string;
  route: string | string[];
  operator: "exactly" | "at_most" | "p95_at_most";
  target: number;
  budget: number | null;
  sample_count: number;
  complete_sample_count: number;
  coverage: number;
  p50: number | null;
  p95: number | null;
  pass: boolean;
  budget_pass: boolean | null;
}

export interface RuntimeEvidence {
  available: boolean;
  authority: "hook-events.jsonl";
  protocol: typeof EVENT_TELEMETRY_PROTOCOL;
  path: string;
  sample_count: number;
  valid_sample_count: number;
  invalid_record_count: number;
  malformed_record_count: number;
  mixed_protocol: boolean;
  duplicate_event_id_count: number;
  coverage: { routes: RuntimeRouteEvidence[]; metrics: Record<string, MetricSummary> };
  targets: {
    runtime_entries: RuntimeTargetResult;
    child_processes: RuntimeTargetResult;
    state_resolutions: RuntimeTargetResult;
    pre_edit_p95_ms: RuntimeTargetResult;
    post_edit_full_projection_writes: RuntimeTargetResult;
    post_edit_event_writes: RuntimeTargetResult;
    stop_write_transactions: RuntimeTargetResult;
  };
}

export interface HookDietReport {
  protocol: typeof DIET_REPORT_PROTOCOL;
  generated_at: string;
  dispatch: {
    previous_count: number;
    target_max: number;
    current_count: number;
    within_target: boolean;
    script_invocation_count: number;
    routes: Array<{ event: string; route_id: string; matcher: string | null; scripts: string[] }>;
  };
  phase_probe: {
    iterations: number;
    baseline_ms: number;
    within_baseline: boolean;
    probes: Array<{
      name: string;
      command: string;
      sample_count: number;
      total_ms: number;
      avg_ms: number;
      p50_ms: number;
      p95_ms: number;
      p99_ms: number;
      max_ms: number;
      exit_codes: number[];
      within_baseline: boolean;
    }>;
  };
  session_start_context: {
    authority: "synthetic_session_start_subprocess";
    command: string;
    exit_code: number;
    output_bytes: number;
    context_bytes: number | null;
    token_estimate: { method: "utf8_bytes_div_4"; estimated_tokens: number | null };
    slo: { max_estimated_tokens: number; within_slo: boolean | null };
  };
  slo: { within_slo: boolean; phase_p95_within_slo: boolean; session_start_context_within_slo: boolean };
  runtime_evidence: RuntimeEvidence;
  guard_regression: { required_command: "bun test tests/hook-runtime.test.ts"; status: "external_required" };
}

interface ProbeSpec { name: string; command: string[]; input?: string }
type ProbeRunner = (spec: ProbeSpec) => { exitCode: number; durationMs: number; stdout?: string };

export interface BuildHookDietReportOptions {
  repo: string;
  iterations: number;
  baselineMs: number;
  now?: Date;
  runProbe?: ProbeRunner;
  eventsPath?: string;
}

export interface EventLogReadResult {
  records: HookEventRecord[];
  sampleCount: number;
  invalidRecordCount: number;
  malformedRecordCount: number;
  mixedProtocol: boolean;
  duplicateEventIdCount: number;
  missing: boolean;
}

function usage(): string {
  return [
    "Usage: scripts/hook-dispatch-diet-report.ts [--repo PATH] [--events PATH] [--out PATH] [--iterations N] [--baseline-ms N] [--json|--markdown]",
    "",
    "Writes the loop-engine hook dispatch diet report from hook-events.jsonl.",
  ].join("\n");
}

function resolveInRepo(repo: string, candidate: string): string {
  return isAbsolute(candidate) ? candidate : resolve(repo, candidate);
}

function defaultProbeRunner(repo: string): ProbeRunner {
  return (spec) => {
    const start = performance.now();
    const result = spawnSync(process.execPath, spec.command, { cwd: repo, input: spec.input, encoding: "utf-8" });
    return { exitCode: result.status ?? 1, durationMs: performance.now() - start, stdout: result.stdout };
  };
}

function roundMs(value: number): number { return Math.round(value * 100) / 100; }

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return roundMs(sorted[index] ?? sorted[sorted.length - 1]);
}

function sessionStartContext(stdout: string): string | null {
  const text = stdout.trim();
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as { hookSpecificOutput?: { hookEventName?: unknown; additionalContext?: unknown } };
    const specific = parsed.hookSpecificOutput;
    return specific?.hookEventName === "SessionStart" && typeof specific.additionalContext === "string"
      ? specific.additionalContext : null;
  } catch { return null; }
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidHookEventRecord(value: unknown): value is HookEventRecord {
  if (!isHookEventTelemetryRecord(value)) return false;
  const candidate = value as HookEventRecord;
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
      !isValidTimestamp(step.started_at) || !isFiniteNonNegative(step.elapsed_ms) || !Number.isInteger(step.exit_code) ||
      !(step.output_bytes === null || isFiniteNonNegative(step.output_bytes))) return false;
  }
  return true;
}

export function readHookEventTelemetry(repo: string, eventsPath = DEFAULT_EVENT_LOG): EventLogReadResult {
  const path = resolveInRepo(resolve(repo), eventsPath);
  if (!existsSync(path)) return { records: [], sampleCount: 0, invalidRecordCount: 0, malformedRecordCount: 0, mixedProtocol: false, duplicateEventIdCount: 0, missing: true };
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records: HookEventRecord[] = [];
  const protocols = new Set<string>();
  const eventIds = new Set<string>();
  let invalidRecordCount = 0;
  let malformedRecordCount = 0;
  let duplicateEventIdCount = 0;
  for (const line of lines) {
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { invalidRecordCount += 1; malformedRecordCount += 1; continue; }
    const protocol = parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).protocol === "string"
      ? (parsed as Record<string, unknown>).protocol as string : "<missing>";
    protocols.add(protocol);
    if (!isValidHookEventRecord(parsed)) { invalidRecordCount += 1; continue; }
    if (eventIds.has(parsed.event_id)) duplicateEventIdCount += 1;
    eventIds.add(parsed.event_id);
    records.push(parsed);
  }
  return {
    records,
    sampleCount: lines.length,
    invalidRecordCount,
    malformedRecordCount,
    mixedProtocol: protocols.size > 1 || protocols.size === 1 && !protocols.has(EVENT_TELEMETRY_PROTOCOL),
    duplicateEventIdCount,
    missing: false,
  };
}

function metricSummary(values: number[], completeValues: number[]): MetricSummary {
  return {
    sample_count: values.length,
    complete_sample_count: completeValues.length,
    coverage: values.length === 0 ? 0 : roundMs(completeValues.length / values.length),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

function routeKey(event: HookEvent, routeId: RouteId): string { return `${event}/${routeId}`; }

function metricIsComplete(record: HookEventRecord, metric: string): boolean {
  return metric === "runtime_entries" || metric === "child_processes" || metric === "elapsed_ms"
    ? true
    : record.measurement.complete_metrics.includes(metric as HookEventTelemetryMetric) &&
      !record.measurement.incomplete_metrics.includes(metric as HookEventTelemetryMetric);
}

function metricValue(record: HookEventRecord, metric: EventMetric): number {
  return metric === "runtime_entries" ? record.runtime_entries : record.metrics[metric];
}

function aggregateRuntimeEvidence(repo: string, eventsPath: string | undefined): RuntimeEvidence {
  const read = readHookEventTelemetry(repo, eventsPath);
  const routeMap = new Map<string, HookEventRecord[]>();
  for (const record of read.records) {
    const key = routeKey(record.event, record.route_id);
    routeMap.set(key, [...(routeMap.get(key) ?? []), record]);
  }
  const makeMetrics = (records: HookEventRecord[]): Record<string, MetricSummary> => {
    const metrics: Record<string, MetricSummary> = {
      runtime_entries: metricSummary(records.map((record) => record.runtime_entries), records.map((record) => record.runtime_entries)),
    };
    for (const metric of EVENT_METRICS) {
      const values = records.map((record) => metricValue(record, metric));
      const complete = records.filter((record) => metricIsComplete(record, metric)).map((record) => metricValue(record, metric));
      metrics[metric] = metricSummary(values, complete);
    }
    return metrics;
  };
  const routeEvidence: RuntimeRouteEvidence[] = [...routeMap.entries()].map(([key, records]) => {
    const [event, routeId] = key.split("/") as [HookEvent, RouteId];
    const complete = records.filter((record) => record.measurement.complete).length;
    return { event, route_id: routeId, sample_count: records.length, complete_sample_count: complete, coverage: roundMs(complete / records.length), metrics: makeMetrics(records) };
  });
  const all = read.records;
  const globalMetrics = makeMetrics(all);
  const group = (event: HookEvent, routeId: RouteId): HookEventRecord[] => routeMap.get(routeKey(event, routeId)) ?? [];
  const preEdit = group(REQUIRED_TARGET_ROUTES.preEdit.event, REQUIRED_TARGET_ROUTES.preEdit.route_id);
  const postEdit = group(REQUIRED_TARGET_ROUTES.postEdit.event, REQUIRED_TARGET_ROUTES.postEdit.route_id);
  const stop = group(REQUIRED_TARGET_ROUTES.stop.event, REQUIRED_TARGET_ROUTES.stop.route_id);
  const completeValues = (records: HookEventRecord[], metric: EventMetric): number[] => records.filter((record) => metricIsComplete(record, metric)).map((record) => metricValue(record, metric));
  const target = (metric: string, route: string | string[], values: number[], complete: number[], operator: RuntimeTargetResult["operator"], threshold: number, budget: number | null = null): RuntimeTargetResult => {
    const summary = metricSummary(values, complete);
    const available = summary.sample_count > 0 && summary.coverage === 1;
    const pass = !available ? false : operator === "exactly" ? values.every((value) => value === threshold) : operator === "at_most" ? values.every((value) => value <= threshold) : (summary.p95 ?? Infinity) <= threshold;
    return { metric, route, operator, target: threshold, budget, sample_count: summary.sample_count, complete_sample_count: summary.complete_sample_count, coverage: summary.coverage, p50: summary.p50, p95: summary.p95, pass, budget_pass: budget === null ? null : !available ? false : (summary.p95 ?? Infinity) <= budget };
  };
  const stateRecords = [...preEdit, ...stop];
  const targets = {
    runtime_entries: target("runtime_entries", "all routes", all.map((record) => record.runtime_entries), all.map((record) => record.runtime_entries), "exactly", 1),
    child_processes: target("child_processes", "all routes", all.map((record) => record.metrics.child_processes), all.map((record) => record.metrics.child_processes), "at_most", 1),
    state_resolutions: target("state_resolutions", [routeKey(REQUIRED_TARGET_ROUTES.preEdit.event, REQUIRED_TARGET_ROUTES.preEdit.route_id), routeKey(REQUIRED_TARGET_ROUTES.stop.event, REQUIRED_TARGET_ROUTES.stop.route_id)], stateRecords.map((record) => record.metrics.state_resolutions), completeValues(stateRecords, "state_resolutions"), "exactly", 1),
    pre_edit_p95_ms: target("elapsed_ms", routeKey(REQUIRED_TARGET_ROUTES.preEdit.event, REQUIRED_TARGET_ROUTES.preEdit.route_id), preEdit.map((record) => record.metrics.elapsed_ms), completeValues(preEdit, "elapsed_ms"), "p95_at_most", 150, 250),
    post_edit_full_projection_writes: target("full_projection_writes", routeKey(REQUIRED_TARGET_ROUTES.postEdit.event, REQUIRED_TARGET_ROUTES.postEdit.route_id), postEdit.map((record) => record.metrics.full_projection_writes), completeValues(postEdit, "full_projection_writes"), "exactly", 0),
    post_edit_event_writes: target("event_writes", routeKey(REQUIRED_TARGET_ROUTES.postEdit.event, REQUIRED_TARGET_ROUTES.postEdit.route_id), postEdit.map((record) => record.metrics.event_writes), completeValues(postEdit, "event_writes"), "at_most", 1),
    stop_write_transactions: target("write_transactions", routeKey(REQUIRED_TARGET_ROUTES.stop.event, REQUIRED_TARGET_ROUTES.stop.route_id), stop.map((record) => record.metrics.write_transactions), completeValues(stop, "write_transactions"), "at_most", 1),
  };
  const requiredRouteMetricsReady = (records: HookEventRecord[], metrics: readonly EventMetric[]): boolean =>
    records.length > 0 && records.every((record) => metrics.every((metric) => metricIsComplete(record, metric)));
  const available = all.length > 0 && read.invalidRecordCount === 0 && !read.mixedProtocol && read.duplicateEventIdCount === 0 &&
    Object.values(targets).every((item) => item.sample_count > 0 && item.coverage === 1) &&
    requiredRouteMetricsReady(preEdit, ["state_resolutions"]) &&
    requiredRouteMetricsReady(postEdit, ["full_projection_writes", "event_writes", "durable_writes", "write_transactions"]) &&
    requiredRouteMetricsReady(stop, ["state_resolutions", "write_transactions", "files_written"]);
  return {
    available,
    authority: "hook-events.jsonl",
    protocol: EVENT_TELEMETRY_PROTOCOL,
    path: eventsPath ?? DEFAULT_EVENT_LOG,
    sample_count: read.sampleCount,
    valid_sample_count: read.records.length,
    invalid_record_count: read.invalidRecordCount,
    malformed_record_count: read.malformedRecordCount,
    mixed_protocol: read.mixedProtocol,
    duplicate_event_id_count: read.duplicateEventIdCount,
    coverage: { routes: routeEvidence, metrics: globalMetrics },
    targets,
  };
}

export function buildHookDietReport(options: BuildHookDietReportOptions): HookDietReport {
  const repo = resolve(options.repo);
  const runner = options.runProbe ?? defaultProbeRunner(repo);
  const probeSpecs: ProbeSpec[] = [
    { name: "state-snapshot", command: ["src/cli/hook-entry.ts", "state-snapshot", "--json"] },
    { name: "prompt-guard-decision", command: ["src/cli/hook-entry.ts", "prompt-guard-decide"], input: JSON.stringify({ prompt: "只是问个问题" }) },
  ];
  const probes = probeSpecs.map((spec) => {
    const durations: number[] = [];
    const exitCodes: number[] = [];
    for (let i = 0; i < options.iterations; i += 1) { const run = runner(spec); durations.push(run.durationMs); exitCodes.push(run.exitCode); }
    const total = durations.reduce((sum, value) => sum + value, 0);
    const p95 = percentile(durations, 0.95) ?? Infinity;
    return {
      name: spec.name, command: ["bun", ...spec.command].join(" "), sample_count: durations.length,
      total_ms: roundMs(total), avg_ms: roundMs(total / durations.length), p50_ms: percentile(durations, 0.5) ?? 0,
      p95_ms: p95, p99_ms: percentile(durations, 0.99) ?? 0, max_ms: roundMs(Math.max(...durations)), exit_codes: exitCodes,
      within_baseline: exitCodes.every((code) => code === 0) && p95 <= options.baselineMs,
    };
  });
  const currentCount = ROUTES.length;
  const routes = ROUTES.map((route) => ({ event: route.event, route_id: route.routeId, matcher: route.matcher ?? null, scripts: [...route.scripts] }));
  const sessionStartSpec: ProbeSpec = { name: "session-start-context", command: ["src/cli/hook-entry.ts", "SessionStart", "--route", "default"] };
  const sessionStartRun = runner(sessionStartSpec);
  const sessionStartStdout = sessionStartRun.stdout ?? "";
  const context = sessionStartRun.exitCode !== 0 ? null : sessionStartStdout.trim().length === 0 ? "" : sessionStartContext(sessionStartStdout);
  const contextBytes = context === null ? null : Buffer.byteLength(context, "utf8");
  const estimatedTokens = contextBytes === null ? null : Math.ceil(contextBytes / 4);
  const phaseWithinSlo = probes.every((probe) => probe.within_baseline);
  const sessionStartWithinSlo = estimatedTokens !== null && estimatedTokens <= SESSION_START_CONTEXT_TOKEN_SLO;
  return {
    protocol: DIET_REPORT_PROTOCOL, generated_at: (options.now ?? new Date()).toISOString(),
    dispatch: { previous_count: PREVIOUS_DISPATCH_COUNT, target_max: TARGET_DISPATCH_MAX, current_count: currentCount, within_target: currentCount <= TARGET_DISPATCH_MAX, script_invocation_count: ROUTES.reduce((sum, route) => sum + route.scripts.length, 0), routes },
    phase_probe: { iterations: options.iterations, baseline_ms: options.baselineMs, within_baseline: phaseWithinSlo, probes },
    session_start_context: { authority: "synthetic_session_start_subprocess", command: ["bun", ...sessionStartSpec.command].join(" "), exit_code: sessionStartRun.exitCode, output_bytes: Buffer.byteLength(sessionStartStdout, "utf8"), context_bytes: contextBytes, token_estimate: { method: "utf8_bytes_div_4", estimated_tokens: estimatedTokens }, slo: { max_estimated_tokens: SESSION_START_CONTEXT_TOKEN_SLO, within_slo: estimatedTokens === null ? null : estimatedTokens <= SESSION_START_CONTEXT_TOKEN_SLO } },
    slo: { within_slo: phaseWithinSlo && sessionStartWithinSlo, phase_p95_within_slo: phaseWithinSlo, session_start_context_within_slo: sessionStartWithinSlo },
    runtime_evidence: aggregateRuntimeEvidence(repo, options.eventsPath),
    guard_regression: { required_command: "bun test tests/hook-runtime.test.ts", status: "external_required" },
  };
}

export function hookDietReportPasses(report: HookDietReport): boolean {
  // Runtime target misses remain committed evidence; they do not abort report writing.
  return report.dispatch.within_target && report.slo.within_slo;
}

export function renderHookDietMarkdown(report: HookDietReport): string {
  const targetRows = Object.entries(report.runtime_evidence.targets).map(([name, target]) => `| ${name} | ${target.operator} ${target.target}${target.budget === null ? "" : ` (budget ${target.budget})`} | ${target.sample_count} | ${target.complete_sample_count} | ${target.p50 ?? "unavailable"} | ${target.p95 ?? "unavailable"} | ${target.pass ? "PASS" : "FAIL"} |`).join("\n");
  const routeRows = report.runtime_evidence.coverage.routes.map((route) => `| ${route.event}/${route.route_id} | ${route.sample_count} | ${route.complete_sample_count} | ${route.coverage} |`).join("\n");
  const preEdit = report.runtime_evidence.targets.pre_edit_p95_ms;
  const stateSnapshot = report.phase_probe.probes.find((probe) => probe.name === "state-snapshot");
  const passedTargets = Object.values(report.runtime_evidence.targets).filter((target) => target.pass).length;
  const totalTargets = Object.keys(report.runtime_evidence.targets).length;
  return [
    "# Hook Dispatch Diet Report", "", `- Protocol: \`${report.protocol}\``, `- Generated: ${report.generated_at}`,
    `- Runtime authority: \`${report.runtime_evidence.authority}\` (${report.runtime_evidence.available ? "available" : "unavailable"})`,
    `- Runtime samples: ${report.runtime_evidence.valid_sample_count}/${report.runtime_evidence.sample_count} valid`,
    `- Invalid/malformed/mixed: ${report.runtime_evidence.invalid_record_count}/${report.runtime_evidence.malformed_record_count}/${report.runtime_evidence.mixed_protocol ? "yes" : "no"}`,
    "", "## Measurement method", "",
    `- Event samples: \`${report.runtime_evidence.path}\`; every public route contributes an equal fixture sample count.`,
    "- Collection: `HRD08_CHARACTERIZATION_CYCLES=20 HRD08_HOOK_EVENT_EVIDENCE_OUT=\"$PWD/.ai/harness/runs/hrd08-hook-event-samples.jsonl\" bun test tests/hook-runtime-characterization.test.ts`.",
    "- Projection: `bun scripts/hook-dispatch-diet-report.ts --repo . --events .ai/harness/runs/hrd08-hook-event-samples.jsonl --out docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.json --iterations 20 --baseline-ms 250 --json`.",
    "- `child_processes` counts direct route-runtime children, not internal Git/Bun plumbing. Logical writes exclude the telemetry sink. Opaque legacy-step I/O remains incomplete rather than inferred.",
    "", "## Baseline vs current", "",
    "| Evidence | Before HRD-08 | Current |",
    "|---|---|---|",
    `| Runtime authority | per-script lines without safe event grouping | one \`${EVENT_TELEMETRY_PROTOCOL}\` record/event |`,
    `| Runtime evidence | unavailable | ${report.runtime_evidence.available ? "available" : "unavailable"}; ${report.runtime_evidence.valid_sample_count} valid samples |`,
    `| LOOP-12 target results | not measured at event level | ${passedTargets}/${totalTargets} pass |`,
    `| PreEdit latency | no event-level p50/p95 | p50 ${preEdit.p50 ?? "unavailable"} ms; p95 ${preEdit.p95 ?? "unavailable"} ms; target ${preEdit.target} ms; budget ${preEdit.budget ?? "n/a"} ms |`,
    `| State snapshot synthetic probe | synthetic only | p95 ${stateSnapshot?.p95_ms ?? "unavailable"} ms against ${report.phase_probe.baseline_ms} ms baseline |`,
    "", "## LOOP-12 targets", "", "| Target | Threshold | Samples | Complete | p50 | p95 | Result |", "|---|---:|---:|---:|---:|---:|---|", targetRows || "| (none) | | | | | | |", "",
    "## Full-metric route coverage", "",
    "`Complete` here means every declared metric, including hidden legacy-step file I/O, is directly observable. Named LOOP-12 target coverage is reported separately above; opaque values never become zero/pass.",
    "", "| Route | Samples | Fully complete | Full coverage |", "|---|---:|---:|---:|", routeRows || "| (none) | 0 | 0 | 0 |", "",
    "## Static and synthetic gates", "", `- Dispatch: ${report.dispatch.within_target ? "PASS" : "FAIL"} (${report.dispatch.current_count}/${report.dispatch.target_max})`, `- Phase probe: ${report.phase_probe.within_baseline ? "PASS" : "FAIL"} (p95 baseline ${report.phase_probe.baseline_ms} ms)`, `- SessionStart context: ${report.session_start_context.slo.within_slo === true ? "PASS" : "FAIL"}`, "",
    "## Conclusion", "",
    `Event authority and structural write/process/state targets are now measurable. ${passedTargets}/${totalTargets} LOOP-12 targets pass. PreEdit p95 is ${preEdit.p95 ?? "unavailable"} ms, so it ${preEdit.pass ? "meets" : "misses"} the ${preEdit.target} ms target${preEdit.budget === null ? "" : ` and ${preEdit.budget} ms budget`}. This measured miss is retained for the next optimization slice; HRD-08 does not relabel or hide it.`, "",
  ].join("\n");
}

interface CliOptions { repo: string; out: string; eventsPath?: string; iterations: number; baselineMs: number; format: "json" | "markdown" }

function parseArgs(argv: string[]): CliOptions | { error: string; help?: boolean } {
  const opts: CliOptions = { repo: process.cwd(), out: DEFAULT_OUT, iterations: 3, baselineMs: DEFAULT_BASELINE_MS, format: "json" };
  let formatExplicit = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { error: "", help: true };
    if (arg === "--repo") opts.repo = argv[++i] ?? "";
    else if (arg === "--events") opts.eventsPath = argv[++i] ?? "";
    else if (arg === "--out") opts.out = argv[++i] ?? "";
    else if (arg === "--iterations") { const parsed = Number.parseInt(argv[++i] ?? "", 10); if (!Number.isFinite(parsed) || parsed <= 0) return { error: "invalid --iterations" }; opts.iterations = parsed; }
    else if (arg === "--baseline-ms") { const parsed = Number.parseInt(argv[++i] ?? "", 10); if (!Number.isFinite(parsed) || parsed <= 0) return { error: "invalid --baseline-ms" }; opts.baselineMs = parsed; }
    else if (arg === "--json") { if (formatExplicit && opts.format !== "json") return { error: "choose only one output format" }; opts.format = "json"; formatExplicit = true; }
    else if (arg === "--markdown") { if (formatExplicit && opts.format !== "markdown") return { error: "choose only one output format" }; opts.format = "markdown"; formatExplicit = true; }
    else return { error: `unknown argument: ${arg}` };
  }
  if (!formatExplicit && opts.out.toLowerCase().endsWith(".md")) opts.format = "markdown";
  if (!opts.repo || !opts.out || opts.eventsPath === "") return { error: "missing required option value" };
  return opts;
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) { if (parsed.help) { console.log(usage()); return 0; } console.error(`hook-dispatch-diet-report: ${parsed.error}`); console.error(usage()); return 2; }
  const repo = resolve(parsed.repo);
  const report = buildHookDietReport({ repo, iterations: parsed.iterations, baselineMs: parsed.baselineMs, eventsPath: parsed.eventsPath });
  const outPath = resolveInRepo(repo, parsed.out);
  mkdirSync(dirname(outPath), { recursive: true });
  const markdown = renderHookDietMarkdown(report);
  writeFileSync(outPath, parsed.format === "markdown" ? markdown : `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (parsed.format === "json") console.log(JSON.stringify(report)); else console.log(markdown);
  return hookDietReportPasses(report) ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
