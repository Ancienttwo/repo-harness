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
const BASELINE_PATH = join(ROOT, "evals", "skill-routing", "discovery-baseline.json");

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
  profiles: ["minimal", "standard"],
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
  profiles: ["standard"],
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
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, { ...FACADE, profiles: "standard" }]))))
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

  test("INVALID_PROFILE: a profile outside the four known profiles", () => {
    const broken = { ...FACADE, profiles: ["standard", "bogus"] };
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
    const broken = { ...FACADE, component: "cross-model-acceptance" }; // standard's set doesn't include this
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
      facadesByProfile: { ...projections.facadesByProfile, standard: ["repo-harness-not-actually-selected"] },
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

  test("covers all 25 repo-owned sources plus the 5 external skills (30 packages)", () => {
    if (resolution.status !== "valid") throw new Error("expected valid catalog");
    expect(resolution.catalog.packages.length).toBe(30);
    const repoOwned = resolution.catalog.packages.filter((p) => p.kind !== "external");
    expect(repoOwned.length).toBe(25);
    const external = resolution.catalog.packages.filter((p) => p.kind === "external");
    expect(external.map((p) => p.name).sort()).toEqual(["check", "health", "hunt", "mermaid", "think"]);
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

describe("skill-surface catalog: selector parity against the frozen SSD-01 discovery baseline", () => {
  const catalogSource = readFileSync(MANIFEST_PATH, "utf-8");
  const resolution = parseSkillSurfaceCatalog(catalogSource, { declared: true, profileComponents: PROFILE_COMPONENTS });
  if (resolution.status !== "valid") throw new Error("expected the real manifest to be a valid catalog");
  const catalog = resolution.catalog;
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) as {
    current_discovered_sets: {
      command_facade_matrix: Record<string, string[]>;
      cross_review_matrix: Record<string, Record<string, string[]>>;
    };
  };

  test("facadesForProfile matches discovery-baseline.json's command_facade_matrix for every profile (set comparison)", () => {
    for (const profile of SKILL_SURFACE_PROFILES) {
      const computed = [...facadesForProfile(catalog, profile)].sort();
      const expected = [...baseline.current_discovered_sets.command_facade_matrix[profile]].sort();
      expect({ profile, computed }).toEqual({ profile, computed: expected });
    }
  });

  test("facadesForProfile's own declared order matches the brief's illustrative order (plan, check, handoff[, gptpro])", () => {
    expect(facadesForProfile(catalog, "standard")).toEqual(["repo-harness-plan", "repo-harness-check", "repo-harness-handoff"]);
    expect(facadesForProfile(catalog, "product-planning")).toEqual([
      "repo-harness-plan", "repo-harness-check", "repo-harness-handoff", "repo-harness-gptpro",
    ]);
    expect(facadesForProfile(catalog, "strict")).toEqual([
      "repo-harness-plan", "repo-harness-check", "repo-harness-handoff", "repo-harness-gptpro",
    ]);
    expect(facadesForProfile(catalog, "minimal")).toEqual([]);
  });

  test("hostSkillPlacements matches discovery-baseline.json's cross_review_matrix for every profile", () => {
    for (const profile of SKILL_SURFACE_PROFILES) {
      const computed = hostSkillPlacements(catalog, profile);
      const expected = baseline.current_discovered_sets.cross_review_matrix[profile];
      expect([...computed.claude].sort()).toEqual([...(expected.claude ?? [])].sort());
      expect([...computed.codex].sort()).toEqual([...(expected.codex ?? [])].sort());
    }
  });

  test("hostSkillPlacements without a profile (init.ts's adopt flow) is the unconditional strict-tier bundle", () => {
    const unconditional = hostSkillPlacements(catalog);
    expect(unconditional).toEqual({ claude: ["codex-review"], codex: ["claude-review", "claude-plan"] });
  });

  test("externalSkillsForProfile: product-planning and strict get the 5 Waza+mermaid names; minimal/standard get none", () => {
    expect(externalSkillsForProfile(catalog, "minimal")).toEqual([]);
    expect(externalSkillsForProfile(catalog, "standard")).toEqual([]);
    expect(externalSkillsForProfile(catalog, "product-planning")).toEqual(["think", "hunt", "check", "health", "mermaid"]);
    expect(externalSkillsForProfile(catalog, "strict")).toEqual(["think", "hunt", "check", "health", "mermaid"]);
  });

  test("mutationPathSkillNames matches installProfileHostMutationPaths's current literals", () => {
    const { repoHarnessSkills, externalSkills } = mutationPathSkillNames(catalog);
    expect(repoHarnessSkills).toEqual([
      "repo-harness", "repo-harness-plan", "repo-harness-check", "repo-harness-handoff", "repo-harness-gptpro",
    ]);
    expect(externalSkills).toEqual(["think", "hunt", "check", "health", "mermaid", "codex-review", "claude-review"]);
  });

  test("profileOwnedSkillNames matches PROFILE_OWNED_SKILLS's current literal", () => {
    expect([...profileOwnedSkillNames(catalog)].sort()).toEqual(
      ["think", "hunt", "check", "health", "mermaid", "codex-review", "claude-review"].sort(),
    );
  });

  test("probeExpectations matches planningSkillNames/planningCapabilityPaths/crossModel's current literals", () => {
    const expectations = probeExpectations(catalog);
    expect(expectations.planningSkillNames).toEqual(["think", "hunt", "check", "health", "mermaid"]);
    expect(expectations.planningCapabilityPaths).toEqual([
      "assets/skill-commands/repo-harness-prd/SKILL.md",
      "assets/skill-commands/repo-harness-sprint/SKILL.md",
      "assets/skill-commands/repo-harness-goal/SKILL.md",
    ]);
    expect(expectations.crossModel).toEqual(["codex-review", "claude-review"]);
  });
});
