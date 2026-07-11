import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { planAdoption } from "../src/core/adoption/plan";
import { applyAdoptionPlan } from "../src/effects/fs-transaction";

describe("adoption hook projection", () => {
  test("central-first standard adoption projects only the required .ai hook libraries", () => {
    const repo = mkdtempSync(join(tmpdir(), "hook-recursive-adoption-"));
    try {
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/session-state.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/run-hook.sh"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
