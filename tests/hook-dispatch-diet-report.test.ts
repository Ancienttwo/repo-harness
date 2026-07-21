import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  buildHookDietReport,
  hookDietReportPasses,
  renderHookDietMarkdown,
  SESSION_START_CONTEXT_TOKEN_SLO,
  TARGET_DISPATCH_MAX,
  type HookDietReport,
} from "../scripts/hook-dispatch-diet-report";
import { HOOK_EVENT_TELEMETRY_PROTOCOL } from "../src/cli/hook/event-telemetry";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/hook-dispatch-diet-report.ts");

const ALL_METRICS = [
  "runtime_entries", "state_resolutions", "child_processes", "files_read", "files_written",
  "durable_writes", "write_transactions", "full_projection_writes", "event_writes", "elapsed_ms",
];

function eventRecord(event: string, route_id: string, id: string, overrides: Record<string, unknown> = {}) {
  const metricOverrides = overrides.metrics && typeof overrides.metrics === "object" ? overrides.metrics as Record<string, unknown> : {};
  const measurementOverrides = overrides.measurement && typeof overrides.measurement === "object" ? overrides.measurement as Record<string, unknown> : {};
  const otherOverrides = Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "metrics" && key !== "measurement"));
  const metrics = {
    state_resolutions: 1,
    child_processes: 0,
    files_read: 1,
    files_written: 0,
    durable_writes: 0,
    write_transactions: 0,
    full_projection_writes: 0,
    event_writes: 0,
    elapsed_ms: 100,
    ...metricOverrides,
  };
  return {
    protocol: HOOK_EVENT_TELEMETRY_PROTOCOL,
    kind: "hook_event",
    event_id: id,
    started_at: "2026-07-21T00:00:00.000Z",
    completed_at: "2026-07-21T00:00:00.100Z",
    host: null,
    session_id: null,
    run_id: null,
    turn_id: null,
    event,
    route_id,
    exit_code: 0,
    blocked: false,
    result_reason: "ok",
    runtime_entries: 1,
    steps: [{ name: "handler", execution: "in_process", started_at: "2026-07-21T00:00:00.000Z", elapsed_ms: 100, exit_code: 0, output_bytes: 0 }],
    metrics,
    measurement: {
      complete: true,
      complete_metrics: ALL_METRICS,
      incomplete_metrics: [],
      opaque_steps: [],
      ...measurementOverrides,
    },
    fingerprint: `sha256:${"0".repeat(64)}`,
    ...otherOverrides,
  };
}

function writeRequiredEvents(root: string, records: unknown[] = [
  eventRecord("PreToolUse", "edit", "pre-edit"),
  eventRecord("PostToolUse", "edit", "post-edit", { metrics: { event_writes: 1 } }),
  eventRecord("Stop", "default", "stop", { metrics: { write_transactions: 1 } }),
]) {
  const path = join(root, "hook-events.jsonl");
  writeFileSync(path, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  return path;
}

function reportFor(eventsPath?: string, runProbe?: (spec: { name: string }) => { exitCode: number; durationMs: number; stdout?: string }) {
  return buildHookDietReport({
    repo: ROOT,
    iterations: 2,
    baselineMs: 250,
    now: new Date("2026-06-12T00:00:00Z"),
    eventsPath,
    runProbe: runProbe ?? ((spec) => ({
      exitCode: 0,
      durationMs: 20,
      stdout: spec.name === "session-start-context"
        ? JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "测试 context" } })
        : "",
    })),
  });
}

