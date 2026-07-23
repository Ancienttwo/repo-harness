#!/usr/bin/env bun
// Thin CLI adapter over src/core/skill-surface/catalog.ts for shell callers
// (scripts/sync-codex-installed-copies.sh's profile_facades()). Resolves the
// manifest and core module relative to this script's own file location, so
// it works when invoked as `bun $SOURCE_ROOT/scripts/skill-surface-select.ts`
// from any cwd, in or out of a dev checkout (package.json "files" ships
// scripts/, src/, and assets/ together). Structural + self-consistency +
// profile-component crossref validation all run here: PROFILE_COMPONENTS is
// core-owned data (src/core/skill-surface/profile-components.ts), so
// importing it costs nothing and keeps this adapter fail-closed on a
// crossref-invalid catalog before the shell facade sync mutates any skill
// root. fs-existence checking stays opt-out here (same as
// src/cli/installer/install-profile.ts, src/cli/commands/init.ts,
// src/cli/commands/global-runtime.ts, which all skip it too): this adapter
// must keep working against sparse fixture SOURCE_ROOTs whose facade
// directories don't physically exist, exactly like the case-statement it
// replaces did.
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  externalSkillsForProfile,
  facadesForProfile,
  hostSkillPlacements,
  parseSkillSurfaceCatalog,
  SKILL_SURFACE_PROFILES,
  type SkillSurfaceCatalog,
  type SkillSurfaceProfile,
} from "../src/core/skill-surface/catalog";
import { PROFILE_COMPONENTS } from "../src/core/skill-surface/profile-components";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(SCRIPT_DIR, "..", "assets", "skill-commands", "manifest.json");

function fail(message: string): never {
  console.error(`skill-surface-select: ${message}`);
  process.exit(1);
}

function isProfile(value: string | undefined): value is SkillSurfaceProfile {
  return value !== undefined && (SKILL_SURFACE_PROFILES as readonly string[]).includes(value);
}

function parseProfileFlag(args: readonly string[]): string | undefined {
  const index = args.indexOf("--profile");
  return index >= 0 ? args[index + 1] : undefined;
}

function loadCatalog(): SkillSurfaceCatalog {
  const source = existsSync(MANIFEST_PATH) ? readFileSync(MANIFEST_PATH, "utf-8") : null;
  const resolution = parseSkillSurfaceCatalog(source, { declared: true, profileComponents: PROFILE_COMPONENTS });
  if (resolution.status !== "valid") {
    for (const entry of resolution.diagnostics) {
      console.error(`skill-surface-select: ${entry.code} ${entry.path}: ${entry.message}`);
    }
    fail(`skill-surface catalog invalid or missing: ${MANIFEST_PATH}`);
  }
  return resolution.catalog;
}

function main(argv: readonly string[]): void {
  const [subcommand, ...rest] = argv;
  const profileFlag = parseProfileFlag(rest);
  const catalog = loadCatalog();

  if (subcommand === "facades") {
    if (!isProfile(profileFlag)) fail(`facades requires --profile <${SKILL_SURFACE_PROFILES.join("|")}>`);
    for (const name of facadesForProfile(catalog, profileFlag)) console.log(name);
    return;
  }
  if (subcommand === "facade-sources") {
    // Unconditional (no --profile): every facade-kind package's name/source
    // pair, regardless of which profile(s) select it. This is the single
    // manifest-derived authority the shell sync script uses both to resolve
    // each selected facade's real source directory (which no longer lives
    // under one fixed assets/skill-commands/<name> parent -- e.g.
    // repo-harness-plan now sources from assets/skills/repo-harness-plan) and
    // to preflight/retire whatever repo-harness-* names it finds already
    // installed on a host, selected or not.
    for (const pkg of catalog.packages) {
      if (pkg.kind !== "facade") continue;
      console.log(`${pkg.name}\t${pkg.source ?? ""}`);
    }
    return;
  }
  if (subcommand === "external-skills") {
    if (profileFlag !== undefined && !isProfile(profileFlag)) {
      fail(`--profile must be one of ${SKILL_SURFACE_PROFILES.join("|")}`);
    }
    for (const name of externalSkillsForProfile(catalog, profileFlag)) console.log(name);
    return;
  }
  if (subcommand === "host-placements") {
    if (profileFlag !== undefined && !isProfile(profileFlag)) {
      fail(`--profile must be one of ${SKILL_SURFACE_PROFILES.join("|")}`);
    }
    const placements = hostSkillPlacements(catalog, profileFlag);
    for (const name of placements.claude) console.log(`claude ${name}`);
    for (const name of placements.codex) console.log(`codex ${name}`);
    return;
  }
  fail(`unknown or missing subcommand "${subcommand ?? ""}"; expected facades|facade-sources|external-skills|host-placements`);
}

main(process.argv.slice(2));
