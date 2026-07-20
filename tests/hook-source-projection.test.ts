import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { spawnSync } from "child_process";
import {
  collectProjectionFiles,
  readProjectionFile,
  writeProjectionFileAtomic,
} from "../src/core/source-projection";
import { workflowSurfaceParityErrors } from "../scripts/sync-hook-sources";

const ROOT = join(import.meta.dir, "..");
const ASSETS_HOOKS = join(ROOT, "assets/hooks");
const AI_HOOKS = join(ROOT, ".ai/hooks");
const MARKER_PATH = join(AI_HOOKS, ".projection.json");

type Manifest = {
  version: number;
  canonical_root: string;
  projection_target: string;
  package_only: string[];
  repo_only: string[];
};

function rel(path: string, root: string): string {
  return relative(root, path).replaceAll("\\", "/");
}

function collectFiles(root: string, current = root): string[] {
  const entries = readdirSync(current).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(current, entry);
    const stat = lstatSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(root, fullPath));
      continue;
    }
    if (stat.isFile()) files.push(rel(fullPath, root));
  }

  return files;
}

function normalizedMode(path: string): "100644" | "100755" {
  return (statSync(path).mode & 0o111) === 0 ? "100644" : "100755";
}

function digest(files: readonly string[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    const fullPath = join(ASSETS_HOOKS, file);
    hash.update(file);
    hash.update("\0");
    hash.update(normalizedMode(fullPath));
    hash.update("\0");
    hash.update(readFileSync(fullPath));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(join(ASSETS_HOOKS, "projection.json"), "utf-8")) as Manifest;
}

