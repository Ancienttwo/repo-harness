import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const HELPER = join(ROOT, "scripts/verify-sprint.sh");
const REAL_GIT = Bun.which("git");
if (!REAL_GIT) throw new Error("git executable is required for verify-sprint base-guard tests");

function git(cwd: string, ...args: string[]) {
  const result = spawnSync(REAL_GIT!, args, { cwd, encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function runHelper(cwd: string) {
  const isolated = { ...process.env };
  for (const key of [
    "REPO_HARNESS_HELPER_SOURCE_PATH",
    "REPO_HARNESS_SOURCE_ROOT",
    "REPO_HARNESS_DIFF_BASE",
    "HARNESS_DIFF_BASE",
    "GITHUB_BASE_REF",
  ]) delete isolated[key];
  // The helper picks its working repo from this var (verify-sprint.sh:31) and
  // otherwise falls back to its own checkout, which would run the guard against
  // the harness repo instead of the fixture.
  isolated.REPO_HARNESS_TARGET_REPO_ROOT = cwd;
  return spawnSync("bash", [HELPER], { cwd, encoding: "utf-8", env: isolated });
}

function initRepo(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(dir, "add", "seed.txt");
  git(dir, "commit", "-q", "-m", "seed");
  return dir;
}

function commit(dir: string, file: string, message: string): string {
  writeFileSync(join(dir, file), `${file}\n`);
  git(dir, "add", file);
  git(dir, "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
}

function writeMetadata(dir: string, baseCommit: string): void {
  mkdirSync(join(dir, ".ai/harness/worktrees"), { recursive: true });
  writeFileSync(
    join(dir, ".ai/harness/worktrees/demo.json"),
    JSON.stringify({
      slug: "demo",
      branch: git(dir, "branch", "--show-current"),
      worktree: dir,
      base_branch: "main",
      base_commit: baseCommit,
    }) + "\n",
  );
}

/**
 * The shape actually observed twice in production: a worktree forks from `main`,
 * `main` advances, the worktree is rebased onto it, and the recorded base is
 * never refreshed. The recorded base stays *reachable* from HEAD -- the new
 * `main` grew out of it -- so an ancestry check passes while the diff base is
 * already wrong by every commit `main` gained.
 */
function seedRebasedOntoAdvancedMain(): { dir: string; recorded: string; forkPoint: string } {
  const dir = initRepo("verify-sprint-rebased-");
  const recorded = git(dir, "rev-parse", "HEAD");

  git(dir, "checkout", "-q", "-b", "feat");
  commit(dir, "feat.txt", "contract work");

  git(dir, "checkout", "-q", "main");
  const forkPoint = commit(dir, "main-only.txt", "main advances");

  git(dir, "checkout", "-q", "feat");
  git(dir, "rebase", "-q", "main");

  writeMetadata(dir, recorded);
  return { dir, recorded, forkPoint };
}

/** A rebase onto a diverged base: the recorded commit leaves the branch outright. */
function seedOrphanedBase(): string {
  const dir = initRepo("verify-sprint-orphan-");

  git(dir, "checkout", "-q", "-b", "abandoned");
  const orphan = commit(dir, "abandoned.txt", "abandoned base");

  git(dir, "checkout", "-q", "main");
  commit(dir, "work.txt", "work");

  writeMetadata(dir, orphan);
  return dir;
}

/** Healthy: the worktree forked from `main` and `main` has not moved since. */
function seedHealthy(): string {
  const dir = initRepo("verify-sprint-healthy-");
  const forkPoint = git(dir, "rev-parse", "HEAD");

  git(dir, "checkout", "-q", "-b", "feat");
  commit(dir, "feat.txt", "contract work");

  writeMetadata(dir, forkPoint);
  return dir;
}

describe("verify-sprint contract worktree base guard", () => {
  test("fires when the branch was rebased onto an advanced main and the base still reaches HEAD", () => {
    const { dir, recorded, forkPoint } = seedRebasedOntoAdvancedMain();
    try {
      // The precondition that made an ancestry-based guard useless here: the
      // stale base is still reachable from HEAD, so `--is-ancestor` succeeds.
      const ancestry = spawnSync(REAL_GIT!, ["merge-base", "--is-ancestor", recorded, "HEAD"], { cwd: dir });
      expect(ancestry.status).toBe(0);

      const result = runHelper(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("base_commit is stale");
      expect(result.stderr).toContain(recorded);
      expect(result.stderr).toContain(forkPoint);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fails closed when the recorded base left the branch entirely", () => {
    const dir = seedOrphanedBase();
    try {
      const result = runHelper(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("base_commit is stale");
      expect(result.stderr).toContain(".ai/harness/worktrees/<slug>.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not fire when the recorded base is still the fork point", () => {
    const dir = seedHealthy();
    try {
      const result = runHelper(dir);
      expect(result.stderr).not.toContain("base_commit is stale");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
