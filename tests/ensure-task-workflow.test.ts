import { describe, expect, test } from "bun:test";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

function copyHelper(cwd: string) {
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  copyFileSync(join(import.meta.dir, "../scripts/ensure-task-workflow.sh"), join(cwd, "scripts/ensure-task-workflow.sh"));
}

describe("ensure-task-workflow runtime preparation", () => {
  test("creates recovery directories without approval artifacts or modifying existing planning data", () => {
    const cwd = tmpWorkspace("helper-ensure-runtime");
    try {
      initGitRepo(cwd);
      copyHelper(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "plans/existing.md"), "# Plan\n> **Status**: Draft\n");
      const result = run("bash", ["scripts/ensure-task-workflow.sh"], cwd);
      expect(result.status, result.stderr).toBe(0);
      for (const path of ["handoff", "checks", "runs"]) expect(existsSync(join(cwd, ".ai/harness", path))).toBe(true);
      expect(result.stdout).toContain("no plan/contract/review/notes");
      expect(readFileSync(join(cwd, "plans/existing.md"), "utf8")).toBe("# Plan\n> **Status**: Draft\n");
      for (const path of ["tasks", ".ai/harness/active-plan", ".ai/harness/policy.json", ".claude/templates"]) expect(existsSync(join(cwd, path))).toBe(false);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  test("rejects retired plan projection arguments", () => {
    const cwd = tmpWorkspace("helper-ensure-retired");
    try {
      initGitRepo(cwd); copyHelper(cwd);
      const result = run("bash", ["scripts/ensure-task-workflow.sh", "--new-plan", "--slug", "demo"], cwd);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("no plan/contract projection");
      expect(existsSync(join(cwd, ".ai/harness"))).toBe(false);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
  test("refuses a symlinked runtime directory", () => {
    const cwd = tmpWorkspace("helper-ensure-symlink");
    const outside = tmpWorkspace("helper-ensure-outside");
    try {
      initGitRepo(cwd); copyHelper(cwd);
      symlinkSync(outside, join(cwd, ".ai"), "dir");
      const result = run("bash", ["scripts/ensure-task-workflow.sh"], cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Unsafe runtime directory");
      expect(existsSync(join(outside, "harness"))).toBe(false);
    } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });
});
