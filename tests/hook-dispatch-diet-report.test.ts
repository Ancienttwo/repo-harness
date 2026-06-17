import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { buildHookDietReport, TARGET_DISPATCH_MAX, type HookDietReport } from "../scripts/hook-dispatch-diet-report";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/hook-dispatch-diet-report.ts");

describe("hook dispatch diet report", () => {
  test("reports the route registry under the target dispatch count", () => {
    const report = buildHookDietReport({
      repo: ROOT,
      iterations: 2,
      baselineMs: 250,
      now: new Date("2026-06-12T00:00:00Z"),
      runProbe: () => ({ exitCode: 0, durationMs: 20 }),
    });

    expect(report.protocol).toBe("loop-engine-hook-diet-report/v1");
    expect(report.dispatch.previous_count).toBe(13);
    expect(report.dispatch.current_count).toBeLessThanOrEqual(TARGET_DISPATCH_MAX);
    expect(report.dispatch.within_target).toBe(true);
    expect(report.phase_probe.within_baseline).toBe(true);
    expect(report.guard_regression.required_command).toBe("bun test tests/hook-runtime.test.ts");
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
