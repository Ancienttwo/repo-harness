import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers, HELPER_DIR, ROOT } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("ship-worktrees helper integration", () => {
  test("ship-worktrees should put dirty main closeout on a PR branch", () => {
    const cwd = tmpWorkspace("helper-ship-main-closeout");
    const remotePath = `${cwd}-remote.git`;
    const fakeBin = `${cwd}-fake-bin`;
    const ghLog = `${cwd}-gh.log`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init main closeout");
      expect(run("git", ["init", "--bare", remotePath], cwd).status).toBe(0);
      expect(run("git", ["remote", "add", "origin", remotePath], cwd).status).toBe(0);
      expect(run("git", ["push", "-u", "origin", "main"], cwd).status).toBe(0);

      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(
        join(fakeBin, "gh"),
        [
          "#!/bin/sh",
          "echo \"$@\" >> \"$GH_LOG\"",
          "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"list\" ]; then exit 0; fi",
          "if [ \"$1\" = \"pr\" ] && [ \"$2\" = \"create\" ]; then echo \"https://example.test/pr/2\"; exit 0; fi",
          "exit 1",
        ].join("\n") + "\n"
      );
      expect(run("chmod", ["+x", join(fakeBin, "gh")], cwd).status).toBe(0);

      writeFileSync(join(cwd, "main-dirty.txt"), "closeout\n");
      const ship = run("bash", ["scripts/ship-worktrees.sh", "--slug", "demo"], cwd, {
        GH_LOG: ghLog,
        PATH: `${fakeBin}:${process.env.PATH}`,
        REPO_HARNESS_BASH_BIN: "/bin/bash",
        REPO_HARNESS_BUN_BIN: process.execPath,
        REPO_HARNESS_GIT_BIN: "/usr/bin/git",
        REPO_HARNESS_GH_BIN: join(fakeBin, "gh"),
        REPO_HARNESS_WORKFLOW_STATE_LIB: join(ROOT, "assets/hooks/lib/workflow-state.sh"),
      });
      expect(ship.status).toBe(0);
      expect(run("git", ["branch", "--show-current"], cwd).stdout.trim()).toBe("codex/demo-main-closeout");
      expect(run("git", ["show", "main:main-dirty.txt"], cwd).status).not.toBe(0);
      expect(run("git", ["ls-remote", "--heads", "origin", "codex/demo-main-closeout"], cwd).stdout).toContain("refs/heads/codex/demo-main-closeout");
      expect(readFileSync(ghLog, "utf-8")).toContain("pr create --base main --head codex/demo-main-closeout");
    } finally {
      rmSync(remotePath, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("ship-worktrees rejects gated dirty-main closeout without a goal before branch mutation", () => {
    const cwd = tmpWorkspace("helper-ship-main-gated-no-goal");
    const remotePath = `${cwd}-remote.git`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/policy.json"), `${JSON.stringify({ merge_gate: { enabled: true, rule: "fixture" } }, null, 2)}\n`);
      writeFileSync(join(cwd, "README.md"), "# gated demo\n");
      commitAll(cwd, "init gated main closeout");
      expect(run("git", ["init", "--bare", remotePath], cwd).status).toBe(0);
      expect(run("git", ["remote", "add", "origin", remotePath], cwd).status).toBe(0);
      expect(run("git", ["push", "-u", "origin", "main"], cwd).status).toBe(0);

      writeFileSync(join(cwd, "main-dirty.txt"), "closeout\n");
      const ship = run("bash", ["scripts/ship-worktrees.sh", "--slug", "demo"], cwd, {
        REPO_HARNESS_BASH_BIN: "/bin/bash",
        REPO_HARNESS_BUN_BIN: process.execPath,
        REPO_HARNESS_GIT_BIN: "/usr/bin/git",
        REPO_HARNESS_HELPER_SOURCE_PATH: join(HELPER_DIR, "ship-worktrees.sh"),
        REPO_HARNESS_WORKFLOW_STATE_LIB: join(ROOT, "assets/hooks/lib/workflow-state.sh"),
      });
      expect(ship.status).toBe(1);
      expect(ship.stderr).toContain("has no active goal plan; use a contract worktree");
      expect(run("git", ["branch", "--show-current"], cwd).stdout.trim()).toBe("main");
      expect(existsSync(join(cwd, "main-dirty.txt"))).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo-main-closeout"], cwd).status).not.toBe(0);
    } finally {
      rmSync(remotePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("ship-worktrees cleanup-merged should refuse dirty merged source worktree", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-dirty-merged");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, "src"), { recursive: true });
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init dirty merged cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(worktreePath, "src"), { recursive: true });
      writeFileSync(join(worktreePath, "src/demo.ts"), "export const demo = 1;\n");
      commitAll(worktreePath, "add demo source");
      expect(run("git", ["merge", "--ff-only", "codex/demo"], cwd).status).toBe(0);

      writeFileSync(join(worktreePath, "src/demo.ts"), "export const demo = 2;\n");

      const cleanup = run("bash", ["scripts/ship-worktrees.sh", "--cleanup-merged", "--target", "main"], cwd);
      expect(cleanup.status).toBe(1);
      expect(cleanup.stderr).toContain("dirty merged linked worktree");
      expect(cleanup.stderr).toContain("pick/apply/commit");
      expect(cleanup.stderr).toContain("tgz");
      expect(cleanup.stderr).toContain("src/demo.ts");
      expect(existsSync(worktreePath)).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).toBe(0);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("ship-worktrees cleanup-merged should honor slug filter and repair stale gitdir", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-slug-repair");
    const demoPath = `${cwd}-wt-demo`;
    const keepPath = `${cwd}-wt-keep`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init slug cleanup");

      expect(run("git", ["worktree", "add", demoPath, "-b", "codex/demo"], cwd).status).toBe(0);
      expect(run("git", ["worktree", "add", keepPath, "-b", "codex/keep"], cwd).status).toBe(0);
      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/demo.json"), '{"slug":"demo"}\n');
      writeFileSync(join(cwd, ".ai/harness/worktrees/keep.json"), '{"slug":"keep"}\n');
      writeFileSync(join(demoPath, ".git"), "gitdir: /tmp/moved-repo/.git/worktrees/wt-demo\n");

      const cleanup = run(
        "bash",
        ["scripts/ship-worktrees.sh", "--cleanup-merged", "--slug", "demo", "--target", "main"],
        cwd
      );

      expect(cleanup.status).toBe(0);
      expect(cleanup.stderr).toContain("Repaired stale worktree gitdir");
      expect(cleanup.stdout).toContain("Removed worktree");
      expect(existsSync(demoPath)).toBe(false);
      expect(existsSync(keepPath)).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).not.toBe(0);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/keep"], cwd).status).toBe(0);
    } finally {
      for (const path of [demoPath, keepPath]) {
        run("git", ["worktree", "remove", "--force", path], cwd);
        rmSync(path, { recursive: true, force: true });
      }
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("ship-worktrees cleanup-merged can discard scaffold-only dirty merged worktree", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-scaffold-discard");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Deferred Goal Ledger\n");
      commitAll(cwd, "init scaffold cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/demo.json"), '{"slug":"demo"}\n');

      mkdirSync(join(worktreePath, "plans"), { recursive: true });
      mkdirSync(join(worktreePath, "tasks/contracts"), { recursive: true });
      mkdirSync(join(worktreePath, "tasks/reviews"), { recursive: true });
      mkdirSync(join(worktreePath, "tasks/notes"), { recursive: true });
      writeFileSync(join(worktreePath, "tasks/todos.md"), "# Deferred Goal Ledger\n- generated scaffold\n");
      writeFileSync(join(worktreePath, "plans/plan-20260304-1410-demo.md"), "# Plan: demo\n");
      writeFileSync(join(worktreePath, "tasks/contracts/demo.contract.md"), "# Contract\n");
      writeFileSync(join(worktreePath, "tasks/reviews/demo.review.md"), "# Review\n");
      writeFileSync(join(worktreePath, "tasks/notes/demo.notes.md"), "# Notes\n");

      const cleanup = run(
        "bash",
        ["scripts/ship-worktrees.sh", "--cleanup-merged", "--discard-scaffold-only", "--target", "main"],
        cwd
      );
      expect(cleanup.status).toBe(0);
      expect(cleanup.stdout).toContain("Discarded scaffold-only changes");
      expect(cleanup.stdout).toContain("Removed worktree");
      expect(cleanup.stdout).toContain("Deleted branch: codex/demo");
      expect(existsSync(worktreePath)).toBe(false);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).not.toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/demo.json"))).toBe(false);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("ship-worktrees cleanup-merged can discard scaffold-only dirty merged worktree with no untracked paths", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-scaffold-tracked-only");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/notes"), { recursive: true });
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Deferred Goal Ledger\n");
      writeFileSync(join(cwd, "plans/plan-20260304-1410-demo.md"), "# Plan: demo\n");
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), "# Contract\n");
      writeFileSync(join(cwd, "tasks/notes/demo.notes.md"), "# Notes\n");
      commitAll(cwd, "init tracked scaffold cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/demo.json"), '{"slug":"demo"}\n');

      // Every dirty scaffold path is tracked; the untracked set is empty.
      writeFileSync(join(worktreePath, "tasks/todos.md"), "# Deferred Goal Ledger\n- generated scaffold\n");
      writeFileSync(join(worktreePath, "plans/plan-20260304-1410-demo.md"), "# Plan: demo\n\n- generated\n");
      writeFileSync(join(worktreePath, "tasks/contracts/demo.contract.md"), "# Contract\n\n- generated\n");
      writeFileSync(join(worktreePath, "tasks/notes/demo.notes.md"), "# Notes\n\n- generated\n");
      expect(run("git", ["status", "--porcelain=v1", "--untracked-files=all"], worktreePath).stdout).not.toContain("??");

      const cleanup = run(
        "bash",
        ["scripts/ship-worktrees.sh", "--cleanup-merged", "--discard-scaffold-only", "--target", "main"],
        cwd
      );
      expect(cleanup.stderr).not.toContain("unbound variable");
      expect(cleanup.status).toBe(0);
      expect(cleanup.stdout).toContain("Discarded scaffold-only changes");
      expect(cleanup.stdout).toContain("Removed worktree");
      expect(cleanup.stdout).toContain("Deleted branch: codex/demo");
      expect(existsSync(worktreePath)).toBe(false);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).not.toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/demo.json"))).toBe(false);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("ship-worktrees cleanup-merged should require explicit scaffold discard flag", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-scaffold-no-flag");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Deferred Goal Ledger\n");
      commitAll(cwd, "init scaffold no flag cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(worktreePath, "plans"), { recursive: true });
      mkdirSync(join(worktreePath, "tasks/contracts"), { recursive: true });
      writeFileSync(join(worktreePath, "tasks/todos.md"), "# Deferred Goal Ledger\n- generated scaffold\n");
      writeFileSync(join(worktreePath, "plans/plan-20260304-1410-demo.md"), "# Plan: demo\n");
      writeFileSync(join(worktreePath, "tasks/contracts/demo.contract.md"), "# Contract\n");

      const cleanup = run("bash", ["scripts/ship-worktrees.sh", "--cleanup-merged", "--target", "main"], cwd);
      expect(cleanup.status).toBe(1);
      expect(cleanup.stderr).toContain("dirty merged linked worktree");
      expect(cleanup.stderr).toContain("--discard-scaffold-only");
      expect(existsSync(join(worktreePath, "tasks/todos.md"))).toBe(true);
      expect(readFileSync(join(worktreePath, "tasks/todos.md"), "utf8")).toContain("generated scaffold");
      expect(existsSync(worktreePath)).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/demo"], cwd).status).toBe(0);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);
});
