import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { buildAgentPacket, buildRunPlan, validateEvaluation } from "../scripts/run-bdd2-evals";

const ROOT = join(import.meta.dir, "..");
const hash = (path: string) => createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");

describe("BDD2 Phase E2 evaluation contract", () => {
  const evaluation = validateEvaluation(ROOT);

  test("current authority is an E2-only direct cut", () => {
    expect(evaluation.manifest.schema).toBe("repo-harness-bdd2-evaluation.e2");
    expect(Object.keys(evaluation.manifest.experiments)).toEqual(["S2", "EB", "EI", "I2"]);
    expect(JSON.stringify(evaluation.manifest)).not.toContain('"S"');
    expect(JSON.stringify(evaluation.manifest)).not.toContain('"A"');
  });

  test("held-out coordinates and public task shapes are frozen exactly", () => {
    expect(evaluation.tasks.held_out.filter((task) => task.experiment === "S2")).toHaveLength(12);
    expect(evaluation.tasks.held_out.filter((task) => task.experiment === "EB")).toHaveLength(6);
    expect(evaluation.tasks.held_out.filter((task) => task.experiment === "EI")).toHaveLength(6);
    expect(evaluation.tasks.held_out.filter((task) => task.experiment === "I2")).toHaveLength(1);
    for (const task of evaluation.tasks.held_out) {
      expect(Object.keys(task).sort()).toEqual(
        task.experiment === "EB" || task.experiment === "EI"
          ? ["agent_input", "experiment", "id", "named_uncertainty", "title"]
          : ["agent_input", "experiment", "id", "title"],
      );
    }
  });

  test("adapter evidence is treatment-only and task-specific", () => {
    const coordinates = buildRunPlan(evaluation, { experiment: "EB", partition: "held_out", taskIds: ["EB-H-01"], repetitions: 1 });
    const control = buildAgentPacket(evaluation, coordinates.find((item) => item.condition === "control")!);
    const treatment = buildAgentPacket(evaluation, coordinates.find((item) => item.condition === "treatment")!);
    expect(control).not.toContain("GOV.UK");
    expect(treatment).toContain("GOV.UK");
    expect(treatment).not.toContain("Carbon data table");
    expect(control).not.toContain("expected_disposition");
    expect(treatment).not.toContain("private truth");
  });

  test("Phase E historical evidence is byte-preserved", () => {
    expect(hash("evals/bdd2/reports/experiment-s.md")).toBe("467cf6f9df52639a88403a31edd9d0e73ab84c0a2b2b9983b3d7a8b1d1dd7287");
    expect(hash("evals/bdd2/reports/experiment-a.md")).toBe("c0f9fc92f4d566ece7a3699744bd97951612a7e909707aef52197a2a039ef02a");
    expect(hash("evals/bdd2/reports/phase-e-gate.md")).toBe("688d61398c8e5b4c314575159b28aee659e97b47e083601a6738a20620a9a47c");
  });

  test("evaluation creates no public BDD product surface", () => {
    for (const path of ["assets/skill-commands/repo-harness-bdd/SKILL.md", "plans/behaviors", "src/cli/commands/bdd.ts", "src/cli/mcp/behavior-tools.ts"]) {
      expect(existsSync(join(ROOT, path))).toBe(false);
    }
  });

  test("Phase E2 gate records complete upstream runs and a fail-closed I2 defer", () => {
    const s2 = JSON.parse(readFileSync(join(ROOT, "evals/bdd2/reports/experiment-s2-evidence.json"), "utf-8"));
    const eb = JSON.parse(readFileSync(join(ROOT, "evals/bdd2/reports/experiment-eb-evidence.json"), "utf-8"));
    const ei = JSON.parse(readFileSync(join(ROOT, "evals/bdd2/reports/experiment-ei-evidence.json"), "utf-8"));
    expect([s2.packet_count, s2.outcome_score_count]).toEqual([72, 144]);
    expect([eb.packet_count, eb.outcome_score_count, eb.evidence_score_count]).toEqual([24, 48, 12]);
    expect([ei.packet_count, ei.outcome_score_count, ei.evidence_score_count]).toEqual([24, 48, 12]);
    expect([s2.summary.recorded_decision, eb.summary.recorded_decision, ei.summary.recorded_decision]).toEqual(["Reshape", "Reshape", "Reshape"]);
    const gate = readFileSync(join(ROOT, "evals/bdd2/reports/phase-e2-gate.md"), "utf-8");
    expect(gate).toContain("I2 implementation pilot | 0/4 | Defer — gated-not-run");
    expect(gate).toContain("Phase P remains");
  });
});
