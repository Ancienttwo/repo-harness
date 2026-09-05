import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  facadesForProfile,
  parseSkillSurfaceCatalog,
  SKILL_SURFACE_PROFILES,
} from "../../src/core/skill-surface/catalog";
import { PROFILE_COMPONENTS } from "../../src/cli/installer/install-profile";

// obsidian-memory is a repo-owned facade whose authority boundary is not
// expressible in the manifest alone: the vault is a projection of repo
// artifacts (direction repo -> brain), vault resolution fails closed rather
// than guessing a root, and the skill is only ever invoked explicitly by the
// model or the operator -- never from a hook. This file pins those three
// facts so a future change that registers the skill differently, rewrites
// the authority paragraph out of the skill body, or wires vault access into
// the hook layer fails here instead of silently shipping.

const ROOT = join(import.meta.dir, "..", "..");
const SKILLS_ROOT = join(ROOT, "assets", "skills");
const MANIFEST_PATH = join(ROOT, "assets", "skill-commands", "manifest.json");
const PACKAGE_NAME = "obsidian-memory";
const PACKAGE_DIR = "obsidian-memory";
const HOOK_ROOT = join(ROOT, "src", "cli", "hook");

function readSkill(): string {
  return readFileSync(join(SKILLS_ROOT, PACKAGE_DIR, "SKILL.md"), "utf-8");
}

function frontmatterOf(body: string): string {
  return body.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
}

function allFilesUnder(dir: string): string[] {
  if (statSync(dir).isFile()) return [dir];
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) return allFilesUnder(child);
      if (entry.isFile()) return [child];
      return [];
    });
}

describe("obsidian-memory: manifest registration", () => {
  const resolution = parseSkillSurfaceCatalog(readFileSync(MANIFEST_PATH, "utf-8"), {
    declared: true,
    profileComponents: PROFILE_COMPONENTS,
    exists: (p) => existsSync(join(ROOT, p)),
  });
  if (resolution.status !== "valid") {
    throw new Error(`expected the real manifest to remain a valid catalog: ${JSON.stringify(resolution.diagnostics)}`);
  }
  const catalog = resolution.catalog;

  test("is a repo-owned facade sourced from assets/skills/obsidian-memory on both hosts", () => {
    const entry = catalog.packages.find((pkg) => pkg.name === PACKAGE_NAME);
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("facade");
    expect(entry?.provider).toBeNull();
    expect(entry?.source).toBe(`assets/skills/${PACKAGE_DIR}`);
    expect([...(entry?.hosts ?? [])].sort()).toEqual(["claude", "codex"]);
    expect(entry?.retirementCandidate).toBeNull();
    expect(entry?.requires).toEqual(["obsidian-markdown", "obsidian-cli"]);
  });

  test("registers both companions as pinned explicit-only external packages", () => {
    for (const name of ["obsidian-markdown", "obsidian-cli"]) {
      const entry = catalog.packages.find((pkg) => pkg.name === name);
      expect(entry).toBeDefined();
      expect(entry?.kind).toBe("external");
      expect(entry?.provider).toBe("kepano/obsidian-skills@a1dc48e68138490d522c04cbf5822214c6eb1202");
      expect(entry?.profiles).toEqual([]);
      expect(entry?.hosts).toEqual(["claude", "codex"]);
      expect(entry?.integrity).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  test("is discovered by every install profile", () => {
    for (const profile of SKILL_SURFACE_PROFILES) {
      expect(facadesForProfile(catalog, profile)).toContain(PACKAGE_NAME);
    }
  });
});

describe("obsidian-memory: skill body pins the authority boundary", () => {
  test("SKILL.md exists and declares the obsidian-memory frontmatter name", () => {
    expect(existsSync(join(SKILLS_ROOT, PACKAGE_DIR, "SKILL.md"))).toBe(true);
    const frontmatter = frontmatterOf(readSkill());
    expect(frontmatter).not.toBe("");
    expect(frontmatter).toContain(`name: ${PACKAGE_NAME}`);
    expect(frontmatter).toContain("description:");
  });

  test("body keeps the repo -> brain direction and the fail-closed failure semantics", () => {
    const body = readSkill();
    // Authority direction: the vault is a projection, never a second source
    // of truth, so the sync arrow may not be reversed or dropped.
    expect(body).toContain("repo → brain");
    // Failure semantics: an unresolvable vault root stops the flow instead of
    // synthesizing one.
    expect(body).toContain("fail-closed");
  });

  test("body keeps the exclusion-first write gate", () => {
    const body = readSkill();
    // The gate has to stay exclusion-shaped. A positive "is this valuable?"
    // standard is not mechanically checkable and in practice produced pages of
    // commit SHAs and CI run ids; anything an authoritative system already
    // records may only be linked, never restated.
    expect(body).toContain("Exclusion-first write gate");
    expect(body).toContain("gets only a pointer in the vault, never a restatement");
  });

  test("body keeps the vault layer optional for adopters without a brain root", () => {
    const body = readSkill();
    // A fresh adopter has no brainRoot. That must read as a supported steady
    // state, not a defect the skill repairs by inventing a vault: repo-local
    // artifacts alone are already a complete memory surface.
    expect(body).toContain("legitimate steady state");
  });

  test("body keeps hands off manifest-owned vault paths", () => {
    const body = readSkill();
    // brain_path entries are machine projections of `repo-harness brain sync`.
    // Hand-writing memory there recreates the dual-authority drift this skill
    // exists to remove, and the next sync silently overwrites it.
    expect(body).toContain("brain-manifest.json");
  });
});

describe("obsidian-memory: hooks never invoke the skill", () => {
  test("no file under src/cli/hook/ references obsidian-memory", () => {
    const hookFiles = allFilesUnder(HOOK_ROOT);
    // Guard against a vacuous pass if the hook tree ever moves.
    expect(hookFiles.length).toBeGreaterThan(0);
    const offenders = hookFiles
      .filter((file) => readFileSync(file, "utf-8").includes(PACKAGE_NAME))
      .map((file) => file.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });
});
