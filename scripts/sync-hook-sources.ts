#!/usr/bin/env bun
import {
  existsSync,
  lstatSync,
  readFileSync,
} from "fs";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import {
  assertSafeProjectionPath,
  collectProjectionFiles,
  digestProjectionFiles,
  normalizedProjectionMode,
  sameProjectionBytes,
  writeProjectionFileAtomic,
  type ProjectionFileRecord,
} from "../src/core/source-projection";
import {
  WORKFLOW_SURFACE_DIR_PREFIXES,
  WORKFLOW_SURFACE_EXTENSIONS,
} from "../src/cli/hook/diff-fingerprint";

type Mode = "check" | "write";

type ProjectionManifest = {
  version: number;
  canonical_root: string;
  projection_target: string;
  package_only?: string[];
  repo_only?: string[];
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
    assertSafeProjectionPath(relPath, "projection manifest");
  }
  return manifest;
}

function markerFor(files: readonly ProjectionFileRecord[]): ProjectionMarker {
  return {
    version: 1,
    canonical_root: "assets/hooks",
    projection_target: ".ai/hooks",
    manifest: "assets/hooks/projection.json",
    digest: digestProjectionFiles(files),
    file_count: files.length,
  };
}

function markerText(marker: ProjectionMarker): string {
  return `${JSON.stringify(marker, null, 2)}\n`;
}

// Phase C2: assets/hooks/pre-edit-guard.sh's is_workflow_surface_path() case
// list is a hand-authored shell projection of the canonical TS source
// (src/cli/hook/diff-fingerprint.ts's WORKFLOW_SURFACE_DIR_PREFIXES /
// WORKFLOW_SURFACE_EXTENSIONS). There is no automatic fix for a mismatch --
// unlike file-content projection, this check always fails closed in both
// --check and --write, naming which side to edit.
//
// Exported as a pure function of the shell source text (rather than only a
// no-arg wrapper that reads the real file) so a drift scenario -- e.g. a
// third case arm added to the shell function that the TS side never declared
// -- can be unit tested directly without mutating the real, checked-in
// assets/hooks/pre-edit-guard.sh on disk.
export function workflowSurfaceParityErrors(source: string): string[] {
  const functionMatch = /is_workflow_surface_path\(\)\s*\{([\s\S]*?)\n\}/.exec(source);
  if (!functionMatch) {
    return ["assets/hooks/pre-edit-guard.sh: is_workflow_surface_path() function not found"];
  }
  const patternLines = [...functionMatch[1].matchAll(/^\s*([^\s)\n][^)\n]*)\)\s*return 0\s*;;\s*$/gm)]
    .map((match) => match[1]);

  const expectedDirPattern = WORKFLOW_SURFACE_DIR_PREFIXES.map((prefix) => `${prefix}*`).join("|");
  const expectedExtPattern = WORKFLOW_SURFACE_EXTENSIONS.map((ext) => `*${ext}`).join("|");

  const errors: string[] = [];
  // Guards against a case list that grew (or shrank) a "return 0" pattern
  // line without the TS canonical source changing to match -- comparing only
  // patternLines[0]/[1] by index would silently accept an extra, undeclared
  // pattern line appended after the two expected ones.
  if (patternLines.length !== 2) {
    errors.push(
      `is_workflow_surface_path drift: expected exactly 2 "return 0" case pattern lines (directory prefixes, extensions), found ${patternLines.length}: ${JSON.stringify(patternLines)}`,
    );
  }
  if (patternLines[0] !== expectedDirPattern) {
    errors.push(
      `is_workflow_surface_path drift: directory prefixes expected "${expectedDirPattern}" got "${patternLines[0] ?? "<missing>"}"`,
    );
  }
  if (patternLines[1] !== expectedExtPattern) {
    errors.push(
      `is_workflow_surface_path drift: extensions expected "${expectedExtPattern}" got "${patternLines[1] ?? "<missing>"}"`,
    );
  }
  return errors;
}

