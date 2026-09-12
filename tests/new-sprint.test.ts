import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers, TEMPLATE_DIR } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("new-sprint helper integration", () => {
  test("new-sprint should create a Draft sprint backlog only", () => {
    const cwd = tmpWorkspace("helper-new-sprint");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, ".claude/templates"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      copyHelpers(cwd);

      copyFileSync(
        join(TEMPLATE_DIR, "plan.template.md"),
        join(cwd, ".claude/templates/plan.template.md")
      );
      writeFileSync(
        join(cwd, "tasks/todos.md"),
        "# Deferred Goal Ledger\n\n> **Status**: Backlog\n\n## Deferred Goals\n\n| Goal | Why Deferred | Tradeoff | Revisit Trigger |\n|------|--------------|----------|-----------------|\n"
      );

      const res = run("bash", ["scripts/new-sprint.sh", "--slug", "draft-only", "--title", "Draft Only"], cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Created draft sprint:");
      expect(res.stdout).toContain("plans/sprints/");

      const sprints = readdirSync(join(cwd, "plans/sprints")).filter((name) => /^\d{8}-\d{4}-draft-only\.sprint\.md$/.test(name));
      expect(sprints.length).toBe(1);
      const sprint = readFileSync(join(cwd, "plans/sprints", sprints[0]), "utf-8");
      expect(sprint).toContain("# Sprint: Draft Only");
      expect(sprint).toContain("> **Status**: Draft");
      expect(readFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), "utf-8")).toContain("plans/sprints/");
      expect(existsSync(join(cwd, "tasks/contracts/draft-only.contract.md"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/reviews/draft-only.review.md"))).toBe(false);
      const todo = readFileSync(join(cwd, "tasks/todos.md"), "utf-8");
      expect(todo).toContain("**Status**: Backlog");
      expect(todo).not.toContain("**Status**: Executing");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
