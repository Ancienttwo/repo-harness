import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { REPO_ROOT, sha256File, validateEvaluation } from "../scripts/run-bdd2-evals";

describe("BDD2 Phase E3 evaluation contract", () => {
  test("historical Phase E and E2 reports remain frozen", () => {
    const evaluation = validateEvaluation();
    expect(evaluation.manifest.historical_reports.length).toBeGreaterThanOrEqual(13);
    for (const ref of evaluation.manifest.historical_reports) expect(sha256File(join(REPO_ROOT, ref.path))).toBe(ref.sha256);
  });

  test("Browser and ImageGen appendices remain first-class tracked evidence", () => {
    const evaluation = validateEvaluation();
    expect(Object.keys(evaluation.manifest.experiments.EB3.appendices ?? {})).toHaveLength(6);
    expect(Object.keys(evaluation.manifest.experiments.EI3.appendices ?? {})).toHaveLength(6);
  });

  test("current Behavior Audit and Phase P surfaces are absent", () => {
    const evaluation = validateEvaluation();
    expect(JSON.stringify(evaluation.manifest)).not.toContain('"A3"');
    const changedProductSurface = ["assets/skill-commands/repo-harness-bdd", "src/cli/commands/bdd.ts", "src/cli/mcp/behavior-tools.ts"];
    for (const path of changedProductSurface) expect(() => readFileSync(join(REPO_ROOT, path))).toThrow();
  });

  test("I3 gate is frozen but does not encode a post-reveal outcome", () => {
    const evaluation = validateEvaluation();
    expect(evaluation.manifest.i3.prerequisite).toEqual({ shape: "Pass", any_adapter: "Pass" });
    expect(JSON.stringify(evaluation.manifest.i3)).not.toContain("S3_decision");
  });
});
