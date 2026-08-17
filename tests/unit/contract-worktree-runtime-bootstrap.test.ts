import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

// A fresh linked worktree has none of the gitignored runtime artifacts the
// verification gates read, and neither resulting failure names its cause: a
// missing dependency tree reads as `state=missing`, a missing code index reads
// as `unresolved-major-change` across every capability. `start` seeds both so
// that diagnosis is paid once rather than once per worktree. These tests pin
// the seeding and, more importantly, pin that it never opts an operator into
// tooling their primary worktree has not already adopted.

const ROOT = join(import.meta.dir, "..", "..");
const COPIES = [
  "scripts/contract-worktree.sh",
  "assets/templates/helpers/contract-worktree.sh",
] as const;

function sourceOf(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf-8");
}

/** Evaluate the bootstrap function alone, so the surrounding script's start-up
 *  side effects stay out of the way. */
function runBootstrap(
  scriptPath: string,
  worktreePath: string,
  repoRoot: string,
  pathPrefix: string | null,
): { status: number | null; stdout: string; stderr: string } {
  const extract = `eval "$(sed -n '/^bootstrap_worktree_runtime() {/,/^}/p' "$1")"`;
  const env: NodeJS.ProcessEnv = { ...process.env, REPO_ROOT: repoRoot };
  if (pathPrefix !== null) env.PATH = pathPrefix;
  const result = spawnSync(
    "bash",
    ["-c", `set -euo pipefail; ${extract}; bootstrap_worktree_runtime "$2"`, "bash", join(ROOT, scriptPath), worktreePath],
    { env, encoding: "utf-8" },
  );
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function tempDirs(): { worktree: string; repoRoot: string; cleanup: () => void } {
  const base = mkdtempSync(join(tmpdir(), "worktree-bootstrap-"));
  const worktree = join(base, "worktree");
  const repoRoot = join(base, "primary");
  mkdirSync(worktree, { recursive: true });
  mkdirSync(repoRoot, { recursive: true });
  return { worktree, repoRoot, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

describe("contract-worktree runtime bootstrap: wiring", () => {
  test("both paired copies define the bootstrap and call it from start", () => {
    for (const relative of COPIES) {
      const body = sourceOf(relative);
      expect(body).toContain("bootstrap_worktree_runtime() {");
      // The call must land inside start_worktree and before the plan copy, so a
      // worktree is usable by the time any downstream helper runs in it.
      const start = body.indexOf("start_worktree() {");
      const call = body.indexOf('bootstrap_worktree_runtime "$worktree_path"', start);
      const copy = body.indexOf('copy_plan_into_worktree "$plan_file" "$worktree_path"', start);
      expect(start).toBeGreaterThan(-1);
      expect(call).toBeGreaterThan(start);
      expect(copy).toBeGreaterThan(call);
    }
  });

  test("the paired copies stay byte-identical", () => {
    const [script, helper] = COPIES.map((relative) => readFileSync(join(ROOT, relative)));
    expect(script!.equals(helper!)).toBe(true);
  });

  test("failure messages name the downstream symptom, not just the failed command", () => {
    // The whole point of this slice is that `state=missing` and
    // `unresolved-major-change` cost two layers of diagnosis to trace back here.
    const body = sourceOf(COPIES[0]);
    expect(body).toContain("no verification gate can run in this worktree");
    expect(body).toContain("unresolved-major-change for every capability");
  });
});

describe("contract-worktree runtime bootstrap: behavior", () => {
  test("a worktree with no manifest and no adopted tooling is left alone", () => {
    const { worktree, repoRoot, cleanup } = tempDirs();
    try {
      const result = runBootstrap(COPIES[0], worktree, repoRoot, null);
      expect(result.status).toBe(0);
      expect(existsSync(join(worktree, "node_modules"))).toBe(false);
      expect(existsSync(join(worktree, ".codegraph"))).toBe(false);
    } finally {
      cleanup();
    }
  });

  test("codegraph is not indexed when the primary worktree never adopted it", () => {
    // An adopter without a .codegraph directory has declined indexing. Seeding
    // one for them would be start inventing an adoption decision.
    const { worktree, repoRoot, cleanup } = tempDirs();
    const shim = mkdtempSync(join(tmpdir(), "worktree-bootstrap-bin-"));
    try {
      writeFileSync(join(shim, "codegraph"), "#!/bin/sh\nmkdir -p .codegraph\ntouch .codegraph/codegraph.db\n", { mode: 0o755 });
      const result = runBootstrap(COPIES[0], worktree, repoRoot, `${shim}:${process.env.PATH ?? ""}`);
      expect(result.status).toBe(0);
      expect(existsSync(join(worktree, ".codegraph", "codegraph.db"))).toBe(false);
    } finally {
      rmSync(shim, { recursive: true, force: true });
      cleanup();
    }
  });

  test("codegraph is indexed once the primary worktree has adopted it", () => {
    const { worktree, repoRoot, cleanup } = tempDirs();
    const shim = mkdtempSync(join(tmpdir(), "worktree-bootstrap-bin-"));
    try {
      mkdirSync(join(repoRoot, ".codegraph"), { recursive: true });
      writeFileSync(join(shim, "codegraph"), "#!/bin/sh\nmkdir -p .codegraph\ntouch .codegraph/codegraph.db\n", { mode: 0o755 });
      const result = runBootstrap(COPIES[0], worktree, repoRoot, `${shim}:${process.env.PATH ?? ""}`);
      expect(result.status).toBe(0);
      expect(existsSync(join(worktree, ".codegraph", "codegraph.db"))).toBe(true);
    } finally {
      rmSync(shim, { recursive: true, force: true });
      cleanup();
    }
  });

  test("an existing index is not rebuilt, so reusing a worktree stays cheap", () => {
    const { worktree, repoRoot, cleanup } = tempDirs();
    const shim = mkdtempSync(join(tmpdir(), "worktree-bootstrap-bin-"));
    try {
      mkdirSync(join(repoRoot, ".codegraph"), { recursive: true });
      mkdirSync(join(worktree, ".codegraph"), { recursive: true });
      writeFileSync(join(worktree, ".codegraph", "codegraph.db"), "existing");
      writeFileSync(join(shim, "codegraph"), "#!/bin/sh\necho reindexed > .codegraph/codegraph.db\n", { mode: 0o755 });
      const result = runBootstrap(COPIES[0], worktree, repoRoot, `${shim}:${process.env.PATH ?? ""}`);
      expect(result.status).toBe(0);
      expect(readFileSync(join(worktree, ".codegraph", "codegraph.db"), "utf-8")).toBe("existing");
    } finally {
      rmSync(shim, { recursive: true, force: true });
      cleanup();
    }
  });

  test("a failing codegraph init stops start instead of deferring the confusion", () => {
    const { worktree, repoRoot, cleanup } = tempDirs();
    const shim = mkdtempSync(join(tmpdir(), "worktree-bootstrap-bin-"));
    try {
      mkdirSync(join(repoRoot, ".codegraph"), { recursive: true });
      writeFileSync(join(shim, "codegraph"), "#!/bin/sh\nexit 3\n", { mode: 0o755 });
      const result = runBootstrap(COPIES[0], worktree, repoRoot, `${shim}:${process.env.PATH ?? ""}`);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("unresolved-major-change for every capability");
    } finally {
      rmSync(shim, { recursive: true, force: true });
      cleanup();
    }
  });
});