describe("hook dispatch diet report", () => {
  test("reports protocol v2 and preserves static/synthetic sections", () => {
    const report = reportFor();
    expect(report.protocol).toBe("loop-engine-hook-diet-report/v2");
    expect(report.dispatch.previous_count).toBe(13);
    expect(report.dispatch.current_count).toBeLessThanOrEqual(TARGET_DISPATCH_MAX);
    expect(report.dispatch.within_target).toBe(true);
    expect(report.phase_probe.within_baseline).toBe(true);
    expect(report.phase_probe.probes[0]).toMatchObject({ sample_count: 2, total_ms: 40, avg_ms: 20, p50_ms: 20, p95_ms: 20, p99_ms: 20, max_ms: 20 });
    expect(report.session_start_context).toMatchObject({ authority: "synthetic_session_start_subprocess", exit_code: 0, context_bytes: 14, token_estimate: { method: "utf8_bytes_div_4", estimated_tokens: 4 }, slo: { max_estimated_tokens: SESSION_START_CONTEXT_TOKEN_SLO, within_slo: true } });
    expect(report.runtime_evidence.available).toBe(false);
    expect(report.runtime_evidence.authority).toBe("hook-events.jsonl");
    expect(hookDietReportPasses(report)).toBe(true);
    expect(report.guard_regression.required_command).toBe("bun test tests/hook-runtime.test.ts");
  });

  test("aggregates valid event records by route and evaluates LOOP-12 targets", () => {
    const dir = mkdtempSync(join(tmpdir(), "hook-diet-events-"));
    try {
      const eventsPath = writeRequiredEvents(dir);
      const report = reportFor(eventsPath);
      expect(report.runtime_evidence.available).toBe(true);
      expect(report.runtime_evidence.protocol).toBe("loop-engine-hook-event/v1");
      expect(report.runtime_evidence.sample_count).toBe(3);
      expect(report.runtime_evidence.valid_sample_count).toBe(3);
      expect(report.runtime_evidence.coverage.routes).toHaveLength(3);
      expect(report.runtime_evidence.targets.runtime_entries).toMatchObject({ sample_count: 3, p50: 1, p95: 1, pass: true });
      expect(report.runtime_evidence.targets.child_processes.pass).toBe(true);
      expect(report.runtime_evidence.targets.state_resolutions).toMatchObject({ sample_count: 2, p50: 1, p95: 1, pass: true });
      expect(report.runtime_evidence.targets.pre_edit_p95_ms).toMatchObject({ p95: 100, budget_pass: true, pass: true });
      expect(report.runtime_evidence.targets.post_edit_full_projection_writes.pass).toBe(true);
      expect(report.runtime_evidence.targets.post_edit_event_writes.pass).toBe(true);
      expect(report.runtime_evidence.targets.stop_write_transactions.pass).toBe(true);
      expect(renderHookDietMarkdown(report)).toContain("## LOOP-12 targets");
      expect(renderHookDietMarkdown(report)).toContain("post_edit_event_writes");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("fails closed on malformed, mixed, and incomplete required evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "hook-diet-invalid-"));
    try {
      const valid = writeRequiredEvents(dir);
      writeFileSync(valid, `${readFileSync(valid, "utf8")}not-json\n`);
      expect(reportFor(valid).runtime_evidence).toMatchObject({ available: false, invalid_record_count: 1, malformed_record_count: 1 });
      const mixedRecord = { ...eventRecord("PostToolUse", "edit", "b"), protocol: "old/v1" } as Record<string, unknown>;
      const mixed = writeRequiredEvents(dir, [eventRecord("PreToolUse", "edit", "a"), mixedRecord, eventRecord("Stop", "default", "c")]);
      expect(reportFor(mixed).runtime_evidence).toMatchObject({ available: false, mixed_protocol: true, invalid_record_count: 1 });
      const incomplete = writeRequiredEvents(dir, [eventRecord("PreToolUse", "edit", "a", { measurement: { complete: false, complete_metrics: ["runtime_entries", "child_processes", "elapsed_ms"], incomplete_metrics: ["state_resolutions"], opaque_steps: ["legacy.sh"] } }), eventRecord("PostToolUse", "edit", "b"), eventRecord("Stop", "default", "c")]);
      expect(reportFor(incomplete).runtime_evidence.available).toBe(false);
      expect(reportFor(incomplete).runtime_evidence.targets.state_resolutions.coverage).toBe(0.5);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("calculates nearest-rank latency percentiles and retains max as observation", () => {
    const durations = [1, 2, 3, 4, 100];
    let phaseIndex = 0;
    const report = buildHookDietReport({
      repo: ROOT, iterations: durations.length, baselineMs: 100,
      runProbe: (spec) => spec.name === "session-start-context" ? { exitCode: 0, durationMs: 1, stdout: "" } : { exitCode: 0, durationMs: durations[phaseIndex++ % durations.length] },
    });
    expect(report.phase_probe.probes[0]).toMatchObject({ sample_count: 5, total_ms: 110, avg_ms: 22, p50_ms: 3, p95_ms: 100, p99_ms: 100, max_ms: 100 });
  });

  test("gates phase latency on p95 while retaining max as observation", () => {
    const durations = [...Array(19).fill(10), 1000];
    let phaseIndex = 0;
    const report = buildHookDietReport({
      repo: ROOT, iterations: durations.length, baselineMs: 250,
      runProbe: (spec) => spec.name === "session-start-context" ? { exitCode: 0, durationMs: 1, stdout: "" } : { exitCode: 0, durationMs: durations[phaseIndex++ % durations.length] },
    });
    expect(report.phase_probe.probes[0]).toMatchObject({ p95_ms: 10, max_ms: 1000, within_baseline: true });
    expect(report.slo.within_slo).toBe(true);
  });

  test("keeps SessionStart context estimate unavailable when structured context is missing", () => {
    const report = buildHookDietReport({ repo: ROOT, iterations: 1, baselineMs: 250, runProbe: (spec) => ({ exitCode: 0, durationMs: 1, stdout: spec.name === "session-start-context" ? "not structured JSON" : "" }) });
    expect(report.session_start_context.context_bytes).toBeNull();
    expect(report.session_start_context.token_estimate.estimated_tokens).toBeNull();
    expect(report.slo.within_slo).toBe(false);
  });

  test("CLI writes JSON and Markdown reports", () => {
    const cwd = mkdtempSync(join(tmpdir(), "hook-dispatch-diet-"));
    try {
      const out = join(cwd, "diet.json");
      const jsonRun = spawnSync(process.execPath, [SCRIPT, "--repo", ROOT, "--out", out, "--iterations", "1", "--baseline-ms", "5000", "--json"], { encoding: "utf-8" });
      const report = JSON.parse(jsonRun.stdout) as HookDietReport;
      expect(jsonRun.status).toBe(hookDietReportPasses(report) ? 0 : 1);
      expect(existsSync(out)).toBe(true);
      expect(report.protocol).toBe("loop-engine-hook-diet-report/v2");
      const eventsPath = writeRequiredEvents(cwd);
      const eventsOut = join(cwd, "diet-with-events.json");
      const eventsRun = spawnSync(process.execPath, [SCRIPT, "--repo", ROOT, "--events", eventsPath, "--out", eventsOut, "--iterations", "1", "--baseline-ms", "5000", "--json"], { encoding: "utf-8" });
      const eventsReport = JSON.parse(eventsRun.stdout) as HookDietReport;
      expect(existsSync(eventsOut)).toBe(true);
      expect(eventsReport.runtime_evidence.available).toBe(true);
      const markdownOut = join(cwd, "diet.md");
      const markdownRun = spawnSync(process.execPath, [SCRIPT, "--repo", ROOT, "--out", markdownOut, "--iterations", "1", "--baseline-ms", "5000", "--markdown"], { encoding: "utf-8" });
      expect([0, 1]).toContain(markdownRun.status ?? -1);
      expect(readFileSync(markdownOut, "utf8")).toContain("# Hook Dispatch Diet Report");
      expect(readFileSync(markdownOut, "utf8")).toContain("## LOOP-12 targets");
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test("unknown flags exit with usage error", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "--bad-flag"], { encoding: "utf-8" });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("unknown argument");
  });

  test("missing --events value exits with usage error", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "--events"], { encoding: "utf-8" });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("missing required option value");
  });
});
