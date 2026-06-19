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
      avg_ms: number;
      max_ms: number;
      exit_codes: number[];
      within_baseline: boolean;
    }>;
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

type ProbeRunner = (spec: ProbeSpec) => { exitCode: number; durationMs: number };

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
    return { exitCode: result.status ?? 1, durationMs };
  };
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
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
    const avg = durations.reduce((sum, value) => sum + value, 0) / durations.length;
    const max = Math.max(...durations);
    return {
      name: spec.name,
      command: [process.execPath, ...spec.command].join(" "),
      avg_ms: roundMs(avg),
      max_ms: roundMs(max),
      exit_codes: exitCodes,
      within_baseline: exitCodes.every((code) => code === 0) && max <= options.baselineMs,
    };
  });
  const currentCount = ROUTES.length;
  const routes = ROUTES.map((route) => ({
    event: route.event,
    route_id: route.routeId,
    matcher: route.matcher ?? null,
    scripts: [...route.scripts],
  }));

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
      within_baseline: probes.every((probe) => probe.within_baseline),
      probes,
    },
    guard_regression: {
      required_command: "bun test tests/hook-runtime.test.ts",
      status: "external_required",
    },
  };
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
  return report.dispatch.within_target && report.phase_probe.within_baseline ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
