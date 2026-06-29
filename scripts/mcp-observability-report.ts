#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";

export const DEFAULT_METRICS_PATH = ".ai/harness/mcp/metrics.jsonl";
export const DEFAULT_TRACE_PATH = ".ai/harness/mcp/trace.jsonl";
export const DEFAULT_REPORT_PATH = ".ai/harness/runs/mcp-observability-report.json";
export const DEFAULT_PATH_ESCAPE_THRESHOLD = 5;
export const DEFAULT_INDEX_LAG_THRESHOLD_MS = 5_000;
export const MAX_OBSERVABILITY_EVENTS = 100_000;

export interface McpObservabilityMetric {
  schema_version?: number;
  event_type?: string;
  timestamp?: string;
  correlation_id?: string;
  repo_id?: string;
  tool?: string;
  operation?: string;
  status?: "ok" | "blocked" | "failed";
  error_code?: string;
  duration_ms?: number;
  codegraph_revision?: string;
  codegraph_available?: boolean;
  codegraph_latency_ms?: number;
  path_count?: number;
  path_digest?: string;
  bytes_returned?: number;
  bytes_written?: number;
  partial?: boolean;
  fallback_used?: boolean;
  filtered_path_count?: number;
  manifest_parity_failure_count?: number;
  manifest_incomplete?: boolean;
  snapshot_stale?: boolean;
  index_lagging?: boolean;
  index_lag_ms?: number;
  lagging_path_count?: number;
  write_conflict?: boolean;
  atomic_write_failure?: boolean;
  reindex_failure?: boolean;
  path_escape_attempt?: boolean;
}

export interface McpObservabilityTrace {
  schema_version?: number;
  event_type?: string;
  timestamp?: string;
  correlation_id?: string;
  trace_id?: string;
  repo_id?: string;
  tool?: string;
  status?: "ok" | "blocked" | "failed";
  duration_ms?: number;
  route?: string[];
  backend?: string;
  codegraph_revision?: string;
  index_state?: string;
}

export interface McpObservabilityReport {
  protocol: "repo-harness-mcp-observability-report/v1";
  generated_at: string;
  source: {
    metrics_path: string;
    trace_path: string;
    metric_events: number;
    trace_events: number;
  };
  dashboard: {
    totals: DashboardStats;
    by_repo_tool_codegraph: DashboardStats[];
  };
  alerts: Array<{
    id: string;
    severity: "warning" | "critical";
    count: number;
    threshold?: number;
    message: string;
  }>;
  tracing: {
    correlated_metric_events: number;
    missing_trace_events: number;
    correlation_ids: string[];
  };
}

export interface DashboardStats {
  repo_id: string;
  tool: string;
  codegraph_revision: string;
  calls: number;
  errors: number;
  blocked: number;
  error_rate: number;
  latency_p95_ms: number;
  latency_max_ms: number;
  bytes_returned: number;
  bytes_written: number;
  partial_count: number;
  partial_rate: number;
  fallback_count: number;
  fallback_rate: number;
  manifest_parity_failures: number;
  manifest_incomplete_count: number;
  snapshot_stale_count: number;
  index_lagging_count: number;
  index_lag_max_ms: number;
  lagging_path_count: number;
  write_conflicts: number;
  atomic_write_failures: number;
  reindex_failures: number;
  path_escape_attempts: number;
}

interface BuildOptions {
  repo: string;
  metricsPath?: string;
  tracePath?: string;
  now?: Date;
  pathEscapeThreshold?: number;
  indexLagThresholdMs?: number;
}

interface MutableGroup {
  repoId: string;
  tool: string;
  codeGraphRevision: string;
  calls: number;
  errors: number;
  blocked: number;
  durations: number[];
  bytesReturned: number;
  bytesWritten: number;
  partialCount: number;
  fallbackCount: number;
  manifestParityFailures: number;
  manifestIncompleteCount: number;
  snapshotStaleCount: number;
  indexLaggingCount: number;
  indexLagMaxMs: number;
  laggingPathCount: number;
  writeConflicts: number;
  atomicWriteFailures: number;
  reindexFailures: number;
  pathEscapeAttempts: number;
}

function usage(): string {
  return [
    "Usage: scripts/mcp-observability-report.ts [--repo PATH] [--metrics PATH] [--trace PATH] [--out PATH] [--json]",
    "       [--path-escape-threshold N] [--index-lag-threshold-ms N]",
    "",
    "Aggregates repo-harness MCP metrics and trace JSONL into a dashboard/alert report.",
  ].join("\n");
}

function resolveInRepo(repo: string, candidate: string): string {
  return isAbsolute(candidate) ? candidate : resolve(repo, candidate);
}

function readJsonLines(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .trimEnd()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-MAX_OBSERVABILITY_EVENTS)
    .map((line) => JSON.parse(line))
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry));
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return Math.round(sorted[index] * 100) / 100;
}

function rate(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 10000) / 10000;
}

