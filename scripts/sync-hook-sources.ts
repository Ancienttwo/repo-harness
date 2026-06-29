#!/usr/bin/env bun
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";
import { dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";

type Mode = "check" | "write";

type ProjectionManifest = {
  version: number;
  canonical_root: string;
  projection_target: string;
  package_only?: string[];
  repo_only?: string[];
};

type FileRecord = {
  relPath: string;
  absPath: string;
  bytes: Buffer;
  mode: "100644" | "100755";
  sha256: string;
};

type ProjectionMarker = {
  version: 1;
  canonical_root: "assets/hooks";
  projection_target: ".ai/hooks";
  manifest: "assets/hooks/projection.json";
  digest: string;
  file_count: number;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CANONICAL_ROOT = join(REPO_ROOT, "assets", "hooks");
const TARGET_ROOT = join(REPO_ROOT, ".ai", "hooks");
const MANIFEST_PATH = join(CANONICAL_ROOT, "projection.json");
const MARKER_REL_PATH = ".projection.json";
const MARKER_PATH = join(TARGET_ROOT, MARKER_REL_PATH);

function usage(): never {
  process.stderr.write("Usage: bun scripts/sync-hook-sources.ts [--check|--write]\n");
  process.exit(2);
}

function parseMode(argv: string[]): Mode {
  let mode: Mode = "check";
  for (const arg of argv) {
    if (arg === "--check") {
      mode = "check";
      continue;
    }
    if (arg === "--write") {
      mode = "write";
      continue;
    }
    usage();
  }
  return mode;
}

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

function assertSafeRelativePath(relPath: string, field: string): void {
  if (!relPath || relPath.startsWith("/") || relPath.includes("\\")) {
    throw new Error(`${field} contains invalid path: ${relPath}`);
  }
  const parts = relPath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`${field} contains unsafe path segment: ${relPath}`);
  }
}

function normalizedMode(absPath: string): "100644" | "100755" {
  return (lstatSync(absPath).mode & 0o111) === 0 ? "100644" : "100755";
}

function modeToPerm(mode: "100644" | "100755"): number {
  return mode === "100755" ? 0o755 : 0o644;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readManifest(): ProjectionManifest {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`missing projection manifest: ${relative(REPO_ROOT, MANIFEST_PATH)}`);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as ProjectionManifest;
  if (manifest.version !== 1) {
    throw new Error(`unsupported projection manifest version: ${manifest.version}`);
  }
  if (manifest.canonical_root !== "assets/hooks") {
    throw new Error(`projection canonical_root must be assets/hooks`);
  }
  if (manifest.projection_target !== ".ai/hooks") {
    throw new Error(`projection_target must be .ai/hooks`);
  }
  for (const relPath of [...(manifest.package_only ?? []), ...(manifest.repo_only ?? [])]) {
    assertSafeRelativePath(relPath, "projection manifest");
  }
  return manifest;
}

function collectFiles(root: string, current = root): FileRecord[] {
  const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const out: FileRecord[] = [];

  for (const entry of entries) {
    const absPath = join(current, entry.name);
    const relPath = toPosixPath(relative(root, absPath));
    if (entry.isSymbolicLink()) {
      throw new Error(`symlink is not allowed in hook projection: ${relPath}`);
    }
    if (entry.isDirectory()) {
      out.push(...collectFiles(root, absPath));
      continue;
    }
    if (!entry.isFile()) continue;

    const bytes = readFileSync(absPath);
    out.push({
      relPath,
      absPath,
      bytes,
      mode: normalizedMode(absPath),
      sha256: sha256(bytes),
    });
  }

  return out;
}

function digestManagedFiles(files: readonly FileRecord[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relPath);
    hash.update("\0");
    hash.update(file.mode);
    hash.update("\0");
    hash.update(file.bytes);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function markerFor(files: readonly FileRecord[]): ProjectionMarker {
  return {
    version: 1,
    canonical_root: "assets/hooks",
    projection_target: ".ai/hooks",
    manifest: "assets/hooks/projection.json",
    digest: digestManagedFiles(files),
    file_count: files.length,
  };
}

function markerText(marker: ProjectionMarker): string {
  return `${JSON.stringify(marker, null, 2)}\n`;
}

function sameBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}

