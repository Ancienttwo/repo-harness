#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "fs";
import { dirname, isAbsolute, resolve } from "path";
import { spawnSync } from "child_process";
import { performance } from "perf_hooks";
import { ROUTES } from "../src/cli/hook/route-registry";

export const DEFAULT_OUT = ".ai/harness/runs/loop-engine-08-hook-diet-report.json";
export const PREVIOUS_DISPATCH_COUNT = 13;
export const CORE_DISPATCH_TARGET_MAX = 8;
export const CODEX_SUBAGENT_LIFECYCLE_ROUTE_ALLOWANCE = 3;
export const TARGET_DISPATCH_MAX = CORE_DISPATCH_TARGET_MAX + CODEX_SUBAGENT_LIFECYCLE_ROUTE_ALLOWANCE;
export const DEFAULT_BASELINE_MS = 250;
export const SESSION_START_CONTEXT_TOKEN_SLO = 1500;

export interface HookDietReport {
  protocol: "loop-engine-hook-diet-report/v1";
  generated_at: string;
  dispatch: {
    previous_count: number;
    target_max: number;
    current_count: number;
    within_target: boolean;
    script_invocation_count: number;
    routes: Array<{
      event: string;
      route_id: string;
      matcher: string | null;
      scripts: string[];
    }>;
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
    token_estimate: {
      method: "utf8_bytes_div_4";
      estimated_tokens: number | null;
    };
    slo: {
      max_estimated_tokens: number;
      within_slo: boolean | null;
    };
  };
  slo: {
    within_slo: boolean;
    phase_p95_within_slo: boolean;
    session_start_context_within_slo: boolean;
  };
  runtime_evidence: {
    available: false;
    authority: "unavailable_runtime_not_instrumented";
    live_hook_invocation_latency_ms: null;
    guard_repeat_count: null;
    time_to_first_edit_ms: null;
  };
  guard_regression: {
    required_command: "bun test tests/hook-runtime.test.ts";
    status: "external_required";
  };
}

interface ProbeSpec {
  name: string;
  command: string[];
  input?: string;
}

type ProbeRunner = (spec: ProbeSpec) => { exitCode: number; durationMs: number; stdout?: string };

export interface BuildHookDietReportOptions {
  repo: string;
  iterations: number;
  baselineMs: number;
  now?: Date;
  runProbe?: ProbeRunner;
}

function usage(): string {
  return [
    "Usage: scripts/hook-dispatch-diet-report.ts [--repo PATH] [--out PATH] [--iterations N] [--baseline-ms N] [--json]",
    "",
    "Writes the loop-engine hook dispatch diet report.",
  ].join("\n");
}

function resolveInRepo(repo: string, candidate: string): string {
  return isAbsolute(candidate) ? candidate : resolve(repo, candidate);
}

function defaultProbeRunner(repo: string): ProbeRunner {
  return (spec) => {
    const start = performance.now();
    const result = spawnSync(process.execPath, spec.command, {
      cwd: repo,
      input: spec.input,
      encoding: "utf-8",
    });
    const durationMs = performance.now() - start;
    return { exitCode: result.status ?? 1, durationMs, stdout: result.stdout };
  };
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[index];
}

function sessionStartContext(stdout: string): string | null {
  const text = stdout.trim();
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as {
      hookSpecificOutput?: { hookEventName?: unknown; additionalContext?: unknown };
    };
    const specific = parsed.hookSpecificOutput;
    if (
      specific?.hookEventName === "SessionStart" &&
      typeof specific.additionalContext === "string"
    ) {
      return specific.additionalContext;
    }
  } catch {
    return null;
  }
  return null;
}

