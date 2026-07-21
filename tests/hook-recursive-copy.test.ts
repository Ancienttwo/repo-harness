import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { planAdoption } from "../src/core/adoption/plan";
import { applyAdoptionPlan } from "../src/effects/fs-transaction";

describe("adoption hook projection", () => {
  test("standard adoption projects only the operator workflow-state helper", () => {
    const repo = mkdtempSync(join(tmpdir(), "hook-recursive-adoption-"));
    try {
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/session-state.sh"))).toBe(false);

      for (const retired of [
        ".ai/hooks/anti-simplification.sh",
        ".ai/hooks/changelog-guard.sh",
        ".ai/hooks/codex-delegation-advisor.sh",
        ".ai/hooks/first-principles-guard.sh",
        ".ai/hooks/hook-input.sh",
        ".ai/hooks/post-bash.sh",
        ".ai/hooks/post-tool-observer.sh",
        ".ai/hooks/prompt-guard.sh",
        ".ai/hooks/run-hook.sh",
        ".ai/hooks/subagent-return-channel-guard.sh",
        ".ai/hooks/subagent-start-context.sh",
        ".ai/hooks/subagent-stop-quality.sh",
        ".ai/hooks/lib/minimal-change.sh",
        ".ai/hooks/lib/session-state.sh",
        "scripts/hook-shim.sh",
        "scripts/repo-harness.sh",
      ]) {
        expect(existsSync(join(repo, retired))).toBe(false);
      }
      expect(existsSync(join(repo, ".claude/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/run-hook.sh"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