function writeAtomic(absPath: string, bytes: Buffer | string, mode: "100644" | "100755"): void {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmp = join(dirname(absPath), `.${relative(REPO_ROOT, absPath).replaceAll("/", "-")}.${process.pid}.tmp`);
  writeFileSync(tmp, bytes);
  chmodSync(tmp, modeToPerm(mode));
  renameSync(tmp, absPath);
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));
  const manifest = readManifest();
  const packageOnly = new Set(manifest.package_only ?? []);
  const repoOnly = new Set(manifest.repo_only ?? []);
  const errors: string[] = [];

  const canonicalFiles = collectFiles(CANONICAL_ROOT);
  const managedFiles = canonicalFiles.filter((file) => !packageOnly.has(file.relPath));
  const marker = markerFor(managedFiles);
  const expectedMarker = markerText(marker);

  for (const packagePath of packageOnly) {
    if (!existsSync(join(CANONICAL_ROOT, packagePath))) {
      errors.push(`package_only path does not exist in assets/hooks: ${packagePath}`);
    }
  }

  const targetFiles = existsSync(TARGET_ROOT) ? collectFiles(TARGET_ROOT) : [];
  const allowedTargetFiles = new Set([
    ...managedFiles.map((file) => file.relPath),
    ...repoOnly,
    MARKER_REL_PATH,
  ]);

  for (const targetFile of targetFiles) {
    if (!allowedTargetFiles.has(targetFile.relPath)) {
      errors.push(`unclassified .ai/hooks drift: ${targetFile.relPath}`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`[hooks] ${error}\n`);
    process.stderr.write("[hooks] Edit assets/hooks/projection.json to classify drift, or remove the unclassified target file deliberately.\n");
    process.exit(1);
  }

  const drift: string[] = [];
  for (const file of managedFiles) {
    const targetPath = join(TARGET_ROOT, file.relPath);
    if (!existsSync(targetPath)) {
      drift.push(`missing managed file: .ai/hooks/${file.relPath}`);
      if (mode === "write") writeAtomic(targetPath, file.bytes, file.mode);
      continue;
    }

    const targetStat = lstatSync(targetPath);
    if (targetStat.isSymbolicLink()) {
      drift.push(`target symlink is not allowed: .ai/hooks/${file.relPath}`);
      continue;
    }
    if (!targetStat.isFile()) {
      drift.push(`target is not a file: .ai/hooks/${file.relPath}`);
      continue;
    }

    const targetBytes = readFileSync(targetPath);
    const targetMode = normalizedMode(targetPath);
    if (!sameBytes(targetBytes, file.bytes)) {
      drift.push(`content drift: .ai/hooks/${file.relPath}`);
    }
    if (targetMode !== file.mode) {
      drift.push(`mode drift: .ai/hooks/${file.relPath} expected ${file.mode} got ${targetMode}`);
    }
    if (mode === "write" && (!sameBytes(targetBytes, file.bytes) || targetMode !== file.mode)) {
      writeAtomic(targetPath, file.bytes, file.mode);
    }
  }

  if (!existsSync(MARKER_PATH)) {
    drift.push(`missing generated marker: .ai/hooks/${MARKER_REL_PATH}`);
    if (mode === "write") writeAtomic(MARKER_PATH, expectedMarker, "100644");
  } else {
    const currentMarker = readFileSync(MARKER_PATH, "utf-8");
    if (currentMarker !== expectedMarker) {
      drift.push(`generated marker drift: .ai/hooks/${MARKER_REL_PATH}`);
      if (mode === "write") writeAtomic(MARKER_PATH, expectedMarker, "100644");
    }
  }

  if (mode === "check" && drift.length > 0) {
    for (const item of drift) process.stderr.write(`[hooks] ${item}\n`);
    process.stderr.write("[hooks] Edit assets/hooks/<path>, then run bun run sync:hooks.\n");
    process.exit(1);
  }

  if (mode === "write") {
    process.stdout.write(
      `[hooks] projected ${managedFiles.length} files from assets/hooks to .ai/hooks (${marker.digest})\n`,
    );
    return;
  }

  process.stdout.write(
    `[hooks] projection OK: ${managedFiles.length} files (${marker.digest})\n`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[hooks] ${message}\n`);
  process.exit(1);
}
