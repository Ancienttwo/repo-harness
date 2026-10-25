#!/usr/bin/env bun
import { createHash } from "crypto";
import { existsSync, lstatSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  collectProjectionFiles,
  digestProjectionFiles,
  normalizedProjectionMode,
  sameProjectionBytes,
  writeProjectionFileAtomic,
  type ProjectionFileRecord,
} from "../src/core/source-projection";

type Mode = "check" | "write";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const CANONICAL_ROOT = join(REPO_ROOT, "scripts");
const TARGET_ROOT = join(REPO_ROOT, "assets", "templates", "helpers");
const CAPABILITY_HELPER = "capability-resolver.ts";
const CAPABILITY_CORE = join(REPO_ROOT, "src", "core", "capabilities", "registry.ts");
const CAPABILITY_RESOLVER = join(REPO_ROOT, "src", "core", "capabilities", "resolver.ts");
const GIT_RUNNER = join(REPO_ROOT, "src/effects/git/runner.ts");
const READONLY_OBSERVATION = join(REPO_ROOT, "src/effects/state/readonly-observation.ts");
const CAPABILITY_EFFECTS = join(REPO_ROOT, "src", "effects", "capabilities", "capability-resolver.ts");

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

function stripInlinedImports(source: string, specifiers: readonly string[]): string {
  const targets = new Set(specifiers);
  return source.replace(
    /(?:^|\n)(?:import\s+[\s\S]*?\sfrom\s+["']([^"']+)["'];|export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+["']([^"']+)["'];)/g,
    (full, importSpecifier: string | undefined, exportSpecifier: string | undefined) => {
      const specifier = importSpecifier || exportSpecifier;
      if (!specifier || !targets.has(specifier)) return full;
      return full.startsWith("\n") ? "\n" : "";
    },
  );
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
  if (!existsSync(CAPABILITY_RESOLVER) || !existsSync(CAPABILITY_EFFECTS)) {
    throw new Error("canonical capability resolver library is missing under src/core/capabilities or src/effects/capabilities");
  }
  const core = readFileSync(CAPABILITY_CORE, "utf-8");
  const resolver = stripInlinedImports(readFileSync(CAPABILITY_RESOLVER, "utf-8"), ["./registry"]);
  const observation = readFileSync(READONLY_OBSERVATION, "utf-8");
  const gitRunner = stripInlinedImports(readFileSync(GIT_RUNNER, "utf-8"), ["../state/readonly-observation"]);
  const effects = stripInlinedImports(readFileSync(CAPABILITY_EFFECTS, "utf-8"), [
    "../../core/capabilities/registry",
    "../../core/capabilities/resolver",
    "../git/runner",
  ]);
  const sourceHash = createHash("sha256").update(core).digest("hex");
  const content = [
    "#!/usr/bin/env bun",
    `// @generated-from src/core/capabilities/registry.ts sha256:${sourceHash}`,
    "// Standalone typed Bun projection. Regenerate from the capability resolver library; do not edit by hand.",
    core.trimEnd(),
    resolver.trim(),
    observation.trim(),
    gitRunner.trim(),
    effects.trim(),
  ].join("\n") + "\n";
  return {
    relPath: CAPABILITY_HELPER,
    bytes: Buffer.from(content),
    mode: "100755",
  };
}

function main(): void {
  const mode = parseMode(process.argv.slice(2));
  for (const [source, name] of [
    ['src/core/worktree-location.mjs', 'worktree-location.mjs'],
    ['src/core/decision/pane-status.mjs', 'pane-status.mjs'],
  ]) {
    const bytes = readFileSync(join(REPO_ROOT, source!));
    const target = join(REPO_ROOT, 'assets/herdr/webhook-notify', name!);
    if (mode === 'write') writeProjectionFileAtomic(REPO_ROOT, target, bytes, 0o644);
    else if (!existsSync(target) || !sameProjectionBytes(readFileSync(target), bytes)) throw new Error(`Herdr ${name} projection drift`);
  }
  const sourceFiles = [buildCapabilityProjection()];
  const errors: string[] = [];

  const targetFiles = existsSync(TARGET_ROOT) ? collectProjectionFiles(TARGET_ROOT) : [];
  for (const targetFile of targetFiles) {
    if (targetFile.relPath !== CAPABILITY_HELPER) {
      errors.push(`unclassified package helper: assets/templates/helpers/${targetFile.relPath}`);
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
    process.stderr.write("[helpers] Edit scripts/capability-resolver.ts or src/core/capabilities/registry.ts, then run bun run sync:helpers.\n");
    process.exit(1);
  }

  if (mode === "write" && blockedDrift.length > 0) {
    for (const item of blockedDrift) process.stderr.write(`[helpers] ${item}\n`);
    process.exit(1);
  }

  const digest = digestProjectionFiles(sourceFiles);
  if (mode === "write") {
    process.stdout.write(
      `[helpers] projected the standalone capability resolver to assets/templates/helpers (${digest})\n`,
    );
    return;
  }

  process.stdout.write(
    `[helpers] projection OK: standalone capability resolver (${digest})\n`,
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[helpers] ${message}\n`);
  process.exit(1);
}
