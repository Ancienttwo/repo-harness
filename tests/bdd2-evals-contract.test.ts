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

  test("foundation authority is valid but deliberately unsealed", () => {
    expect(evaluation.manifest.schema).toBe("repo-harness-bdd2-evaluation.v1");
    expect(evaluation.manifest.freeze.state).toBe("foundation");
    expect(evaluation.manifest.agents).toEqual({});
  });

  test("development and held-out sets cover both independent hypotheses", () => {
    for (const partition of ["development", "held_out"] as const) {
      expect(evaluation.tasks[partition].some((task) => task.experiment === "S")).toBe(true);
      expect(evaluation.tasks[partition].some((task) => task.experiment === "A")).toBe(true);
    }
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
});
