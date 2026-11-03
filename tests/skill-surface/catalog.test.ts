import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  externalSkillsForSelection,
  facadesForSelection,
  hostSkillPlacements,
  mutationPathSkillNames,
  parseSkillSurfaceCatalog,
  requiredExplicitExternalDependencyInstallGroups,
  requiredExplicitExternalSkillInstallGroup,
  selectionOwnedSkillNames,
  validateSkillSurfaceCatalogValue,
  type SkillSurfaceCatalog,
} from "../../src/core/skill-surface/catalog";
import { PLUGIN_IDS } from "../../src/core/skill-surface/plugin-manifest";

const ROOT = join(import.meta.dir, "..", "..");
const MANIFEST_PATH = join(ROOT, "assets", "skill-commands", "manifest.json");

function codes(value: ReturnType<typeof validateSkillSurfaceCatalogValue>): string[] {
  return value.diagnostics.map((d) => d.code);
}

/** A router + one core-owned facade, valid on its own (used as the "happy path" base every bad-fixture test mutates one thing away from). */
const ROUTER = {
  name: "repo-harness",
  kind: "router",
  audience: "bot",
  source: ".",
  provider: null,
  hosts: ["claude", "codex"],
  owner: "core",
  explicitOnly: false,
  discoverability: "always",
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
  owner: "core",
  explicitOnly: false,
  discoverability: "profile-facade",
  requires: [],
  mutatesRepoByDefault: false,
  summary: "plan facade",
  retirementCandidate: null,
};

function catalogValue(packages: unknown[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 4,
    surface: "test-surface",
    source: "assets/skill-commands",
    router: "repo-harness",
    packages,
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

  test("UNSUPPORTED_VERSION: version is not 4", () => {
    expect(codes(validateSkillSurfaceCatalogValue({ ...VALID_BASE, version: 3 }))).toEqual(["UNSUPPORTED_VERSION"]);
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
    for (const field of ["name", "kind", "discoverability", "summary"]) {
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

  test("FIELD_REQUIRED: hosts/requires must be string arrays; explicitOnly/mutatesRepoByDefault must be boolean", () => {
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, { ...FACADE, hosts: "claude" }]))))
      .toContain("FIELD_REQUIRED");
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, { ...FACADE, explicitOnly: "false" }]))))
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

  test("INVALID_OWNER: an owner outside core and the plugin ids", () => {
    const broken = { ...FACADE, owner: "bogus" };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, broken])))).toContain("INVALID_OWNER");
  });

  test("INVALID_INTEGRITY_SCOPE: integrity-bound packages must stay explicit-only external packages", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    const selectionProjected = {
      ...FACADE,
      name: "selection-integrity-bypass",
      kind: "external",
      source: null,
      provider: "example/provider@pinned",
      integrity: digest,
      explicitOnly: false,
      discoverability: "external-marketplace",
    };
    const nonExternal = { ...FACADE, integrity: digest };
    expect(codes(validateSkillSurfaceCatalogValue(catalogValue([ROUTER, selectionProjected]))))
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

  test("a fixture with none of the above problems is valid with zero diagnostics", () => {
    const result = validateSkillSurfaceCatalogValue(VALID_BASE);
    expect(result.status).toBe("valid");
    expect(result.diagnostics).toEqual([]);
  });
});

