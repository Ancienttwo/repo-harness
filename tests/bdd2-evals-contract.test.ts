import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "fs";
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
    expect(report).toContain("<!-- generated-core-end -->");
    expect(report).toContain("Agent-panel proxy");
    expect(report).toContain("evidence, not human adjudication");
    expect(report).toContain("Truth-aware authority");
    expect(report).toContain("inter-rater disagreement was not measured");
    expect(report).toContain("filesystem isolation depended");
    expect(report).toContain("on reviewer compliance rather than an OS");
    expect(report).toContain("Phase P, Experiment E, and Experiment I remain");

    const mismatchRows = report
      .split("\n")
      .filter((line) => /^\| S-H-\d+ \| (baseline|treatment) \|/.test(line))
      .map((line) => line.split("|").map((cell) => cell.trim()));
    const baseline = mismatchRows.filter((cells) => cells[2] === "baseline").length;
    const treatment = mismatchRows.filter((cells) => cells[2] === "treatment").length;
    expect(mismatchRows).toHaveLength(17);
    expect({ baseline, treatment }).toEqual({ baseline: 12, treatment: 5 });
    expect(report).toContain(`mismatches are therefore ${baseline} baseline versus ${treatment} treatment`);

    const plan = readFileSync(
      join(ROOT, "plans/plan-20260712-0605-bdd2-e-02-run-experiment-s-shape-hypothesis.md"),
      "utf-8"
    );
    expect(plan).not.toContain("--output evals/bdd2/reports/experiment-s.md");
    expect(plan).toContain("--output <ignored-run-path>/experiment-s.generated.md");
  });

  const localShapeRun = join(ROOT, ".ai/harness/runs/bdd2/bdd2-e02-shape-s-v2");
  if (existsSync(join(localShapeRun, "scores"))) {
    test("local raw Shape evidence reproduces the tracked truth-aware mismatch table", () => {
      const truth = JSON.parse(readFileSync(join(ROOT, "evals/bdd2/truth/held-out.json"), "utf-8")).shape_tasks;
      const rawRows = readdirSync(join(localShapeRun, "scores"))
        .filter((file) => file.endsWith(".json"))
        .flatMap((file) => {
          const score = JSON.parse(readFileSync(join(localShapeRun, "scores", file), "utf-8"));
          const coordinate = JSON.parse(readFileSync(join(localShapeRun, "private", file), "utf-8"));
          const expected = truth[coordinate.task_id].expected_authority;
          const label = score.score.authority_fit;
          return label === "incorrect" || label !== expected
            ? [`${coordinate.task_id}|${coordinate.condition}|${coordinate.repetition}|${label}|${expected}`]
            : [];
        })
        .sort();
      const reportRows = readFileSync(join(ROOT, "evals/bdd2/reports/experiment-s.md"), "utf-8")
        .split("\n")
        .filter((line) => /^\| S-H-\d+ \| (baseline|treatment) \|/.test(line))
        .map((line) => line.split("|").slice(1, 6).map((cell) => cell.trim()).join("|"))
        .sort();
      expect(reportRows).toEqual(rawRows);
    });
  } else {
    test.skip("local raw Shape evidence reproduces the tracked truth-aware mismatch table", () => {});
  }
});
