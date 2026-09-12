import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  copyFileSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { HELPER_DIR } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("worktree-merge-lib.sh batch entrypoint", () => {
  function mergeLibFixture(): string {
    const cwd = tmpWorkspace("worktree-merge-lib-batch");
    mkdirSync(join(cwd, "scripts"), { recursive: true });
    copyFileSync(join(HELPER_DIR, "worktree-merge-lib.sh"), join(cwd, "scripts/worktree-merge-lib.sh"));
    initGitRepo(cwd);
    writeFileSync(join(cwd, "README.md"), "# merge lib\n");
    commitAll(cwd, "init");

    // ancestor: branch tip is reachable from main.
    expect(run("git", ["branch", "codex/ancestor-demo"], cwd).status).toBe(0);

    // absorbed: squash-merged, so the tip is never an ancestor of main.
    expect(run("git", ["checkout", "-q", "-b", "codex/absorbed-demo"], cwd).status).toBe(0);
    writeFileSync(join(cwd, "absorbed.txt"), "absorbed\n");
    commitAll(cwd, "absorbed feature");
    expect(run("git", ["checkout", "-q", "main"], cwd).status).toBe(0);
    expect(run("git", ["merge", "--squash", "codex/absorbed-demo"], cwd).status).toBe(0);
    commitAll(cwd, "squash absorbed");

    // unmerged: main does not have this content in any form.
    expect(run("git", ["checkout", "-q", "-b", "codex/unmerged-demo"], cwd).status).toBe(0);
    writeFileSync(join(cwd, "unmerged.txt"), "unmerged\n");
    commitAll(cwd, "unmerged feature");
    expect(run("git", ["checkout", "-q", "main"], cwd).status).toBe(0);
    return cwd;
  }

  test("prints one <branch>\\t<mode> line per input branch, in input order", () => {
    const cwd = mergeLibFixture();
    try {
      const res = run(
        "bash",
        [
          "scripts/worktree-merge-lib.sh",
          "--target",
          "main",
          "codex/unmerged-demo",
          "codex/absorbed-demo",
          "codex/ancestor-demo",
        ],
        cwd,
      );
      expect(res.status).toBe(0);
      expect(res.stdout).toBe(
        [
          "codex/unmerged-demo\tunmerged",
          "codex/absorbed-demo\tabsorbed",
          "codex/ancestor-demo\tancestor",
          "",
        ].join("\n"),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("sourcing stays side-effect free: no output, function still callable", () => {
    const cwd = mergeLibFixture();
    try {
      const res = run(
        "bash",
        [
          "-c",
          'set -euo pipefail; source scripts/worktree-merge-lib.sh --target main codex/absorbed-demo; echo "sourced"; worktree_merge_mode codex/absorbed-demo main',
        ],
        cwd,
      );
      expect(res.status).toBe(0);
      // The `--target ...` words are positional parameters of the source call
      // and must be ignored; the entrypoint may not run under `source`.
      expect(res.stdout).toBe("sourced\nabsorbed\n");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("missing --target fails closed with exit 2 and no classification output", () => {
    const cwd = mergeLibFixture();
    try {
      const res = run("bash", ["scripts/worktree-merge-lib.sh", "codex/absorbed-demo"], cwd);
      expect(res.status).toBe(2);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("--target <ref> is required");

      const unknown = run("bash", ["scripts/worktree-merge-lib.sh", "--bogus"], cwd);
      expect(unknown.status).toBe(2);
      expect(unknown.stdout).toBe("");
      expect(unknown.stderr).toContain("unknown option: --bogus");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
