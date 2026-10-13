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
import { TOOL_CATALOG, type ToolCatalogV1 } from "../src/core/tools/catalog";

type Mode = "check" | "write";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CANONICAL_ROOT = join(REPO_ROOT, "assets", "reference-configs");
const TARGET_ROOT = join(REPO_ROOT, "docs", "reference-configs");
/** The canonical doc whose resource table assets/tool-catalog.v1.json owns. */
const CATALOG_DOC = "external-tooling.md";
const CATALOG_BEGIN = "<!-- tool-catalog:resources:begin -->";
const CATALOG_END = "<!-- tool-catalog:resources:end -->";

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

function resourceTable(catalog: ToolCatalogV1): string {
  const rows = catalog.tools
    .filter((tool) => tool.kind === "resource")
    .map((tool) => `| [\`${tool.name}\`](${tool.url}) | ${tool.summary.en} | ${tool.license ?? "Unknown"} |`);
  return ["| Repo | Use it for | License |", "| --- | --- | --- |", ...rows].join("\n");
}

/**
 * Returns `markdown` with the text between the catalog markers rendered from
 * `catalog`. The doc must hold exactly one marker pair; a missing pair fails
 * instead of skipping the table.
 */
export function renderToolCatalogRegion(markdown: string, catalog: ToolCatalogV1): string {
  const begin = markdown.indexOf(CATALOG_BEGIN);
  const end = markdown.indexOf(CATALOG_END);
  if (
    begin < 0 || end < begin
    || markdown.indexOf(CATALOG_BEGIN, begin + 1) >= 0
    || markdown.indexOf(CATALOG_END, end + 1) >= 0
  ) {
    throw new Error(`${CATALOG_DOC} must hold exactly one ${CATALOG_BEGIN} ... ${CATALOG_END} region`);
  }
  return `${markdown.slice(0, begin + CATALOG_BEGIN.length)}\n${resourceTable(catalog)}\n${markdown.slice(end)}`;
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));
  const inventory = referenceConfigInventory();
  if (inventory.length === 0) {
    process.stderr.write("[reference-configs] canonical source has no markdown files\n");
    process.exit(1);
  }

  const drift: string[] = [];
  const blockedDrift: string[] = [];

  // The catalog table is rendered into the canonical doc before projection.
  const catalogDoc = readProjectionFile(CANONICAL_ROOT, CATALOG_DOC);
  const renderedDoc = renderToolCatalogRegion(catalogDoc.bytes.toString("utf8"), TOOL_CATALOG);
  if (renderedDoc !== catalogDoc.bytes.toString("utf8")) {
    drift.push(`tool catalog drift: assets/reference-configs/${CATALOG_DOC}`);
    if (mode === "write") {
      writeProjectionFileAtomic(REPO_ROOT, join(CANONICAL_ROOT, CATALOG_DOC), renderedDoc, catalogDoc.mode);
    }
  }

  const sourceFiles: ProjectionFileRecord[] = inventory.map((name) =>
    readProjectionFile(CANONICAL_ROOT, name),
  );

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
      "[reference-configs] Edit assets/reference-configs/<doc>.md or assets/tool-catalog.v1.json, then run bun run sync:reference-configs.\n",
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
