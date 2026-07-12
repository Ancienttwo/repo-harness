import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  buildAgentPacket,
  buildRunPlan,
  validateEvaluation,
} from "../scripts/run-bdd2-evals";

const ROOT = join(import.meta.dir, "..");

describe("BDD2 Phase E evaluation contract", () => {
  const evaluation = validateEvaluation(ROOT);

  test("Shape is independently sealed while Audit remains foundation-only", () => {
    expect(evaluation.manifest.schema).toBe("repo-harness-bdd2-evaluation.v2");
    expect(evaluation.manifest.experiments.S.freeze.state).toBe("sealed");
    expect(evaluation.manifest.experiments.A.freeze.state).toBe("foundation");
    expect(Object.keys(evaluation.manifest.agents)).toEqual(["codex-gpt-5.6-sol-xhigh"]);
  });

  test("development and held-out sets cover both independent hypotheses", () => {
    for (const partition of ["development", "held_out"] as const) {
      expect(evaluation.tasks[partition].some((task) => task.experiment === "S")).toBe(true);
      expect(evaluation.tasks[partition].some((task) => task.experiment === "A")).toBe(true);
    }
    expect(evaluation.tasks.held_out.filter((task) => task.experiment === "S")).toHaveLength(12);
    expect(evaluation.tasks.held_out.filter((task) => task.experiment === "A")).toHaveLength(2);
  });

  test("agent packets contain treatment instructions and task input but no truth payload", () => {
    const coordinate = buildRunPlan(evaluation, {
      experiment: "A",
      partition: "held_out",
      taskIds: ["A-H-01"],
      conditions: ["treatment"],
      repetitions: 1,
    })[0];
    const packet = buildAgentPacket(evaluation, coordinate);

    expect(packet).toContain("Perform a read-only behavior audit");
    expect(packet).toContain("A-H-01");
    expect(packet).not.toContain("A-H-01-I1");
    expect(packet).not.toContain("repo-harness-bdd2-truth-set");
    expect(packet).not.toContain("condition: treatment");
  });

  test("Phase E files do not create a public BDD product surface", () => {
    for (const path of [
      "assets/skill-commands/repo-harness-bdd/SKILL.md",
      "plans/behaviors",
      "src/cli/commands/bdd.ts",
      "src/cli/mcp/behavior-tools.ts",
    ]) {
      expect(existsSync(join(ROOT, path))).toBe(false);
    }

    const manifest = readFileSync(join(ROOT, "evals/bdd2/evaluation-manifest.json"), "utf-8");
    expect(manifest).not.toContain("hook");
    expect(manifest).not.toContain("sidecar");
  });

  test("tracked Shape report discloses proxy-evidence limits", () => {
    const report = readFileSync(join(ROOT, "evals/bdd2/reports/experiment-s.md"), "utf-8");
    expect(report).toContain("Agent-panel proxy");
    expect(report).toContain("evidence, not human adjudication");
    expect(report).toContain("Truth-aware authority");
    expect(report).toContain("mismatches are therefore 12 baseline versus 5 treatment");
    expect(report).toContain("inter-rater disagreement was not measured");
    expect(report).toContain("filesystem isolation depended");
    expect(report).toContain("on reviewer compliance rather than an OS");
    expect(report).toContain("Phase P, Experiment E, and Experiment I remain");
  });
});
