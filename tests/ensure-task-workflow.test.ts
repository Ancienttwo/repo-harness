import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";
import { defaultPolicy } from "../src/core/adoption/standard-plan";
import { readRefactorPolicy } from "../src/core/refactor/policy";

import { copyHelpers, installCanonicalContractTemplate } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("ensure-task-workflow helper integration", () => {
  test("ensure-task-workflow should create a draft plan when none exists", () => {
    const cwd = tmpWorkspace("helper-ensure-workflow");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);

      const res = run(
        "bash",
        ["scripts/ensure-task-workflow.sh", "--slug", "alpha-feature", "--title", "Alpha Feature"],
        cwd
      );

      expect(res.status).toBe(0);
      const plans = readdirSync(join(cwd, "plans")).filter((name) => /^plan-\d{8}-\d{4}-alpha-feature\.md$/.test(name));
      expect(plans.length).toBe(1);

      const todo = readFileSync(join(cwd, "tasks/todos.md"), "utf-8");
      expect(todo).toContain("# Deferred Goal Ledger");
      expect(todo).toContain("**Status**: Backlog");
      expect(existsSync(join(cwd, ".claude/templates/spec.template.md"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/templates/review.template.md"))).toBe(true);

      // Parity guard: ensure-task-workflow.sh's ensure_auxiliary_files fallback writer (this
      // fresh cwd has no pre-existing .ai/harness/policy.json, so it just fired) is a third,
      // independently hardcoded source for agentic_development.routing alongside
      // scripts/lib/project-init-lib.sh and src/core/adoption/standard-plan.ts. Assert it stays
      // identical to the TS default so it cannot silently diverge again.
      const fallbackPolicy = JSON.parse(readFileSync(join(cwd, ".ai/harness/policy.json"), "utf-8"));
      const tsDefaultPolicy = defaultPolicy("minimal-agentic", "en") as Record<string, any>;
      expect(fallbackPolicy.agentic_development.routing).toEqual(tsDefaultPolicy.agentic_development.routing);
      expect(readRefactorPolicy(fallbackPolicy).stages).toEqual(readRefactorPolicy({}).stages);
      expect(fallbackPolicy.architecture.projection_version).toBeUndefined();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("ensure-task-workflow should create a new draft plan when requested despite an existing plan", () => {
    const cwd = tmpWorkspace("helper-ensure-workflow-new-plan");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(
        join(cwd, "plans/plan-20260304-0900-old-draft.md"),
        "# Plan: old draft\n\n> **Status**: Draft\n"
      );

      const res = run(
        "bash",
        ["scripts/ensure-task-workflow.sh", "--new-plan", "--slug", "beta-feature", "--title", "Beta Feature"],
        cwd
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Created plan:");
      const plans = readdirSync(join(cwd, "plans")).filter((name) => /^plan-\d{8}-\d{4}-beta-feature\.md$/.test(name));
      expect(plans.length).toBe(1);
      expect(readFileSync(join(cwd, "plans", plans[0]), "utf-8")).toContain("> **Status**: Draft");
      expect(existsSync(join(cwd, ".ai/harness/active-plan"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/.active-plan"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
