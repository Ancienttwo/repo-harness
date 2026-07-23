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
import { assertChatGptMcpContract } from "../helpers/chatgpt-mcp-contract";

// SSD-05 staged the canonical `repo-harness-chatgpt` package (router + setup /
// consult / continue / read-back / bridge references) INERT under
// assets/skills/**. SSD-06 has now performed the atomic public cutover: the
// package is a live, explicit-setup-only manifest entry, the retiring GPT Pro
// facades (repo-harness-gptpro, repo-harness-gptpro-setup) and the static
// .agents/skills/repo-harness-chatgpt-{bridge,browser} source dirs are
// deleted, and this file's former "inertness" proof flips to an "activation"
// proof mirroring tests/skill-surface/canonical-packages.test.ts's pattern.
// The generated bridge/browser projection identity (R2) is unaffected: this
// file's reconciliation-complete proxy still proves setup.ts's install-skill
// projection and the canonical bridge reference share one byte source.

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

describe("repo-harness-chatgpt canonical package: router frontmatter and size", () => {
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

describe("repo-harness-chatgpt canonical package: every reference is reachable", () => {
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

describe("repo-harness-chatgpt canonical package: read-back.md is bound to the code/test Connector-invocation contract", () => {
  // SSD-04/05 wave-acceptance intake finding (carried to SSD-06, MEDIUM
  // safe_auto): read-back.md is the declared single source of the Connector
  // Invocation Evidence contract but was not bound to
  // assertChatGptMcpContract, so it could silently drift from the code/test
  // contract once gptpro retires. This test is that binding.
  test("assertChatGptMcpContract accepts read-back.md's Connector Invocation Evidence content", () => {
    const readBack = readFileSync(join(PACKAGE_ROOT, "references", "read-back.md"), "utf-8");
    assertChatGptMcpContract(readBack);
  });
});

describe("repo-harness-chatgpt canonical package: activation proof -- live in manifest v2, explicit-setup only", () => {
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

  test("manifest v2 packages[] declares exactly one live entry named repo-harness-chatgpt, sourced at this package's directory", () => {
    const entry = catalog.packages.find((pkg) => pkg.name === PACKAGE_DIR);
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("integration");
    expect(entry?.source).toBe(`assets/skills/${PACKAGE_DIR}`);
    expect(entry?.discoverability).toBe("explicit-setup");
    expect(entry?.profiles).toEqual([]);
  });

  test("no profile ever discovers repo-harness-chatgpt as a facade, external skill, or host placement", () => {
    for (const profile of SKILL_SURFACE_PROFILES) {
      expect(facadesForProfile(catalog, profile)).not.toContain(PACKAGE_DIR);
      expect(externalSkillsForProfile(catalog, profile)).not.toContain(PACKAGE_DIR);
      const placements = hostSkillPlacements(catalog, profile);
      expect(placements.claude).not.toContain(PACKAGE_DIR);
      expect(placements.codex).not.toContain(PACKAGE_DIR);
    }
  });

  test("product-planning does not install ChatGPT (independence proven against the live catalog, not just router prose)", () => {
    expect(facadesForProfile(catalog, "product-planning")).not.toContain(PACKAGE_DIR);
    expect(hostSkillPlacements(catalog, "product-planning")).toEqual({ claude: [], codex: [] });
  });

  test("the retired GPT Pro facades and static ChatGPT source dirs are fully retired: absent from packages[], recorded in retiredPackages, and deleted from disk", () => {
    for (const retiredName of [
      "repo-harness-gptpro",
      "repo-harness-gptpro-setup",
      "repo-harness-chatgpt-bridge",
      "repo-harness-chatgpt-browser",
    ]) {
      expect(catalog.packages.find((pkg) => pkg.name === retiredName)).toBeUndefined();
      const entry = catalog.retiredPackages.find((r) => r.name === retiredName);
      expect(entry).toBeDefined();
      expect(entry?.replacement).toBe(PACKAGE_DIR);
    }
    expect(existsSync(join(ROOT, "assets", "skill-commands", "repo-harness-gptpro"))).toBe(false);
    expect(existsSync(join(ROOT, "assets", "skill-commands", "repo-harness-gptpro-setup"))).toBe(false);
    expect(existsSync(join(ROOT, ".agents", "skills", "repo-harness-chatgpt-bridge"))).toBe(false);
    expect(existsSync(join(ROOT, ".agents", "skills", "repo-harness-chatgpt-browser"))).toBe(false);
  });

  test("no selector output anywhere still names a retired GPT Pro facade", () => {
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
    expect(allSelectorNames).not.toContain("repo-harness-gptpro");
    expect(allSelectorNames).not.toContain("repo-harness-gptpro-setup");
  });
});

describe("repo-harness-chatgpt canonical package: reconciliation-complete proxy", () => {
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
