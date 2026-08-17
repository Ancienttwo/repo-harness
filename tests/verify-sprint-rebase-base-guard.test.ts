import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { delimiter, dirname, join } from "path";
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

function runHelper(cwd: string, extraEnv: Record<string, string> = {}) {
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
  return spawnSync("bash", [HELPER], { cwd, encoding: "utf-8", env: { ...isolated, ...extraEnv } });
}

/** A PATH carrying everything the helper needs except `jq`. */
function pathWithoutJq(cwd: string): string {
  const shim = join(cwd, "nojq-bin");
  mkdirSync(shim, { recursive: true });
  for (const tool of ["git", "bash", "sed", "awk", "grep", "cat", "head", "tail", "cut", "sort",
    "tr", "wc", "mktemp", "date", "basename", "dirname", "rm", "mkdir", "env", "find", "xargs", "printf"]) {
    const resolved = Bun.which(tool);
    if (!resolved) continue;
    spawnSync("ln", ["-sf", resolved, join(shim, tool)]);
  }
  return shim;
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

function writeMetadata(dir: string, name: string, record: Record<string, unknown>): void {
  const target = join(dir, ".ai/harness/worktrees", name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(record)}\n`);
}

function selfMetadata(dir: string, name: string, extra: Record<string, unknown>): void {
  writeMetadata(dir, name, {
    slug: "demo",
    branch: git(dir, "branch", "--show-current"),
    worktree: dir,
    base_branch: "main",
    ...extra,
  });
}

/**
 * The shape observed twice in production: a worktree forks from `main`, `main`
 * advances, the worktree is rebased onto it, and the recorded base is never
 * refreshed. The recorded base stays reachable from HEAD -- the new `main` grew
 * out of it -- so an ancestry check passes while the diff base is already wrong
 * by every commit `main` gained.
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

  selfMetadata(dir, "demo.json", { base_commit: recorded });
  return { dir, recorded, forkPoint };
}

/** Healthy: the worktree forked from `main` and `main` has not moved since. */
function seedHealthy(): string {
  const dir = initRepo("verify-sprint-healthy-");
  const forkPoint = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "-b", "feat");
  commit(dir, "feat.txt", "contract work");
  selfMetadata(dir, "demo.json", { base_commit: forkPoint });
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
      expect(result.stderr).toContain("reason=stale_base_commit");
      expect(result.stderr).toContain(recorded);
      expect(result.stderr).toContain(forkPoint);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not fire when the recorded base is still the fork point", () => {
    const dir = seedHealthy();
    try {
      expect(runHelper(dir).stderr).not.toContain("reason=");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an all-empty exact-worktree record cannot mask a stale record behind it", () => {
    // Regression guard for the reproduced bypass. The previous row emitter
    // skipped a row only when it serialized to the empty string; an all-empty
    // record serializes to two separators, so the guard consumed it and
    // returned silently while the resolver walked past it to the stale base in
    // the next file. Now one selector picks that record for both sides, and a
    // record carrying no base at all is malformed rather than ignorable.
    const { dir, recorded } = seedRebasedOntoAdvancedMain();
    try {
      // The empty record must be the only exact-worktree match, so the seeded
      // one gives way to it; the stale base survives as a branch-only record.
      rmSync(join(dir, ".ai/harness/worktrees/demo.json"));
      writeMetadata(dir, "00-empty.json", { worktree: dir, base_commit: "", base_branch: "", started_at: "" });
      writeMetadata(dir, "10-stale.json", { branch: "feat", base_commit: recorded, base_branch: "main" });

      const result = runHelper(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("reason=metadata_malformed");
      expect(result.stderr).toContain("00-empty.json");
      // The stale base in the second file must never surface as the diff base.
      expect(result.stderr).not.toContain(recorded);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("two records claiming the same worktree path fail closed", () => {
    const dir = seedHealthy();
    try {
      selfMetadata(dir, "a.json", { base_commit: git(dir, "rev-parse", "HEAD") });
      selfMetadata(dir, "b.json", { base_commit: git(dir, "rev-parse", "HEAD") });
      const result = runHelper(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("reason=duplicate_exact_worktree_metadata");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an exact-worktree record outranks a branch-only record", () => {
    const { dir, recorded, forkPoint } = seedRebasedOntoAdvancedMain();
    try {
      // Exact match is current; the branch-only record is stale and must be ignored.
      // seedRebasedOntoAdvancedMain already wrote demo.json as the exact record,
      // so refresh that one rather than adding a second exact match.
      selfMetadata(dir, "demo.json", { base_commit: forkPoint });
      writeMetadata(dir, "10-branch.json", { branch: "feat", base_commit: recorded, base_branch: "main" });
      expect(runHelper(dir).stderr).not.toContain("reason=");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a record missing base_branch fails closed instead of being skipped", () => {
    const dir = seedHealthy();
    try {
      writeMetadata(dir, "demo.json", { worktree: dir, base_commit: git(dir, "rev-parse", "HEAD"), base_branch: "" });
      const result = runHelper(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("reason=metadata_malformed");
      expect(result.stderr).toContain("missing: base_branch");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an unresolvable base_branch fails closed", () => {
    const dir = seedHealthy();
    try {
      selfMetadata(dir, "demo.json", { base_commit: git(dir, "rev-parse", "HEAD"), base_branch: "no-such-branch" });
      const result = runHelper(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("reason=base_ref_unresolvable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("invalid JSON in a metadata file fails closed and names the file", () => {
    const dir = seedHealthy();
    try {
      writeFileSync(join(dir, ".ai/harness/worktrees/broken.json"), "{not json\n");
      const result = runHelper(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("reason=metadata_unparseable");
      expect(result.stderr).toContain("broken.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("metadata present with no JSON parser fails closed rather than disabling the guard", () => {
    const { dir } = seedRebasedOntoAdvancedMain();
    try {
      const shim = pathWithoutJq(dir);
      const result = runHelper(dir, { PATH: shim });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("reason=parser_unavailable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a worktree started from a source ahead of base_branch is not reported as a rebase", () => {
    const dir = initRepo("verify-sprint-stacked-");
    try {
      git(dir, "checkout", "-q", "-b", "parent");
      const sourceHead = commit(dir, "parent.txt", "parent work");
      git(dir, "checkout", "-q", "-b", "contract");
      commit(dir, "contract.txt", "contract work");
      selfMetadata(dir, "demo.json", { base_commit: sourceHead });

      const result = runHelper(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("reason=stacked_source_start");
      expect(result.stderr).not.toContain("reason=stale_base_commit");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("criss-cross history with several best merge bases is its own class", () => {
    const dir = initRepo("verify-sprint-crisscross-");
    try {
      const root = git(dir, "rev-parse", "HEAD");
      git(dir, "checkout", "-q", "-b", "a1");
      const a1 = commit(dir, "a1.txt", "a1");
      git(dir, "checkout", "-q", root);
      git(dir, "checkout", "-q", "-b", "b1");
      const b1 = commit(dir, "b1.txt", "b1");

      git(dir, "checkout", "-q", "-b", "feat", a1);
      git(dir, "merge", "-q", "--no-edit", b1);
      git(dir, "branch", "-f", "main", b1);
      git(dir, "checkout", "-q", "main");
      git(dir, "merge", "-q", "--no-edit", a1);
      git(dir, "checkout", "-q", "feat");

      const bases = git(dir, "merge-base", "--all", "HEAD", "main").split("\n").filter(Boolean);
      if (bases.length < 2) return; // fixture did not produce ambiguity on this git build

      selfMetadata(dir, "demo.json", { base_commit: bases[0] });
      const result = runHelper(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("reason=ambiguous_merge_base");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a base_branch lagging its upstream fails closed instead of passing on the stale local ref", () => {
    const upstream = initRepo("verify-sprint-upstream-");
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "verify-sprint-clone-")));
    try {
      commit(upstream, "main-only.txt", "main advances");
      spawnSync(REAL_GIT!, ["clone", "-q", upstream, dir], { encoding: "utf-8" });
      git(dir, "config", "user.email", "test@example.com");
      git(dir, "config", "user.name", "Test");
      // Local `main` deliberately behind its own remote-tracking ref. Move off
      // main first: a checked-out branch cannot be force-updated.
      git(dir, "checkout", "-q", "-b", "feat");
      git(dir, "branch", "-f", "main", "feat~1");
      commit(dir, "feat.txt", "contract work");
      selfMetadata(dir, "demo.json", { base_commit: git(dir, "merge-base", "HEAD", "main") });

      const result = runHelper(dir);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("reason=base_ref_unsynchronized");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(upstream, { recursive: true, force: true });
    }
  });

  test("an explicit diff-base override suppresses the guard", () => {
    const { dir, forkPoint } = seedRebasedOntoAdvancedMain();
    try {
      const result = runHelper(dir, { REPO_HARNESS_DIFF_BASE: forkPoint });
      expect(result.stderr).not.toContain("reason=");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
