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

import { copyHelpers } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("sync-brain-docs helper integration", () => {
  test("sync-brain-docs mirrors opted-in repo docs and checks drift", () => {
    const cwd = tmpWorkspace("helper-sync-brain-docs");
    try {
      copyHelpers(cwd);
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

      const syncRes = run("bash", ["scripts/sync-brain-docs.sh", "--all"], cwd, {
        REPO_HARNESS_BRAIN_ROOT: brainRoot,
      });
      expect(syncRes.status).toBe(0);
      expect(syncRes.stdout).toContain("[BrainSync] synced docs/valuable.md");

      const brainFile = join(brainRoot, "demo/references/valuable.md");
      expect(readFileSync(brainFile, "utf-8")).toContain("Stable project knowledge.");

      const checkRes = run("bash", ["scripts/sync-brain-docs.sh", "--check"], cwd, {
        REPO_HARNESS_BRAIN_ROOT: brainRoot,
      });
      expect(checkRes.status).toBe(0);
      expect(checkRes.stdout).toContain("[BrainSync] OK");

      writeFileSync(join(cwd, "docs/valuable.md"), "# Valuable Doc\n\nUpdated knowledge.\n");
      const changedRes = run("bash", ["scripts/sync-brain-docs.sh", "--changed", "docs/valuable.md"], cwd, {
        REPO_HARNESS_BRAIN_ROOT: brainRoot,
      });
      expect(changedRes.status).toBe(0);
      expect(readFileSync(brainFile, "utf-8")).toContain("Updated knowledge.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("sync-brain-docs should reject repo and brain symlink escapes", () => {
    const cwd = tmpWorkspace("helper-sync-brain-docs-symlink");
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "helper-sync-brain-docs-outside-")));
    try {
      copyHelpers(cwd);
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

      const sourceRes = run("bash", ["scripts/sync-brain-docs.sh", "--all"], cwd, {
        REPO_HARNESS_BRAIN_ROOT: brainRoot,
      });
      expect(sourceRes.status).toBe(1);
      expect(sourceRes.stdout).toContain("source file symlink escapes repo");

      rmSync(join(cwd, "docs/valuable.md"));
      writeFileSync(join(cwd, "docs/valuable.md"), "# Valuable\n");
      writeFileSync(join(outside, "target.md"), "# Old outside target\n");
      symlinkSync(join(outside, "target.md"), join(brainRoot, "demo/references/valuable.md"));

      const targetRes = run("bash", ["scripts/sync-brain-docs.sh", "--all"], cwd, {
        REPO_HARNESS_BRAIN_ROOT: brainRoot,
      });
      expect(targetRes.status).toBe(1);
      expect(targetRes.stdout).toContain("brain file symlink escapes brain root");
      expect(readFileSync(join(outside, "target.md"), "utf-8")).toContain("Old outside target");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, 30_000);
});
