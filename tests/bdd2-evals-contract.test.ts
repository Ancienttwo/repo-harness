import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..");

describe("retired research and evaluation surfaces", () => {
  test("current Behavior Audit and Phase P surfaces are absent", () => {
    const changedProductSurface = ["assets/skill-commands/repo-harness-bdd", "src/cli/commands/bdd.ts", "src/cli/mcp/behavior-tools.ts"];
    for (const path of changedProductSurface) expect(() => readFileSync(join(REPO_ROOT, path))).toThrow();
  });

  test("retired batch C tools and data stay absent", () => {
    const removed = [
      "scripts/axr7-consumer-e2e.ts",
      "scripts/session-context-packet-panel.ts",
      "scripts/benchmark-general-repo-reader.ts",
      "scripts/run-bdd2-evals.ts",
      "evals/bdd2",
      "evals/bdd3",
      "scripts/c9-collaboration-canary.ts",
      "scripts/hook-dispatch-diet-report.ts",
      "scripts/route-nl-vs-ts-eval.ts",
      "scripts/loop-engine-cutover-gate.ts",
      "scripts/run-debug-ground-truth-eval.ts",
      "evals/debug-hunt",
      "scripts/mcp-observability-report.ts",
      "scripts/akn00-native-execution-admission.ts",
    ];
    for (const path of removed) expect(existsSync(join(REPO_ROOT, path)), path).toBe(false);
  });

  test("retired package commands stay absent", () => {
    const { scripts } = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
    for (const command of ["benchmark:mcp-reader", "benchmark:debug", "check:route-eval"]) {
      expect(scripts[command], command).toBeUndefined();
    }
  });
});