function emptyGroup(repoId: string, tool: string, codeGraphRevision: string): MutableGroup {
  return {
    repoId,
    tool,
    codeGraphRevision,
    calls: 0,
    errors: 0,
    blocked: 0,
    durations: [],
    bytesReturned: 0,
    bytesWritten: 0,
    partialCount: 0,
    fallbackCount: 0,
    manifestParityFailures: 0,
    manifestIncompleteCount: 0,
    snapshotStaleCount: 0,
    indexLaggingCount: 0,
    indexLagMaxMs: 0,
    laggingPathCount: 0,
    writeConflicts: 0,
    atomicWriteFailures: 0,
    reindexFailures: 0,
    pathEscapeAttempts: 0,
  };
}

function addMetric(group: MutableGroup, metric: McpObservabilityMetric): void {
  group.calls += 1;
  if (metric.status === "failed") group.errors += 1;
  if (metric.status === "blocked") group.blocked += 1;
  group.durations.push(numberValue(metric.duration_ms));
  group.bytesReturned += numberValue(metric.bytes_returned);
  group.bytesWritten += numberValue(metric.bytes_written);
  if (booleanValue(metric.partial)) group.partialCount += 1;
  if (booleanValue(metric.fallback_used)) group.fallbackCount += 1;
  group.manifestParityFailures += numberValue(metric.manifest_parity_failure_count);
  if (booleanValue(metric.manifest_incomplete)) group.manifestIncompleteCount += 1;
  if (booleanValue(metric.snapshot_stale)) group.snapshotStaleCount += 1;
  if (booleanValue(metric.index_lagging)) group.indexLaggingCount += 1;
  group.indexLagMaxMs = Math.max(group.indexLagMaxMs, numberValue(metric.index_lag_ms));
  group.laggingPathCount += numberValue(metric.lagging_path_count);
  if (booleanValue(metric.write_conflict)) group.writeConflicts += 1;
  if (booleanValue(metric.atomic_write_failure)) group.atomicWriteFailures += 1;
  if (booleanValue(metric.reindex_failure)) group.reindexFailures += 1;
  if (booleanValue(metric.path_escape_attempt)) group.pathEscapeAttempts += 1;
}

function toStats(group: MutableGroup): DashboardStats {
  return {
    repo_id: group.repoId,
    tool: group.tool,
    codegraph_revision: group.codeGraphRevision,
    calls: group.calls,
    errors: group.errors,
    blocked: group.blocked,
    error_rate: rate(group.errors, group.calls),
    latency_p95_ms: percentile95(group.durations),
    latency_max_ms: group.durations.reduce((max, duration) => Math.max(max, duration), 0),
    bytes_returned: group.bytesReturned,
    bytes_written: group.bytesWritten,
    partial_count: group.partialCount,
    partial_rate: rate(group.partialCount, group.calls),
    fallback_count: group.fallbackCount,
    fallback_rate: rate(group.fallbackCount, group.calls),
    manifest_parity_failures: group.manifestParityFailures,
    manifest_incomplete_count: group.manifestIncompleteCount,
    snapshot_stale_count: group.snapshotStaleCount,
    index_lagging_count: group.indexLaggingCount,
    index_lag_max_ms: group.indexLagMaxMs,
    lagging_path_count: group.laggingPathCount,
    write_conflicts: group.writeConflicts,
    atomic_write_failures: group.atomicWriteFailures,
    reindex_failures: group.reindexFailures,
    path_escape_attempts: group.pathEscapeAttempts,
  };
}

function buildAlerts(totals: DashboardStats, opts: Required<Pick<BuildOptions, "pathEscapeThreshold" | "indexLagThresholdMs">>): McpObservabilityReport["alerts"] {
  const alerts: McpObservabilityReport["alerts"] = [];
  if (totals.path_escape_attempts >= opts.pathEscapeThreshold) {
    alerts.push({
      id: "path_escape_spike",
      severity: "critical",
      count: totals.path_escape_attempts,
      threshold: opts.pathEscapeThreshold,
      message: "Path escape attempts exceeded the configured threshold.",
    });
  }
  if (totals.index_lag_max_ms > opts.indexLagThresholdMs) {
    alerts.push({
      id: "index_lag_threshold",
      severity: "warning",
      count: totals.index_lag_max_ms,
      threshold: opts.indexLagThresholdMs,
      message: "Observed index lag exceeded the configured threshold.",
    });
  }
  if (totals.manifest_incomplete_count > 0) {
    alerts.push({
      id: "manifest_incomplete",
      severity: "critical",
      count: totals.manifest_incomplete_count,
      message: "At least one manifest call reported incomplete walking.",
    });
  }
  if (totals.reindex_failures > 0) {
    alerts.push({
      id: "reindex_dead_letter",
      severity: "critical",
      count: totals.reindex_failures,
      message: "At least one reindex operation failed and needs dead-letter recovery.",
    });
  }
  return alerts;
}

