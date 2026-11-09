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
} from "../src/effects/source-projection";
import { TOOL_CATALOG, type ToolCatalogV1 } from "../src/core/tools/catalog";
import { REVIEW_HAZARDS, REVIEW_HIGH_LIST, type ReviewHazardsV1, type ReviewHighListV1, type ReviewPathEntry } from "../src/core/board/hazards";

type Mode = "check" | "write";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CANONICAL_ROOT = join(REPO_ROOT, "assets", "reference-configs");
const TARGET_ROOT = join(REPO_ROOT, "docs", "reference-configs");
/** The canonical doc whose resource table assets/tool-catalog.v1.json owns. */
const CATALOG_DOC = "external-tooling.md";
const CATALOG_BEGIN = "<!-- tool-catalog:resources:begin -->";
const CATALOG_END = "<!-- tool-catalog:resources:end -->";
/** The canonical doc whose change hazard table assets/review-hazards.v1.json owns. */
const HAZARDS_DOC = "agentic-development-flow.md";
const HAZARDS_BEGIN = "<!-- review-hazards:list:begin -->";
const HAZARDS_END = "<!-- review-hazards:list:end -->";
/** The High list table of the same doc, owned by assets/review-high-list.v1.json. */
const HIGH_LIST_BEGIN = "<!-- review-high-list:list:begin -->";
const HIGH_LIST_END = "<!-- review-high-list:list:end -->";

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

function pathCell(entry: ReviewPathEntry): string {
  return entry.path_visible ? entry.paths.map((path) => `\`${path}\``).join(", ") : "None (`path_visible: false`)";
}

function hazardTable(list: ReviewHazardsV1): string {
  return [
    "The board rule R3 reads only the rows with `path_visible: true`: a changed path that matches one of their patterns is a hit. Reviewers apply every row.",
    "",
    "| Hazard | Paths that R3 reads |",
    "| --- | --- |",
    ...list.hazards.map((hazard) => `| ${hazard.text} | ${pathCell(hazard)} |`),
  ].join("\n");
}

function highListTable(list: ReviewHighListV1): string {
  return [
    "The board rule R5 reads only the rows with `path_visible: true`: a changed path that matches one of their patterns is a hit. Reviewers apply every row to the whole diff; a path outside the patterns can still be High.",
    "",
    "| High signal | Paths that R5 reads |",
    "| --- | --- |",
    ...list.signals.map((signal) => `| ${signal.text} | ${pathCell(signal)} |`),
  ].join("\n");
}

/**
 * Returns `markdown` with the text between `beginMarker` and `endMarker`
 * replaced by `body`. The doc must hold exactly one marker pair; a missing
 * pair fails instead of skipping the region.
 */
function renderRegion(markdown: string, doc: string, beginMarker: string, endMarker: string, body: string): string {
  const begin = markdown.indexOf(beginMarker);
  const end = markdown.indexOf(endMarker);
  if (
    begin < 0 || end < begin
    || markdown.indexOf(beginMarker, begin + 1) >= 0
    || markdown.indexOf(endMarker, end + 1) >= 0
  ) {
    throw new Error(`${doc} must hold exactly one ${beginMarker} ... ${endMarker} region`);
  }
  return `${markdown.slice(0, begin + beginMarker.length)}\n${body}\n${markdown.slice(end)}`;
}

/** Renders the resource table of external-tooling.md from `catalog`. */
export function renderToolCatalogRegion(markdown: string, catalog: ToolCatalogV1): string {
  return renderRegion(markdown, CATALOG_DOC, CATALOG_BEGIN, CATALOG_END, resourceTable(catalog));
}

/** Renders the change hazard table of agentic-development-flow.md from `list`. */
export function renderHazardRegion(markdown: string, list: ReviewHazardsV1): string {
  return renderRegion(markdown, HAZARDS_DOC, HAZARDS_BEGIN, HAZARDS_END, hazardTable(list));
}

/** Renders the High list table of agentic-development-flow.md from `list`. */
export function renderHighListRegion(markdown: string, list: ReviewHighListV1): string {
  return renderRegion(markdown, HAZARDS_DOC, HIGH_LIST_BEGIN, HIGH_LIST_END, highListTable(list));
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

  // The generated regions are rendered into the canonical docs before projection.
  const regions = [
    { doc: CATALOG_DOC, label: "tool catalog", render: (markdown: string) => renderToolCatalogRegion(markdown, TOOL_CATALOG) },
    { doc: HAZARDS_DOC, label: "review hazards", render: (markdown: string) => renderHazardRegion(markdown, REVIEW_HAZARDS) },
    { doc: HAZARDS_DOC, label: "review high list", render: (markdown: string) => renderHighListRegion(markdown, REVIEW_HIGH_LIST) },
  ];
  for (const region of regions) {
    const file = readProjectionFile(CANONICAL_ROOT, region.doc);
    const rendered = region.render(file.bytes.toString("utf8"));
    if (rendered !== file.bytes.toString("utf8")) {
      drift.push(`${region.label} drift: assets/reference-configs/${region.doc}`);
      if (mode === "write") {
        writeProjectionFileAtomic(REPO_ROOT, join(CANONICAL_ROOT, region.doc), rendered, file.mode);
      }
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
      "[reference-configs] Edit assets/reference-configs/<doc>.md, assets/tool-catalog.v1.json or assets/review-hazards.v1.json, then run bun run sync:reference-configs.\n",
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
