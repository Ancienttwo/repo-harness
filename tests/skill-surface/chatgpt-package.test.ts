import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
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
import { runMcpInstallSkill } from "../../src/cli/mcp/setup";

// SSD-05: the canonical `repo-harness-chatgpt` package (router + setup /
// consult / continue / read-back / bridge references) is staged INERT under
// assets/skills/**, mirroring the SSD-03 convention exercised by
// tests/skill-surface/canonical-packages.test.ts. It is not activated or
// wired into the manifest here -- SSD-06 repoints discovery at it. This file
// follows that test's pattern but stays self-contained (SSD-03's file is not
// edited): frontmatter/byte-cap, reference reachability, inertness against
// the real manifest/selectors, and a reconciliation-complete proxy proving
// setup.ts's install-skill projection and the canonical bridge reference now
// share one byte source.

const ROOT = join(import.meta.dir, "..", "..");
const PACKAGE_DIR = "repo-harness-chatgpt";
const SKILLS_ROOT = join(ROOT, "assets", "skills");
const PACKAGE_ROOT = join(SKILLS_ROOT, PACKAGE_DIR);
const MANIFEST_PATH = join(ROOT, "assets", "skill-commands", "manifest.json");
const ROUTER_BODY_BYTE_LIMIT = 2048;

const REFERENCES = ["setup.md", "consult.md", "continue.md", "read-back.md", "bridge.md"] as const;

function readSkill(): string {
  return readFileSync(join(PACKAGE_ROOT, "SKILL.md"), "utf-8");
}

function frontmatterOf(body: string): string {
  return body.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
}

describe("repo-harness-chatgpt canonical package (SSD-05): router frontmatter and size", () => {
  test("SKILL.md parses with valid frontmatter naming repo-harness-chatgpt", () => {
    const body = readSkill();
    const frontmatter = frontmatterOf(body);
    expect(frontmatter).not.toBe("");
    expect(frontmatter).toContain("name: repo-harness-chatgpt");
    // Exact-name check: the frontmatter `name:` line must equal the package
    // name, not merely contain it as a prefix of a longer retired name like
    // repo-harness-chatgpt-bridge.
    expect(frontmatter).toMatch(/^name:\s*repo-harness-chatgpt$/m);
    expect(frontmatter).toContain("description:");
    expect(frontmatter).toContain("when_to_use:");
    const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1] ?? "";
    expect(description.length).toBeGreaterThan(20);
  });

  test(`SKILL.md is a compact router: <= ${ROUTER_BODY_BYTE_LIMIT} bytes, routing + boundaries only`, () => {
    const byteSize = statSync(join(PACKAGE_ROOT, "SKILL.md")).size;
    expect(byteSize).toBeLessThanOrEqual(ROUTER_BODY_BYTE_LIMIT);

    const body = readSkill();
    expect(body).toContain("## Mode Selection");
    expect(body).toContain("## Boundaries");
    expect(body).not.toMatch(/^## Protocol$/m);
  });

  test("router states product-planning independence as a content rule", () => {
    const body = readSkill().toLowerCase();
    expect(body).toContain("product planning never implies");
  });
});

describe("repo-harness-chatgpt canonical package (SSD-05): every reference is reachable", () => {
  test("each declared reference file exists and is linked from SKILL.md by explicit relative path", () => {
    const body = readSkill();
    for (const reference of REFERENCES) {
      const relativePath = `references/${reference}`;
      expect(existsSync(join(PACKAGE_ROOT, relativePath))).toBe(true);
      expect(body).toContain(relativePath);
    }
  });

  test("references/ contains no undeclared files", () => {
    const actual = readdirSync(join(PACKAGE_ROOT, "references")).sort();
    expect(actual).toEqual([...REFERENCES].sort());
  });
});

