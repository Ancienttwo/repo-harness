import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
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
  validateSkillSurfaceCatalogValue,
  type SkillSurfaceCatalog,
  type SkillSurfaceProfile,
} from "../../src/core/skill-surface/catalog";
import { PROFILE_COMPONENTS } from "../../src/cli/installer/install-profile";

const ROOT = join(import.meta.dir, "..", "..");
const MANIFEST_PATH = join(ROOT, "assets", "skill-commands", "manifest.json");

function codes(value: ReturnType<typeof validateSkillSurfaceCatalogValue>): string[] {
  return value.diagnostics.map((d) => d.code);
}

/** A router + one profile-gated facade, valid on its own (used as the "happy path" base every bad-fixture test mutates one thing away from). */
const ROUTER = {
  name: "repo-harness",
  kind: "router",
  source: ".",
  provider: null,
  hosts: ["claude", "codex"],
  profiles: ["minimal", "full"],
  discoverability: "always",
  component: "cli",
  requires: [],
  mutatesRepoByDefault: false,
  summary: "root router",
  retirementCandidate: null,
};

const FACADE = {
  name: "repo-harness-plan",
  kind: "facade",
  source: "assets/skill-commands/repo-harness-plan",
  provider: null,
  hosts: ["claude", "codex"],
  profiles: ["minimal"],
  discoverability: "profile-facade",
  component: "adaptive-workflow",
  requires: [],
  mutatesRepoByDefault: false,
  summary: "plan facade",
  retirementCandidate: null,
};

/** Computes the expectedProjections block that makes a given packages[] array self-consistent, using the library's own selectors (so fixtures can't hand-compute the wrong answer). */
function computeExpectedProjections(packages: unknown[]): unknown {
  // Test-fixture-only tolerance: a bad-fixture test may pass a malformed
  // entry (e.g. null) to prove the core module's own PACKAGE_NOT_OBJECT
  // diagnostic; this helper only needs a best-effort expectedProjections
  // block for the surrounding fixture; it is not the module under test.
  const wellFormed = packages.filter((p) => p !== null && typeof p === "object");
  const provisional = { packages: wellFormed } as unknown as SkillSurfaceCatalog;
  const facadesByProfile: Record<string, readonly string[]> = {};
  const externalSkillsByProfile: Record<string, readonly string[]> = {};
  const hostSkillPlacementsByProfile: Record<string, { claude: readonly string[]; codex: readonly string[] }> = {};
  for (const profile of SKILL_SURFACE_PROFILES) {
    facadesByProfile[profile] = facadesForProfile(provisional, profile);
    externalSkillsByProfile[profile] = externalSkillsForProfile(provisional, profile);
    hostSkillPlacementsByProfile[profile] = hostSkillPlacements(provisional, profile);
  }
  return { facadesByProfile, externalSkillsByProfile, hostSkillPlacementsByProfile };
}

function catalogValue(packages: unknown[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    surface: "test-surface",
    source: "assets/skill-commands",
    router: "repo-harness",
    packages,
    expectedProjections: computeExpectedProjections(packages),
    nonPublicInternalSteps: [],
    ...overrides,
  };
}

const VALID_BASE = catalogValue([ROUTER, FACADE]);

describe("skill-surface catalog: absence vs. declared-missing", () => {
  test("steady-state catalog exposes only minimal and full profiles", () => {
    expect(SKILL_SURFACE_PROFILES).toEqual(["minimal", "full"]);
  });

  test("distinguishes an undeclared absence from a declared missing manifest", () => {
    expect(parseSkillSurfaceCatalog(null)).toEqual({ status: "absent", catalog: null, diagnostics: [] });
    const declared = parseSkillSurfaceCatalog(null, { declared: true });
    expect(declared.status).toBe("invalid");
    expect(declared.diagnostics[0]?.code).toBe("MANIFEST_MISSING");
  });

  test("rejects invalid JSON", () => {
    expect(codes(parseSkillSurfaceCatalog("{not json"))).toEqual(["INVALID_JSON"]);
  });
});

