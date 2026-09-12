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

import { copyHelpers, evidenceContract, installCanonicalContractTemplate, promotionGate } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("plan-to-todo helper integration", () => {
  test("plan-to-todo should archive previous todo and set plan to Executing", () => {
    const cwd = tmpWorkspace("helper-plan-to-todo");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/planning"), { recursive: true });
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      writeFileSync(join(cwd, ".ai/harness/planning/pending.json"), JSON.stringify({ version: 1, kind: "codex-plan", prompt_slug: "demo" }) + "\n");

      const planFile = join(cwd, "plans/plan-20260304-1400-demo.md");
      writeFileSync(
        planFile,
        [
          "# Plan: demo",
          "",
          "> **Status**: Approved",
          "",
          evidenceContract(),
          "",
          promotionGate(),
          "",
          "## Task Breakdown",
          "- [ ] Step one",
          "- [ ] Step two",
          "",
          "## Notes",
        ].join("\n")
      );
      writeFileSync(join(cwd, "tasks/todos.md"), "old todo content\n");

      const res = run(
        "bash",
        ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1400-demo.md"],
        cwd,
        { CODEX_SESSION_ID: "codex-host-fixture", CLAUDE_SESSION_ID: undefined },
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[BriefPreflight]");
      expect(res.stdout).toContain("contract brief is not yet self-sufficient");
      expect(res.stderr).toContain("[Geju]");
      expect(res.stderr).toContain("## Why");
      expect(res.stderr).toContain("## Falsifier");

      const archiveFiles = readdirSync(join(cwd, "tasks/archive")).filter((name) => name.startsWith("todo-"));
      expect(archiveFiles.length).toBeGreaterThanOrEqual(1);

      const todo = readFileSync(join(cwd, "tasks/todos.md"), "utf-8");
      expect(todo).toContain("# Deferred Goal Ledger");
      expect(todo).toContain("**Status**: Backlog");
      expect(todo).toContain("Tradeoff");
      expect(todo).toContain("Revisit Trigger");
      expect(todo).not.toContain("- [ ] Step one");
      expect(existsSync(join(cwd, "tasks/contracts/20260304-1400-demo.contract.md"))).toBe(true);
      const contract = readFileSync(join(cwd, "tasks/contracts/20260304-1400-demo.contract.md"), "utf-8");
      expect(contract).toContain("## Workflow Inventory");
      expect(contract).toContain("> **Task Profile**: code-change");
      expect(contract).toContain("Scope gate: edit only paths listed under `allowed_paths`");
      expect(contract).toContain("## Delegation Contract");
      expect(contract).toContain("budget:");
      expect(contract).toContain("permission_scope:");
      expect(contract).toContain("roles:");
      expect(contract).toContain("## Why");
      expect(contract).toContain("## Stop Conditions");
      expect(contract).toContain("## Falsifier");
      expect(contract).toContain('{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}');
      expect(existsSync(join(cwd, "tasks/notes/20260304-1400-demo.notes.md"))).toBe(true);
      expect(readFileSync(join(cwd, "tasks/notes/20260304-1400-demo.notes.md"), "utf-8")).toContain("## Design Decisions");
      expect(readFileSync(join(cwd, "tasks/reviews/20260304-1400-demo.review.md"), "utf-8")).toContain("tasks/notes/20260304-1400-demo.notes.md");
      expect(existsSync(join(cwd, ".claude/.task-state.json"))).toBe(false);

      const updatedPlan = readFileSync(planFile, "utf-8");
      expect(updatedPlan).toContain("**Status**: Executing");
      expect(existsSync(join(cwd, ".ai/harness/planning/pending.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should carry forward plan Out of scope bullets into the contract", () => {
    const cwd = tmpWorkspace("helper-plan-to-todo-carry-forward");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);

      const planFile = join(cwd, "plans/plan-20260304-1401-carry.md");
      writeFileSync(
        planFile,
        [
          "# Plan: carry",
          "",
          "> **Status**: Approved",
          "",
          evidenceContract(),
          "",
          promotionGate(),
          "",
          "## Scope / Non-scope",
          "",
          "In scope:",
          "- Implement the carry-forward feature.",
          "",
          "Out of scope:",
          "- Rewriting the verify-contract compatibility promise.",
          "- Renaming the Non-goals/Non-scope/Out-of-scope terms across templates.",
          "",
          "## Task Breakdown",
          "- [ ] Step one",
          "",
          "## Notes",
        ].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1401-carry.md"], cwd);
      expect(res.status).toBe(0);

      const contract = readFileSync(join(cwd, "tasks/contracts/20260304-1401-carry.contract.md"), "utf-8");
      expect(contract).toContain(
        [
          "- Out of scope:",
          "  - Rewriting the verify-contract compatibility promise.",
          "  - Renaming the Non-goals/Non-scope/Out-of-scope terms across templates.",
        ].join("\n")
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should carry forward a Non-scope: labeled plan section too", () => {
    const cwd = tmpWorkspace("helper-plan-to-todo-carry-forward-nonscope");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);

      const planFile = join(cwd, "plans/plan-20260304-1403-carry-nonscope.md");
      writeFileSync(
        planFile,
        [
          "# Plan: carry nonscope",
          "",
          "> **Status**: Approved",
          "",
          evidenceContract(),
          "",
          promotionGate(),
          "",
          "## Scope / Non-scope",
          "",
          "In scope:",
          "- Implement the feature.",
          "",
          "Non-scope:",
          "- A deferred follow-up slice.",
          "",
          "## Task Breakdown",
          "- [ ] Step one",
          "",
          "## Notes",
        ].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1403-carry-nonscope.md"], cwd);
      expect(res.status).toBe(0);

      const contract = readFileSync(join(cwd, "tasks/contracts/20260304-1403-carry-nonscope.contract.md"), "utf-8");
      expect(contract).toContain(["- Out of scope:", "  - A deferred follow-up slice."].join("\n"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should keep the Out of scope placeholder when the plan has no Non-scope section", () => {
    const cwd = tmpWorkspace("helper-plan-to-todo-no-carry-forward");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);

      const planFile = join(cwd, "plans/plan-20260304-1404-no-nonscope.md");
      writeFileSync(
        planFile,
        [
          "# Plan: no nonscope",
          "",
          "> **Status**: Approved",
          "",
          evidenceContract(),
          "",
          promotionGate(),
          "",
          "## Task Breakdown",
          "- [ ] Step one",
          "",
          "## Notes",
        ].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1404-no-nonscope.md"], cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[BriefPreflight]");
      expect(res.stdout).toContain("contract brief is not yet self-sufficient");

      const contract = readFileSync(join(cwd, "tasks/contracts/20260304-1404-no-nonscope.contract.md"), "utf-8");
      expect(contract).toContain("- In scope:\n- Out of scope:\n");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should reject transient plan projection", () => {
    const cwd = tmpWorkspace("helper-plan-to-todo-transient-artifact-name");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      const planFile = join(cwd, "plans/plan-20260304-1400-think-plan-224448.md");
      writeFileSync(
        planFile,
        [
          "# Plan: Batch Digest Repository",
          "",
          "> **Status**: Approved",
          "> **Task Profile**: docs-only",
          "> **Task Contract**: `tasks/contracts/20260304-1400-think-plan-224448.contract.md`",
          "> **Task Review**: `tasks/reviews/20260304-1400-think-plan-224448.review.md`",
          "> **Implementation Notes**: `tasks/notes/20260304-1400-think-plan-224448.notes.md`",
          "",
          evidenceContract(),
          "",
          promotionGate(),
          "",
          "## Task Breakdown",
          "- [ ] Step one",
          "",
          "## Task Contracts",
          "- Contract file: `tasks/contracts/20260304-1400-think-plan-224448.contract.md`",
          "- Review file: `tasks/reviews/20260304-1400-think-plan-224448.review.md`",
          "- Implementation notes file: `tasks/notes/20260304-1400-think-plan-224448.notes.md`",
        ].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1400-think-plan-224448.md"], cwd);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("transient plan slug 'think-plan-224448' cannot be projected");

      const transientStem = "20260304-1400-think-plan-224448";
      expect(existsSync(join(cwd, `tasks/contracts/${transientStem}.contract.md`))).toBe(false);
      expect(existsSync(join(cwd, "tasks/contracts"))).toBe(false);
      expect(readFileSync(planFile, "utf-8")).toContain("> **Status**: Approved");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should start a linked contract worktree when policy enables contract tasks", () => {
    const cwd = tmpWorkspace("helper-contract-auto");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify(
          {
            worktree_strategy: {
              auto_for_contract_tasks: true,
              branch_prefix: "codex/",
              base_branch: "main",
              merge_back: { target: "main" },
            },
          },
          null,
          2
        ) + "\n"
      );
      writeFileSync(join(cwd, "tasks/todos.md"), "# Primary Todo\n\n- [ ] keep primary clean\n");
      initGitRepo(cwd);
      commitAll(cwd, "init workflow");
      expect(run("git", ["checkout", "-b", "integration/task-base"], cwd).status).toBe(0);
      writeFileSync(join(cwd, "integration-base.txt"), "task base is ahead of main\n");
      commitAll(cwd, "integration task base");
      const taskBase = run("git", ["rev-parse", "HEAD"], cwd).stdout.trim();

      writeFileSync(
        join(cwd, "plans/plan-20260304-1440-demo.md"),
        [
          "# Plan: demo",
          "",
          "> **Status**: Approved",
          "",
          evidenceContract(),
          "",
          promotionGate(),
          "",
          "## Task Breakdown",
          "- [ ] Step one",
        ].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1440-demo.md"], cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ContractWorktree] Created worktree");
      expect(existsSync(worktreePath)).toBe(true);

      const primaryTodo = readFileSync(join(cwd, "tasks/todos.md"), "utf-8");
      expect(primaryTodo).toContain("# Primary Todo");
      expect(primaryTodo).not.toContain("**Status**: Executing");

      const worktreeTodo = readFileSync(join(worktreePath, "tasks/todos.md"), "utf-8");
      expect(worktreeTodo).toContain("# Deferred Goal Ledger");
      expect(worktreeTodo).toContain("**Status**: Backlog");
      expect(worktreeTodo).not.toContain("- [ ] Step one");
      expect(existsSync(join(worktreePath, ".ai/harness/planning"))).toBe(true);
      const metadata = JSON.parse(readFileSync(join(worktreePath, ".ai/harness/worktrees/demo.json"), "utf-8"));
      expect(metadata.branch).toBe("codex/demo");
      expect(metadata.base_commit).toBe(taskBase);
      expect(metadata.base_commit).not.toBe(run("git", ["rev-parse", "main"], cwd).stdout.trim());
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should reject non-Approved plan status", () => {
    const cwd = tmpWorkspace("helper-plan-status");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1410-draft.md"),
        ["# Plan: draft", "", "> **Status**: Draft", "", "## Task Breakdown", "- [ ] Step one"].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1410-draft.md"], cwd);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Plan status must be Approved");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should reject approved plans without an evidence contract", () => {
    const cwd = tmpWorkspace("helper-plan-evidence-contract");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1415-missing-evidence.md"),
        ["# Plan: missing evidence", "", "> **Status**: Approved", "", "## Task Breakdown", "- [ ] Step one"].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1415-missing-evidence.md"], cwd);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Plan Evidence Contract is incomplete");
      expect(res.stderr).toContain("missing ## Evidence Contract section");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should reject approved plans without a promotion gate", () => {
    const cwd = tmpWorkspace("helper-plan-promotion-gate");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1418-missing-promotion.md"),
        [
          "# Plan: missing promotion",
          "",
          "> **Status**: Approved",
          "",
          evidenceContract(),
          "",
          "## Task Breakdown",
          "- [ ] Step one",
        ].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1418-missing-promotion.md"], cwd);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Plan Promotion Gate is incomplete");
      expect(res.stderr).toContain("missing ## Promotion Gate section");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should reject approved plans without work-package artifact metadata", () => {
    const cwd = tmpWorkspace("helper-plan-artifact-level");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-14185-missing-artifact-level.md"),
        [
          "# Plan: missing artifact level",
          "",
          "> **Status**: Approved",
          "",
          evidenceContract(),
          "",
          "## Promotion Gate",
          "",
          "- **Merge/PR unit**: demo branch is the reviewed merge unit",
          "- **Rollback surface**: revert the demo branch and generated task files",
          "- **Verification boundary**: bun test and contract verification",
          "- **Review/acceptance boundary**: task review must recommend pass",
          "- **High-risk surface**: generated workflow artifacts and helper scripts",
          "- **Why not checklist row**: fixture exercises contract projection",
          "",
          "## Task Breakdown",
          "- [ ] Step one",
        ].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-14185-missing-artifact-level.md"], cwd);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Plan Artifact Level gate is incomplete");
      expect(res.stderr).toContain("Artifact Level must be work-package");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should reject inline sprint-task projections", () => {
    const cwd = tmpWorkspace("helper-plan-inline-sprint-task");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1419-inline-sprint.md"),
        [
          "# Plan: inline sprint",
          "",
          "> **Status**: Approved",
          "> **Orchestration Kind**: sprint-task",
          "",
          "## Context",
          "",
          "- Mode: inline",
          "",
          evidenceContract(),
          "",
          promotionGate(),
          "",
          "## Task Breakdown",
          "- [ ] Step one",
        ].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1419-inline-sprint.md"], cwd);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Plan cannot be projected into task artifacts");
      expect(res.stderr).toContain("inline sprint rows and inline orchestration modes must stay");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo should reject sprint-inline work-package projections", () => {
    const cwd = tmpWorkspace("helper-plan-sprint-inline-work-package");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1420-sprint-inline.md"),
        [
          "# Plan: sprint inline",
          "",
          "> **Status**: Approved",
          "> **Orchestration Kind**: sprint-inline",
          "",
          evidenceContract(),
          "",
          promotionGate(),
          "",
          "## Task Breakdown",
          "- [ ] Step one",
        ].join("\n")
      );

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1420-sprint-inline.md"], cwd);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Plan cannot be projected into task artifacts");
      expect(res.stderr).toContain("inline sprint rows and inline orchestration modes must stay");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("plan-to-todo archive should include metadata header and original todo content", () => {
    const cwd = tmpWorkspace("helper-plan-archive-meta");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1420-meta.md"),
        [
          "# Plan: meta",
          "",
          "> **Status**: Approved",
          "",
          evidenceContract(),
          "",
          promotionGate(),
          "",
          "## Task Breakdown",
          "- [ ] Step one",
          "- [ ] Step two",
        ].join("\n")
      );
      writeFileSync(join(cwd, "tasks/todos.md"), "# Existing Todo\n\n- [ ] legacy task\n");

      const res = run("bash", ["scripts/plan-to-todo.sh", "--plan", "plans/plan-20260304-1420-meta.md"], cwd);
      expect(res.status).toBe(0);

      const archiveFiles = readdirSync(join(cwd, "tasks/archive")).filter((name) => name.startsWith("todo-"));
      expect(archiveFiles.length).toBeGreaterThanOrEqual(1);

      const archive = readFileSync(join(cwd, "tasks/archive", archiveFiles[0]), "utf-8");
      expect(archive).toContain("> **Archived**:");
      expect(archive).toContain("> **Related Plan**: plans/plan-20260304-1420-meta.md");
      expect(archive).toContain("> **Outcome**: Converted to deferred-goal ledger");
      expect(archive).toContain("# Existing Todo");
      expect(archive).toContain("- [ ] legacy task");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