function checkWorkflowSurfaceParity(): string[] {
  const guardPath = join(CANONICAL_ROOT, "pre-edit-guard.sh");
  if (!existsSync(guardPath)) {
    return ["missing assets/hooks/pre-edit-guard.sh: cannot check is_workflow_surface_path parity"];
  }
  return workflowSurfaceParityErrors(readFileSync(guardPath, "utf-8"));
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));
  const manifest = readManifest();
  const packageOnly = new Set(manifest.package_only ?? []);
  const repoOnly = new Set(manifest.repo_only ?? []);
  const errors: string[] = [];

  const canonicalFiles = collectProjectionFiles(CANONICAL_ROOT);
  const managedFiles = canonicalFiles.filter((file) => !packageOnly.has(file.relPath));
  const marker = markerFor(managedFiles);
  const expectedMarker = markerText(marker);

  for (const packagePath of packageOnly) {
    if (!existsSync(join(CANONICAL_ROOT, packagePath))) {
      errors.push(`package_only path does not exist in assets/hooks: ${packagePath}`);
    }
  }

  const targetFiles = existsSync(TARGET_ROOT) ? collectProjectionFiles(TARGET_ROOT) : [];
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

  const parityErrors = checkWorkflowSurfaceParity();
  if (parityErrors.length > 0) {
    for (const error of parityErrors) process.stderr.write(`[hooks] ${error}\n`);
    process.stderr.write(
      "[hooks] Keep assets/hooks/pre-edit-guard.sh's is_workflow_surface_path() case list in sync with src/cli/hook/diff-fingerprint.ts's WORKFLOW_SURFACE_DIR_PREFIXES / WORKFLOW_SURFACE_EXTENSIONS.\n",
    );
    process.exit(1);
  }

  const drift: string[] = [];
  const blockedDrift: string[] = [];
  for (const file of managedFiles) {
    const targetPath = join(TARGET_ROOT, file.relPath);
    if (!existsSync(targetPath)) {
      drift.push(`missing managed file: .ai/hooks/${file.relPath}`);
      if (mode === "write") writeProjectionFileAtomic(REPO_ROOT, targetPath, file.bytes, file.mode);
      continue;
    }

    const targetStat = lstatSync(targetPath);
    if (targetStat.isSymbolicLink()) {
      drift.push(`target symlink is not allowed: .ai/hooks/${file.relPath}`);
      blockedDrift.push(`target symlink is not allowed: .ai/hooks/${file.relPath}`);
      continue;
    }
    if (!targetStat.isFile()) {
      drift.push(`target is not a file: .ai/hooks/${file.relPath}`);
      blockedDrift.push(`target is not a file: .ai/hooks/${file.relPath}`);
      continue;
    }

    const targetBytes = readFileSync(targetPath);
    const targetMode = normalizedProjectionMode(targetPath);
    if (!sameProjectionBytes(targetBytes, file.bytes)) {
      drift.push(`content drift: .ai/hooks/${file.relPath}`);
    }
    if (targetMode !== file.mode) {
      drift.push(`mode drift: .ai/hooks/${file.relPath} expected ${file.mode} got ${targetMode}`);
    }
    if (mode === "write" && (!sameProjectionBytes(targetBytes, file.bytes) || targetMode !== file.mode)) {
      writeProjectionFileAtomic(REPO_ROOT, targetPath, file.bytes, file.mode);
    }
  }

  if (!existsSync(MARKER_PATH)) {
    drift.push(`missing generated marker: .ai/hooks/${MARKER_REL_PATH}`);
    if (mode === "write") writeProjectionFileAtomic(REPO_ROOT, MARKER_PATH, expectedMarker, "100644");
  } else {
    const currentMarker = readFileSync(MARKER_PATH, "utf-8");
    if (currentMarker !== expectedMarker) {
      drift.push(`generated marker drift: .ai/hooks/${MARKER_REL_PATH}`);
      if (mode === "write") writeProjectionFileAtomic(REPO_ROOT, MARKER_PATH, expectedMarker, "100644");
    }
  }

  if (mode === "check" && drift.length > 0) {
    for (const item of drift) process.stderr.write(`[hooks] ${item}\n`);
    process.stderr.write("[hooks] Edit assets/hooks/<path>, then run bun run sync:hooks.\n");
    process.exit(1);
  }

  if (mode === "write" && blockedDrift.length > 0) {
    for (const item of blockedDrift) process.stderr.write(`[hooks] ${item}\n`);
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

// Guarded so importing this module (e.g. to unit test workflowSurfaceParityErrors)
// never runs main()/process.exit() as an import side effect; only running the
// script directly (`bun scripts/sync-hook-sources.ts`) triggers it.
if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[hooks] ${message}\n`);
    process.exit(1);
  }
}
