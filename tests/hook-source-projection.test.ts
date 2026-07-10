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
