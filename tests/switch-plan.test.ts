import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("switch-plan helper integration", () => {
  test("switch-plan should ignore and not rewrite the retired legacy marker", () => {
    const cwd = tmpWorkspace("helper-switch-plan-active-marker");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "plans/plan-20260327-2200-alpha.md"), "# Plan: alpha\n\n> **Status**: Draft\n");
      writeFileSync(join(cwd, "plans/plan-20260327-2210-beta.md"), "# Plan: beta\n\n> **Status**: Draft\n");
      writeFileSync(join(cwd, ".ai/harness/active-plan"), "plans/plan-20260327-2200-alpha.md");
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      writeFileSync(join(cwd, ".claude/.active-plan"), "plans/plan-20260327-2200-alpha.md");

      const list = run("bash", ["scripts/switch-plan.sh", "--list"], cwd);
      expect(list.status).toBe(0);
      expect(list.stdout).toContain("[*] plans/plan-20260327-2200-alpha.md");

      const switched = run("bash", ["scripts/switch-plan.sh", "--plan", "plans/plan-20260327-2210-beta.md"], cwd);
      expect(switched.status).toBe(0);
      expect(switched.stdout).toContain("tasks/todos.md is a deferred-goal ledger");
      expect(readFileSync(join(cwd, ".ai/harness/active-plan"), "utf-8")).toBe("plans/plan-20260327-2210-beta.md");
      expect(readFileSync(join(cwd, ".claude/.active-plan"), "utf-8")).toBe("plans/plan-20260327-2200-alpha.md");
      expect(readFileSync(join(cwd, ".ai/harness/active-worktree"), "utf-8").trim()).toBe(cwd);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
