import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { evaluateCutoverGate, type CutoverGateReport } from "../scripts/loop-engine-cutover-gate";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/loop-engine-cutover-gate.ts");

function tempRepo(prefix: string): string {
  const repo = join(tmpdir(), `${prefix}-${crypto.randomUUID()}`);
  mkdirSync(repo, { recursive: true });
  mkdirSync(join(repo, ".ai/harness/runs"), { recursive: true });
  mkdirSync(join(repo, "src/cli/hook"), { recursive: true });
  writeFileSync(join(repo, "src/cli/hook/prompt-intents.ts"), "// classifier\n");
  writeFileSync(join(repo, "src/cli/hook/prompt-guard-decision.ts"), "// decision table\n");
  return repo;
}

function writeJson(repo: string, rel: string, value: unknown): void {
  const target = join(repo, rel);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function writeG1(repo: string, recommendation: "go" | "no-go" = "go"): void {
  writeJson(repo, ".ai/harness/runs/g1.json", {
    protocol: "loop-engine-03-no-go-router-schema-repair/summary/v1",
    conclusion: recommendation,
    reason: `second g1 ${recommendation}`,
  });
}

function writeShadow(repo: string, recommendation: "go" | "no-go" = "go"): void {
  writeJson(repo, ".ai/harness/runs/shadow.json", {
    protocol: "loop-engine-shadow-divergence/report/v1",
    sample_count: 100,
    divergence: {
      critical_count: 0,
      false_positive_count: 0,
      false_negative_count: 0,
    },
    phase_probe: {
      baseline_ms: 10,
      current_ms: 10,
      within_baseline: true,
    },
    go_no_go: {
      recommendation,
      reason: `shadow ${recommendation}`,
    },
  });
}

describe("loop-engine cutover gate", () => {
  test("blocks cutover when second G1 is go but shadow divergence evidence is missing", () => {
    const repo = tempRepo("loop-engine-cutover-missing-shadow");
    try {
      writeG1(repo, "go");
      const report = evaluateCutoverGate({
        repo,
        g1Report: ".ai/harness/runs/g1.json",
        shadowReport: ".ai/harness/runs/shadow.json",
        out: ".ai/harness/runs/out.json",
        minSamples: 100,
        now: new Date("2026-06-12T00:00:00Z"),
      });

      expect(report.g1.status).toBe("go");
      expect(report.shadow.status).toBe("missing");
      expect(report.cutover.allowed).toBe(false);
      expect(report.cutover.reason).toBe("missing_shadow_divergence_report");
      expect(report.classifier_guardrail.present).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("allows cutover only when G1 and shadow G2 are both go", () => {
    const repo = tempRepo("loop-engine-cutover-go");
    try {
      writeG1(repo, "go");
      writeShadow(repo, "go");
      const report = evaluateCutoverGate({
        repo,
        g1Report: ".ai/harness/runs/g1.json",
        shadowReport: ".ai/harness/runs/shadow.json",
        out: ".ai/harness/runs/out.json",
        minSamples: 100,
        now: new Date("2026-06-12T00:00:00Z"),
      });

      expect(report.shadow.status).toBe("go");
      expect(report.cutover.allowed).toBe(true);
      expect(report.cutover.reason).toBe("g1_and_shadow_g2_go");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("keeps cutover blocked when second G1 is no-go", () => {
    const repo = tempRepo("loop-engine-cutover-g1-no-go");
    try {
      writeG1(repo, "no-go");
      writeShadow(repo, "go");
      const report = evaluateCutoverGate({
        repo,
        g1Report: ".ai/harness/runs/g1.json",
        shadowReport: ".ai/harness/runs/shadow.json",
        out: ".ai/harness/runs/out.json",
        minSamples: 100,
        now: new Date("2026-06-12T00:00:00Z"),
      });

      expect(report.g1.status).toBe("no-go");
      expect(report.cutover.allowed).toBe(false);
      expect(report.cutover.reason).toBe("g1_no-go");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails the CLI when the classifier was deleted before G2", () => {
    const repo = tempRepo("loop-engine-cutover-missing-classifier");
    try {
      rmSync(join(repo, "src/cli/hook/prompt-intents.ts"), { force: true });
      writeG1(repo, "go");
      const run = spawnSync(process.execPath, [
        SCRIPT,
        "--repo",
        repo,
        "--g1-report",
        ".ai/harness/runs/g1.json",
        "--shadow-report",
        ".ai/harness/runs/shadow.json",
        "--out",
        ".ai/harness/runs/out.json",
        "--json",
      ], { encoding: "utf-8" });
      const report = JSON.parse(run.stdout) as CutoverGateReport;

      expect(run.status).toBe(1);
      expect(report.classifier_guardrail.violation).toBe(true);
      expect(report.cutover.reason).toBe("typescript_classifier_missing_before_g2");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30_000);

  test("unknown flags exit with usage error", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "--definitely-unknown"], {
      encoding: "utf-8",
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("unknown argument");
  }, 30_000);
});
