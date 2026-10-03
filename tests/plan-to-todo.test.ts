import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { copyHelpers } from "./helpers/helper-script-fixture";
import { initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

describe("plan-to-todo optional planning reference", () => {
  for (const status of ["Draft", "Approved", "Executing", "!!broken!!", ""]) {
    test(`reads ${JSON.stringify(status)} planning data without projecting execution artifacts`, () => {
      const cwd = tmpWorkspace("helper-plan-reference");
      try {
        initGitRepo(cwd); copyHelpers(cwd);
        mkdirSync(join(cwd, "plans"), { recursive: true });
        mkdirSync(join(cwd, "tasks"), { recursive: true });
        const text = `# Plan\n> **Status**: ${status}\n## Out of scope\n- Preserve this\n`;
        writeFileSync(join(cwd, "plans/reference.md"), text);
        writeFileSync(join(cwd, "tasks/todos.md"), "existing backlog\n");
        const result = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/reference.md"], cwd);
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toBe(text);
        expect(result.stderr).toContain("no execution artifacts were created");
        expect(readFileSync(join(cwd, "plans/reference.md"), "utf8")).toBe(text);
        expect(readFileSync(join(cwd, "tasks/todos.md"), "utf8")).toBe("existing backlog\n");
        for (const path of ["tasks/contracts", "tasks/notes", "tasks/archive", ".ai/harness/active-plan"]) expect(existsSync(join(cwd, path))).toBe(false);
      } finally { rmSync(cwd, { recursive: true, force: true }); }
    });
  }
  test("rejects absolute, traversing, non-plan, missing and symlinked references", () => {
    const cwd = tmpWorkspace("helper-plan-boundary");
    const outside = tmpWorkspace("helper-plan-external");
    try {
      initGitRepo(cwd); copyHelpers(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "plans/reference.md"), "# Plan\n");
      writeFileSync(join(cwd, "README.md"), "# Readme\n");
      writeFileSync(join(outside, "external.md"), "# External\n");
      symlinkSync(join(outside, "external.md"), join(cwd, "plans/link.md"));
      symlinkSync(outside, join(cwd, "plans/linked"), "dir");
      for (const path of [join(cwd, "plans/reference.md"), "../external.md", "README.md", "plans/missing.md", "plans/link.md", "plans/linked/external.md", "plans"]) {
        const result = run("bash", ["scripts/plan-to-todo.sh", "--plan", path], cwd);
        expect(result.status, path).not.toBe(0);
        expect(result.stdout, path).toBe("");
      }
      expect(readFileSync(join(outside, "external.md"), "utf8")).toBe("# External\n");
    } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });
  test("requires one explicit reference and rejects retired projection flags", () => {
    const cwd = tmpWorkspace("helper-plan-args");
    try {
      initGitRepo(cwd); copyHelpers(cwd);
      for (const args of [[], ["--plan"], ["--plan", "plans/reference.md", "--worktree"]]) {
        const result = run("bash", ["scripts/plan-to-todo.sh", ...args], cwd);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain("Usage:");
      }
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