export function buildMcpObservabilityReport(options: BuildOptions): McpObservabilityReport {
  const repo = resolve(options.repo);
  const metricsPath = resolveInRepo(repo, options.metricsPath ?? DEFAULT_METRICS_PATH);
  const tracePath = resolveInRepo(repo, options.tracePath ?? DEFAULT_TRACE_PATH);
  const metrics = readJsonLines(metricsPath) as McpObservabilityMetric[];
  const traces = readJsonLines(tracePath) as McpObservabilityTrace[];
  const groups = new Map<string, MutableGroup>();
  const totals = emptyGroup("all", "all", "all");

  for (const metric of metrics) {
    const repoId = stringValue(metric.repo_id, "unknown");
    const tool = stringValue(metric.tool, "unknown");
    const revision = stringValue(metric.codegraph_revision, "unknown");
    const key = `${repoId}\0${tool}\0${revision}`;
    const group = groups.get(key) ?? emptyGroup(repoId, tool, revision);
    groups.set(key, group);
    addMetric(group, metric);
    addMetric(totals, metric);
  }

  const traceIds = new Set(traces.map((trace) => trace.correlation_id).filter((id): id is string => typeof id === "string" && id.length > 0));
  const metricIds = metrics.map((metric) => metric.correlation_id).filter((id): id is string => typeof id === "string" && id.length > 0);
  const correlatedMetricEvents = metricIds.filter((id) => traceIds.has(id)).length;

  return {
    protocol: "repo-harness-mcp-observability-report/v1",
    generated_at: (options.now ?? new Date()).toISOString(),
    source: {
      metrics_path: metricsPath,
      trace_path: tracePath,
      metric_events: metrics.length,
      trace_events: traces.length,
    },
    dashboard: {
      totals: toStats(totals),
      by_repo_tool_codegraph: [...groups.values()].map(toStats).sort((a, b) => (
        `${a.repo_id}\0${a.tool}\0${a.codegraph_revision}`.localeCompare(`${b.repo_id}\0${b.tool}\0${b.codegraph_revision}`)
      )),
    },
    alerts: buildAlerts(toStats(totals), {
      pathEscapeThreshold: options.pathEscapeThreshold ?? DEFAULT_PATH_ESCAPE_THRESHOLD,
      indexLagThresholdMs: options.indexLagThresholdMs ?? DEFAULT_INDEX_LAG_THRESHOLD_MS,
    }),
    tracing: {
      correlated_metric_events: correlatedMetricEvents,
      missing_trace_events: metricIds.length - correlatedMetricEvents,
      correlation_ids: metricIds.slice(-50),
    },
  };
}

export function writeMcpObservabilityReport(path: string, report: McpObservabilityReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
}

interface CliOptions {
  repo: string;
  metricsPath: string;
  tracePath: string;
  out: string;
  pathEscapeThreshold: number;
  indexLagThresholdMs: number;
  json: boolean;
}

function parsePositiveInteger(value: string | undefined, label: string): number | string {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return `invalid ${label}`;
  return parsed;
}

function parseArgs(argv: string[]): CliOptions | { error: string; help?: boolean } {
  const opts: CliOptions = {
    repo: process.cwd(),
    metricsPath: DEFAULT_METRICS_PATH,
    tracePath: DEFAULT_TRACE_PATH,
    out: DEFAULT_REPORT_PATH,
    pathEscapeThreshold: DEFAULT_PATH_ESCAPE_THRESHOLD,
    indexLagThresholdMs: DEFAULT_INDEX_LAG_THRESHOLD_MS,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { error: "", help: true };
    if (arg === "--repo") {
      opts.repo = argv[++i] ?? "";
    } else if (arg === "--metrics") {
      opts.metricsPath = argv[++i] ?? "";
    } else if (arg === "--trace") {
      opts.tracePath = argv[++i] ?? "";
    } else if (arg === "--out") {
      opts.out = argv[++i] ?? "";
    } else if (arg === "--path-escape-threshold") {
      const parsed = parsePositiveInteger(argv[++i], "--path-escape-threshold");
      if (typeof parsed === "string") return { error: parsed };
      opts.pathEscapeThreshold = parsed;
    } else if (arg === "--index-lag-threshold-ms") {
      const parsed = parsePositiveInteger(argv[++i], "--index-lag-threshold-ms");
      if (typeof parsed === "string") return { error: parsed };
      opts.indexLagThresholdMs = parsed;
    } else if (arg === "--json") {
      opts.json = true;
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }

  if (!opts.repo || !opts.metricsPath || !opts.tracePath || !opts.out) return { error: "missing required option value" };
  return opts;
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    if (parsed.help) {
      console.log(usage());
      return 0;
    }
    console.error(`mcp-observability-report: ${parsed.error}`);
    console.error(usage());
    return 2;
  }

  const repo = resolve(parsed.repo);
  const report = buildMcpObservabilityReport({
    repo,
    metricsPath: parsed.metricsPath,
    tracePath: parsed.tracePath,
    pathEscapeThreshold: parsed.pathEscapeThreshold,
    indexLagThresholdMs: parsed.indexLagThresholdMs,
  });
  const outPath = resolveInRepo(repo, parsed.out);
  writeMcpObservabilityReport(outPath, report);

  if (parsed.json) {
    console.log(JSON.stringify(report));
  } else {
    console.log(`mcp-observability events=${report.source.metric_events} alerts=${report.alerts.length} out=${parsed.out}`);
  }
  return report.alerts.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
