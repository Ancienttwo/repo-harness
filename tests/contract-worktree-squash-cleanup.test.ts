import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

// Regression guard for the squash-merge absorption predicate in the cleanup
// branch of `scripts/contract-worktree.sh`. See:
//   plans/plan-20260731-0952-contract-worktree-squash-cleanup.md
//   tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md
//
// This composition checks cleanup absorption through both contract-worktree
// and ship-worktrees against the same Git history.

const ROOT = join(import.meta.dir, "..");
const HELPER_DIR = join(ROOT, "assets/templates/helpers");

setDefaultTimeout(30000);







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
  for (const blockedFirst of [true, false]) {
    for (const refusal of ["dirty", "locked", "unreadable"]) {
      for (const dryRun of [false, true]) {
        test(`cleanup-closeout batch continues after ${refusal}; first=${blockedFirst}; dry-run=${dryRun}`, () => {
          const cwd = tmpWorkspace("cleanup-closeout-batch");
          const paths: string[] = [];
          try {
            copyHelpers(cwd);
            initGitRepo(cwd);
            writeFileSync(join(cwd, ".gitignore"), ".ai/harness/worktrees/\n");
            commitAll(cwd, "fixture");
            const add = (slug: string) => {
              const path = `${cwd}-wt-${slug}`;
              paths.push(path);
              expect(run("git", ["worktree", "add", path, "-b", `codex/${slug}`], cwd).status).toBe(0);
              return path;
            };
            const blocked = add(blockedFirst ? "a-blocked" : "z-blocked");
            const clean = add("m-clean");
            const squash = add("n-squash");
            writeFileSync(join(squash, "feature.txt"), "squashed\n");
            commitAll(squash, "feature");
            expect(run("git", ["merge", "--squash", "codex/n-squash"], cwd).status).toBe(0);
            commitAll(cwd, "squash feature");
            const unmerged = add("p-unmerged");
            writeFileSync(join(unmerged, "extra.txt"), "unmerged\n");
            commitAll(unmerged, "unmerged feature");
            if (refusal === "dirty") writeFileSync(join(blocked, "wip.txt"), "preserve me\n");
            else if (refusal === "locked") expect(run("git", ["worktree", "lock", blocked], cwd).status).toBe(0);
            const env: NodeJS.ProcessEnv = {};
            if (refusal === "unreadable") {
              const wrapper = `${cwd}-git`;
              writeFileSync(wrapper, '#!/bin/bash\nif [[ "$1" == "-C" && "$2" == "$CLEANUP_UNREADABLE_PATH" && "$3" == "status" ]]; then exit 128; fi\nexec "$CLEANUP_REAL_GIT" "$@"\n');
              chmodSync(wrapper, 0o755);
              env.REPO_HARNESS_GIT_BIN = wrapper;
              env.CLEANUP_UNREADABLE_PATH = blocked;
              env.CLEANUP_REAL_GIT = Bun.which("git")!;
            }
            const result = run("bash", ["scripts/ship-worktrees.sh", "--cleanup-merged", ...(dryRun ? ["--dry-run"] : [])], cwd, env);
            expect(result.status, result.stdout + result.stderr).toBe(1);
            expect(existsSync(blocked)).toBe(true);
            if (refusal === "dirty") expect(readFileSync(join(blocked, "wip.txt"), "utf-8")).toBe("preserve me\n");
            expect(existsSync(unmerged)).toBe(true);
            expect(existsSync(clean)).toBe(dryRun);
            expect(existsSync(squash)).toBe(dryRun);
            expect(result.stdout).toContain(dryRun ? "would-clean=2 blocked=1 skipped=1" : "cleaned=2 blocked=1 skipped=1");
            for (const slug of ["m-clean", "n-squash"]) {
              expect(run("git", ["show-ref", "--verify", "--quiet", `refs/heads/codex/${slug}`], cwd).status).toBe(dryRun ? 0 : 1);
            }
          } finally {
            for (const path of paths) {
              run("git", ["worktree", "unlock", path], cwd);
              run("git", ["worktree", "remove", "--force", path], cwd);
              rmSync(path, { recursive: true, force: true });
            }
            rmSync(`${cwd}-git`, { force: true });
            rmSync(cwd, { recursive: true, force: true });
          }
        }, 30_000);
      }
    }
  }

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

  // Regression guard for the branch-deletion half of the fix: the merge
  // gate above already proves absorption/ancestry -- the deletion step must
  // consume that predicate instead of re-deriving it via git's own
  // ancestry-based `-d` safety check, which is a guaranteed false positive
  // for every squash-absorbed branch. See:
  //   plans/plan-20260731-1056-contract-worktree-branch-delete.md
  //   tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md
  test("cleanup deletes a squash-merged branch end to end on a real (non-dry-run) run", () => {
    const cwd = tmpWorkspace("helper-cleanup-squash-real");
    const worktreePath = `${cwd}-wt-squash-real`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init squash real cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/squash-real"], cwd).status).toBe(0);
      writeFileSync(join(worktreePath, "feature.txt"), "squash feature\n");
      commitAll(worktreePath, "add squash feature");

      expect(run("git", ["merge", "--squash", "codex/squash-real"], cwd).status).toBe(0);
      commitAll(cwd, "squash-merge codex/squash-real");
      expect(
        run("git", ["merge-base", "--is-ancestor", "codex/squash-real", "main"], cwd).status,
      ).not.toBe(0);

      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/squash-real.json"), '{"slug":"squash-real"}\n');

      const result = run(
        "bash",
        ["scripts/contract-worktree.sh", "cleanup", "--slug", "squash-real"],
        cwd,
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("absorbed into main (squash-equivalent tree)");
      expect(result.stdout).toContain("Deleted branch: codex/squash-real (-D, absorbed)");

      // The real assertion this test exists for: cleanup must finish in one
      // pass -- worktree, branch, AND metadata all gone, exit 0. Pre-fix,
      // `git branch -d` refuses (not fully merged) and `set -euo pipefail`
      // kills the script before metadata removal, leaving the branch (and
      // possibly the metadata) behind with a non-zero exit.
      expect(existsSync(worktreePath)).toBe(false);
      expect(
        run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/squash-real"], cwd).status,
      ).not.toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/squash-real.json"))).toBe(false);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  // Regression guard for the batch entrypoint. `contract-worktree cleanup
  // --slug` already recognizes squash absorption (the tests above), but
  // `ship-worktrees --cleanup-merged` filtered with an ancestry check only,
  // so every squash-merged worktree -- which is every worktree under this
  // project's house ship flow -- was reported unmerged and skipped, and
  // worktrees accumulated without bound. See:
  //   plans/plan-20260817-2055-worktree-merge-authority.md
  //   tasks/contracts/20260817-2055-worktree-merge-authority.contract.md
  test("ship-worktrees --cleanup-merged cleans a squash-merged worktree instead of skipping it", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-squash");
    const worktreePath = `${cwd}-wt-ship-squash`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init ship cleanup squash");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/ship-squash"], cwd).status).toBe(0);
      writeFileSync(join(worktreePath, "feature.txt"), "squash feature\n");
      commitAll(worktreePath, "add squash feature");

      expect(run("git", ["merge", "--squash", "codex/ship-squash"], cwd).status).toBe(0);
      commitAll(cwd, "squash-merge codex/ship-squash");
      expect(
        run("git", ["merge-base", "--is-ancestor", "codex/ship-squash", "main"], cwd).status,
      ).not.toBe(0);

      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/ship-squash.json"), '{"slug":"ship-squash"}\n');

      const result = run("bash", ["scripts/ship-worktrees.sh", "--cleanup-merged"], cwd);
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain("Skipped unmerged branch");
      expect(result.stdout).toContain("absorbed into main (squash-equivalent tree)");

      expect(existsSync(worktreePath)).toBe(false);
      expect(
        run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/ship-squash"], cwd).status,
      ).not.toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/ship-squash.json"))).toBe(false);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  // Negative control for the batch entrypoint: relocating the merge
  // determination must not widen it. A branch carrying a commit main does
  // not have stays skipped.
  test("ship-worktrees --cleanup-merged still skips a branch carrying an unmerged extra commit", () => {
    const cwd = tmpWorkspace("helper-ship-cleanup-extra");
    const worktreePath = `${cwd}-wt-ship-extra`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init ship cleanup extra");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/ship-extra"], cwd).status).toBe(0);
      writeFileSync(join(worktreePath, "feature.txt"), "squash feature\n");
      commitAll(worktreePath, "add squash feature");

      expect(run("git", ["merge", "--squash", "codex/ship-extra"], cwd).status).toBe(0);
      commitAll(cwd, "squash-merge codex/ship-extra");

      writeFileSync(join(worktreePath, "extra.txt"), "not on main\n");
      commitAll(worktreePath, "add unmerged extra change");

      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/ship-extra.json"), '{"slug":"ship-extra"}\n');

      const result = run("bash", ["scripts/ship-worktrees.sh", "--cleanup-merged"], cwd);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Skipped unmerged branch: codex/ship-extra");

      expect(existsSync(worktreePath)).toBe(true);
      expect(
        run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/ship-extra"], cwd).status,
      ).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/ship-extra.json"))).toBe(true);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("cleanup deletes a plain-merged (ancestor) branch via -d on a real run", () => {
    const cwd = tmpWorkspace("helper-cleanup-ancestor-real");
    const worktreePath = `${cwd}-wt-ancestor-real`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, "README.md"), "# demo\n");
      commitAll(cwd, "init ancestor real cleanup");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/ancestor-real"], cwd).status).toBe(0);
      writeFileSync(join(worktreePath, "feature.txt"), "ancestor feature\n");
      commitAll(worktreePath, "add ancestor feature");

      // Diverge main so the merge cannot fast-forward -- forces a real merge
      // commit, proving the ancestor predicate (not the absorption
      // fallback) is what fires here, and that the double-insurance -d path
      // still works after the deletion step starts branching on merge_mode.
      writeFileSync(join(cwd, "main-only.txt"), "main-only change\n");
      commitAll(cwd, "diverge main");

      expect(
        run(
          "git",
          ["merge", "--no-ff", "-m", "merge codex/ancestor-real", "codex/ancestor-real"],
          cwd,
        ).status,
      ).toBe(0);
      expect(
        run("git", ["merge-base", "--is-ancestor", "codex/ancestor-real", "main"], cwd).status,
      ).toBe(0);

      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/worktrees/ancestor-real.json"), '{"slug":"ancestor-real"}\n');

      const result = run(
        "bash",
        ["scripts/contract-worktree.sh", "cleanup", "--slug", "ancestor-real"],
        cwd,
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("ancestor of main");
      expect(result.stdout).toContain("Deleted branch: codex/ancestor-real (-d, ancestor)");

      expect(existsSync(worktreePath)).toBe(false);
      expect(
        run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/ancestor-real"], cwd).status,
      ).not.toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/ancestor-real.json"))).toBe(false);
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);
});