export function buildHookDietReport(options: BuildHookDietReportOptions): HookDietReport {
  const repo = resolve(options.repo);
  const runner = options.runProbe ?? defaultProbeRunner(repo);
  const probeSpecs: ProbeSpec[] = [
    {
      name: "state-snapshot",
      command: ["src/cli/hook-entry.ts", "state-snapshot", "--json"],
    },
    {
      name: "prompt-guard-decision",
      command: ["src/cli/hook-entry.ts", "prompt-guard-decide"],
      input: JSON.stringify({ prompt: "只是问个问题" }),
    },
  ];
  const probes = probeSpecs.map((spec) => {
    const durations: number[] = [];
    const exitCodes: number[] = [];
    for (let i = 0; i < options.iterations; i += 1) {
      const run = runner(spec);
      durations.push(run.durationMs);
      exitCodes.push(run.exitCode);
    }
    const total = durations.reduce((sum, value) => sum + value, 0);
    const avg = total / durations.length;
    const max = Math.max(...durations);
    const p95 = percentile(durations, 0.95);
    return {
      name: spec.name,
      command: [process.execPath, ...spec.command].join(" "),
      sample_count: durations.length,
      total_ms: roundMs(total),
      avg_ms: roundMs(avg),
      p50_ms: roundMs(percentile(durations, 0.5)),
      p95_ms: roundMs(p95),
      p99_ms: roundMs(percentile(durations, 0.99)),
      max_ms: roundMs(max),
      exit_codes: exitCodes,
      within_baseline: exitCodes.every((code) => code === 0) && p95 <= options.baselineMs,
    };
  });
  const currentCount = ROUTES.length;
  const routes = ROUTES.map((route) => ({
    event: route.event,
    route_id: route.routeId,
    matcher: route.matcher ?? null,
    scripts: [...route.scripts],
  }));
  const sessionStartSpec: ProbeSpec = {
    name: "session-start-context",
    command: ["src/cli/hook-entry.ts", "SessionStart", "--route", "default"],
  };
  const sessionStartRun = runner(sessionStartSpec);
  const sessionStartStdout = sessionStartRun.stdout ?? "";
  const context = sessionStartRun.exitCode !== 0
    ? null
    : sessionStartStdout.trim().length === 0
      ? ""
      : sessionStartContext(sessionStartStdout);
  const contextBytes = context === null ? null : Buffer.byteLength(context, "utf8");
  const estimatedTokens = contextBytes === null ? null : Math.ceil(contextBytes / 4);
  const phaseWithinSlo = probes.every((probe) => probe.within_baseline);
  const sessionStartWithinSlo = estimatedTokens !== null &&
    estimatedTokens <= SESSION_START_CONTEXT_TOKEN_SLO;

  return {
    protocol: "loop-engine-hook-diet-report/v1",
    generated_at: (options.now ?? new Date()).toISOString(),
    dispatch: {
      previous_count: PREVIOUS_DISPATCH_COUNT,
      target_max: TARGET_DISPATCH_MAX,
      current_count: currentCount,
      within_target: currentCount <= TARGET_DISPATCH_MAX,
      script_invocation_count: ROUTES.reduce((sum, route) => sum + route.scripts.length, 0),
      routes,
    },
    phase_probe: {
      iterations: options.iterations,
      baseline_ms: options.baselineMs,
      within_baseline: phaseWithinSlo,
      probes,
    },
    session_start_context: {
      authority: "synthetic_session_start_subprocess",
      command: [process.execPath, ...sessionStartSpec.command].join(" "),
      exit_code: sessionStartRun.exitCode,
      output_bytes: Buffer.byteLength(sessionStartStdout, "utf8"),
      context_bytes: contextBytes,
      token_estimate: {
        method: "utf8_bytes_div_4",
        estimated_tokens: estimatedTokens,
      },
      slo: {
        max_estimated_tokens: SESSION_START_CONTEXT_TOKEN_SLO,
        within_slo: estimatedTokens === null
          ? null
          : estimatedTokens <= SESSION_START_CONTEXT_TOKEN_SLO,
      },
    },
    slo: {
      within_slo: phaseWithinSlo && sessionStartWithinSlo,
      phase_p95_within_slo: phaseWithinSlo,
      session_start_context_within_slo: sessionStartWithinSlo,
    },
    runtime_evidence: {
      available: false,
      authority: "unavailable_runtime_not_instrumented",
      live_hook_invocation_latency_ms: null,
      guard_repeat_count: null,
      time_to_first_edit_ms: null,
    },
    guard_regression: {
      required_command: "bun test tests/hook-runtime.test.ts",
      status: "external_required",
    },
  };
}

export function hookDietReportPasses(report: HookDietReport): boolean {
  return report.dispatch.within_target && report.slo.within_slo;
}

interface CliOptions {
  repo: string;
  out: string;
  iterations: number;
  baselineMs: number;
  json: boolean;
}

function parseArgs(argv: string[]): CliOptions | { error: string; help?: boolean } {
  const opts: CliOptions = {
    repo: process.cwd(),
    out: DEFAULT_OUT,
    iterations: 3,
    baselineMs: DEFAULT_BASELINE_MS,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { error: "", help: true };
    if (arg === "--repo") {
      opts.repo = argv[++i] ?? "";
    } else if (arg === "--out") {
      opts.out = argv[++i] ?? "";
    } else if (arg === "--iterations") {
      const parsed = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return { error: "invalid --iterations" };
      opts.iterations = parsed;
    } else if (arg === "--baseline-ms") {
      const parsed = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return { error: "invalid --baseline-ms" };
      opts.baselineMs = parsed;
    } else if (arg === "--json") {
      opts.json = true;
    } else {
      return { error: `unknown argument: ${arg}` };
    }
  }

  if (!opts.repo || !opts.out) return { error: "missing required option value" };
  return opts;
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    if (parsed.help) {
      console.log(usage());
      return 0;
    }
    console.error(`hook-dispatch-diet-report: ${parsed.error}`);
    console.error(usage());
    return 2;
  }

  const repo = resolve(parsed.repo);
  const report = buildHookDietReport({
    repo,
    iterations: parsed.iterations,
    baselineMs: parsed.baselineMs,
  });
  const outPath = resolveInRepo(repo, parsed.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (parsed.json) {
    console.log(JSON.stringify(report));
  } else {
    console.log(`hook-dispatch-diet current=${report.dispatch.current_count}/${report.dispatch.target_max} phase_probe=${report.phase_probe.within_baseline ? "pass" : "fail"} out=${parsed.out}`);
  }
  return hookDietReportPasses(report) ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
