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

// SSD-03: focused content tests for the canonical setup/product/plan
// packages staged under assets/skills/**. These packages are pure content —
// inactive until SSD-06 repoints the manifest at them (see plan
// "File ownership by slice", SSD-03 row: "no activation or deletion").

const ROOT = join(import.meta.dir, "..", "..");
const SKILLS_ROOT = join(ROOT, "assets", "skills");
const MANIFEST_PATH = join(ROOT, "assets", "skill-commands", "manifest.json");

/** The three staged packages that carry a routable SKILL.md (D1-D3). */
const STAGED_PACKAGES: ReadonlyArray<{
  readonly dir: string;
  /** Expected frontmatter `name:` value. repo-harness-plan-canonical is staged
   * under a disambiguating directory name but its frontmatter already carries
   * the eventual public name `repo-harness-plan` (see its SKILL.md and the
   * SSD-03 notes: SSD-06 renames the directory when it repoints the
   * manifest). */
  readonly frontmatterName: string;
  readonly references: readonly string[];
}> = [
  {
    dir: "repo-harness-setup",
    frontmatterName: "repo-harness-setup",
    references: [
      "adopt-init.md",
      "migrate.md",
      "upgrade.md",
      "repair.md",
      "scaffold.md",
      "capability.md",
    ],
  },
  {
    dir: "repo-harness-product",
    frontmatterName: "repo-harness-product",
    references: ["prd.md", "sprint.md", "goal.md"],
  },
  {
    dir: "repo-harness-plan-canonical",
    frontmatterName: "repo-harness-plan",
    references: ["create.md", "review.md"],
  },
];

/** D4 staged reference bundles: content-only, no owning SKILL.md yet (their
 * eventual consumer is the root router / repo-harness-check SKILL.md, both
 * untouched in this slice per the hard constraints). */
const STAGED_REFERENCE_BUNDLES = [
  "repo-harness-root-references",
  "repo-harness-check-references",
] as const;

/** Every staged directory name, used for the inertness proof below. Distinct
 * from every real manifest package name/source (verified in that describe
 * block), so a plain substring/equality check cannot false-positive against
 * legitimate existing content. */
const ALL_STAGED_DIR_NAMES = [
  ...STAGED_PACKAGES.map((p) => p.dir),
  ...STAGED_REFERENCE_BUNDLES,
];

const ROUTER_BODY_BYTE_LIMIT = 2048;