describe("skill-surface catalog: every validation rejection, proven on a bad fixture", () => {
  test("CATALOG_NOT_OBJECT: root is not an object", () => {
    expect(codes(validateSkillSurfaceCatalogValue(null))).toEqual(["CATALOG_NOT_OBJECT"]);
    expect(codes(validateSkillSurfaceCatalogValue([]))).toEqual(["CATALOG_NOT_OBJECT"]);
  });

  test("UNSUPPORTED_VERSION: version is not 2", () => {
    expect(codes(validateSkillSurfaceCatalogValue({ ...VALID_BASE, version: 1 }))).toEqual(["UNSUPPORTED_VERSION"]);
  });

  test("PACKAGES_NOT_ARRAY: packages is not an array", () => {
    expect(codes(validateSkillSurfaceCatalogValue({ ...VALID_BASE, packages: {} }))).toEqual(["PACKAGES_NOT_ARRAY"]);
  });

  test("PACKAGE_NOT_OBJECT: a package entry is not an object", () => {
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([null])))).toContain("PACKAGE_NOT_OBJECT");
  });

  test("FIELD_REQUIRED: a required string field is missing or blank", () => {
    for (const field of ["name", "kind", "discoverability", "component", "summary"]) {
      const broken = { ...FACADE, [field]: "" };
      const result = validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken]));
      expect(codes(result)).toContain("FIELD_REQUIRED");
    }
  });

  test("FIELD_REQUIRED: source must be a string or null", () => {
    const broken = { ...FACADE, source: 42 };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).toContain("FIELD_REQUIRED");
  });

  test("FIELD_REQUIRED: provider must be a string or null", () => {
    const broken = { ...FACADE, provider: 42 };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).toContain("FIELD_REQUIRED");
  });

  test("FIELD_REQUIRED: hosts/profiles/requires must be string arrays; mutatesRepoByDefault must be boolean", () => {
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, { ...FACADE, hosts: "claude" }]))))
      .toContain("FIELD_REQUIRED");
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, { ...FACADE, profiles: "minimal" }]))))
      .toContain("FIELD_REQUIRED");
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, { ...FACADE, requires: "none" }]))))
      .toContain("FIELD_REQUIRED");
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, { ...FACADE, mutatesRepoByDefault: "false" }]))))
      .toContain("FIELD_REQUIRED");
  });

  test("INVALID_KIND: kind outside the closed vocabulary", () => {
    const broken = { ...FACADE, kind: "bogus" };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).toContain("INVALID_KIND");
  });

  test("INVALID_DISCOVERABILITY: discoverability outside the closed vocabulary", () => {
    const broken = { ...FACADE, discoverability: "bogus" };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).toContain("INVALID_DISCOVERABILITY");
  });

  test("INVALID_HOST: a host outside claude|codex", () => {
    const broken = { ...FACADE, hosts: ["claude", "bogus"] };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).toContain("INVALID_HOST");
  });

  test("INVALID_PROFILE: a profile outside the two known profiles", () => {
    const broken = { ...FACADE, profiles: ["minimal", "bogus"] };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).toContain("INVALID_PROFILE");
  });

  test("DUPLICATE_NAME: two packages share a name", () => {
    const result = validateSkillSurfaceCatalogValue(catalogValue([ROUTER, FACADE, { ...FACADE }]));
    expect(codes(result)).toContain("DUPLICATE_NAME");
  });

  test("DUPLICATE_SOURCE: two packages share a non-null source", () => {
    const clash = { ...FACADE, name: "repo-harness-plan-clone", source: FACADE.source };
    const result = validateSkillSurfaceCatalogValue(catalogValue([ROUTER, FACADE, clash]));
    expect(codes(result)).toContain("DUPLICATE_SOURCE");
  });

  test("COMPONENT_NOT_IN_PROFILE: a profile-discovered package whose component is absent from that profile's component set", () => {
    const broken = { ...FACADE, component: "cross-model-acceptance" }; // minimal's set doesn't include this
    const result = validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken]), {
      profileComponents: PROFILE_COMPONENTS,
    });
    expect(codes(result)).toContain("COMPONENT_NOT_IN_PROFILE");
    // Omitting profileComponents skips the crossref check entirely (opt-in, mirrors registry.ts's options.repoRoot pattern).
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).not.toContain("COMPONENT_NOT_IN_PROFILE");
  });

  test("RETIREMENT_CANDIDATE_NOT_OBJECT: retirementCandidate is neither an object nor null", () => {
    const broken = { ...FACADE, retirementCandidate: "retired" };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).toContain("RETIREMENT_CANDIDATE_NOT_OBJECT");
  });

  test("RETIREMENT_REPLACEMENT_UNKNOWN: replacement names a package outside the catalog", () => {
    const broken = { ...FACADE, retirementCandidate: { replacement: "repo-harness-nonexistent", note: "gone" } };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).toContain("RETIREMENT_REPLACEMENT_UNKNOWN");
  });

  test("RETIREMENT_REPLACEMENT_RETIRING: replacement targets another retirement candidate", () => {
    const alsoRetiring = { ...FACADE, name: "repo-harness-also-retiring", retirementCandidate: { replacement: null, note: "retired" } };
    const pointsAtIt = { ...FACADE, name: "repo-harness-pointer", retirementCandidate: { replacement: "repo-harness-also-retiring", note: "chained" } };
    const result = validateSkillSurfaceCatalogValue(catalogValue([ROUTER, alsoRetiring, pointsAtIt]));
    expect(codes(result)).toContain("RETIREMENT_REPLACEMENT_RETIRING");
  });

  test("SOURCE_MISSING: caller-supplied exists() reports a declared source absent from disk", () => {
    const result = validateSkillSurfaceCatalogValue(catalogValue([ROUTER, FACADE]), { exists: () => false });
    expect(codes(result)).toContain("SOURCE_MISSING");
    // Omitting exists skips fs-existence detection entirely (pure core never touches fs itself).
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, FACADE])))).not.toContain("SOURCE_MISSING");
  });

  test("EXPECTED_PROJECTIONS_REQUIRED: expectedProjections is missing or malformed", () => {
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, FACADE], { expectedProjections: null }))))
      .toContain("EXPECTED_PROJECTIONS_REQUIRED");
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, FACADE], { expectedProjections: { facadesByProfile: {} } }))))
      .toContain("EXPECTED_PROJECTIONS_REQUIRED");
  });

  test("PROJECTION_MISMATCH: a declared expected projection disagrees with what packages[] compute", () => {
    const projections = computeExpectedProjections([ROUTER, FACADE]) as { facadesByProfile: Record<string, string[]> };
    const wrong = {
      ...projections,
      facadesByProfile: { ...projections.facadesByProfile, minimal: ["repo-harness-not-actually-selected"] },
    };
    const result = validateSkillSurfaceCatalogValue(catalogValue([ROUTER, FACADE], { expectedProjections: wrong }));
    expect(codes(result)).toContain("PROJECTION_MISMATCH");
  });

  test("a fixture with none of the above problems is valid with zero diagnostics", () => {
    const result = validateSkillSurfaceCatalogValue(VALID_BASE, { profileComponents: PROFILE_COMPONENTS });
    expect(result.status).toBe("valid");
    expect(result.diagnostics).toEqual([]);
  });
});

