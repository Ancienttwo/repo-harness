import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers, HELPER_DIR, ROOT, writeActivePlan } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("refresh-current-status helper integration", () => {
  test("refresh-current-status should preview and write an idle local snapshot", () => {
    const cwd = tmpWorkspace("helper-current-idle");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });

      const preview = run("bash", ["scripts/refresh-current-status.sh"], cwd);
      expect(preview.status).toBe(0);
      expect(preview.stdout).toContain("# Current Status Snapshot");
      expect(preview.stdout).toContain("> **Status**: Idle");
      expect(existsSync(join(cwd, "tasks/current.md"))).toBe(false);

      const write = run("bash", ["scripts/refresh-current-status.sh", "--write", "--reason", "unit-test"], cwd);
      expect(write.status).toBe(0);
      expect(write.stdout).toContain("[CurrentStatus] Wrote tasks/current.md.");
      const current = readFileSync(join(cwd, "tasks/current.md"), "utf-8");
      expect(current).toContain("> **Status**: Idle");
      expect(current).toContain("> **Reason**: unit-test");
      expect(current).toContain("<!-- stale_after: 24h -->");
      expect(current).not.toContain("git show");
      expect(current).not.toContain("Mainline Snapshot Reading");
      expect(current).not.toContain("tracked mainline snapshot");
      expect(current).toContain("ignored local read model");
      expect(current).not.toContain(".current.md.tmp");
      expect(current).not.toContain("- [ ]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("refresh-current-status should derive active plan next task", () => {
    const cwd = tmpWorkspace("helper-current-active");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(
        join(cwd, "plans/plan-20260304-1600-demo.md"),
        [
          "# Plan: demo",
          "",
          "> **Status**: Executing",
          "",
          "## Task Breakdown",
          "",
          "- [x] Finished setup",
          "- [ ] Ship current status snapshot",
          "",
        ].join("\n")
      );
      writeActivePlan(cwd, "plans/plan-20260304-1600-demo.md");

      const res = run("bash", ["scripts/refresh-current-status.sh", "--write", "--reason", "active-test"], cwd);
      expect(res.status).toBe(0);
      const current = readFileSync(join(cwd, "tasks/current.md"), "utf-8");
      expect(current).toContain("> **Status**: Active");
      expect(current).toContain("- Active Plan: plans/plan-20260304-1600-demo.md");
      expect(current).toContain("- Plan Status: Executing");
      expect(current).toContain("- Next Task: Ship current status snapshot");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("refresh-current-status clear should not write Idle while active work exists", () => {
    const cwd = tmpWorkspace("helper-current-clear-active");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(
        join(cwd, "plans/plan-20260304-1610-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n\n## Task Breakdown\n\n- [ ] Continue\n"
      );
      writeActivePlan(cwd, "plans/plan-20260304-1610-demo.md");

      const res = run("bash", ["scripts/refresh-current-status.sh", "--clear", "--write", "--reason", "manual"], cwd);
      expect(res.status).toBe(0);
      const current = readFileSync(join(cwd, "tasks/current.md"), "utf-8");
      expect(current).toContain("> **Status**: ManualClearedWithActiveWork");
      expect(current).toContain("Idle was not written");
      expect(current).not.toContain("> **Status**: Idle");
      expect(current).toContain("- Active Plan: plans/plan-20260304-1610-demo.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("refresh-current-status should keep linked worktree paths and owners out of tracked output", () => {
    const cwd = tmpWorkspace("helper-current-linked-worktree");
    const linkedWorktree = `${cwd}-linked`;
    try {
      expect(readFileSync(join(ROOT, "scripts/refresh-current-status.sh"), "utf-8")).toBe(
        readFileSync(join(HELPER_DIR, "refresh-current-status.sh"), "utf-8")
      );
      initGitRepo(cwd);
      copyHelpers(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "README.md"), "fixture\n");
      commitAll(cwd, "fixture");
      expect(run("git", ["worktree", "add", "-b", "linked-current-status", linkedWorktree], cwd).status).toBe(0);

      const linkedPlan = join(linkedWorktree, "plans/plan-20260824-0100-linked.md");
      mkdirSync(join(linkedWorktree, "plans"), { recursive: true });
      mkdirSync(join(linkedWorktree, ".ai/harness"), { recursive: true });
      writeFileSync(linkedPlan, "# Plan: linked\n\n> **Status**: Executing\n");
      writeFileSync(join(linkedWorktree, ".ai/harness/active-plan"), `${linkedPlan}\n`);
      writeFileSync(
        join(linkedWorktree, ".ai/harness/active-worktree"),
        "/Users/macos-local-user/Library/Application Support/repo-harness\n"
      );

      const macos = run("bash", ["scripts/refresh-current-status.sh", "--write", "--reason", "path-sanitization"], cwd);
      expect(macos.status, macos.stderr).toBe(0);
      const macosCurrent = readFileSync(join(cwd, "tasks/current.md"), "utf-8");
      expect(macosCurrent).toContain("linked-worktree-");
      expect(macosCurrent).toContain("plans/plan-20260824-0100-linked.md");
      expect(macosCurrent).toContain("opaque-owner-");
      expect(macosCurrent).not.toContain(linkedWorktree);
      expect(macosCurrent).not.toContain("/Users/");
      expect(macosCurrent).not.toContain("macos-local-user");

      writeFileSync(join(linkedWorktree, ".ai/harness/active-plan"), "/home/unix-local-user/private/plan.md\n");
      writeFileSync(join(linkedWorktree, ".ai/harness/active-worktree"), "/home/unix-local-user/worktrees/repo\n");
      const unix = run("bash", ["scripts/refresh-current-status.sh", "--write", "--reason", "path-sanitization"], cwd);
      expect(unix.status, unix.stderr).toBe(0);
      const unixCurrent = readFileSync(join(cwd, "tasks/current.md"), "utf-8");
      expect(unixCurrent).toContain("opaque-plan-");
      expect(unixCurrent).toContain("opaque-owner-");
      expect(unixCurrent).not.toContain("/home/");
      expect(unixCurrent).not.toContain("unix-local-user");
      expect(unixCurrent).not.toContain(linkedWorktree);

      const foreignPaths = [
        ["C:/Users/windows-local/private/plan.md", "C:/Users/windows-local/worktrees/repo"],
        [String.raw`C:\Users\windows-local\private\plan.md`, String.raw`C:\Users\windows-local\worktrees\repo`],
        [String.raw`\\server\share\private\plan.md`, String.raw`\\server\share\worktrees\repo`],
        ["//server/share/private/plan.md", "//server/share/worktrees/repo"],
      ] as const;
      for (const [planPath, ownerPath] of foreignPaths) {
        writeFileSync(join(linkedWorktree, ".ai/harness/active-plan"), `${planPath}\n`);
        writeFileSync(join(linkedWorktree, ".ai/harness/active-worktree"), `${ownerPath}\n`);
        const foreign = run("bash", ["scripts/refresh-current-status.sh", "--write", "--reason", "path-sanitization"], cwd);
        expect(foreign.status, foreign.stderr).toBe(0);
        const foreignCurrent = readFileSync(join(cwd, "tasks/current.md"), "utf-8");
        expect(foreignCurrent).toContain("opaque-plan-");
        expect(foreignCurrent).toContain("opaque-owner-");
        expect(foreignCurrent).not.toContain(planPath);
        expect(foreignCurrent).not.toContain(ownerPath);
      }

      mkdirSync(join(cwd, ".ai/harness/sprint"), { recursive: true });
      const foreignSprint = String.raw`\\server\share\private\sprint.md`;
      writeFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), `${foreignSprint}\n`);
      const sprint = run("bash", ["scripts/refresh-current-status.sh", "--write", "--reason", "path-sanitization"], cwd);
      expect(sprint.status, sprint.stderr).toBe(0);
      const sprintCurrent = readFileSync(join(cwd, "tasks/current.md"), "utf-8");
      expect(sprintCurrent).toContain("stale active-sprint marker -> opaque-sprint-");
      expect(sprintCurrent).not.toContain(foreignSprint);
    } finally {
      if (existsSync(join(cwd, ".git")) && existsSync(linkedWorktree)) {
        run("git", ["worktree", "remove", "--force", linkedWorktree], cwd);
      }
      rmSync(cwd, { recursive: true, force: true });
      rmSync(linkedWorktree, { recursive: true, force: true });
    }
  }, 30_000);
});
