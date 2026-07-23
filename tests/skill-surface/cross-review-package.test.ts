import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  externalSkillsForProfile,
  facadesForProfile,
  hostSkillPlacements,
  mutationPathSkillNames,
  parseSkillSurfaceCatalog,
  probeExpectations,
  profileOwnedSkillNames,
  SKILL_SURFACE_PROFILES,
} from "../../src/core/skill-surface/catalog";
import { PROFILE_COMPONENTS } from "../../src/cli/installer/install-profile";

// SSD-04 staged this package as pure content (inactive; no manifest edits in
// that slice). SSD-06 has now performed the atomic public cutover: the
// package is a live manifest entry, the two legacy provider skills it
// replaces (codex-review, claude-review) are deleted directories and
// retiredPackages entries, and this file's former "inertness proof" flips to
// an "activation proof" mirroring
// tests/skill-surface/canonical-packages.test.ts's own pattern.

const ROOT = join(import.meta.dir, "..", "..");
const SKILLS_ROOT = join(ROOT, "assets", "skills");
const MANIFEST_PATH = join(ROOT, "assets", "skill-commands", "manifest.json");
const PACKAGE_DIR = "repo-harness-cross-review";
const ROUTER_BODY_BYTE_LIMIT = 2048;
const REFERENCES = ["claude-mode.md", "codex-mode.md"] as const;

function readSkill(): string {
  return readFileSync(join(SKILLS_ROOT, PACKAGE_DIR, "SKILL.md"), "utf-8");
}

function frontmatterOf(body: string): string {
  return body.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
}

function allFilesUnder(dir: string): string[] {
  const stats = statSync(dir);
  if (stats.isFile()) return [dir];
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const child = join(dir, entry.name);
      if (entry.isDirectory()) return allFilesUnder(child);
      if (entry.isFile()) return [child];
      return [];
    });
}

const ALL_PACKAGE_FILES = allFilesUnder(join(SKILLS_ROOT, PACKAGE_DIR));

describe("repo-harness-cross-review package: SKILL.md frontmatter and router size", () => {
  test("SKILL.md parses with valid frontmatter and the expected name", () => {
    const body = readSkill();
    const frontmatter = frontmatterOf(body);
    expect(frontmatter).not.toBe("");
    expect(frontmatter).toContain(`name: ${PACKAGE_DIR}`);
    expect(frontmatter).toContain("description:");
    expect(frontmatter).toContain("when_to_use:");
    const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1] ?? "";
    expect(description.length).toBeGreaterThan(20);
  });

  test(`SKILL.md is a compact router: <= ${ROUTER_BODY_BYTE_LIMIT} bytes, routing + boundaries only`, () => {
    const path = join(SKILLS_ROOT, PACKAGE_DIR, "SKILL.md");
    const byteSize = statSync(path).size;
    expect(byteSize).toBeLessThanOrEqual(ROUTER_BODY_BYTE_LIMIT);

    const body = readSkill();
    expect(body).toContain("## Mode Selection");
    expect(body).toContain("## Boundaries");
    expect(body).not.toMatch(/^## Protocol$/m);
  });
});

describe("repo-harness-cross-review package: every reference file is reachable from its SKILL.md", () => {
  test("each declared reference file exists and is linked by explicit relative path", () => {
    const body = readSkill();
    for (const reference of REFERENCES) {
      const relativePath = `references/${reference}`;
      expect(existsSync(join(SKILLS_ROOT, PACKAGE_DIR, relativePath))).toBe(true);
      expect(body).toContain(relativePath);
    }
  });

  test("references/ contains no undeclared files", () => {
    const referencesDir = join(SKILLS_ROOT, PACKAGE_DIR, "references");
    const actual = readdirSync(referencesDir).sort();
    expect(actual).toEqual([...REFERENCES].sort());
  });
});

describe("repo-harness-cross-review package: no imported stale/retired guidance", () => {
  // Same excluded-pattern vocabulary as canonical-packages.test.ts, applied to
  // this package's own files instead of editing that shared test.
  const STALE_PATTERNS = [
    "agentic-dev-",
    "gstack",
    "plan-eng-review",
    "plan-design-review",
    "compatibility shim",
    "compatibility-shim",
    "delegate_to",
  ];

  test("no package file contains any excluded stale pattern", () => {
    const violations = ALL_PACKAGE_FILES.flatMap((file) => {
      const content = readFileSync(file, "utf-8").toLowerCase();
      return STALE_PATTERNS
        .filter((pattern) => content.includes(pattern))
        .map((pattern) => `${file.slice(ROOT.length + 1)}: ${pattern}`);
    });
    expect(violations).toEqual([]);
  });
});

