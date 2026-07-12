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

  test("Shape v2 result is retained while current Shape and Audit authority remain foundation-only", () => {
    expect(evaluation.manifest.schema).toBe("repo-harness-bdd2-evaluation.v2");
    expect(evaluation.manifest.experiments.S.freeze).toEqual({
      id: "bdd2-experiment-s-reshape-foundation-v3",
      state: "foundation",
      sealed_at: null,
    });
    expect(evaluation.manifest.experiments.A.freeze.state).toBe("foundation");
    expect(Object.keys(evaluation.manifest.agents)).toEqual([]);
    expect(readFileSync(join(ROOT, "evals/bdd2/reports/experiment-s.md"), "utf-8")).toContain(
      "cd9e0426d362614ba277e067633db2596c236491"
    );
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
    expect(report).toContain("<!-- generated-core-end -->");
    expect(report).toContain("Agent-panel proxy");
    expect(report).toContain("evidence, not human adjudication");
    expect(report).toContain("Truth-aware authority");
    expect(report).toContain("inter-rater disagreement was not measured");
    expect(report).toContain("filesystem isolation depended");
    expect(report).toContain("on reviewer compliance rather than an OS");
    expect(report).toContain("Phase P, Experiment E, and Experiment I remain");

    const evidence = JSON.parse(
      readFileSync(join(ROOT, "evals/bdd2/reports/experiment-s-evidence.json"), "utf-8")
    );
    const currentManifest = JSON.parse(
      readFileSync(join(ROOT, "evals/bdd2/evaluation-manifest.json"), "utf-8")
    );
    const truth = JSON.parse(readFileSync(join(ROOT, "evals/bdd2/truth/held-out.json"), "utf-8")).shape_tasks;
    expect(Object.keys(evidence).sort()).toEqual([
      "packet_count",
      "projector_sha256",
      "rows",
      "run_manifest_sha256",
      "schema",
      "source_commit",
    ]);
    expect(evidence.schema).toBe("repo-harness-bdd2-shape-evidence.v1");
    expect(evidence.projector_sha256).toBe(currentManifest.runner.sha256);
    expect(evidence.source_commit).toBe("cd9e0426d362614ba277e067633db2596c236491");
    expect(evidence.run_manifest_sha256).toBe("b64a343415fb47c31a8f7aecd29e47409c86c5da1409b6b19bafbdb08c6a2a5b");
    expect(evidence.packet_count).toBe(72);
    expect(evidence.rows).toHaveLength(72);
    expect(new Set(evidence.rows.map((row: any) => row.packet_id)).size).toBe(72);
    for (const row of evidence.rows) {
      expect(Object.keys(row).sort()).toEqual([
        "authority_fit",
        "condition",
        "correction_minutes",
        "escalation_correct",
        "expected_authority",
        "packet_id",
        "private_sha256",
        "protected_p0_p1_count",
        "repetition",
        "required_behavior_omission",
        "score_sha256",
        "task_id",
        "unnecessary_tracked_artifact_count",
        "unsupported_expansion",
      ]);
      expect(row.expected_authority).toBe(truth[row.task_id].expected_authority);
    }
    const baselineRows = evidence.rows.filter((row: any) => row.condition === "baseline");
    const treatmentRows = evidence.rows.filter((row: any) => row.condition === "treatment");
    const sum = (rows: any[], key: string) => rows.reduce((total, row) => total + row[key], 0);
    expect(sum(baselineRows, "unsupported_expansion")).toBe(48);
    expect(sum(treatmentRows, "unsupported_expansion")).toBe(2);
    expect(sum(baselineRows, "required_behavior_omission")).toBe(23);
    expect(sum(treatmentRows, "required_behavior_omission")).toBe(0);
    expect(sum(treatmentRows, "unnecessary_tracked_artifact_count")).toBe(1);

    const pairs = new Map<string, any>();
    for (const row of evidence.rows) {
      const key = `${row.task_id}:${row.repetition}`;
      const pair = pairs.get(key) ?? {};
      pair[row.condition] = row;
      pairs.set(key, pair);
    }
    let wins = 0;
    let ties = 0;
    let losses = 0;
    let newSevere = 0;
    const requiredIncreases = new Map<string, number>();
    for (const pair of pairs.values()) {
      if (pair.treatment.unsupported_expansion < pair.baseline.unsupported_expansion) wins += 1;
      else if (pair.treatment.unsupported_expansion > pair.baseline.unsupported_expansion) losses += 1;
      else ties += 1;
      if (pair.treatment.protected_p0_p1_count > pair.baseline.protected_p0_p1_count) newSevere += 1;
      if (pair.treatment.required_behavior_omission > pair.baseline.required_behavior_omission) {
        requiredIncreases.set(pair.treatment.task_id, (requiredIncreases.get(pair.treatment.task_id) ?? 0) + 1);
      }
    }
    expect({ wins, ties, losses }).toEqual({ wins: 12, ties: 22, losses: 2 });
    expect(newSevere).toBe(0);
    expect([...requiredIncreases.values()].some((count) => count >= 2)).toBe(false);
    const median = (rows: any[]) => {
      const values = rows.map((row) => row.correction_minutes).sort((a, b) => a - b);
      return (values[17] + values[18]) / 2;
    };
    expect({ baseline: median(baselineRows), treatment: median(treatmentRows) }).toEqual({ baseline: 10, treatment: 0 });

    const truthMismatches = evidence.rows.filter(
      (row: any) => row.authority_fit === "incorrect" || row.authority_fit !== row.expected_authority
    );
    const baselineMismatches = truthMismatches.filter((row: any) => row.condition === "baseline").length;
    const treatmentMismatches = truthMismatches.filter((row: any) => row.condition === "treatment").length;
    expect({ baseline: baselineMismatches, treatment: treatmentMismatches }).toEqual({ baseline: 12, treatment: 5 });
    expect(report).toContain(`mismatches are therefore ${baselineMismatches} baseline versus ${treatmentMismatches} treatment`);
    expect(report).toContain("22/36 pairs (61.1%) were ties");
    expect(report).toContain("inherited the invoking process environment");
    expect(report).toContain("bdd2-experiment-s-reshape-foundation-v3");

    const plan = readFileSync(
      join(ROOT, "plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md"),
      "utf-8"
    );
    expect(plan).not.toContain("--output evals/bdd2/reports/experiment-s.md");
    expect(plan).toContain("source-commit `validate`, `run`,");
    expect(plan).toContain("Current S-v3 authority is foundation-only");
  });
});
