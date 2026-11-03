#!/usr/bin/env bun
// Thin CLI adapter over src/core/skill-surface/catalog.ts for shell callers
// (scripts/sync-codex-installed-copies.sh's facade selection). Resolves the
// manifest and core module relative to this script's own file location, so
// it works when invoked as `bun $SOURCE_ROOT/scripts/skill-surface-select.ts`
// from any cwd, in or out of a dev checkout (package.json "files" ships
// scripts/, src/, and assets/ together). Structural and owner validation run
// here, so this adapter fails closed on an invalid catalog or an unknown
// plugin id before the shell facade sync mutates any skill root.
// fs-existence checking stays opt-out here (same as
// src/cli/installer/install-profile.ts, src/cli/commands/init.ts,
// src/cli/commands/global-runtime.ts, which all skip it too): this adapter
// must keep working against sparse fixture SOURCE_ROOTs whose facade
// directories don't physically exist, exactly like the case-statement it
// replaces did.
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  externalSkillsForSelection,
  facadesForSelection,
  hostSkillPlacements,
  parseSkillSurfaceCatalog,
  type SkillSurfaceCatalog,
} from "../src/core/skill-surface/catalog";
import { parsePluginList, PLUGIN_IDS, type PluginId } from "../src/core/skill-surface/plugin-manifest";
import { syncSkillRoots } from "../src/effects/host-skill-roots";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(SCRIPT_DIR, "..", "assets", "skill-commands", "manifest.json");

function fail(message: string): never {
  console.error(`skill-surface-select: ${message}`);
  process.exit(1);
}

/** `--plugins <ids>` (an empty value selects core only) or `--all-plugins`; undefined when neither is given. */
function parseSelection(args: readonly string[]): readonly PluginId[] | undefined {
  if (args.includes("--all-plugins")) return PLUGIN_IDS;
  const index = args.indexOf("--plugins");
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined) fail("--plugins requires a value");
  try {
    return value === "" ? [] : parsePluginList(value);
  } catch (error) {
    fail((error as Error).message);
  }
}

function loadCatalog(): SkillSurfaceCatalog {
  const source = existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, "utf-8") : null;
  const resolution = parseSkillSurfaceCatalog(source, { declared: true });
  if (resolution.status !== "valid") {
    for (const entry of resolution.diagnostics) {
      console.error(`skill-surface-select: ${entry.code} ${entry.path}: ${entry.message}`);
    }
    fail(`skill-surface catalog invalid or missing: ${MANIFEST_PATH}`);
  }
  return resolution.catalog;
}

async function main(argv: readonly string[]): Promise<void> {
  const [subcommand, ...rest] = argv;
  if (subcommand === "remove-dangling-links") {
    const { removeOwnedDanglingSkillLinks } = await import("../src/effects/skill-tree-integrity");
    for (const link of removeOwnedDanglingSkillLinks(join(SCRIPT_DIR, ".."), rest)) {
      console.log(`[sync-installed] removed dangling skill symlink: ${link}`);
    }
    return;
  }
  if (subcommand === "managed-tree-hash") {
    // Single authority for installed-copy ownership hashes: the shell sync
    // script's owner markers and the TS installer must hash identically.
    const [root] = rest;
    if (!root || rest.length !== 1) fail("managed-tree-hash requires exactly one <root> argument");
    const { hashManagedTree } = await import("../src/effects/managed-tree");
    console.log(hashManagedTree(root));
    return;
  }
  if (subcommand === "installed-copy-files") {
    const [root, surface, contractPath] = rest;
    if (!root || !contractPath || rest.length !== 3 || (surface !== 'canonical-skill' && surface !== 'command-facade')) {
      fail("installed-copy-files requires <root> <canonical-skill|command-facade> <contract>");
    }
    const { installedCopyTreeOptions, managedTreeEntries } = await import("../src/effects/managed-tree");
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
    for (const entry of managedTreeEntries(root, installedCopyTreeOptions(surface, contract))) {
      process.stdout.write(`${entry.path}\0`);
    }
    return;
  }
  const selection = parseSelection(rest);
  const catalog = loadCatalog();

  if (subcommand === "audience-sources") {
    const [audience] = rest;
    if (rest.length !== 1 || (audience !== "bot" && audience !== "worker")) {
      fail("audience-sources requires exactly one <bot|worker> argument");
    }
    for (const pkg of catalog.packages) {
      if (pkg.audience === audience && pkg.source !== null) console.log(`${pkg.name}\t${pkg.source}`);
    }
    return;
  }
  if (subcommand === "facades") {
    if (selection === undefined) fail("facades requires --plugins <ids> or --all-plugins");
    for (const name of facadesForSelection(catalog, selection)) console.log(name);
    return;
  }
  if (subcommand === "selection-projection") {
    if (selection === undefined) fail("selection-projection requires --plugins <ids> or --all-plugins");
    if (!process.env.CODEX_SKILLS_ROOT && !process.env.HOME) fail("HOME is required when CODEX_SKILLS_ROOT is not set.");
    const roots = syncSkillRoots(process.env, process.env.HOME ?? "", selection);
    console.log(`codex-root\t${roots.codex}`);
    console.log(`claude-root\t${roots.claude ?? ""}`);
    console.log(`pi-root\t${roots.pi ?? ""}`);
    console.log(`root-override\t${roots.overridden ? 1 : 0}`);
    for (const name of facadesForSelection(catalog, selection)) console.log(`facade\t${name}`);
    const providers = hostSkillPlacements(catalog);
    for (const name of providers.claude) console.log(`provider\tclaude ${name}`);
    for (const name of providers.codex) console.log(`provider\tcodex ${name}`);
    for (const name of providers.pi) console.log(`provider\tpi ${name}`);
    // Integrations have their own explicit setup command and lifecycle.
    for (const pkg of catalog.packages) if (pkg.kind === "integration") console.log(`integration\t${pkg.name}`);
    return;
  }
  if (subcommand === "facade-sources") {
    // Unconditional (no selection): every facade-kind package's name/source
    // pair, regardless of which owner selects it. This is the single
    // manifest-derived authority the shell sync script uses both to resolve
    // each selected facade's real source directory (which no longer lives
    // under one fixed assets/skill-commands/<name> parent -- e.g.
    // repo-harness-product sources from assets/skills/repo-harness-product) and
    // to preflight/retire whatever repo-harness-* names it finds already
    // installed on a host, selected or not.
    for (const pkg of catalog.packages) {
      if (pkg.kind !== "facade") continue;
      console.log(`${pkg.name}\t${pkg.source ?? ""}`);
    }
    return;
  }
  if (subcommand === "external-skills") {
    for (const name of externalSkillsForSelection(catalog, selection)) console.log(name);
    return;
  }
  if (subcommand === "host-placements") {
    const placements = hostSkillPlacements(catalog, selection);
    for (const name of placements.claude) console.log(`claude ${name}`);
    for (const name of placements.codex) console.log(`codex ${name}`);
    return;
  }
  fail(`unknown or missing subcommand "${subcommand ?? ""}"; expected audience-sources|facades|selection-projection|facade-sources|external-skills|host-placements|managed-tree-hash|remove-dangling-links`);
}

await main(process.argv.slice(2));
