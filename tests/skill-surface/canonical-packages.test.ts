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

// SSD-03 staged these packages as pure content, inactive until SSD-06
// repointed the manifest at them. SSD-06 has now performed that activation
// (plan "File ownership by slice", SSD-06 row: "Activate canonical packages
// and remove old authoring directories in the same integration slice"), so
// this file's content-quality describe blocks are unchanged in spirit but
// the former "inertness proof" flips to an "activation proof": these
// packages now DO appear in manifest.json packages[] and in the selector
// outputs their target profiles require.

const ROOT = join(import.meta.dir, "..", "..");
const SKILLS_ROOT = join(ROOT, "assets", "skills");
const MANIFEST_PATH = join(ROOT, "assets", "skill-commands", "manifest.json");

/** The three canonical packages that carry a routable SKILL.md. */
const CANONICAL_PACKAGES: ReadonlyArray<{
  readonly dir: string;
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
    // SSD-03 staged this directory as "repo-harness-plan-canonical" (its
    // frontmatter already carried the eventual public name) to avoid
    // colliding with the then-live assets/skill-commands/repo-harness-plan
    // facade. SSD-06 renamed the directory to its final public name
    // (`git mv`) and deleted the retiring facade in the same slice.
    dir: "repo-harness-plan",
    frontmatterName: "repo-harness-plan",
    references: ["create.md", "review.md"],
  },
];

/**
 * SSD-03 also staged two reference-only bundle directories with no owning
 * SKILL.md of their own (`repo-harness-root-references`,
 * `repo-harness-check-references`). SSD-06 dissolved both: their content
 * moved to its final canonical home (a root `references/` file for the
 * router, or a `references/` file under the surviving
 * `repo-harness-check` facade) and the bundle directories were deleted.
 * These are the same content-quality gates the bundle dirs used to receive,
 * now pointed at the files' new homes.
 */
const DISSOLVED_REFERENCE_FILES = [
  join(ROOT, "references", "handoff.md"),
  join(ROOT, "references", "workflow-packaging-rubric.md"),
  join(ROOT, "assets", "skill-commands", "repo-harness-check", "references", "deploy-readiness.md"),
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

const ALL_CANONICAL_FILES = [
  ...CANONICAL_PACKAGES.flatMap((pkg) => allFilesUnder(join(SKILLS_ROOT, pkg.dir))),
  ...DISSOLVED_REFERENCE_FILES,
];

describe("canonical packages: SKILL.md frontmatter and router size", () => {
  for (const pkg of CANONICAL_PACKAGES) {
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

describe("canonical packages: every reference file is reachable from its SKILL.md", () => {
  for (const pkg of CANONICAL_PACKAGES) {
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

describe("canonical packages: no imported stale/retired guidance", () => {
  // Concrete patterns SSD-03 was explicitly told not to import, plus this
  // repo's own existing retired-term vocabulary
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

  test("no canonical package or dissolved-reference file contains any excluded stale pattern", () => {
    const violations = ALL_CANONICAL_FILES.flatMap((file) => {
      const content = readFileSync(file, "utf-8").toLowerCase();
      return STALE_PATTERNS
        .filter((pattern) => content.includes(pattern))
        .map((pattern) => `${file.slice(ROOT.length + 1)}: ${pattern}`);
    });
    expect(violations).toEqual([]);
  });
});

describe("canonical packages: no reimplemented CLI/Core state transitions", () => {
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

  test(`no canonical package or dissolved-reference file has a shell fenced block over ${MAX_SHELL_BLOCK_LINES} lines`, () => {
    const violations = ALL_CANONICAL_FILES.flatMap((file) =>
      shellBlockLineCounts(file)
        .filter((lineCount) => lineCount > MAX_SHELL_BLOCK_LINES)
        .map((lineCount) => `${file.slice(ROOT.length + 1)}: ${lineCount} lines`));
    expect(violations).toEqual([]);
  });
});

describe("canonical packages: activation proof — present in manifest v2 and correctly discovered", () => {
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

  test("manifest v2 packages[] declares exactly one live entry per canonical package, sourced at its final directory", () => {
    for (const pkg of CANONICAL_PACKAGES) {
      const entry = catalog.packages.find((p) => p.name === pkg.frontmatterName);
      expect(entry).toBeDefined();
      expect(entry?.source).toBe(`assets/skills/${pkg.dir}`);
      expect(entry?.retirementCandidate).toBeNull();
    }
  });

  test("repo-harness-setup is discovered by no profile (router-only progressive load)", () => {
    for (const profile of SKILL_SURFACE_PROFILES) {
      expect(facadesForProfile(catalog, profile)).not.toContain("repo-harness-setup");
    }
  });

  test("repo-harness-plan is discovered by standard, product-planning, and strict, not minimal", () => {
    expect(facadesForProfile(catalog, "minimal")).not.toContain("repo-harness-plan");
    for (const profile of ["standard", "product-planning", "strict"] as const) {
      expect(facadesForProfile(catalog, profile)).toContain("repo-harness-plan");
    }
  });

  test("repo-harness-product is discovered only by product-planning", () => {
    expect(facadesForProfile(catalog, "product-planning")).toContain("repo-harness-product");
    for (const profile of ["minimal", "standard", "strict"] as const) {
      expect(facadesForProfile(catalog, profile)).not.toContain("repo-harness-product");
    }
  });

  test("no selector output still names the old disambiguating staging directory repo-harness-plan-canonical", () => {
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
    expect(allSelectorNames.some((name) => name.includes("repo-harness-plan-canonical"))).toBe(false);
    expect(existsSync(join(SKILLS_ROOT, "repo-harness-plan-canonical"))).toBe(false);
  });
});