function readSkill(dir: string): string {
  return readFileSync(join(SKILLS_ROOT, dir, "SKILL.md"), "utf-8");
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

const ALL_STAGED_FILES = ALL_STAGED_DIR_NAMES.flatMap((dir) => allFilesUnder(join(SKILLS_ROOT, dir)));

describe("canonical packages (SSD-03): SKILL.md frontmatter and router size", () => {
  for (const pkg of STAGED_PACKAGES) {
    test(`${pkg.dir}/SKILL.md parses with valid frontmatter and matches its expected name`, () => {
      const body = readSkill(pkg.dir);
      const frontmatter = frontmatterOf(body);
      expect(frontmatter).not.toBe("");
      expect(frontmatter).toContain(`name: ${pkg.frontmatterName}`);
      expect(frontmatter).toContain("description:");
      expect(frontmatter).toContain("when_to_use:");
      const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1] ?? "";
      expect(description.length).toBeGreaterThan(20);
    });

    test(`${pkg.dir}/SKILL.md is a compact router: <= ${ROUTER_BODY_BYTE_LIMIT} bytes, routing + boundaries only`, () => {
      const path = join(SKILLS_ROOT, pkg.dir, "SKILL.md");
      const byteSize = statSync(path).size;
      expect(byteSize).toBeLessThanOrEqual(ROUTER_BODY_BYTE_LIMIT);

      const body = readSkill(pkg.dir);
      // Routing + boundaries only: a router body names its modes and their
      // cross-cutting invariants, but does not inline a mode's own numbered
      // protocol (that content has exactly one home: the mode's reference).
      expect(body).toContain("## Mode Selection");
      expect(body).toContain("## Boundaries");
      expect(body).not.toMatch(/^## Protocol$/m);
    });
  }
});

describe("canonical packages (SSD-03): every reference file is reachable from its SKILL.md", () => {
  for (const pkg of STAGED_PACKAGES) {
    test(`${pkg.dir}: each declared reference file exists and is linked by explicit relative path`, () => {
      const body = readSkill(pkg.dir);
      for (const reference of pkg.references) {
        const relativePath = `references/${reference}`;
        expect(existsSync(join(SKILLS_ROOT, pkg.dir, relativePath))).toBe(true);
        expect(body).toContain(relativePath);
      }
    });

    test(`${pkg.dir}: references/ contains no undeclared files`, () => {
      const referencesDir = join(SKILLS_ROOT, pkg.dir, "references");
      const actual = readdirSync(referencesDir).sort();
      expect(actual).toEqual([...pkg.references].sort());
    });
  }
});

describe("canonical packages (SSD-03): no imported stale/retired guidance", () => {
  // Concrete patterns this slice was explicitly told not to import (D1: "do
  // not copy stale agentic-dev-*, fallback, or compatibility-shim guidance"),
  // plus this repo's own existing retired-term vocabulary
  // (tests/retired-planning-provider.test.ts's RETIRED_TERMS), checked again
  // here defensively because assets/ is one of that test's own scanned
  // surfaces and any hit here would fail it too.
  const STALE_PATTERNS = [
    // Old pre-rename command prefix (e.g. "agentic-dev-init"). The trailing
    // hyphen distinguishes it from the legitimate current doc name
    // "agentic-development-flow.md" (no hyphen directly after "dev" there).
    "agentic-dev-",
    "gstack",
    "plan-eng-review",
    "plan-design-review",
    "compatibility shim",
    "compatibility-shim",
    "delegate_to",
  ];

  test("no staged file contains any excluded stale pattern", () => {
    const violations = ALL_STAGED_FILES.flatMap((file) => {
      const content = readFileSync(file, "utf-8").toLowerCase();
      return STALE_PATTERNS
        .filter((pattern) => content.includes(pattern))
        .map((pattern) => `${file.slice(ROOT.length + 1)}: ${pattern}`);
    });
    expect(violations).toEqual([]);
  });
});

describe("canonical packages (SSD-03): no reimplemented CLI/Core state transitions", () => {
  // Mechanical proxy: a canonical package should route to deterministic
  // CLI/Core commands, not carry its own multi-line shell workflow. A single
  // illustrative command (the norm throughout these packages) is fine; a
  // fenced shell block long enough to look like an embedded script is not.
  // Documented threshold: more than 5 lines inside one ```bash/sh/shell/zsh
  // fence.
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

  test(`no staged file has a shell fenced block over ${MAX_SHELL_BLOCK_LINES} lines`, () => {
    const violations = ALL_STAGED_FILES.flatMap((file) =>
      shellBlockLineCounts(file)
        .filter((lineCount) => lineCount > MAX_SHELL_BLOCK_LINES)
        .map((lineCount) => `${file.slice(ROOT.length + 1)}: ${lineCount} lines`));
    expect(violations).toEqual([]);
  });
});

describe("canonical packages (SSD-03): inertness proof — absent from manifest v2 and every selector output", () => {
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

  test("manifest v2 packages[] declares zero entries under any staged directory (name or source)", () => {
    const violations = catalog.packages.flatMap((pkg) => {
      const hits: string[] = [];
      for (const dirName of ALL_STAGED_DIR_NAMES) {
        if (pkg.name === dirName) hits.push(`${pkg.name}: name equals staged dir "${dirName}"`);
        if (pkg.source !== null && pkg.source.includes(dirName)) {
          hits.push(`${pkg.name}: source "${pkg.source}" references staged dir "${dirName}"`);
        }
      }
      return hits;
    });
    expect(violations).toEqual([]);
  });

  test("no selector output names a staged directory, on any profile (including the unconditional bundle)", () => {
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

    const violations = ALL_STAGED_DIR_NAMES.filter((dirName) =>
      allSelectorNames.some((name) => name.includes(dirName)));
    expect(violations).toEqual([]);
  });
});
