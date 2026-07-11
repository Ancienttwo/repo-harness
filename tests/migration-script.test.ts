import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { planAdoption } from "../src/core/adoption/plan";
import { applyAdoptionPlan } from "../src/effects/fs-transaction";

describe("adoption migration cutover", () => {
  test("retired shell migration entrypoints are absent from canonical helper inventory", () => {
    const root = join(import.meta.dir, "..");
    const contract = JSON.parse(readFileSync(join(root, "assets/workflow-contract.v1.json"), "utf-8")) as { helpers: { scripts: string[] } };
    expect(existsSync(join(root, "scripts/migrate-project-template.sh"))).toBe(false);
    expect(existsSync(join(root, "scripts/migrate-workflow-docs.ts"))).toBe(false);
    expect(contract.helpers.scripts).not.toContain("migrate-project-template.sh");
    expect(contract.helpers.scripts).not.toContain("migrate-workflow-docs.ts");
  });

  test("planner fails closed for malformed managed JSON before writing the standard scaffold", () => {
    const repo = mkdtempSync(join(tmpdir(), "adoption-malformed-policy-"));
    try {
      mkdirSync(join(repo, ".ai/harness"), { recursive: true });
      writeFileSync(join(repo, ".ai/harness/policy.json"), "{ not-json\n");
      expect(() => planAdoption({ repoRoot: repo, mode: "standard", apply: true })).toThrow("invalid JSON in .ai/harness/policy.json");
      expect(existsSync(join(repo, "docs/spec.md"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("known generated cleanup retains an explicit transaction backup", () => {
    const repo = mkdtempSync(join(tmpdir(), "adoption-cleanup-"));
    const root = join(import.meta.dir, "..");
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      const generated = readFileSync(join(root, "assets/templates/helpers/check-task-sync.sh"), "utf-8");
      writeFileSync(join(repo, "scripts/check-task-sync.sh"), generated);
      const apply = applyAdoptionPlan(planAdoption({ repoRoot: repo, mode: "standard", apply: true }));
      expect(apply.ok).toBe(true);
      const removed = apply.results.find((result) => result.path === "scripts/check-task-sync.sh" && result.kind === "remove");
      expect(removed?.status).toBe("applied");
      expect(removed?.backupPath).toContain(".ai/harness/backups/fs-transaction/");
      expect(existsSync(join(repo, "scripts/check-task-sync.sh"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
