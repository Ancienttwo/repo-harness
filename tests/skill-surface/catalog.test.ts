import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  externalSkillInstallGroups,
  externalSkillsForProfile,
  facadesForProfile,
  hostSkillPlacements,
  mutationPathSkillNames,
  parseSkillSurfaceCatalog,
  probeExpectations,
  profileOwnedSkillNames,
  requiredExplicitExternalDependencyInstallGroups,
  requiredExplicitExternalSkillInstallGroup,
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
  audience: "bot",
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
  audience: "bot",
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
  const hostSkillPlacementsByProfile: Record<string, { claude: readonly string[]; codex: readonly string[]; pi: readonly string[] }> = {};
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

test("retired package cleanup preserves exact proof records and rejects invalid ownership metadata", () => {
  const cleanup = [{ actionId: "retired-skills", historicalFingerprints: [`sha256:${"a".repeat(64)}`] }];
  const value = catalogValue([ROUTER, FACADE], { retiredPackages: [{ name: "old-skill", replacement: null, note: "Retired package.", cleanup }] });
  const parsed = validateSkillSurfaceCatalogValue(value);
  expect(parsed.status).toBe("valid");
  if (parsed.status !== "valid") throw new Error("expected valid retirement proof");
  expect(parsed.catalog.retiredPackages[0]!.cleanup).toEqual(cleanup);
  for (const malformed of [
    { actionId: "retired-skills", historicalFingerprints: [] },
    { actionId: "retired-skills", historicalFingerprints: ["sha256:bad"] },
    { actionId: "", historicalFingerprints: cleanup[0]!.historicalFingerprints },
  ]) {
    expect(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, FACADE], {
      retiredPackages: [{ name: "old-skill", replacement: null, note: "Retired package.", cleanup: [malformed] }],
    })).status).toBe("invalid");
  }
  expect(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, FACADE], {
    retiredPackages: [{ name: "../outside", replacement: null, note: "Retired package.", cleanup }],
  })).status).toBe("invalid");
});

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

  test("PACKAGE_NOT_OBJECT: entries before valid packages keep dependency checks on their own packages", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as { packages: unknown[] };
    const real = validateSkillSurfaceCatalogValue({ ...manifest, packages: [null, ...manifest.packages] });
    expect(real.status).toBe("invalid");
    expect(real.diagnostics.map((d) => `${d.code} ${d.path}`)).toEqual(["PACKAGE_NOT_OBJECT packages[0]"]);

    const unknownRequirement = { ...FACADE, requires: ["missing-skill"] };
    const left = { ...FACADE, name: "left", source: "assets/skill-commands/left", requires: ["right"] };
    const right = { ...FACADE, name: "right", source: "assets/skill-commands/right", requires: ["left"] };
    const retiring = { ...FACADE, name: "retiring", source: "assets/skill-commands/retiring", retirementCandidate: { replacement: "gone", note: "n" } };
    const interleaved = validateSkillSurfaceCatalogValue(
      catalogValue([null, ROUTER, 42, unknownRequirement, "x", left, right, retiring]),
    );
    expect(interleaved.status).toBe("invalid");
    expect(interleaved.diagnostics.map((d) => `${d.code} ${d.path}`)).toEqual([
      "PACKAGE_NOT_OBJECT packages[0]",
      "PACKAGE_NOT_OBJECT packages[2]",
      "PACKAGE_NOT_OBJECT packages[4]",
      "UNKNOWN_REQUIREMENT packages[3].requires[0]",
      "RETIREMENT_REPLACEMENT_UNKNOWN packages[7].retirementCandidate.replacement",
      "CYCLIC_REQUIREMENT packages[5].requires",
    ]);
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

  test("FIELD_REQUIRED: integrity must be a lowercase SHA-256 digest", () => {
    for (const integrity of [42, "sha256:ABC", "sha512:deadbeef"]) {
      const broken = { ...FACADE, integrity };
      expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).toContain("FIELD_REQUIRED");
    }
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

  test("INVALID_INTEGRITY_SCOPE: integrity-bound packages must stay explicit-only external packages", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const profileSelected = {
      ...FACADE,
      name: "profile-integrity-bypass",
      kind: "external",
      source: null,
      provider: "example/provider@pinned",
      integrity: digest,
      profiles: ["minimal"],
      discoverability: "external-marketplace",
      component: "adaptive-workflow",
    };
    const nonExternal = { ...FACADE, integrity: digest };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, profileSelected]))))
      .toContain("INVALID_INTEGRITY_SCOPE");
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, nonExternal]))))
      .toContain("INVALID_INTEGRITY_SCOPE");
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

  test("UNKNOWN_REQUIREMENT: requires targets must exist", () => {
    const broken = { ...FACADE, requires: ["missing-skill"] };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken]))))
      .toContain("UNKNOWN_REQUIREMENT");
  });

  test("SELF_REQUIREMENT: packages cannot require themselves", () => {
    const broken = { ...FACADE, requires: [FACADE.name] };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken]))))
      .toContain("SELF_REQUIREMENT");
  });

  test("DUPLICATE_REQUIREMENT: requires edges are unique", () => {
    const broken = { ...FACADE, requires: [ROUTER.name, ROUTER.name] };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken]))))
      .toContain("DUPLICATE_REQUIREMENT");
  });

  test("CYCLIC_REQUIREMENT: dependency graphs must be acyclic", () => {
    const left = { ...FACADE, name: "left", requires: ["right"] };
    const right = { ...FACADE, name: "right", source: "assets/skill-commands/right", requires: ["left"] };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, left, right]))))
      .toContain("CYCLIC_REQUIREMENT");
  });

  test("HOST_INCOMPATIBLE_REQUIREMENT: every consumer host must be supported by its dependency", () => {
    const dependency = {
      ...FACADE,
      name: "codex-only",
      source: "assets/skill-commands/codex-only",
      hosts: ["codex"],
    };
    const broken = { ...FACADE, requires: [dependency.name] };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken, dependency]))))
      .toContain("HOST_INCOMPATIBLE_REQUIREMENT");
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

  // Current closed catalog excludes the retired headless plan skill.
  test("covers all 11 repo-owned entries plus the 9 external skills (20 packages)", () => {
    if (resolution.status !== "valid") throw new Error("expected valid catalog");
    expect(resolution.catalog.packages.length).toBe(20);
    const repoOwned = resolution.catalog.packages.filter((p) => p.kind !== "external");
    expect(repoOwned.length).toBe(11);
    expect(repoOwned.map(p => p.name)).not.toContain("claude-plan");
    const external = resolution.catalog.packages.filter((p) => p.kind === "external");
    expect(external.map((p) => p.name).sort()).toEqual([
      "check", "health", "herdr", "hunt", "mermaid", "obsidian-cli", "obsidian-markdown", "reverse-skill-router", "think",
    ]);
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

  test("retiredPackages records all 20 retired names with a live or null replacement", () => {
    if (resolution.status !== "valid") throw new Error("expected valid catalog");
    const catalog = resolution.catalog;
    expect(catalog.retiredPackages.length).toBe(20);
    const liveNames = new Set(catalog.packages.map((p) => p.name));
    for (const entry of catalog.retiredPackages) {
      expect(entry.note.length).toBeGreaterThan(0);
      if (entry.replacement !== null) expect(liveNames.has(entry.replacement)).toBe(true);
    }
    expect(catalog.retiredPackages.find((e) => e.name === "repo-harness-autoplan")?.replacement).toBeNull();
    expect(catalog.retiredPackages.find((e) => e.name === "codex-review")?.replacement).toBeNull();
    // The exclusive CLI/schema/host/session is now retired without an alias.
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
      "repo-harness-check", "obsidian-memory",
    ]);
    expect(facadesForProfile(catalog, "full")).toEqual([
      "repo-harness-check", "repo-harness-test", "repo-harness-product", "repo-harness-ship",
      "obsidian-memory",
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

  test("hostSkillPlacements: full places repo-harness-cross-review on both hosts without retired plan skill", () => {
    expect(hostSkillPlacements(catalog, "minimal")).toEqual({ claude: [], codex: [], pi: [] });
    expect(hostSkillPlacements(catalog, "full")).toEqual({
      claude: ["repo-harness-cross-review"],
      codex: ["repo-harness-cross-review"],
      pi: [],
    });
  });

  test("hostSkillPlacements without a profile (init.ts's init flow) is the unconditional full-tier bundle", () => {
    const unconditional = hostSkillPlacements(catalog);
    expect(unconditional).toEqual({ claude: ["repo-harness-cross-review"], codex: ["repo-harness-cross-review"], pi: [] });
  });

  test("explicit ChatGPT setup is never implied by either install profile", () => {
    for (const profile of SKILL_SURFACE_PROFILES) {
      expect(facadesForProfile(catalog, profile)).not.toContain("repo-harness-chatgpt");
    }
    const chatgpt = catalog.packages.find((p) => p.name === "repo-harness-chatgpt");
    expect(chatgpt?.discoverability).toBe("explicit-setup");
    expect(chatgpt?.profiles).toEqual([]);
  });

  test("externalSkillsForProfile: full gets Waza and Mermaid while Reverse Skill stays explicit-only", () => {
    expect(externalSkillsForProfile(catalog, "minimal")).toEqual([]);
    expect(externalSkillsForProfile(catalog, "full")).toEqual(["think", "hunt", "check", "health", "mermaid"]);
    expect(externalSkillsForProfile(catalog, undefined)).toContain("reverse-skill-router");
  });

  test("externalSkillInstallGroups applies profile and host gates while excluding explicit-only packages", () => {
    expect(externalSkillInstallGroups(catalog, {
      hosts: ["claude", "codex"],
      profileGate: "minimal",
    })).toEqual([]);
    expect(externalSkillInstallGroups(catalog, {
      hosts: ["claude", "codex"],
      profileGate: "full",
    }).map(({ provider, hosts, skills }) => ({ provider, hosts, skills }))).toEqual([
      { provider: "tw93/Waza", hosts: ["claude", "codex"], skills: ["think", "hunt", "check", "health"] },
      { provider: "BfdCampos/dotfiles", hosts: ["claude", "codex"], skills: ["mermaid"] },
    ]);
    expect(requiredExplicitExternalSkillInstallGroup(catalog, "reverse-skill-router", ["codex"])).toEqual({
      status: "selected",
      group: {
      provider: "zhaoxuya520/reverse-skill@539899ddc7608d63dc66e08e794d572e080f1a55",
      hosts: ["codex"],
      skills: ["reverse-skill-router"],
      integrityBySkill: {
        "reverse-skill-router": "sha256:7aafee6c0dec684d410af6864ab77da4d88b9d442142c0efb91b235ce9793dda",
      },
      },
    });
  });

  test("requiredExplicitExternalSkillInstallGroup rejects a profile-selected package", () => {
    const fullPackage = catalog.packages.find((pkg) => pkg.name === "mermaid")!;
    expect(requiredExplicitExternalSkillInstallGroup(catalog, fullPackage.name, ["codex"])).toEqual({
      status: "not_explicit_only",
      name: "mermaid",
    });
  });

  test("requiredExplicitExternalSkillInstallGroup requires pinned tree integrity", () => {
    const withoutIntegrity: SkillSurfaceCatalog = {
      ...catalog,
      packages: catalog.packages.map((pkg) => (
        pkg.name === "reverse-skill-router" ? { ...pkg, integrity: null } : pkg
      )),
    };
    expect(requiredExplicitExternalSkillInstallGroup(withoutIntegrity, "reverse-skill-router", ["codex"])).toEqual({
      status: "missing_integrity",
      name: "reverse-skill-router",
    });
  });

  test("Obsidian companion dependency closure selects exactly the two pinned Skills for both hosts", () => {
    expect(requiredExplicitExternalDependencyInstallGroups(
      catalog,
      "obsidian-memory",
      ["claude", "codex"],
    )).toEqual({
      status: "selected",
      groups: [{
        provider: "kepano/obsidian-skills@a1dc48e68138490d522c04cbf5822214c6eb1202",
        hosts: ["claude", "codex"],
        skills: ["obsidian-markdown", "obsidian-cli"],
        integrityBySkill: {
          "obsidian-markdown": "sha256:ac9b702f9697f0bbf5f0fdc0c6896d94efef01438a59a4b508e5d7346da050e6",
          "obsidian-cli": "sha256:58b3eaf9ccaadfcbe3b8d0eddb0d1fe872ef42c4cf289393a72d4e9a6d896f6f",
        },
      }],
    });
  });

  test("mutationPathSkillNames covers every package path that can be host-synced post-cutover", () => {
    const { repoHarnessSkills, externalSkills } = mutationPathSkillNames(catalog);
    expect(repoHarnessSkills).toEqual([
      "repo-harness", "repo-harness-check", "repo-harness-test", "repo-harness-product",
      "repo-harness-ship", "obsidian-memory",
    ]);
    expect(externalSkills).toEqual([
      "repo-harness-cross-review", "herdr", "think", "hunt", "check", "health", "mermaid", "reverse-skill-router",
      "obsidian-markdown", "obsidian-cli",
    ]);
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

// `explicit-only` is the "installed but not model-auto-routed" tier. The
// manifest is the single source of truth; the committed host-native switches
// (Claude SKILL.md `disable-model-invocation`, Codex agents/openai.yaml
// `allow_implicit_invocation`) are projections that must never drift from it.
describe("skill-surface catalog: explicit-only projection onto host-native switches", () => {
  const resolution = parseSkillSurfaceCatalog(readFileSync(MANIFEST_PATH, "utf-8"), { declared: true, profileComponents: PROFILE_COMPONENTS });
  if (resolution.status !== "valid") throw new Error("expected the real manifest to be a valid catalog");
  const catalog = resolution.catalog;
  const facades = catalog.packages.filter((pkg) => pkg.kind === "facade" && pkg.source !== null);

  function claudeDisablesModelInvocation(source: string): boolean {
    const frontmatter = readFileSync(join(ROOT, source, "SKILL.md"), "utf-8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    return /^disable-model-invocation:\s*true\s*$/m.test(frontmatter);
  }

  function codexDisablesImplicitInvocation(source: string): boolean {
    const path = join(ROOT, source, "agents", "openai.yaml");
    return existsSync(path) && /^\s*allow_implicit_invocation:\s*false\s*$/m.test(readFileSync(path, "utf-8"));
  }

  test("the explicit-only set is exactly repo-harness-ship and obsidian-memory", () => {
    expect(facades.filter((pkg) => pkg.discoverability === "explicit-only").map((pkg) => pkg.name).sort()).toEqual([
      "obsidian-memory", "repo-harness-ship",
    ]);
  });

  test("every facade carries both host switches iff the manifest declares it explicit-only", () => {
    for (const pkg of facades) {
      const explicitOnly = pkg.discoverability === "explicit-only";
      expect([pkg.name, claudeDisablesModelInvocation(pkg.source as string)]).toEqual([pkg.name, explicitOnly]);
      expect([pkg.name, codexDisablesImplicitInvocation(pkg.source as string)]).toEqual([pkg.name, explicitOnly]);
    }
  });

  test("explicit-only facades stay installed: facade selection filters kind and profile, never discoverability", () => {
    expect(facadesForProfile(catalog, "minimal")).toContain("obsidian-memory");
    for (const name of ["repo-harness-ship", "obsidian-memory"]) expect(facadesForProfile(catalog, "full")).toContain(name);
  });
});


describe("skill audiences", () => {
  test("rejects missing or invalid audience", () => {
    for (const audience of [undefined, "mixed"]) {
      const result = validateSkillSurfaceCatalogValue(catalogValue([ROUTER, { ...FACADE, audience }]));
      expect(result.status).toBe("invalid");
      expect(result.diagnostics.some((entry) => entry.path.endsWith(".audience"))).toBe(true);
    }
  });

  test("every shipped entrypoint states its catalog audience and the merged name is retired", () => {
    const result = parseSkillSurfaceCatalog(readFileSync(MANIFEST_PATH, "utf-8"), { declared: true });
    if (result.status !== "valid") throw new Error("invalid real catalog");
    for (const pkg of result.catalog.packages.filter((pkg) => pkg.source !== null)) {
      const body = readFileSync(join(ROOT, pkg.source!, "SKILL.md"), "utf-8");
      expect(body.toLowerCase()).toContain(`${pkg.audience} entrypoint`);

    }
    expect(result.catalog.packages.some((pkg) => pkg.name === "repo-harness-plan")).toBe(false);
    expect(result.catalog.retiredPackages.find((pkg) => pkg.name === "repo-harness-plan")?.replacement).toBe("repo-harness-check");
  });
});


test("audience source selection returns disjoint complete load groups and rejects unknown roles", () => {
  const select = (role: string) => spawnSync(process.execPath, [join(ROOT, "scripts/skill-surface-select.ts"), "audience-sources", role], { cwd: ROOT, encoding: "utf-8" });
  const bot = select("bot");
  const worker = select("worker");
  expect(bot.status).toBe(0);
  expect(worker.status).toBe(0);
  const lines = (body: string) => body.trim().split("\n");
  expect(lines(bot.stdout).map((line) => line.split("\t")[0])).toEqual([
    "repo-harness", "repo-harness-check", "repo-harness-product", "repo-harness-ship",
    "obsidian-memory", "repo-harness-cross-review", "repo-harness-chatgpt",
  ]);
  expect(lines(worker.stdout).map((line) => line.split("\t")[0])).toEqual([
    "repo-harness-setup", "repo-harness-test", "repo-harness-architecture",
  ]);
  for (const line of [...lines(bot.stdout), ...lines(worker.stdout)]) {
    expect(existsSync(join(ROOT, line.split("\t")[1], "SKILL.md"))).toBe(true);
  }
  const invalid = select("mixed");
  expect(invalid.status).not.toBe(0);
  expect(invalid.stdout).toBe("");
});