describe("skill-surface catalog: the real manifest.json on disk", () => {
  const source = readFileSync(MANIFEST_PATH, "utf-8");
  const resolution = parseSkillSurfaceCatalog(source, {
    declared: true,
    profileComponents: PROFILE_COMPONENTS,
    exists: (p) => existsSync(join(ROOT, p)),
  });

  test("parses valid with zero diagnostics", () => {
    if (resolution.status !== "valid") {
      throw new Error(`expected valid, got: ${JSON.stringify(resolution.diagnostics, null, 2)}`);
    }
    expect(resolution.status).toBe("valid");
    expect(resolution.diagnostics).toEqual([]);
  });

  // SSD-06 migration: the pre-cutover manifest had 30 packages (25 repo-owned
  // + 5 external). The atomic public cutover deletes 15 retired facades plus
  // codex-review/claude-review (replaced by one repo-harness-cross-review),
  // leaving 11 repo-owned canonical/provider/judge/router entries (repo-harness,
  // repo-harness-setup, repo-harness-plan, repo-harness-check, repo-harness-product,
  // repo-harness-ship, repo-harness-architecture, repo-harness-cross-review,
  // merge-gate, repo-harness-chatgpt, claude-plan) + 5 unaffected external
  // skills = 16 total. See tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md#SSD-06.
  test("covers all 11 repo-owned sources plus the 5 external skills (16 packages)", () => {
    if (resolution.status !== "valid") throw new Error("expected valid catalog");
    expect(resolution.catalog.packages.length).toBe(16);
    const repoOwned = resolution.catalog.packages.filter((p) => p.kind !== "external");
    expect(repoOwned.length).toBe(11);
    const external = resolution.catalog.packages.filter((p) => p.kind === "external");
    expect(external.map((p) => p.name).sort()).toEqual(["check", "health", "hunt", "mermaid", "think"]);
  });

  test("merge-gate is a non-selectable classification-only judge entry", () => {
    if (resolution.status !== "valid") throw new Error("expected valid catalog");
    const mergeGate = resolution.catalog.packages.find((p) => p.name === "merge-gate");
    expect(mergeGate).toBeDefined();
    expect(mergeGate?.kind).toBe("judge");
    expect(mergeGate?.hosts).toEqual([]);
    expect(mergeGate?.profiles).toEqual([]);
    expect(mergeGate?.source).toBeNull();
    // Non-selectable: a judge-kind package never matches any selector's kind filter.
    for (const profile of SKILL_SURFACE_PROFILES) {
      expect(facadesForProfile(resolution.catalog, profile)).not.toContain("merge-gate");
      expect(externalSkillsForProfile(resolution.catalog, profile)).not.toContain("merge-gate");
      const placements = hostSkillPlacements(resolution.catalog, profile);
      expect(placements.claude).not.toContain("merge-gate");
      expect(placements.codex).not.toContain("merge-gate");
    }
  });

  test("retiredPackages records all 19 retired names with a live or null replacement", () => {
    if (resolution.status !== "valid") throw new Error("expected valid catalog");
    const catalog = resolution.catalog;
    expect(catalog.retiredPackages.length).toBe(19);
    const liveNames = new Set(catalog.packages.map((p) => p.name));
    for (const entry of catalog.retiredPackages) {
      expect(entry.note.length).toBeGreaterThan(0);
      if (entry.replacement !== null) expect(liveNames.has(entry.replacement)).toBe(true);
    }
    expect(catalog.retiredPackages.find((e) => e.name === "repo-harness-autoplan")?.replacement).toBeNull();
    expect(catalog.retiredPackages.find((e) => e.name === "codex-review")?.replacement).toBe("repo-harness-cross-review");
    expect(catalog.retiredPackages.find((e) => e.name === "claude-review")?.replacement).toBe("repo-harness-cross-review");
    expect(catalog.retiredPackages.find((e) => e.name === "repo-harness-handoff")?.replacement).toBe("repo-harness");
  });

  test("declared expectedProjections are self-consistent with packages[] (independent recomputation)", () => {
    if (resolution.status !== "valid") throw new Error("expected valid catalog");
    const catalog = resolution.catalog;
    for (const profile of SKILL_SURFACE_PROFILES) {
      expect(catalog.expectedProjections.facadesByProfile[profile]).toEqual([...facadesForProfile(catalog, profile)]);
      expect(catalog.expectedProjections.externalSkillsByProfile[profile])
        .toEqual([...externalSkillsForProfile(catalog, profile)]);
      const declaredHosts = catalog.expectedProjections.hostSkillPlacementsByProfile[profile];
      const computedHosts = hostSkillPlacements(catalog, profile);
      expect(declaredHosts.claude).toEqual([...computedHosts.claude]);
      expect(declaredHosts.codex).toEqual([...computedHosts.codex]);
    }
  });
});

