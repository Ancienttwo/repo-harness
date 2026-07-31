import { describe, test, expect, setDefaultTimeout } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

// Regression guard for the squash-merge absorption predicate in the cleanup
// branch of `scripts/contract-worktree.sh`. See:
//   plans/plan-20260731-0952-contract-worktree-squash-cleanup.md
//   tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md
//
// Kept as its own file (rather than folded into helper-scripts.test.ts) so a
// targeted RED capture only needs to run this one file.

const ROOT = join(import.meta.dir, "..");
const HELPER_DIR = join(ROOT, "assets/templates/helpers");

setDefaultTimeout(30000);

function tmpWorkspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
}

const SANDBOX_ENV_BLOCKLIST = [
  "REPO_HARNESS_TARGET_REPO_ROOT",
  "REPO_HARNESS_HELPER_SOURCE_PATH",
  "REPO_HARNESS_SOURCE_ROOT",
  "REPO_HARNESS_BUN_BIN",
  "REPO_HARNESS_WORKFLOW_STATE_LIB",
];

function sandboxEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const base = { ...process.env };
  for (const key of SANDBOX_ENV_BLOCKLIST) delete base[key];
  return { ...base, ...env };
}

function run(cmd: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return spawnSync(cmd, args, { cwd, encoding: "utf-8", env: sandboxEnv(env) });
}

function initGitRepo(cwd: string) {
  expect(run("git", ["init"], cwd).status).toBe(0);
  const branch = run("git", ["branch", "--show-current"], cwd).stdout.trim();
  if (branch !== "main") {
    expect(run("git", ["checkout", "-b", "main"], cwd).status).toBe(0);
  }
  expect(run("git", ["config", "user.name", "Helper Test"], cwd).status).toBe(0);
  expect(run("git", ["config", "user.email", "helper@test.local"], cwd).status).toBe(0);
}

function commitAll(cwd: string, message: string) {
  expect(run("git", ["add", "."], cwd).status).toBe(0);
  expect(run("git", ["commit", "-m", message], cwd).status).toBe(0);
}

function copyHelpers(cwd: string) {
  const scriptsDir = join(cwd, "scripts");
  const harnessScriptsDir = join(cwd, ".ai", "harness", "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(harnessScriptsDir, { recursive: true });
  mkdirSync(join(cwd, ".ai", "harness"), { recursive: true });
  mkdirSync(join(cwd, ".ai", "harness", "triage"), { recursive: true });
  mkdirSync(join(cwd, "docs", "architecture"), { recursive: true });

  for (const file of readdirSync(HELPER_DIR).filter((name) => name.endsWith(".sh") || name.endsWith(".ts"))) {
    copyFileSync(join(HELPER_DIR, file), join(scriptsDir, file));
    copyFileSync(join(HELPER_DIR, file), join(harnessScriptsDir, file));
  }
  copyFileSync(join(ROOT, "assets/workflow-contract.v1.json"), join(cwd, ".ai/harness/workflow-contract.json"));
  writeFileSync(join(cwd, ".ai", "harness", "triage", ".gitkeep"), "");
  if (!existsSync(join(cwd, "docs/architecture/index.md"))) {
    writeFileSync(
      join(cwd, "docs/architecture/index.md"),
      [
        "# Architecture Index",
        "",
        "## Pending Requests",
        "",
        "<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->",
        "- (none)",
        "<!-- END ARCHITECTURE PENDING REQUESTS -->",
        "",
      ].join("\n"),
    );
  }

  expect(run("bash", ["-lc", "chmod +x scripts/*.sh"], cwd).status).toBe(0);
  expect(run("bash", ["-lc", "chmod +x .ai/harness/scripts/*.sh"], cwd).status).toBe(0);
}

describe("contract-worktree cleanup squash-merge absorption", () => {
  test("cleanup accepts a squash-merged branch via merge-tree absorption (dry-run)", () => {
    const cwd = tmpWorkspace("helper-cleanup-squash-absorbed");
    const worktreePath = `${cwd}-wt-squash-demo`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init squash cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/squash-demo"], cwd).status).toBe(0);
      writeFileSync(join(worktreePath, "feature.txt"), "squash feature\n");
      commitAll(worktreePath, "add squash feature");

      // Simulate the repo's house ship flow: squash the branch onto main.
      // The branch tip is now NOT an ancestor of main -- that structural
      // mismatch is exactly what the ancestry-only check cannot see past.
      expect(run("git", ["merge", "--squash", "codex/squash-demo"], cwd).status).toBe(0);
      commitAll(cwd, "squash-merge codex/squash-demo");
      expect(
        run("git", ["merge-base", "--is-ancestor", "codex/squash-demo", "main"], cwd).status,
      ).not.toBe(0);

      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/squash-demo.json"), '{"slug":"squash-demo"}\n');

      const dryRun = run(
        "bash",
        ["scripts/contract-worktree.sh", "cleanup", "--slug", "squash-demo", "--dry-run"],
        cwd,
      );
      expect(dryRun.status).toBe(0);
      expect(dryRun.stdout).toContain("absorbed");
      expect(dryRun.stdout).toContain("dry-run cleanup");
      expect(dryRun.stdout).toContain("would remove worktree");
      expect(dryRun.stdout).toContain("would delete branch: codex/squash-demo");
      expect(dryRun.stdout).toContain("would remove metadata");

      // dry-run must not touch anything
      expect(existsSync(worktreePath)).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/squash-demo"], cwd).status).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/squash-demo.json"))).toBe(true);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("cleanup still refuses a squash-merged branch carrying an unmerged extra commit (fail-closed)", () => {
    const cwd = tmpWorkspace("helper-cleanup-squash-extra");
    const worktreePath = `${cwd}-wt-squash-extra`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init squash cleanup extra");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/squash-extra"], cwd).status).toBe(0);
      writeFileSync(join(worktreePath, "feature.txt"), "squash feature\n");
      commitAll(worktreePath, "add squash feature");

      expect(run("git", ["merge", "--squash", "codex/squash-extra"], cwd).status).toBe(0);
      commitAll(cwd, "squash-merge codex/squash-extra");

      // Extra commit lands on the branch AFTER the squash-merge landed on
      // main, so main's tree no longer equals the branch's tree. The
      // absorption predicate must reject exactly as the ancestry check does
      // -- this is the falsifier's negative control.
      writeFileSync(join(worktreePath, "extra.txt"), "not on main\n");
      commitAll(worktreePath, "add unmerged extra change");

      const dryRun = run(
        "bash",
        ["scripts/contract-worktree.sh", "cleanup", "--slug", "squash-extra", "--dry-run"],
        cwd,
      );
      expect(dryRun.status).toBe(1);
      expect(dryRun.stderr).toContain("not fully merged");

      expect(existsSync(worktreePath)).toBe(true);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/squash-extra"], cwd).status).toBe(0);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);
});