describe("skill-surface catalog: the real manifest.json on disk", () => {
  const source = readFileSync(MANIFEST_PATH, "utf-8");
  const resolution = parseSkillSurfaceCatalog(source, {
    declared: true,
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
  test("covers all 15 repo-owned entries plus the 9 external skills (24 packages)", () => {
    if (resolution.status !== "valid") throw new Error("expected valid catalog");
    expect(resolution.catalog.packages.length).toBe(24);
    const repoOwned = resolution.catalog.packages.filter((p) => p.kind !== "external");
    expect(repoOwned.length).toBe(15);
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
    expect(mergeGate?.explicitOnly).toBe(true);
    expect(mergeGate?.source).toBeNull();
    // Non-selectable: a judge-kind package never matches any selector's kind filter.
    for (const plugins of [[], PLUGIN_IDS]) {
      expect(facadesForSelection(resolution.catalog, plugins)).not.toContain("merge-gate");
      expect(externalSkillsForSelection(resolution.catalog, plugins)).not.toContain("merge-gate");
      const placements = hostSkillPlacements(resolution.catalog, plugins);
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
  const resolution = parseSkillSurfaceCatalog(catalogSource, { declared: true });
  if (resolution.status !== "valid") throw new Error("expected the real manifest to be a valid catalog");
  const catalog = resolution.catalog;

  test("facadesForSelection matches the target discovery matrix for core only and every plugin", () => {
    expect(facadesForSelection(catalog, [])).toEqual([
      "repo-harness-check", "repo-harness-test", "repo-harness-issue-flow", "repo-harness-ship",
    ]);
    expect(facadesForSelection(catalog, PLUGIN_IDS)).toEqual([
      "repo-harness-check", "repo-harness-test", "repo-harness-product", "repo-harness-issue-flow", "repo-harness-ship",
      "repo-harness-architecture", "repo-harness-archimap", "obsidian-memory", "windows-python-first",
    ]);
  });

  test("a plugin-owned facade projects only when its owner plugin is selected", () => {
    const core = facadesForSelection(catalog, []);
    expect(facadesForSelection(catalog, ["product"])).toEqual([...core.slice(0, 2), "repo-harness-product", ...core.slice(2)]);
    expect(facadesForSelection(catalog, ["architecture"])).toEqual([...core, "repo-harness-architecture", "repo-harness-archimap"]);
    expect(facadesForSelection(catalog, ["strategy-memory"])).toEqual([...core, "obsidian-memory"]);
    expect(facadesForSelection(catalog, ["platform"])).toEqual([...core, "windows-python-first"]);
  });

  test("repo-harness-setup is router-only progressive load in every selection", () => {
    for (const plugins of [[], PLUGIN_IDS]) {
      expect(facadesForSelection(catalog, plugins)).not.toContain("repo-harness-setup");
    }
  });

  test("hostSkillPlacements: cross-review places repo-harness-cross-review on every host and peer-runtime places repo-harness-herdr-portal on claude only", () => {
    expect(hostSkillPlacements(catalog, [])).toEqual({ claude: [], codex: [], pi: [], dsh: [] });
    expect(hostSkillPlacements(catalog, ["cross-review"])).toEqual({
      claude: ["repo-harness-cross-review"],
      codex: ["repo-harness-cross-review"],
      pi: ["repo-harness-cross-review"],
      dsh: [],
    });
    expect(hostSkillPlacements(catalog, ["peer-runtime"])).toEqual({ claude: ["repo-harness-herdr-portal"], codex: [], pi: [], dsh: [] });
    expect(hostSkillPlacements(catalog, PLUGIN_IDS)).toEqual({
      claude: ["repo-harness-cross-review", "repo-harness-herdr-portal"],
      codex: ["repo-harness-cross-review"],
      pi: ["repo-harness-cross-review"],
      dsh: [],
    });
  });

  test("hostSkillPlacements without a selection (init.ts's init flow) is the unconditional bundle", () => {
    const unconditional = hostSkillPlacements(catalog);
    expect(unconditional).toEqual({
      claude: ["repo-harness-cross-review", "repo-harness-herdr-portal"],
      codex: ["repo-harness-cross-review"],
      pi: ["repo-harness-cross-review"],
      dsh: [],
    });
  });

  test("externalSkillsForSelection: core gets Waza and Mermaid while Reverse Skill and the Obsidian companions stay explicit-only", () => {
    expect(externalSkillsForSelection(catalog, [])).toEqual(["think", "hunt", "check", "health", "mermaid"]);
    expect(externalSkillsForSelection(catalog, PLUGIN_IDS)).toEqual(["think", "hunt", "check", "health", "mermaid"]);
    expect(externalSkillsForSelection(catalog, undefined)).toContain("reverse-skill-router");
  });

  test("requiredExplicitExternalSkillInstallGroup selects the pinned explicit-only package", () => {
    expect(requiredExplicitExternalSkillInstallGroup(catalog, "reverse-skill-router", ["codex"])).toEqual({
      status: "selected",
      group: {
      provider: "zhaoxuya520/reverse-skill#539899ddc7608d63dc66e08e794d572e080f1a55",
      hosts: ["codex"],
      skills: ["reverse-skill-router"],
      integrityBySkill: {
        "reverse-skill-router": "sha256:7aafee6c0dec684d410af6864ab77da4d88b9d442142c0efb91b235ce9793dda",
      },
      },
    });
  });

  test("requiredExplicitExternalSkillInstallGroup rejects a selection-projected package", () => {
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
        provider: "kepano/obsidian-skills#a1dc48e68138490d522c04cbf5822214c6eb1202",
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
      "repo-harness-issue-flow", "repo-harness-ship", "repo-harness-architecture", "repo-harness-archimap",
      "obsidian-memory", "windows-python-first",
    ]);
    expect(externalSkills).toEqual([
      "repo-harness-cross-review", "repo-harness-herdr-portal", "herdr", "think", "hunt", "check", "health", "mermaid", "reverse-skill-router",
      "obsidian-markdown", "obsidian-cli",
    ]);
  });

  test("selectionOwnedSkillNames matches the provider-skill + selection-projected external set", () => {
    expect([...selectionOwnedSkillNames(catalog)].sort()).toEqual(
      ["think", "hunt", "check", "health", "mermaid", "repo-harness-cross-review", "repo-harness-herdr-portal"].sort(),
    );
  });
});

// `explicit-only` is the "installed but not model-auto-routed" tier. The
// manifest is the single source of truth; the committed host-native switches
// (Claude SKILL.md `disable-model-invocation`, Codex agents/openai.yaml
// `allow_implicit_invocation`) are projections that must never drift from it.
describe("skill-surface catalog: explicit-only projection onto host-native switches", () => {
  const resolution = parseSkillSurfaceCatalog(readFileSync(MANIFEST_PATH, "utf-8"), { declared: true });
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

  test("the explicit-only set is exactly repo-harness-architecture, repo-harness-ship and obsidian-memory", () => {
    expect(facades.filter((pkg) => pkg.discoverability === "explicit-only").map((pkg) => pkg.name).sort()).toEqual([
      "obsidian-memory", "repo-harness-architecture", "repo-harness-ship",
    ]);
  });

  test("every facade carries both host switches iff the manifest declares it explicit-only", () => {
    for (const pkg of facades) {
      const explicitOnly = pkg.discoverability === "explicit-only";
      expect([pkg.name, claudeDisablesModelInvocation(pkg.source as string)]).toEqual([pkg.name, explicitOnly]);
      expect([pkg.name, codexDisablesImplicitInvocation(pkg.source as string)]).toEqual([pkg.name, explicitOnly]);
    }
  });

  test("explicit-only facades stay installed: facade selection filters kind and owner, never discoverability", () => {
    expect(facadesForSelection(catalog, [])).toContain("repo-harness-ship");
    expect(facadesForSelection(catalog, ["strategy-memory"])).toContain("obsidian-memory");
    for (const name of ["repo-harness-ship", "repo-harness-architecture", "obsidian-memory"]) expect(facadesForSelection(catalog, PLUGIN_IDS)).toContain(name);
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
    "repo-harness", "repo-harness-check", "repo-harness-product", "repo-harness-issue-flow", "repo-harness-ship",
    "obsidian-memory", "repo-harness-cross-review", "repo-harness-herdr-portal",
    "repo-harness-strategy",
  ]);
  expect(lines(worker.stdout).map((line) => line.split("\t")[0])).toEqual([
    "repo-harness-setup", "repo-harness-test", "repo-harness-architecture", "repo-harness-archimap", "windows-python-first",
  ]);
  for (const line of [...lines(bot.stdout), ...lines(worker.stdout)]) {
    expect(existsSync(join(ROOT, line.split("\t")[1], "SKILL.md"))).toBe(true);
  }
  const invalid = select("mixed");
  expect(invalid.status).not.toBe(0);
  expect(invalid.stdout).toBe("");
});