describe("repo-harness-cross-review package: no reimplemented CLI/Core state transitions", () => {
  // Same mechanical proxy as canonical-packages.test.ts: a canonical package
  // routes to deterministic CLI/Core commands, not a multi-line embedded
  // shell workflow. This is the D4 acceptance itself -- the mechanics this
  // package used to embed (Step 0-2 of the two now-deleted provider skills)
  // now live in src/core/review, src/effects/review, and src/cli/commands.
  const SHELL_LANGS = new Set(["bash", "sh", "shell", "zsh"]);
  const MAX_SHELL_BLOCK_LINES = 5;

  function shellBlockLineCounts(file: string): number[] {
    const lines = readFileSync(file, "utf-8").split("\n");
    const counts: number[] = [];
    let openLang: string | null = null;
    let count = 0;
    for (const line of lines) {
      const fence = line.match(/^```\s*([a-zA-Z0-9_-]*)\s*$/);
      if (fence && openLang === null) {
        openLang = fence[1].toLowerCase();
        count = 0;
        continue;
      }
      if (fence && openLang !== null) {
        if (SHELL_LANGS.has(openLang)) counts.push(count);
        openLang = null;
        continue;
      }
      if (openLang !== null) count += 1;
    }
    return counts;
  }

  test(`no package file has a shell fenced block over ${MAX_SHELL_BLOCK_LINES} lines`, () => {
    const violations = ALL_PACKAGE_FILES.flatMap((file) =>
      shellBlockLineCounts(file)
        .filter((lineCount) => lineCount > MAX_SHELL_BLOCK_LINES)
        .map((lineCount) => `${file.slice(ROOT.length + 1)}: ${lineCount} lines`));
    expect(violations).toEqual([]);
  });
});

describe("repo-harness-cross-review package: activation proof -- live in manifest v2 and correctly discovered", () => {
  const source = readFileSync(MANIFEST_PATH, "utf-8");
  const resolution = parseSkillSurfaceCatalog(source, {
    declared: true,
    profileComponents: PROFILE_COMPONENTS,
    exists: (p) => existsSync(join(ROOT, p)),
  });
  if (resolution.status !== "valid") {
    throw new Error(`expected the real manifest to remain a valid catalog: ${JSON.stringify(resolution.diagnostics)}`);
  }
  const catalog = resolution.catalog;

  test("manifest v2 packages[] declares exactly one live entry sourced at this package's directory", () => {
    const entry = catalog.packages.find((pkg) => pkg.name === PACKAGE_DIR);
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("provider-skill");
    expect(entry?.source).toBe(`assets/skills/${PACKAGE_DIR}`);
    expect(entry?.component).toBe("cross-model-acceptance");
    expect([...(entry?.hosts ?? [])].sort()).toEqual(["claude", "codex"]);
    expect(entry?.profiles).toEqual(["strict"]);
  });

  test("hostSkillPlacements installs this package on both hosts for strict, and no other profile", () => {
    for (const profile of ["minimal", "standard", "product-planning"] as const) {
      const placements = hostSkillPlacements(catalog, profile);
      expect(placements.claude).not.toContain(PACKAGE_DIR);
      expect(placements.codex).not.toContain(PACKAGE_DIR);
    }
    const strict = hostSkillPlacements(catalog, "strict");
    expect(strict.claude).toContain(PACKAGE_DIR);
    expect(strict.codex).toContain(PACKAGE_DIR);
  });

  test("this package is included in the transaction mutation-path and probe-expectation crossModel sets", () => {
    const { externalSkills } = mutationPathSkillNames(catalog);
    expect(externalSkills).toContain(PACKAGE_DIR);
    expect(probeExpectations(catalog).crossModel).toContain(PACKAGE_DIR);
    expect(profileOwnedSkillNames(catalog)).toContain(PACKAGE_DIR);
  });

  test("codex-review and claude-review are fully retired: absent from packages[], recorded in retiredPackages pointing at this package", () => {
    expect(catalog.packages.find((pkg) => pkg.name === "codex-review")).toBeUndefined();
    expect(catalog.packages.find((pkg) => pkg.name === "claude-review")).toBeUndefined();
    for (const retiredName of ["codex-review", "claude-review"]) {
      const entry = catalog.retiredPackages.find((r) => r.name === retiredName);
      expect(entry).toBeDefined();
      expect(entry?.replacement).toBe(PACKAGE_DIR);
    }
    expect(existsSync(join(SKILLS_ROOT, "codex-review"))).toBe(false);
    expect(existsSync(join(SKILLS_ROOT, "claude-review"))).toBe(false);
  });

  test("this package never contributes a facade or external-skill selector name (it is a provider-skill, not a facade)", () => {
    const profilesToCheck: Array<(typeof SKILL_SURFACE_PROFILES)[number]> = [...SKILL_SURFACE_PROFILES];
    for (const profile of profilesToCheck) {
      expect(facadesForProfile(catalog, profile)).not.toContain(PACKAGE_DIR);
      expect(externalSkillsForProfile(catalog, profile)).not.toContain(PACKAGE_DIR);
    }
  });
});
