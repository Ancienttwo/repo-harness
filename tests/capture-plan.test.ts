import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers, installCanonicalContractTemplate } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("capture-plan helper integration", () => {
  test("capture-plan should save planning output as an active plan artifact", () => {
    const cwd = tmpWorkspace("helper-capture-plan");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/planning"), { recursive: true });
      copyHelpers(cwd);
      writeFileSync(join(cwd, ".ai/harness/planning/pending.json"), JSON.stringify({ version: 1, kind: "waza-think", prompt_slug: "passive-plan" }) + "\n");
      writeFileSync(
        join(cwd, "captured.md"),
        [
          "## Approved design summary",
          "- Building: passive plan capture",
          "- Verification: run helper tests",
          "",
          "## Task Breakdown",
          "- [ ] Add capture helper",
          "- [ ] Update routing docs",
        ].join("\n")
      );

      const res = run("bash", [
        "scripts/capture-plan.sh",
        "--slug",
        "passive-plan",
        "--title",
        "Passive Plan",
        "--source",
        "waza-think",
        "--orchestration-kind",
        "waza-think",
        "--source-ref",
        "thread://plan-discussion",
        "--route",
        "waza:think",
        "--body-file",
        "captured.md",
      ], cwd);

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Captured plan:");

      const plans = readdirSync(join(cwd, "plans")).filter((name) => /^plan-\d{8}-\d{4}-passive-plan\.md$/.test(name));
      expect(plans.length).toBe(1);
      const artifactStem = plans[0].replace(/^plan-/, "").replace(/\.md$/, "");
      const planPath = join(cwd, "plans", plans[0]);
      const plan = readFileSync(planPath, "utf-8");
      expect(plan).toContain("> **Status**: Draft");
      expect(plan).toContain("> **Planning Source**: waza-think");
      expect(plan).toContain("> **Orchestration Kind**: waza-think");
      expect(plan).toContain("> **Source Ref**: thread://plan-discussion");
      expect(plan).toContain("> **Artifact Level**: work-package");
      expect(plan).toContain("> **Promotion Reason**: (required before projection)");
      expect(plan).toContain("- Selected route: waza:think");
      expect(plan).toContain("- Source ref: thread://plan-discussion");
      expect(plan).toContain("## Workflow Inventory");
      expect(plan).toContain("- Active plan: `plans/");
      expect(plan).toContain("repo-harness run contract-worktree start --plan");
      expect(plan).toContain("## Evidence Contract");
      expect(plan).toContain("## Promotion Gate");
      expect(plan).toContain("Why not checklist row");
      expect(plan).toContain(`tasks/contracts/${artifactStem}.contract.md`);
      expect(plan).toContain("## Captured Planning Output");
      expect(plan).toContain("- [ ] Add capture helper");
      expect(readFileSync(join(cwd, ".ai/harness/active-plan"), "utf-8")).toBe(`plans/${plans[0]}`);
      expect(existsSync(join(cwd, ".claude/.active-plan"))).toBe(false);
      expect(readFileSync(join(cwd, ".ai/harness/active-worktree"), "utf-8").trim()).toBe(cwd);
      expect(existsSync(join(cwd, ".ai/harness/planning/pending.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("capture-plan should name transient plan artifacts from the task title", () => {
    const cwd = tmpWorkspace("helper-capture-transient-artifact-name");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      copyHelpers(cwd);
      writeFileSync(
        join(cwd, "captured.md"),
        [
          "## Approved design summary",
          "- Building: batch digest repository",
          "- Verification: helper tests",
          "",
          "## Task Breakdown",
          "- [ ] Add repository path",
        ].join("\n")
      );

      const res = run("bash", [
        "scripts/capture-plan.sh",
        "--slug",
        "think-plan-224448",
        "--title",
        "Batch Digest Repository",
        "--source",
        "waza-think",
        "--body-file",
        "captured.md",
      ], cwd);

      expect(res.status).toBe(0);
      const planName = readdirSync(join(cwd, "plans")).find((name) =>
        /^plan-\d{8}-\d{4}-think-plan-224448\.md$/.test(name)
      );
      expect(planName).toBeDefined();
      const timestampStem = planName!.match(/^plan-(\d{8}-\d{4})-/)![1];
      const semanticStem = `${timestampStem}-batch-digest-repository`;
      const transientStem = planName!.replace(/^plan-/, "").replace(/\.md$/, "");
      const plan = readFileSync(join(cwd, "plans", planName!), "utf-8");
      expect(plan).toContain(`tasks/contracts/${semanticStem}.contract.md`);
      expect(plan).toContain(`tasks/reviews/${semanticStem}.review.md`);
      expect(plan).toContain(`tasks/notes/${semanticStem}.notes.md`);
      expect(plan).not.toContain(`tasks/contracts/${transientStem}.contract.md`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("capture-plan checklist-row appends to the active plan without durable projection", () => {
    const cwd = tmpWorkspace("helper-capture-plan-checklist-row");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      copyHelpers(cwd);
      writeFileSync(
        join(cwd, "plans/plan-20260304-1500-active.md"),
        [
          "# Plan: active",
          "",
          "> **Status**: Executing",
          "> **Artifact Level**: work-package",
          "> **Promotion Reason**: worktree_boundary",
          "> **Verification Boundary**: bun test",
          "> **Rollback Surface**: revert active branch",
          "",
          "## Task Breakdown",
          "- [ ] Existing row",
        ].join("\n")
      );
      writeFileSync(join(cwd, ".ai/harness/active-plan"), "plans/plan-20260304-1500-active.md");
      writeFileSync(
        join(cwd, "captured.md"),
        [
          "## Approved design summary",
          "- Building: checklist-only row",
          "",
          "## Task Breakdown",
          "- [ ] Add a row-level check",
        ].join("\n")
      );

      const res = run("bash", [
        "scripts/capture-plan.sh",
        "--artifact-level",
        "checklist-row",
        "--slug",
        "row-only",
        "--title",
        "Row Only",
        "--body-file",
        "captured.md",
      ], cwd);

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Appended checklist row(s)");
      const planNames = readdirSync(join(cwd, "plans")).filter((name) => /^plan-\d{8}-\d{4}-row-only/.test(name));
      expect(planNames).toHaveLength(0);
      expect(existsSync(join(cwd, "tasks/contracts"))).toBe(false);
      const activePlan = readFileSync(join(cwd, "plans/plan-20260304-1500-active.md"), "utf-8");
      expect(activePlan).toContain("- [ ] Existing row");
      expect(activePlan).toContain("- [ ] Add a row-level check");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("capture-plan checklist-row rejects active plans without Task Breakdown", () => {
    const cwd = tmpWorkspace("helper-capture-plan-checklist-row-missing-breakdown");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      copyHelpers(cwd);
      writeFileSync(
        join(cwd, "plans/plan-20260304-1500-active.md"),
        [
          "# Plan: active",
          "",
          "> **Status**: Executing",
          "> **Artifact Level**: work-package",
        ].join("\n")
      );
      writeFileSync(join(cwd, ".ai/harness/active-plan"), "plans/plan-20260304-1500-active.md");
      writeFileSync(
        join(cwd, "captured.md"),
        [
          "## Task Breakdown",
          "- [ ] Add a row-level check",
        ].join("\n")
      );

      const res = run("bash", [
        "scripts/capture-plan.sh",
        "--artifact-level",
        "checklist-row",
        "--slug",
        "row-only",
        "--title",
        "Row Only",
        "--body-file",
        "captured.md",
      ], cwd);

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("Active plan lacks ## Task Breakdown");
      const activePlan = readFileSync(join(cwd, "plans/plan-20260304-1500-active.md"), "utf-8");
      expect(activePlan).not.toContain("- [ ] Add a row-level check");
      expect(readdirSync(join(cwd, "plans")).filter((name) => /^plan-\d{8}-\d{4}-row-only/.test(name))).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("capture-plan should execute an already approved plan through plan-to-todo", () => {
    const cwd = tmpWorkspace("helper-capture-plan-execute");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      writeFileSync(
        join(cwd, "approved.md"),
        [
          "## Approved design summary",
          "- Building: approved capture",
          "- Verification: sprint verification",
          "",
          "## Task Breakdown",
          "- [ ] Implement approved capture",
        ].join("\n")
      );

      const res = run("bash", [
        "scripts/capture-plan.sh",
        "--slug",
        "approved-capture",
        "--title",
        "Approved Capture",
        "--status",
        "Approved",
        "--promotion-reason",
        "verification_boundary",
        "--execute",
        "--body-file",
        "approved.md",
      ], cwd);

      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      expect(res.stdout).toContain("Captured plan:");
      expect(res.stdout).toContain("Prepared sprint artifacts");
      const todo = readFileSync(join(cwd, "tasks/todos.md"), "utf-8");
      expect(todo).toContain("# Deferred Goal Ledger");
      expect(todo).toContain("**Status**: Backlog");
      expect(todo).not.toContain("- [ ] Implement approved capture");
      const planName = readdirSync(join(cwd, "plans")).find((name) => /^plan-\d{8}-\d{4}-approved-capture\.md$/.test(name));
      expect(planName).toBeDefined();
      const artifactStem = planName!.replace(/^plan-/, "").replace(/\.md$/, "");
      expect(existsSync(join(cwd, `tasks/contracts/${artifactStem}.contract.md`))).toBe(true);
      expect(existsSync(join(cwd, `tasks/reviews/${artifactStem}.review.md`))).toBe(true);
      expect(existsSync(join(cwd, `tasks/notes/${artifactStem}.notes.md`))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("capture-plan execute should require a concrete promotion reason", () => {
    const cwd = tmpWorkspace("helper-capture-plan-execute-missing-reason");
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      copyHelpers(cwd);
      writeFileSync(
        join(cwd, "approved.md"),
        [
          "## Approved design summary",
          "- Building: approved capture",
          "",
          "## Task Breakdown",
          "- [ ] Implement approved capture",
        ].join("\n")
      );

      const res = run("bash", [
        "scripts/capture-plan.sh",
        "--slug",
        "approved-capture",
        "--title",
        "Approved Capture",
        "--status",
        "Approved",
        "--execute",
        "--body-file",
        "approved.md",
      ], cwd);

      expect(res.status).toBe(1);
      expect(res.stderr).toContain("--execute with --artifact-level work-package requires a concrete --promotion-reason");
      expect(readdirSync(join(cwd, "plans"))).toHaveLength(0);

      const placeholder = run("bash", [
        "scripts/capture-plan.sh",
        "--slug",
        "approved-capture",
        "--title",
        "Approved Capture",
        "--status",
        "Approved",
        "--promotion-reason",
        "TBD",
        "--execute",
        "--body-file",
        "approved.md",
      ], cwd);

      expect(placeholder.status).toBe(1);
      expect(placeholder.stderr).toContain("--execute with --artifact-level work-package requires a concrete --promotion-reason");
      expect(readdirSync(join(cwd, "plans"))).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("capture-plan execute transfers active markers to the linked worktree", () => {
    const cwd = tmpWorkspace("helper-capture-worktree-transfer");
    const worktreePath = `${cwd}-wt-transfer-markers`;
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
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
            },
          },
          null,
          2
        ) + "\n"
      );
      initGitRepo(cwd);
      commitAll(cwd, "init workflow");
      writeFileSync(
        join(cwd, "approved.md"),
        [
          "## Approved design summary",
          "- Building: worktree marker transfer",
          "- Verification: helper tests",
          "",
          "## Task Breakdown",
          "- [ ] Transfer markers",
        ].join("\n")
      );

      const res = run("bash", [
        "scripts/capture-plan.sh",
        "--slug",
        "transfer-markers",
        "--title",
        "Transfer Markers",
        "--status",
        "Approved",
        "--promotion-reason",
        "worktree_boundary",
        "--execute",
        "--body-file",
        "approved.md",
      ], cwd);

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ContractWorktree] Created worktree");
      expect(existsSync(worktreePath)).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/active-plan"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/.active-plan"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/active-worktree"))).toBe(false);

      const linkedPlans = readdirSync(join(worktreePath, "plans")).filter((name) =>
        /^plan-\d{8}-\d{4}-transfer-markers\.md$/.test(name)
      );
      expect(linkedPlans).toHaveLength(1);
      expect(existsSync(join(cwd, "plans", linkedPlans[0]))).toBe(false);
      expect(readFileSync(join(worktreePath, ".ai/harness/active-plan"), "utf-8")).toBe(`plans/${linkedPlans[0]}`);
      expect(existsSync(join(worktreePath, ".claude/.active-plan"))).toBe(false);
      expect(readFileSync(join(worktreePath, ".ai/harness/active-worktree"), "utf-8").trim()).toBe(realpathSync(worktreePath));
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
