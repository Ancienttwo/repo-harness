import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  buildLoopEngineShadowSummary,
  writeLoopEngineShadowSummary,
} from "../scripts/loop-engine-shadow-report";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/loop-engine-shadow-report.ts");

function tempPath(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

function shadowLine(params: {
  ts: string;
  tsAction: string;
  nlAction: string;
  divergence: boolean;
}): string {
  return `${JSON.stringify({
    ts: params.ts,
    event_type: "UserPromptSubmit",
    hook: "prompt-guard",
    loop_engine_shadow: {
      protocol: "loop-engine-shadow/v1",
      enabled: true,
      g1: "go",
      authoritative: "ts_verdict",
      state_snapshot: {
        protocol: 1,
        kind: "repo-harness-state-snapshot",
        states: { spec: "present" },
      },
      nl_decision_table: "docs/reference-configs/loop-engine-nl-decision-table.md",
      ts_verdict: { intent: "none", action: params.tsAction },
      nl_decision: {
        intent: "none",
        action: params.nlAction,
        source: "unit",
      },
      divergence: params.divergence,
      timebox: {
        max_prompt_count: 2,
        max_days: 14,
      },
    },
  })}\n`;
}

describe("loop engine shadow report", () => {
  test("summarizes prompt trace divergence and prompt-count timebox", () => {
    const cwd = tempPath("loop-engine-shadow-report");
    try {
      const trace = join(cwd, ".trace.jsonl");
      writeFileSync(
        trace,
        [
          shadowLine({
            ts: "2026-06-12T00:00:00+0800",
            tsAction: "allow",
            nlAction: "allow",
            divergence: false,
          }),
          "not-json\n",
          shadowLine({
            ts: "2026-06-12T00:01:00+0800",
            tsAction: "allow",
            nlAction: "done_gate",
            divergence: true,
          }),
        ].join(""),
      );

      const summary = buildLoopEngineShadowSummary({
        traceFile: trace,
        now: new Date("2026-06-12T01:00:00+08:00"),
      });

      expect(summary.protocol).toBe("loop-engine-shadow-summary/v1");
      expect(summary.prompt_count).toBe(2);
      expect(summary.divergence_count).toBe(1);
      expect(summary.timebox.complete).toBe(true);
      expect(summary.timebox.completion_reason).toBe("prompt_count");
      expect(summary.recommendation).toBe("no_go");
      expect(summary.actions).toContainEqual({
        ts_action: "allow",
        nl_action: "done_gate",
        count: 1,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("CLI writes and checks a shadow summary report", () => {
    const cwd = tempPath("loop-engine-shadow-cli");
    try {
      const trace = join(cwd, ".claude/.trace.jsonl");
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      writeFileSync(
        trace,
        shadowLine({
          ts: "2026-06-12T00:00:00+0800",
          tsAction: "allow",
          nlAction: "allow",
          divergence: false,
        }),
      );
      const out = join(cwd, ".ai/harness/runs/loop-engine-03-shadow-summary.json");

      const run = spawnSync(process.execPath, [SCRIPT, "--trace", trace, "--out", out], {
        cwd,
        encoding: "utf-8",
      });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("loop-engine-shadow");
      expect(existsSync(out)).toBe(true);

      const check = spawnSync(process.execPath, [SCRIPT, "--check", "--out", out], {
        cwd,
        encoding: "utf-8",
      });
      expect(check.status).toBe(0);
      expect(check.stdout).toContain("recommendation=continue_shadow");

      const summary = JSON.parse(readFileSync(out, "utf-8"));
      expect(summary.prompt_count).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("writeLoopEngineShadowSummary creates parent directories", () => {
    const cwd = tempPath("loop-engine-shadow-write");
    try {
      const out = join(cwd, ".ai/harness/runs/loop-engine-03-shadow-summary.json");
      writeLoopEngineShadowSummary(
        out,
        buildLoopEngineShadowSummary({
          traceFile: join(cwd, "missing.jsonl"),
          now: new Date("2026-06-12T00:00:00Z"),
        }),
      );
      expect(existsSync(out)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
