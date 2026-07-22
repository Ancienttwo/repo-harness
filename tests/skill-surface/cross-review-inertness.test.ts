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

// SSD-04: sibling inertness assertion for assets/skills/repo-harness-cross-review,
// mirroring tests/skill-surface/canonical-packages.test.ts's own SSD-03
// pattern (that file is out of this slice's write scope, so this package
// gets its own dedicated test file instead of an edit there). The package is
// pure content -- inactive until SSD-06 repoints the manifest at it (plan
// "File ownership by slice", SSD-04 row: cross-review Core/Effects/CLI, new
// cross-review package, dedicated tests; no manifest/profile edits here).

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

describe("repo-harness-cross-review package (SSD-04): SKILL.md frontmatter and router size", () => {
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

describe("repo-harness-cross-review package (SSD-04): every reference file is reachable from its SKILL.md", () => {
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

describe("repo-harness-cross-review package (SSD-04): no imported stale/retired guidance", () => {
  // Same excluded-pattern vocabulary as the SSD-03 canonical-packages test
  // (tests/skill-surface/canonical-packages.test.ts), applied to this
  // package's own files instead of editing that shared test.
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

describe("repo-harness-cross-review package (SSD-04): no reimplemented CLI/Core state transitions", () => {
  // Same mechanical proxy as canonical-packages.test.ts: a canonical package
  // routes to deterministic CLI/Core commands, not a multi-line embedded
  // shell workflow. This is the D4 acceptance itself -- the mechanics this
  // package used to embed (Step 0-2 of the two live provider skills) now
  // live in src/core/review, src/effects/review, and src/cli/commands.
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

describe("repo-harness-cross-review package (SSD-04): inertness proof -- absent from manifest v2 and every selector output", () => {
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

  test("manifest v2 packages[] declares zero entries under this staged directory (name or source)", () => {
    const violations = catalog.packages.flatMap((pkg) => {
      const hits: string[] = [];
      if (pkg.name === PACKAGE_DIR) hits.push(`${pkg.name}: name equals staged dir "${PACKAGE_DIR}"`);
      if (pkg.source !== null && pkg.source.includes(PACKAGE_DIR)) {
        hits.push(`${pkg.name}: source "${pkg.source}" references staged dir "${PACKAGE_DIR}"`);
      }
      return hits;
    });
    expect(violations).toEqual([]);
  });

  test("no selector output names this staged directory, on any profile (including the unconditional bundle)", () => {
    const profilesToCheck: Array<(typeof SKILL_SURFACE_PROFILES)[number] | undefined> = [
      ...SKILL_SURFACE_PROFILES,
      undefined,
    ];

    const allSelectorNames: string[] = [];
    for (const profile of profilesToCheck) {
      if (profile !== undefined) {
        allSelectorNames.push(...facadesForProfile(catalog, profile));
        allSelectorNames.push(...externalSkillsForProfile(catalog, profile));
      } else {
        allSelectorNames.push(...externalSkillsForProfile(catalog, undefined));
      }
      const placements = hostSkillPlacements(catalog, profile);
      allSelectorNames.push(...placements.claude, ...placements.codex);
    }

    const { repoHarnessSkills, externalSkills } = mutationPathSkillNames(catalog);
    allSelectorNames.push(...repoHarnessSkills, ...externalSkills);
    allSelectorNames.push(...profileOwnedSkillNames(catalog));
    const expectations = probeExpectations(catalog);
    allSelectorNames.push(
      ...expectations.planningSkillNames,
      ...expectations.planningCapabilityPaths,
      ...expectations.crossModel,
    );

    const violations = allSelectorNames.filter((name) => name.includes(PACKAGE_DIR));
    expect(violations).toEqual([]);
  });

  test("the note pointing to this consolidation target still names it only as a not-yet-created planned facade", () => {
    // This slice stages the package; it does not repoint the note or the
    // manifest (SSD-06's job). Documents the current expected state so a
    // drive-by manifest edit in this slice fails loudly here first.
    const codexReviewEntry = catalog.packages.find((pkg) => pkg.name === "codex-review");
    const claudeReviewEntry = catalog.packages.find((pkg) => pkg.name === "claude-review");
    expect(codexReviewEntry?.retirementCandidate?.replacement ?? null).toBeNull();
    expect(claudeReviewEntry?.retirementCandidate?.replacement ?? null).toBeNull();
  });
});
