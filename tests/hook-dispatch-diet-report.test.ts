import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  buildHookDietReport,
  hookDietReportPasses,
  SESSION_START_CONTEXT_TOKEN_SLO,
  TARGET_DISPATCH_MAX,
  type HookDietReport,
} from "../scripts/hook-dispatch-diet-report";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/hook-dispatch-diet-report.ts");

describe("hook dispatch diet report", () => {
  test("reports the route registry under the target dispatch count", () => {
    const report = buildHookDietReport({
      repo: ROOT,
      iterations: 2,
      baselineMs: 250,
      now: new Date("2026-06-12T00:00:00Z"),
      runProbe: (spec) => ({
        exitCode: 0,
        durationMs: 20,
        stdout: spec.name === "session-start-context"
          ? JSON.stringify({
              hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: "测试 context",
              },
            })
          : "",
      }),
    });

    expect(report.protocol).toBe("loop-engine-hook-diet-report/v1");
    expect(report.dispatch.previous_count).toBe(13);
    expect(report.dispatch.current_count).toBeLessThanOrEqual(TARGET_DISPATCH_MAX);
    expect(report.dispatch.within_target).toBe(true);
    expect(report.phase_probe.within_baseline).toBe(true);
    expect(report.phase_probe.probes[0]).toMatchObject({
      sample_count: 2,
      total_ms: 40,
      avg_ms: 20,
      p50_ms: 20,
      p95_ms: 20,
      p99_ms: 20,
      max_ms: 20,
    });
    expect(report.session_start_context).toMatchObject({
      authority: "synthetic_session_start_subprocess",
      exit_code: 0,
      output_bytes: 92,
      context_bytes: 14,
      token_estimate: {
        method: "utf8_bytes_div_4",
        estimated_tokens: 4,
      },
      slo: {
        max_estimated_tokens: SESSION_START_CONTEXT_TOKEN_SLO,
        within_slo: true,
      },
    });
    expect(report.runtime_evidence).toEqual({
      available: false,
      authority: "unavailable_runtime_not_instrumented",
      live_hook_invocation_latency_ms: null,
      guard_repeat_count: null,
      time_to_first_edit_ms: null,
    });
    expect(report.slo).toEqual({
      within_slo: true,
      phase_p95_within_slo: true,
      session_start_context_within_slo: true,
    });
    expect(hookDietReportPasses(report)).toBe(true);
    expect(report.guard_regression.required_command).toBe("bun test tests/hook-runtime.test.ts");
  });

  test("calculates nearest-rank latency percentiles and totals", () => {
    const durations = [1, 2, 3, 4, 100];
    let phaseIndex = 0;
    const report = buildHookDietReport({
      repo: ROOT,
      iterations: durations.length,
      baselineMs: 100,
      runProbe: (spec) => {
        if (spec.name === "session-start-context") {
          return { exitCode: 0, durationMs: 1, stdout: "" };
        }
        const durationMs = durations[phaseIndex % durations.length];
        phaseIndex += 1;
        return { exitCode: 0, durationMs };
      },
    });

    expect(report.phase_probe.probes[0]).toMatchObject({
      sample_count: 5,
      total_ms: 110,
      avg_ms: 22,
      p50_ms: 3,
      p95_ms: 100,
      p99_ms: 100,
      max_ms: 100,
    });
  });

  test("gates phase latency on p95 while retaining max as observation", () => {
    const durations = [...Array(19).fill(10), 1000];
    let phaseIndex = 0;
    const report = buildHookDietReport({
      repo: ROOT,
      iterations: durations.length,
      baselineMs: 250,
      runProbe: (spec) => {
        if (spec.name === "session-start-context") {
          return { exitCode: 0, durationMs: 1, stdout: "" };
        }
        const durationMs = durations[phaseIndex % durations.length];
        phaseIndex += 1;
        return { exitCode: 0, durationMs };
      },
    });

    expect(report.phase_probe.probes[0]).toMatchObject({
      p95_ms: 10,
      max_ms: 1000,
      within_baseline: true,
    });
    expect(report.slo.within_slo).toBe(true);
    expect(hookDietReportPasses(report)).toBe(true);
  });

  test("records a successful inert SessionStart as zero authoritative context", () => {
    const report = buildHookDietReport({
      repo: ROOT,
      iterations: 1,
      baselineMs: 250,
      runProbe: () => ({ exitCode: 0, durationMs: 1, stdout: "" }),
    });

    expect(report.session_start_context).toMatchObject({
      output_bytes: 0,
      context_bytes: 0,
      token_estimate: { estimated_tokens: 0 },
      slo: { within_slo: true },
    });
    expect(hookDietReportPasses(report)).toBe(true);
  });

  test("keeps SessionStart context estimate unavailable when structured context is missing", () => {
    const report = buildHookDietReport({
      repo: ROOT,
      iterations: 1,
      baselineMs: 250,
      runProbe: (spec) => ({
        exitCode: 0,
        durationMs: 1,
        stdout: spec.name === "session-start-context" ? "not structured JSON" : "",
      }),
    });

    expect(report.session_start_context.output_bytes).toBe(19);
    expect(report.session_start_context.context_bytes).toBeNull();
    expect(report.session_start_context.token_estimate.estimated_tokens).toBeNull();
    expect(report.session_start_context.slo.within_slo).toBeNull();
    expect(report.slo.within_slo).toBe(false);
    expect(hookDietReportPasses(report)).toBe(false);
  });

  test("fails the SessionStart context SLO above 1500 estimated tokens", () => {
    const context = "x".repeat((SESSION_START_CONTEXT_TOKEN_SLO * 4) + 1);
    const report = buildHookDietReport({
      repo: ROOT,
      iterations: 1,
      baselineMs: 250,
      runProbe: (spec) => ({
        exitCode: 0,
        durationMs: 1,
        stdout: spec.name === "session-start-context"
          ? JSON.stringify({
              hookSpecificOutput: {
                hookEventName: "SessionStart",
                additionalContext: context,
              },
            })
          : "",
      }),
    });

    expect(report.session_start_context.context_bytes).toBe(6001);
    expect(report.session_start_context.token_estimate.estimated_tokens).toBe(1501);
    expect(report.session_start_context.slo.within_slo).toBe(false);
    expect(report.slo.within_slo).toBe(false);
    expect(hookDietReportPasses(report)).toBe(false);
  });

  test("CLI writes a JSON report", () => {
    const cwd = mkdtempSync(join(tmpdir(), "hook-dispatch-diet-"));
    try {
      const out = join(cwd, "diet.json");
      const run = spawnSync(process.execPath, [
        SCRIPT,
        "--repo",
        ROOT,
        "--out",
        out,
        "--iterations",
        "1",
        "--baseline-ms",
        "5000",
        "--json",
      ], { encoding: "utf-8" });
      const report = JSON.parse(run.stdout) as HookDietReport;

      expect(run.status).toBe(0);
      expect(existsSync(out)).toBe(true);
      expect(JSON.parse(readFileSync(out, "utf8")).dispatch.current_count).toBe(report.dispatch.current_count);
      expect(report.dispatch.within_target).toBe(true);
      expect(report.phase_probe.probes.length).toBe(2);
      expect(report.session_start_context.output_bytes).toBeGreaterThan(0);
      expect(report.session_start_context.context_bytes).toBeGreaterThan(0);
      expect(report.session_start_context.token_estimate.method).toBe("utf8_bytes_div_4");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("unknown flags exit with usage error", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "--bad-flag"], {
      encoding: "utf-8",
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("unknown argument");
  });
});
