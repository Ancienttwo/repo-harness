import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";
import { executeVerificationContract } from "../src/effects/evidence/verification-execution";
import { nativeVerificationPlan } from "./state/effective-state-fixture";
import { sweepManagedWorktrees } from "../src/effects/state/coordination-worktree-topology";

// Regression guard for the squash-merge absorption predicate in the cleanup
// branch of `scripts/contract-worktree.sh`. See:
//   plans/plan-20260731-0952-contract-worktree-squash-cleanup.md
//   tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md
//
// This composition checks cleanup absorption through contract-worktree and
// the managed worktree sweep against real Git history.

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
  mkdirSync(join(cwd, "src"), { recursive: true });
  symlinkSync(join(ROOT, "src/effects"), join(cwd, "src/effects"), "dir");
  symlinkSync(join(ROOT, "src/core"), join(cwd, "src/core"), "dir");

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
  test("cleanup removes a merged clean worktree that holds an ignored native ledger and executed run", () => {
    const cwd = tmpWorkspace("cleanup-native-evidence");
    const worktreePath = `${cwd}-wt-native-evidence`;
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, ".gitignore"), ".ai/harness/worktrees/\n.ai/harness/evidence/\n.ai/harness/runs/\n");
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      const contract = "tasks/contracts/native.contract.md";
      writeFileSync(join(cwd, contract), "# Native Contract\n" + nativeVerificationPlan());
      writeFileSync(join(cwd, "feature.txt"), "fixture\n");
      commitAll(cwd, "native cleanup fixture");
      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/native-evidence"], cwd).status).toBe(0);
      const report = executeVerificationContract({ repoRoot: worktreePath, contractPath: contract });
      expect(report.passed).toBe(true);
      if (report.kind !== "verification_execution_report") throw new Error(report.reason);
      expect(report.results).toHaveLength(1);
      expect(report.results[0]!.execution).toBe("executed");
      const runPath = join(worktreePath, report.results[0]!.run_file!);
      const ledgerPath = join(worktreePath, ".ai/harness/evidence/events/log.jsonl");
      const runBytes = readFileSync(runPath, "utf8");
      const ledgerBytes = readFileSync(ledgerPath, "utf8");
      expect(ledgerBytes.length).toBeGreaterThan(0);
      expect(run("git", ["status", "--porcelain"], worktreePath).stdout).toBe("");
      mkdirSync(join(cwd, ".ai/harness/worktrees"), { recursive: true });
      const metadataPath = join(cwd, ".ai/harness/worktrees/native-evidence.json");
      const metadata = '{"slug":"native-evidence"}\n';
      writeFileSync(metadataPath, metadata);
      const dryRun = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "native-evidence", "--dry-run"], cwd);
      expect(dryRun.status, dryRun.stdout + dryRun.stderr).toBe(0);
      expect(existsSync(worktreePath)).toBe(true);
      expect(readFileSync(runPath, "utf8")).toBe(runBytes);
      expect(readFileSync(ledgerPath, "utf8")).toBe(ledgerBytes);
      expect(readFileSync(metadataPath, "utf8")).toBe(metadata);
      const result = run("bash", ["scripts/contract-worktree.sh", "cleanup", "--slug", "native-evidence"], cwd);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(existsSync(worktreePath)).toBe(false);
      expect(existsSync(metadataPath)).toBe(false);
      expect(run("git", ["show-ref", "--verify", "--quiet", "refs/heads/codex/native-evidence"], cwd).status).not.toBe(0);
    } finally {
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

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
      expect(result.stdout).toContain("Deleted branch: codex/squash-real (update-ref, absorbed)");

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

  test("cleanup deletes a plain-merged (ancestor) branch at the proven snapshot on a real run", () => {
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
      expect(result.stdout).toContain("Deleted branch: codex/ancestor-real (update-ref, ancestor)");

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

// A squash merge stays locally provable only until the target changes the
// same lines again. After that, only the provider PR can prove the merge.
describe("sweep provider merge proof after a later conflicting target edit", () => {
  /** A stub answer that is not a JSON value, or that exits non-zero. */
  class RawAnswer { constructor(readonly stdout: string, readonly exit = 0) {} }
  /** Answer N serves provider call N. Later calls reuse the last answer. */
  function squashFixture(...answers: Array<(squash: string, target: string) => unknown>) {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "worktree-provider-proof-")));
    const root = join(parent, "repo");
    const managed = join(parent, "managed");
    const home = join(parent, "home");
    for (const directory of [root, managed, home]) mkdirSync(directory);
    const env = { ...process.env, REPO_HARNESS_WORKTREE_ROOT: managed, HOME: home };
    const git = (cwd: string, ...args: string[]) => {
      const result = spawnSync("git", args, { cwd, encoding: "utf8", env });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.name", "Test");
    git(root, "config", "user.email", "test@example.test");
    writeFileSync(join(root, ".gitignore"), ".ai/\n");
    writeFileSync(join(root, "source"), "base\n");
    git(root, "add", ".");
    git(root, "commit", "-qm", "base");
    const path = join(managed, "repo-wt-squash");
    git(root, "worktree", "add", "-q", "-b", "fix/squash", path);
    writeFileSync(join(path, "source"), "feature\n");
    git(path, "commit", "-qam", "feature");
    const head = git(root, "rev-parse", "refs/heads/fix/squash");
    git(root, "merge", "--squash", "fix/squash");
    git(root, "commit", "-qm", "squash fix/squash");
    const squash = git(root, "rev-parse", "HEAD");
    writeFileSync(join(root, "source"), "later\n");
    git(root, "commit", "-qam", "later conflicting edit");
    git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
    const target = git(root, "rev-parse", "HEAD");
    mkdirSync(join(path, ".ai/harness/evidence/events"), { recursive: true });
    writeFileSync(join(path, ".ai/harness/evidence/events/log.jsonl"), "{}\n");
    const log = join(parent, "gh.log");
    answers.forEach((answer, index) => {
      const value = answer(squash, target);
      const raw = value instanceof RawAnswer ? value : new RawAnswer(JSON.stringify(value));
      writeFileSync(join(parent, `gh.${index + 1}.out`), raw.stdout);
      writeFileSync(join(parent, `gh.${index + 1}.exit`), String(raw.exit));
    });
    const gh = join(parent, "gh");
    writeFileSync(gh, [
      "#!/bin/bash",
      `printf '%s|%s|%s|%s\\n' "$PWD" "\${GH_REPO-unset}" "\${GH_HOST-unset}" "$*" >> '${log}'`,
      "n=0",
      `while IFS= read -r _; do n=$((n + 1)); done < '${log}'`,
      `(( n <= ${answers.length} )) || n=${answers.length}`,
      `cat '${parent}/gh.'"$n"'.out'`,
      `exit "$(< '${parent}/gh.'"$n"'.exit')"`,
      "",
    ].join("\n"));
    chmodSync(gh, 0o755);
    const calls = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
    const sweep = () => sweepManagedWorktrees(root, root, env, { deadlineMs: 30_000, ghBin: gh });
    return { root, managed, path, head, squash, git, calls, sweep, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
  }
  const mergedPr = (squash: string) => [{ number: 7, state: "closed", merged_at: "2026-10-01T00:00:00Z", base: { ref: "main" }, merge_commit_sha: squash }];

  test("the local proof alone reports the squash-merged branch as unproven", () => {
    const f = squashFixture(() => []);
    try {
      const result = f.sweep();
      expect(result).toContain(`${f.path}: kept; cleanup merge is unproven`);
      expect(existsSync(f.path)).toBe(true);
    } finally { f.cleanup(); }
  });

  test("a merged provider PR proves the merge and the sweep removes the worktree and its evidence log", () => {
    const saved = { GH_REPO: process.env.GH_REPO, GH_HOST: process.env.GH_HOST };
    process.env.GH_REPO = "caller/other-repo";
    process.env.GH_HOST = "caller.example.test";
    let f: ReturnType<typeof squashFixture> | undefined;
    try {
      // The fixture copies process.env into the env that it passes to the sweep.
      f = squashFixture(mergedPr);
      const result = f.sweep();
      expect(result, String(result)).toContain(`${f.path}: removed`);
      expect(existsSync(f.path)).toBe(false);
      expect(f.git(f.root, "branch", "--list", "fix/squash")).toBe("");
      // The sweep proves once outside the lock, and the barrier proves again.
      const call = `${f.root}|unset|unset|api repos/{owner}/{repo}/commits/${f.head}/pulls`;
      expect(f.calls()).toEqual([call, call]);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      f?.cleanup();
    }
  });

  for (const [label, second, reason] of [
    ["no PR", () => [], "cleanup merge is unproven"],
    ["another merge commit", (_squash: string, target: string) => mergedPr(target), "cleanup merge commit changed"],
  ] as const) {
    test(`the barrier keeps the worktree when its second provider proof returns ${label}`, () => {
      const f = squashFixture(mergedPr, second);
      try {
        expect(f.sweep()).toContain(`${f.path}: kept; ${reason}`);
        expect(f.calls()).toHaveLength(2);
        expect(existsSync(f.path)).toBe(true);
        expect(f.git(f.root, "branch", "--list", "fix/squash")).toContain("fix/squash");
      } finally { f.cleanup(); }
    });
  }

  for (const [label, answer] of [
    ["exits non-zero", (squash: string) => new RawAnswer(JSON.stringify(mergedPr(squash)), 1)],
    ["returns malformed JSON", () => new RawAnswer('[{"merged_at":')],
  ] as const) {
    test(`a provider call that ${label} keeps the worktree`, () => {
      const f = squashFixture(answer);
      try {
        expect(f.sweep()).toContain(`${f.path}: kept; cleanup merge is unproven`);
        expect(existsSync(f.path)).toBe(true);
        expect(f.git(f.root, "branch", "--list", "fix/squash")).toContain("fix/squash");
      } finally { f.cleanup(); }
    });
  }

  test("an open provider PR keeps the worktree", () => {
    const f = squashFixture(squash => [{ number: 7, state: "open", merged_at: null, base: { ref: "main" }, merge_commit_sha: squash }]);
    try {
      const result = f.sweep();
      expect(result).toContain(`${f.path}: kept; cleanup merge is unproven`);
      expect(existsSync(f.path)).toBe(true);
      expect(f.git(f.root, "branch", "--list", "fix/squash")).toContain("fix/squash");
    } finally { f.cleanup(); }
  });

  type ProviderPull = ReturnType<typeof mergedPr>[number];
  const edits: ReadonlyArray<readonly [string, (pr: ProviderPull) => ProviderPull]> = [
    ["another base branch", pr => ({ ...pr, base: { ref: "release" } })],
    ["a merge commit missing locally", pr => ({ ...pr, merge_commit_sha: "0".repeat(40) })],
    ["an abbreviated merge commit", pr => ({ ...pr, merge_commit_sha: pr.merge_commit_sha.slice(0, 12) })],
  ];
  for (const [label, edit] of edits) {
    test(`a merged provider PR with ${label} keeps the worktree`, () => {
      const f = squashFixture(squash => mergedPr(squash).map(edit));
      try {
        expect(f.sweep()).toContain(`${f.path}: kept; cleanup merge is unproven`);
        expect(existsSync(f.path)).toBe(true);
      } finally { f.cleanup(); }
    });
  }

  test("a fresh branch at the target head is kept and never reaches the provider", () => {
    const f = squashFixture(mergedPr);
    try {
      const fresh = join(f.managed, "repo-wt-fresh");
      f.git(f.root, "worktree", "add", "-q", "-b", "fix/fresh", fresh, "refs/remotes/origin/main");
      const freshHead = f.git(f.root, "rev-parse", "refs/heads/fix/fresh");
      const result = f.sweep();
      expect(result).toContain(`${fresh}: kept; branch has no commits of its own`);
      expect(existsSync(fresh)).toBe(true);
      expect(f.git(f.root, "branch", "--list", "fix/fresh")).toContain("fix/fresh");
      expect(f.calls().some(call => call.includes(freshHead))).toBe(false);
    } finally { f.cleanup(); }
  });
});

describe("contract-worktree sweep", () => {
  test("sweep removes merged worktrees and keeps dirty and locked work", () => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-sweep-")));
    const cwd = join(parent, "repo");
    mkdirSync(cwd);
    let locked = "";
    try {
      copyHelpers(cwd);
      initGitRepo(cwd);
      writeFileSync(join(cwd, ".gitignore"), ".ai/\n");
      commitAll(cwd, "fixture");
      const add = (slug: string) => {
        const path = join(parent, `repo-wt-${slug}`);
        expect(run("git", ["worktree", "add", path, "-b", `fix/${slug}`], cwd).status).toBe(0);
        writeFileSync(join(path, `${slug}.txt`), `${slug}\n`);
        commitAll(path, slug);
        return path;
      };
      const dirty = add("a-dirty");
      locked = add("b-locked");
      const merged = add("m-merged");
      for (const slug of ["a-dirty", "b-locked", "m-merged"]) {
        expect(run("git", ["merge", "--no-ff", "-m", `merge ${slug}`, `fix/${slug}`], cwd).status).toBe(0);
      }
      const squash = add("n-squash");
      expect(run("git", ["merge", "--squash", "fix/n-squash"], cwd).status).toBe(0);
      commitAll(cwd, "squash fix/n-squash");
      expect(run("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], cwd).status).toBe(0);
      writeFileSync(join(dirty, "wip.txt"), "preserve me\n");
      expect(run("git", ["worktree", "lock", locked], cwd).status).toBe(0);

      const result = run("bash", ["scripts/contract-worktree.sh", "sweep"], cwd, { REPO_HARNESS_WORKTREE_ROOT: parent });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain("[WorktreeSweep] removed=2 pruned=0 kept=2");
      expect(result.stdout).toContain(`${merged}: removed`);
      expect(result.stdout).toContain(`${squash}: removed`);
      expect(result.stdout).toContain(`${dirty}: kept; cleanup_blocked_dirty_worktree`);
      expect(result.stdout).toContain(`${locked}: kept; locked`);
      expect(existsSync(merged)).toBe(false);
      expect(existsSync(squash)).toBe(false);
      expect(readFileSync(join(dirty, "wip.txt"), "utf8")).toBe("preserve me\n");
      expect(existsSync(locked)).toBe(true);
      expect(run("git", ["branch", "--list", "fix/*"], cwd).stdout.split("\n").map(line => line.replace(/^[*+ ]+/, "").trim()).filter(Boolean).sort())
        .toEqual(["fix/a-dirty", "fix/b-locked"]);

      const usage = run("bash", ["scripts/contract-worktree.sh", "sweep", "--dry-run"], cwd);
      expect(usage.status).toBe(2);
      expect(usage.stderr).toContain("sweep takes no arguments");
    } finally {
      if (locked) run("git", ["worktree", "unlock", locked], cwd);
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