describe("hook source projection", () => {
  test("check command accepts the checked-in projection", () => {
    const res = spawnSync("bun", ["scripts/sync-hook-sources.ts", "--check"], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("projection OK");
    expect(res.stderr).toBe("");
  });

  test("manifest classifies package-only files and no repo-only drift", () => {
    const manifest = readManifest();
    expect(manifest).toEqual({
      version: 1,
      canonical_root: "assets/hooks",
      projection_target: ".ai/hooks",
      package_only: ["projection.json"],
      repo_only: [],
    });

    for (const packageOnly of manifest.package_only) {
      expect(existsSync(join(ASSETS_HOOKS, packageOnly))).toBe(true);
      expect(existsSync(join(AI_HOOKS, packageOnly))).toBe(false);
    }
  });

  test("self-host projection matches canonical bytes and executable bits", () => {
    const manifest = readManifest();
    const packageOnly = new Set(manifest.package_only);
    const managedAssets = collectFiles(ASSETS_HOOKS).filter((file) => !packageOnly.has(file));
    const projected = collectFiles(AI_HOOKS).filter((file) => file !== ".projection.json");

    expect(projected).toEqual(managedAssets);

    for (const file of managedAssets) {
      const assetPath = join(ASSETS_HOOKS, file);
      const projectedPath = join(AI_HOOKS, file);
      expect(readFileSync(projectedPath)).toEqual(readFileSync(assetPath));
      expect(normalizedMode(projectedPath)).toBe(normalizedMode(assetPath));
    }
  });

  test("generated marker is deterministic and path-independent", () => {
    const manifest = readManifest();
    const managedAssets = collectFiles(ASSETS_HOOKS).filter(
      (file) => !new Set(manifest.package_only).has(file),
    );
    const marker = JSON.parse(readFileSync(MARKER_PATH, "utf-8")) as {
      version: number;
      canonical_root: string;
      projection_target: string;
      manifest: string;
      digest: string;
      file_count: number;
      generated_at?: string;
      repo_root?: string;
    };

    expect(marker).toEqual({
      version: 1,
      canonical_root: "assets/hooks",
      projection_target: ".ai/hooks",
      manifest: "assets/hooks/projection.json",
      digest: digest(managedAssets),
      file_count: managedAssets.length,
    });
    expect(marker.generated_at).toBeUndefined();
    expect(marker.repo_root).toBeUndefined();
  });

  test("write mode is idempotent for an already-synced projection", () => {
    const before = new Map(
      collectFiles(AI_HOOKS).map((file) => [
        file,
        {
          mode: normalizedMode(join(AI_HOOKS, file)),
          content: readFileSync(join(AI_HOOKS, file), "utf-8"),
        },
      ]),
    );

    const res = spawnSync("bun", ["scripts/sync-hook-sources.ts", "--write"], {
      cwd: ROOT,
      encoding: "utf-8",
    });

    expect(res.status).toBe(0);
    expect(res.stdout).toContain("projected");
    expect(res.stderr).toBe("");

    const after = new Map(
      collectFiles(AI_HOOKS).map((file) => [
        file,
        {
          mode: normalizedMode(join(AI_HOOKS, file)),
          content: readFileSync(join(AI_HOOKS, file), "utf-8"),
        },
      ]),
    );
    expect(after).toEqual(before);
  });

  test("projection reads reject symlinked roots and ancestor directories", () => {
    const tmp = mkdtempSync(join(tmpdir(), "source-projection-read-"));
    const sourceRoot = join(tmp, "source");
    const sourceLink = join(tmp, "source-link");
    const outside = join(tmp, "outside");
    try {
      mkdirSync(sourceRoot);
      mkdirSync(outside);
      writeFileSync(join(sourceRoot, "local.sh"), "#!/bin/bash\n");
      writeFileSync(join(outside, "escaped.sh"), "#!/bin/bash\n");
      symlinkSync(sourceRoot, sourceLink);

      expect(() => collectProjectionFiles(sourceLink)).toThrow("projection root must not be a symlink");

      symlinkSync(outside, join(sourceRoot, "nested"));
      expect(() => readProjectionFile(sourceRoot, "nested/escaped.sh")).toThrow(
        "symlink is not allowed in projection path",
      );
      expect(() => collectProjectionFiles(sourceRoot)).toThrow("symlink is not allowed in source projection");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // HRD-03 retired assets/hooks/pre-edit-guard.sh (the real file this test
  // used to read to prove workflowSurfaceParityErrors "accepts the real
  // checked-in shape") along with the hand-copied is_workflow_surface_path()
  // bash predicate it carried -- mutation-guard.ts imports isWorkflowSurfacePath
  // from diff-fingerprint.ts directly now, so there is no real bash file
  // left with this shape to read. The synthetic-source tests below continue
  // to prove workflowSurfaceParityErrors' own parsing/comparison logic
  // (kept exported as general, reusable infrastructure -- see
  // scripts/sync-hook-sources.ts) without depending on a real file.

  function guardSourceWithCaseLines(caseLines: readonly string[]): string {
    return [
      "is_workflow_surface_path() {",
      '  case "$1" in',
      ...caseLines,
      "    *) return 1 ;;",
      "  esac",
      "}",
    ].join("\n");
  }

  test("workflowSurfaceParityErrors passes for exactly the two expected case pattern lines", () => {
    const source = guardSourceWithCaseLines([
      "    plans/*|tasks/*|docs/*|.ai/*|.claude/*|.codex/*) return 0 ;;",
      "    *.md|*.markdown) return 0 ;;",
    ]);
    expect(workflowSurfaceParityErrors(source)).toEqual([]);
  });

  test("workflowSurfaceParityErrors catches an undeclared third case pattern appended after the two expected lines (regression: index-only comparison missed this)", () => {
    // Before this fix, workflowSurfaceParityErrors (then inline in
    // checkWorkflowSurfaceParity) only compared patternLines[0] and
    // patternLines[1] against the expected directory/extension patterns.
    // Both still match exactly here -- a third "return 0" arm appended after
    // them was invisible to that comparison, so a hand-added shell-side
    // exemption with no TS-side counterpart passed --check silently.
    const source = guardSourceWithCaseLines([
      "    plans/*|tasks/*|docs/*|.ai/*|.claude/*|.codex/*) return 0 ;;",
      "    *.md|*.markdown) return 0 ;;",
      "    bogus/*) return 0 ;;",
    ]);
    const errors = workflowSurfaceParityErrors(source);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.includes("expected exactly 2"))).toBe(true);
    expect(errors.some((error) => error.includes("found 3"))).toBe(true);
  });

  test("workflowSurfaceParityErrors still catches drift in either of the two expected lines", () => {
    const source = guardSourceWithCaseLines([
      "    plans/*|tasks/*) return 0 ;;",
      "    *.md|*.markdown) return 0 ;;",
    ]);
    const errors = workflowSurfaceParityErrors(source);
    expect(errors.some((error) => error.includes("directory prefixes expected"))).toBe(true);
  });

  test("workflowSurfaceParityErrors reports a missing function distinctly", () => {
    expect(workflowSurfaceParityErrors("#!/bin/bash\necho no function here\n")).toEqual([
      "assets/hooks/pre-edit-guard.sh: is_workflow_surface_path() function not found",
    ]);
  });

  test("projection writes reject symlinked roots, symlinked parents, and repo escapes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "source-projection-write-"));
    const repoRoot = join(tmp, "repo");
    const repoLink = join(tmp, "repo-link");
    const outside = join(tmp, "outside");
    try {
      mkdirSync(join(repoRoot, ".ai"), { recursive: true });
      mkdirSync(outside);
      symlinkSync(repoRoot, repoLink);

      expect(() =>
        writeProjectionFileAtomic(repoLink, join(repoLink, ".ai", "hooks", "test.sh"), "safe\n", "100644"),
      ).toThrow("projection root must not be a symlink");

      symlinkSync(outside, join(repoRoot, ".ai", "hooks"));
      expect(() =>
        writeProjectionFileAtomic(repoRoot, join(repoRoot, ".ai", "hooks", "test.sh"), "safe\n", "100644"),
      ).toThrow("symlink is not allowed in projection parent");
      expect(existsSync(join(outside, "test.sh"))).toBe(false);

      expect(() =>
        writeProjectionFileAtomic(repoRoot, join(repoRoot, "..", "escaped.sh"), "safe\n", "100644"),
      ).toThrow("projection path escapes root");
      expect(existsSync(join(tmp, "escaped.sh"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