// SSD-06 migration note (per plan Ruling R5): evals/skill-routing/discovery-baseline.json
// is untouchable historical pre-cutover evidence -- it intentionally continues
// to describe the PRE-cutover 19-facade/2-provider-skill world. The live
// manifest.json now describes the POST-cutover target world, so comparing
// live selector output against that frozen baseline would fail by design
// (the whole point of the cutover is that they diverge). This describe block
// therefore no longer reads discovery-baseline.json at all; every assertion
// below pins the plan's target discovery matrix directly
// (plans/plan-20260715-1140-skill-surface-discovery-convergence.md, "Target
// discovery matrix"). discovery-baseline.json's own historical parity is
// separately preserved as an internal-consistency check in
// tests/skill-routing-eval.test.ts (baseline vs. its own recorded inventory,
// not the live filesystem).
describe("skill-surface catalog: target post-cutover discovery matrix", () => {
  const catalogSource = readFileSync(MANIFEST_PATH, "utf-8");
  const resolution = parseSkillSurfaceCatalog(catalogSource, { declared: true, profileComponents: PROFILE_COMPONENTS });
  if (resolution.status !== "valid") throw new Error("expected the real manifest to be a valid catalog");
  const catalog = resolution.catalog;

  test("facadesForProfile matches the target discovery matrix for every profile", () => {
    expect(facadesForProfile(catalog, "minimal")).toEqual([
      "repo-harness-plan", "repo-harness-check",
    ]);
    expect(facadesForProfile(catalog, "full")).toEqual([
      "repo-harness-plan", "repo-harness-check", "repo-harness-product", "repo-harness-ship",
    ]);
  });

  test("full is the explicit union while minimal excludes product and ship", () => {
    expect(facadesForProfile(catalog, "full")).toContain("repo-harness-product");
    expect(facadesForProfile(catalog, "full")).toContain("repo-harness-ship");
    expect(facadesForProfile(catalog, "minimal")).not.toContain("repo-harness-product");
    expect(facadesForProfile(catalog, "minimal")).not.toContain("repo-harness-ship");
  });

  test("repo-harness-setup and repo-harness-architecture are router-only progressive load, never auto-discovered", () => {
    for (const profile of SKILL_SURFACE_PROFILES) {
      expect(facadesForProfile(catalog, profile)).not.toContain("repo-harness-setup");
      expect(facadesForProfile(catalog, profile)).not.toContain("repo-harness-architecture");
    }
  });

  test("hostSkillPlacements: full places repo-harness-cross-review on both hosts and claude-plan on codex only", () => {
    expect(hostSkillPlacements(catalog, "minimal")).toEqual({ claude: [], codex: [] });
    expect(hostSkillPlacements(catalog, "full")).toEqual({
      claude: ["repo-harness-cross-review"],
      codex: ["repo-harness-cross-review", "claude-plan"],
    });
  });

  test("hostSkillPlacements without a profile (init.ts's adopt flow) is the unconditional full-tier bundle", () => {
    const unconditional = hostSkillPlacements(catalog);
    expect(unconditional).toEqual({ claude: ["repo-harness-cross-review"], codex: ["repo-harness-cross-review", "claude-plan"] });
  });

  test("explicit ChatGPT setup is never implied by either install profile", () => {
    for (const profile of SKILL_SURFACE_PROFILES) {
      expect(facadesForProfile(catalog, profile)).not.toContain("repo-harness-chatgpt");
    }
    const chatgpt = catalog.packages.find((p) => p.name === "repo-harness-chatgpt");
    expect(chatgpt?.discoverability).toBe("explicit-setup");
    expect(chatgpt?.profiles).toEqual([]);
  });

  test("externalSkillsForProfile: full gets the 5 Waza+mermaid names and minimal gets none", () => {
    expect(externalSkillsForProfile(catalog, "minimal")).toEqual([]);
    expect(externalSkillsForProfile(catalog, "full")).toEqual(["think", "hunt", "check", "health", "mermaid"]);
  });

  test("mutationPathSkillNames covers every package path that can be host-synced post-cutover", () => {
    const { repoHarnessSkills, externalSkills } = mutationPathSkillNames(catalog);
    expect(repoHarnessSkills).toEqual([
      "repo-harness", "repo-harness-plan", "repo-harness-check", "repo-harness-product", "repo-harness-ship",
    ]);
    expect(externalSkills).toEqual(["repo-harness-cross-review", "think", "hunt", "check", "health", "mermaid"]);
  });

  test("profileOwnedSkillNames matches the post-cutover cross-model-acceptance + external set", () => {
    expect([...profileOwnedSkillNames(catalog)].sort()).toEqual(
      ["think", "hunt", "check", "health", "mermaid", "repo-harness-cross-review"].sort(),
    );
  });

  test("probeExpectations matches the post-cutover planningSkillNames/planningCapabilityPaths/crossModel sets", () => {
    const expectations = probeExpectations(catalog);
    expect(expectations.planningSkillNames).toEqual(["think", "hunt", "check", "health", "mermaid"]);
    expect(expectations.planningCapabilityPaths).toEqual([
      "assets/skills/repo-harness-product/SKILL.md",
    ]);
    expect(expectations.crossModel).toEqual(["repo-harness-cross-review"]);
  });
});