describe("repo-harness-chatgpt canonical package (SSD-05): inertness — absent from manifest v2 and every selector output", () => {
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

  // Precise identity, not a bare substring: assets/skills/repo-harness-chatgpt-bridge
  // and assets/skills/repo-harness-chatgpt-browser (used by
  // .agents/skills/repo-harness-chatgpt-{bridge,browser} entries) are
  // *legitimately* still-registered retirement candidates today, and both
  // contain "repo-harness-chatgpt" as a plain substring. A naive
  // `.includes("repo-harness-chatgpt")` check would false-positive on those
  // pre-existing, still-active entries. The qualified, trailing-slash source
  // needle and exact-name checks below avoid that collision.
  const QUALIFIED_SOURCE_NEEDLE = `assets/skills/${PACKAGE_DIR}/`;

  test("manifest v2 packages[] declares no entry named exactly repo-harness-chatgpt or sourced under assets/skills/repo-harness-chatgpt/", () => {
    const violations = catalog.packages.flatMap((pkg) => {
      const hits: string[] = [];
      if (pkg.name === PACKAGE_DIR) hits.push(`${pkg.name}: name equals staged package "${PACKAGE_DIR}"`);
      if (pkg.source !== null && pkg.source.includes(QUALIFIED_SOURCE_NEEDLE)) {
        hits.push(`${pkg.name}: source "${pkg.source}" references staged package "${QUALIFIED_SOURCE_NEEDLE}"`);
      }
      return hits;
    });
    expect(violations).toEqual([]);

    // Sanity check that the needle logic itself is discriminating and this
    // isn't a vacuously-true assertion: the still-active legacy entries must
    // exist in the real manifest (proving the test can see real data) while
    // legitimately not tripping the staged-package check above.
    const legacyNames = catalog.packages.map((pkg) => pkg.name);
    expect(legacyNames).toContain("repo-harness-chatgpt-bridge");
    expect(legacyNames).toContain("repo-harness-chatgpt-browser");
  });

  test("no selector output names the staged package exactly, on any profile (including the unconditional bundle)", () => {
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

    // Exact equality only: a bare .includes() would flag legitimate,
    // unrelated names in this sweep (see the discriminating-needle comment
    // above the manifest-level test in this describe block).
    const violations = allSelectorNames.filter((name) => name === PACKAGE_DIR);
    expect(violations).toEqual([]);

    // Sanity check that the sweep produced real, non-trivial data instead of
    // vacuously passing on an accidentally-empty catalog. Note:
    // repo-harness-chatgpt-bridge/-browser are `explicit-setup` packages
    // (installed only through the dedicated `repo-harness mcp install-skill`
    // path this slice modifies) and are correctly absent from every
    // profile/host selector below by manifest design -- that is not this
    // package's inertness, it is the pre-existing explicit-setup contract for
    // the whole ChatGPT integration family.
    expect(allSelectorNames.length).toBeGreaterThan(20);
    expect(allSelectorNames).toContain("repo-harness-gptpro");
  });
});

describe("repo-harness-chatgpt canonical package (SSD-05): reconciliation-complete proxy", () => {
  test("no second SKILL_MD-like ChatGPT Skill template string exists anywhere under src/cli/mcp/", () => {
    const mcpSrcRoot = join(ROOT, "src", "cli", "mcp");
    const distinctiveMarkers = [
      "name: repo-harness-chatgpt-bridge",
      "# repo-harness-chatgpt-bridge",
      "You are operating inside a repo-harness adopted repository.",
    ];

    function allTsFilesUnder(dir: string): string[] {
      return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const child = join(dir, entry.name);
        if (entry.isDirectory()) return allTsFilesUnder(child);
        if (entry.isFile() && entry.name.endsWith(".ts")) return [child];
        return [];
      });
    }

    const violations = allTsFilesUnder(mcpSrcRoot).flatMap((file) => {
      const content = readFileSync(file, "utf-8");
      return distinctiveMarkers
        .filter((marker) => content.includes(marker))
        .map((marker) => `${file.slice(ROOT.length + 1)}: embeds "${marker}"`);
    });
    expect(violations).toEqual([]);
  });

  test("install-skill's projected SKILL.md is byte-identical to the canonical bridge reference (one shared byte source)", () => {
    const canonical = readFileSync(join(PACKAGE_ROOT, "references", "bridge.md"), "utf-8");
    const repoRoot = mkdtempSync(join(tmpdir(), "repo-harness-chatgpt-package-proxy-"));
    try {
      const result = runMcpInstallSkill({ repo: repoRoot });
      expect(result.changed.length).toBeGreaterThan(0);
      const projected = readFileSync(
        join(repoRoot, ".agents/skills/repo-harness-chatgpt-bridge/SKILL.md"),
        "utf-8",
      );
      expect(projected).toBe(canonical);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
