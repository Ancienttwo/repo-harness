#!/usr/bin/env bun
import { createHash } from "crypto";
import { existsSync, lstatSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  collectProjectionFiles,
  digestProjectionFiles,
  normalizedProjectionMode,
  readProjectionFile,
  sameProjectionBytes,
  writeProjectionFileAtomic,
  type ProjectionFileRecord,
} from "../src/core/source-projection";
import { getHelperScripts, loadWorkflowContract } from "./workflow-contract";

type Mode = "check" | "write";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CANONICAL_ROOT = join(REPO_ROOT, "scripts");
const TARGET_ROOT = join(REPO_ROOT, "assets", "templates", "helpers");
const CONTRACT_PATH = join(REPO_ROOT, "assets", "workflow-contract.v1.json");
const CAPABILITY_HELPER = "capability-resolver.ts";
const CAPABILITY_CORE = join(REPO_ROOT, "src", "core", "capabilities", "registry.ts");

function usage(): never {
  process.stderr.write("Usage: bun scripts/sync-helper-sources.ts [--check|--write]\n");
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

function buildCapabilityProjection(): ProjectionFileRecord {
  if (!existsSync(CAPABILITY_CORE)) {
    throw new Error("canonical capability registry source is missing: src/core/capabilities/registry.ts");
  }
  const sourcePath = join(CANONICAL_ROOT, CAPABILITY_HELPER);
  const script = readFileSync(sourcePath, "utf-8");
  const shebang = "#!/usr/bin/env bun\n";
  if (!script.startsWith(shebang)) {
    throw new Error("canonical capability helper must start with the Bun shebang");
  }
  let adapter = script.slice(shebang.length);
  const importEndMarker = '} from "../src/core/capabilities/registry";';
  const importEnd = adapter.indexOf(importEndMarker);
  const importStart = importEnd >= 0 ? adapter.lastIndexOf("import {", importEnd) : -1;
  if (importStart < 0 || importEnd < 0) {
    throw new Error("canonical capability helper must import the canonical registry module exactly once");
  }
  adapter = `${adapter.slice(0, importStart)}${adapter.slice(importEnd + importEndMarker.length).replace(/^\n/, "")}`;
  const typeExport = /^export type \{[^\n]+\} from "\.\.\/src\/core\/capabilities\/registry";\n/m;
  if (!typeExport.test(adapter)) {
    throw new Error("canonical capability helper must re-export canonical registry contract types");
  }
  adapter = adapter.replace(typeExport, "");

  const core = readFileSync(CAPABILITY_CORE, "utf-8");
  const sourceHash = createHash("sha256").update(core).digest("hex");
  const content = [
    "#!/usr/bin/env bun",
    `// @generated-from src/core/capabilities/registry.ts sha256:${sourceHash}`,
    "// Standalone typed Bun projection. Regenerate from scripts/capability-resolver.ts; do not edit by hand.",
    core.trimEnd(),
    adapter.trim(),
  ].join("\n") + "\n";
  return {
    relPath: CAPABILITY_HELPER,
    bytes: Buffer.from(content),
    mode: "100755",
  };
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));
  const contract = loadWorkflowContract(CONTRACT_PATH);
  const inventory = getHelperScripts(contract);
  const inventorySet = new Set(inventory);
  const errors: string[] = [];

  const sourceFiles = inventory.map((name) => {
    const sourcePath = join(CANONICAL_ROOT, name);
    if (!existsSync(sourcePath)) {
      errors.push(`contract helper source is missing: scripts/${name}`);
      return null;
    }
    return name === CAPABILITY_HELPER
      ? buildCapabilityProjection()
      : readProjectionFile(CANONICAL_ROOT, name);
  }).filter((file) => file !== null);

  const targetFiles = existsSync(TARGET_ROOT) ? collectProjectionFiles(TARGET_ROOT) : [];
  for (const targetFile of targetFiles) {
    if (!inventorySet.has(targetFile.relPath)) {
      errors.push(`unclassified package helper: assets/templates/helpers/${targetFile.relPath}`);
    }
  }

  for (const name of inventory) {
    if (!existsSync(join(TARGET_ROOT, name))) {
      if (mode === "check") {
        errors.push(`missing projected helper: assets/templates/helpers/${name}`);
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`[helpers] ${error}\n`);
    process.exit(1);
  }

  const drift: string[] = [];
  const blockedDrift: string[] = [];
  for (const sourceFile of sourceFiles) {
    const targetPath = join(TARGET_ROOT, sourceFile.relPath);
    if (!existsSync(targetPath)) {
      drift.push(`missing projected helper: assets/templates/helpers/${sourceFile.relPath}`);
      if (mode === "write") {
        writeProjectionFileAtomic(REPO_ROOT, targetPath, sourceFile.bytes, sourceFile.mode);
      }
      continue;
    }

    const targetStat = lstatSync(targetPath);
    if (targetStat.isSymbolicLink()) {
      drift.push(`target symlink is not allowed: assets/templates/helpers/${sourceFile.relPath}`);
      blockedDrift.push(`target symlink is not allowed: assets/templates/helpers/${sourceFile.relPath}`);
      continue;
    }
    if (!targetStat.isFile()) {
      drift.push(`target is not a file: assets/templates/helpers/${sourceFile.relPath}`);
      blockedDrift.push(`target is not a file: assets/templates/helpers/${sourceFile.relPath}`);
      continue;
    }

    const targetBytes = readFileSync(targetPath);
    const targetMode = normalizedProjectionMode(targetPath);
    if (!sameProjectionBytes(targetBytes, sourceFile.bytes)) {
      drift.push(`content drift: assets/templates/helpers/${sourceFile.relPath}`);
    }
    if (targetMode !== sourceFile.mode) {
      drift.push(
        `mode drift: assets/templates/helpers/${sourceFile.relPath} expected ${sourceFile.mode} got ${targetMode}`,
      );
    }
    if (
      mode === "write" &&
      (!sameProjectionBytes(targetBytes, sourceFile.bytes) || targetMode !== sourceFile.mode)
    ) {
      writeProjectionFileAtomic(REPO_ROOT, targetPath, sourceFile.bytes, sourceFile.mode);
    }
  }

  if (mode === "check" && drift.length > 0) {
    for (const item of drift) process.stderr.write(`[helpers] ${item}\n`);
    process.stderr.write("[helpers] Edit scripts/<helper>, then run bun run sync:helpers.\n");
    process.exit(1);
  }

  if (mode === "write" && blockedDrift.length > 0) {
    for (const item of blockedDrift) process.stderr.write(`[helpers] ${item}\n`);
    process.exit(1);
  }

  const digest = digestProjectionFiles(sourceFiles);
  if (mode === "write") {
    process.stdout.write(
      `[helpers] projected ${sourceFiles.length} helpers from scripts to assets/templates/helpers (${digest})\n`,
    );
    return;
  }

  process.stdout.write(
    `[helpers] projection OK: ${sourceFiles.length} helpers (${digest})\n`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[helpers] ${message}\n`);
  process.exit(1);
}
