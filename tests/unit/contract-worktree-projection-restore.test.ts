import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "../..");
const SCRIPT = join(ROOT, "scripts/contract-worktree.sh");
const MANIFEST = "docs/architecture/.projection-manifest.json";
const MIXED_DOC = "docs/architecture/modules/capability-demo.md";

/**
 * Runs the shipped `restore_machine_owned_projection_output` against a scratch repository.
 *
 * The function is extracted from the real script rather than reimplemented, so the test fails if
 * the shipped classification drifts. Sourcing the whole script is not an option: it executes a
 * closeout on import.
 */
function restore(repo: string): { stderr: string; status: string } {
  const helper = readFileSync(SCRIPT, "utf-8");
  const start = helper.indexOf("MACHINE_OWNED_PROJECTION_PATH=");
  expect(start).toBeGreaterThan(-1);
  const end = helper.indexOf("\n}\n", helper.indexOf("restore_machine_owned_projection_output()", start));
  expect(end).toBeGreaterThan(start);
  const source = helper.slice(start, end + 3);

  const run = spawnSync("bash", ["-c", `${source}\nrestore_machine_owned_projection_output "$1"`, "bash", repo], {
    cwd: repo,
    encoding: "utf-8",
  });
  expect(run.status).toBe(0);
  const after = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repo, encoding: "utf-8" });
  // Only trailing whitespace: porcelain encodes "unstaged" as a leading space in the XY column.
  return { stderr: run.stderr, status: after.stdout.trimEnd() };
}

function scratchRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "rh-projection-restore-"));
  const git = (...args: string[]) => spawnSync("git", args, { cwd: repo, encoding: "utf-8" });
  git("init", "-q");
  git("config", "user.email", "harness@example.invalid");
  git("config", "user.name", "Harness");
  mkdirSync(join(repo, "docs/architecture/modules"), { recursive: true });
  writeFileSync(join(repo, MANIFEST), '{"targets":[]}\n', "utf-8");
  writeFileSync(join(repo, MIXED_DOC), "# demo\n\n## 3. P3\n\nHuman-authored.\n", "utf-8");
  git("add", "-A");
  git("commit", "-qm", "base");
  return repo;
}

describe("contract-worktree machine-owned projection restore", () => {
  test("an unstaged manifest re-stamp is restored so the closeout is not blocked by it", () => {
    const repo = scratchRepo();
    try {
      writeFileSync(join(repo, MANIFEST), '{"targets":[],"restamped":true}\n', "utf-8");
      const { stderr, status } = restore(repo);

      expect(status).toBe("");
      expect(stderr).toContain(`restored machine-owned projection output to HEAD: ${MANIFEST}`);
      expect(readFileSync(join(repo, MANIFEST), "utf-8")).toBe('{"targets":[]}\n');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("a staged manifest change carries an intent this cannot read, so it still blocks", () => {
    const repo = scratchRepo();
    try {
      writeFileSync(join(repo, MANIFEST), '{"targets":[],"staged":true}\n', "utf-8");
      spawnSync("git", ["add", MANIFEST], { cwd: repo, encoding: "utf-8" });
      const { stderr, status } = restore(repo);

      expect(status).toBe(`M  ${MANIFEST}`);
      expect(stderr).toBe("");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("a mixed-ownership capability document is never discarded", () => {
    const repo = scratchRepo();
    try {
      writeFileSync(join(repo, MIXED_DOC), "# demo\n\n## 3. P3\n\nHuman-authored, edited.\n", "utf-8");
      const { stderr, status } = restore(repo);

      // §3/§4 are hand-written and no projection can regenerate them: the closeout must keep
      // refusing rather than restore this file.
      expect(status).toBe(` M ${MIXED_DOC}`);
      expect(stderr).toBe("");
      expect(readFileSync(join(repo, MIXED_DOC), "utf-8")).toContain("edited");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("a clean worktree is a silent no-op", () => {
    const repo = scratchRepo();
    try {
      const { stderr, status } = restore(repo);
      expect(status).toBe("");
      expect(stderr).toBe("");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("the packaged helper stays byte-identical to the repo-local script", () => {
    expect(readFileSync(join(ROOT, "assets/templates/helpers/contract-worktree.sh"), "utf-8"))
      .toBe(readFileSync(SCRIPT, "utf-8"));
  });
});
