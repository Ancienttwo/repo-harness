import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { run, tmpWorkspace } from "../helpers/repo-fixture";

setDefaultTimeout(30000);

const CLI = join(import.meta.dir, "..", "..", "src", "cli", "index.ts");

function brain(cwd: string, args: string[], brainRoot: string) {
  return run("bun", [CLI, "brain", ...args, "--repo", cwd], cwd, { REPO_HARNESS_BRAIN_ROOT: brainRoot });
}

describe("repo-harness brain", () => {
  test("brain sync mirrors opted-in repo docs and brain check reports drift", () => {
    const cwd = tmpWorkspace("brain-sync");
    try {
      const brainRoot = join(cwd, "brain");
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(brainRoot, { recursive: true });

      writeFileSync(join(cwd, "docs/valuable.md"), "# Valuable Doc\n\nStable project knowledge.\n");
      writeFileSync(
        join(cwd, ".ai/harness/brain-manifest.json"),
        JSON.stringify(
          {
            version: 1,
            project: "demo",
            mode: "repo-contract-external-knowledge",
            default_brain_path: "brain/demo/*",
            entries: [
              {
                id: "valuable",
                role: "repo-authored",
                repo_path: "docs/valuable.md",
                brain_path: "brain/demo/references/valuable.md",
                sync: { direction: "repo-to-brain" },
              },
            ],
          },
          null,
          2
        ) + "\n"
      );

      const syncRes = brain(cwd, ["sync"], brainRoot);
      expect(syncRes.status).toBe(0);
      expect(syncRes.stdout).toContain("Synced: 1");

      const brainFile = join(brainRoot, "demo/references/valuable.md");
      expect(readFileSync(brainFile, "utf-8")).toContain("Stable project knowledge.");

      const checkRes = brain(cwd, ["check"], brainRoot);
      expect(checkRes.status).toBe(0);
      expect(checkRes.stdout).toContain("Skipped/up-to-date: 1");

      writeFileSync(join(cwd, "docs/valuable.md"), "# Valuable Doc\n\nUpdated knowledge.\n");
      const driftRes = brain(cwd, ["check"], brainRoot);
      expect(driftRes.status).toBe(1);
      expect(driftRes.stdout).toContain("Brain file differs for valuable");

      const changedRes = brain(cwd, ["sync", "--changed", "docs/valuable.md"], brainRoot);
      expect(changedRes.status).toBe(0);
      expect(readFileSync(brainFile, "utf-8")).toContain("Updated knowledge.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("brain sync rejects repo and brain symlink escapes", () => {
    const cwd = tmpWorkspace("brain-sync-symlink");
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "brain-sync-outside-")));
    try {
      const brainRoot = join(cwd, "brain");
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(join(brainRoot, "demo/references"), { recursive: true });
      mkdirSync(outside, { recursive: true });
      writeFileSync(join(outside, "source.md"), "# Outside\n");
      symlinkSync(join(outside, "source.md"), join(cwd, "docs/valuable.md"));
      writeFileSync(
        join(cwd, ".ai/harness/brain-manifest.json"),
        JSON.stringify(
          {
            version: 1,
            project: "demo",
            mode: "repo-contract-external-knowledge",
            default_brain_path: "brain/demo/*",
            entries: [
              {
                id: "valuable",
                role: "repo-authored",
                repo_path: "docs/valuable.md",
                brain_path: "brain/demo/references/valuable.md",
                sync: { direction: "repo-to-brain" },
              },
            ],
          },
          null,
          2
        ) + "\n"
      );

      const sourceRes = brain(cwd, ["sync"], brainRoot);
      expect(sourceRes.status).toBe(1);
      expect(sourceRes.stdout).toContain("Entry valuable source_path resolves outside repo");

      rmSync(join(cwd, "docs/valuable.md"));
      writeFileSync(join(cwd, "docs/valuable.md"), "# Valuable\n");
      writeFileSync(join(outside, "target.md"), "# Old outside target\n");
      symlinkSync(join(outside, "target.md"), join(brainRoot, "demo/references/valuable.md"));

      const targetRes = brain(cwd, ["sync"], brainRoot);
      expect(targetRes.status).toBe(1);
      expect(targetRes.stdout).toContain("brain file symlink escapes brain root");
      expect(readFileSync(join(outside, "target.md"), "utf-8")).toContain("Old outside target");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, 30_000);

  test("repo-harness run fails on the retired brain helper ids", () => {
    const cwd = tmpWorkspace("brain-retired-helper");
    try {
      for (const [helper, replacement] of [
        ["check-brain-manifest", "repo-harness brain check"],
        ["sync-brain-docs", "repo-harness brain sync"],
      ]) {
        const res = run("bun", [CLI, "run", helper], cwd);
        expect(res.status).toBe(2);
        expect(res.stderr).toContain(`helper "${helper}" is retired`);
        expect(res.stderr).toContain(replacement);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
