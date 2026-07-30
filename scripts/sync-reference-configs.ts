#!/usr/bin/env bun
import { existsSync, lstatSync, readdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  digestProjectionFiles,
  readProjectionFile,
  sameProjectionBytes,
  writeProjectionFileAtomic,
  type ProjectionFileRecord,
} from "../src/core/source-projection";

type Mode = "check" | "write";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CANONICAL_ROOT = join(REPO_ROOT, "assets", "reference-configs");
const TARGET_ROOT = join(REPO_ROOT, "docs", "reference-configs");

function usage(): never {
  process.stderr.write("Usage: bun scripts/sync-reference-configs.ts [--check|--write]\n");
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

/**
 * Canonical inventory: every `.md` directly under assets/reference-configs.
 * docs/reference-configs may hold additional docs-only files (install profiles,
 * MCP guides, contract brief examples); those are outside the projection and
 * are neither checked nor removed.
 */
export function referenceConfigInventory(root: string = CANONICAL_ROOT): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));
  const inventory = referenceConfigInventory();
  if (inventory.length === 0) {
    process.stderr.write("[reference-configs] canonical source has no markdown files\n");
    process.exit(1);
  }

  const sourceFiles: ProjectionFileRecord[] = inventory.map((name) =>
    readProjectionFile(CANONICAL_ROOT, name),
  );

  const drift: string[] = [];
  const blockedDrift: string[] = [];

  for (const sourceFile of sourceFiles) {
    const targetPath = join(TARGET_ROOT, sourceFile.relPath);
    if (!existsSync(targetPath)) {
      drift.push(`missing projected doc: docs/reference-configs/${sourceFile.relPath}`);
      if (mode === "write") {
        writeProjectionFileAtomic(REPO_ROOT, targetPath, sourceFile.bytes, "100644");
      }
      continue;
    }

    const targetStat = lstatSync(targetPath);
    if (targetStat.isSymbolicLink()) {
      const message = `target symlink is not allowed: docs/reference-configs/${sourceFile.relPath}`;
      drift.push(message);
      blockedDrift.push(message);
      continue;
    }
    if (!targetStat.isFile()) {
      const message = `target is not a file: docs/reference-configs/${sourceFile.relPath}`;
      drift.push(message);
      blockedDrift.push(message);
      continue;
    }

    const targetBytes = readFileSync(targetPath);
    if (!sameProjectionBytes(targetBytes, sourceFile.bytes)) {
      drift.push(`content drift: docs/reference-configs/${sourceFile.relPath}`);
      if (mode === "write") {
        writeProjectionFileAtomic(REPO_ROOT, targetPath, sourceFile.bytes, "100644");
      }
    }
  }

  if (mode === "check" && drift.length > 0) {
    for (const item of drift) process.stderr.write(`[reference-configs] ${item}\n`);
    process.stderr.write(
      "[reference-configs] Edit assets/reference-configs/<doc>.md, then run bun run sync:reference-configs.\n",
    );
    process.exit(1);
  }

  if (mode === "write" && blockedDrift.length > 0) {
    for (const item of blockedDrift) process.stderr.write(`[reference-configs] ${item}\n`);
    process.exit(1);
  }

  const digest = digestProjectionFiles(sourceFiles);
  if (mode === "write") {
    process.stdout.write(
      `[reference-configs] projected ${sourceFiles.length} docs from assets/reference-configs to docs/reference-configs (${digest})\n`,
    );
    return;
  }

  process.stdout.write(
    `[reference-configs] projection OK: ${sourceFiles.length} docs (${digest})\n`,
  );
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[reference-configs] ${message}\n`);
    process.exit(1);
  }
}
