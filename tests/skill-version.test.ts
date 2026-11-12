import { describe, test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { checkConsistency } from "../scripts/check-skill-version";

const REPO_ROOT = join(import.meta.dir, "..");

/** A repo-harness checkout whose README body holds `line` as its release line. */
function scratchRepo(line: string): string {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8"));
  const sv = JSON.parse(readFileSync(join(REPO_ROOT, "assets", "skill-version.json"), "utf-8"));
  const root = mkdtempSync(join(tmpdir(), "skill-version-readme-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "package.json"), JSON.stringify(pkg));
  writeFileSync(join(root, "assets", "skill-version.json"), JSON.stringify(sv));
  writeFileSync(join(root, "README.md"), `# repo-harness\n\n${line}\n`);
  return root;
}
/** The complete README release line of a version. */
function releaseLine(version: string): string {
  return `- npm: \`repo-harness@${version}\` · workflow stamp \`repo-harness@${version}+template@${version}\``;
}

describe("Skill Version Consistency", () => {
  test("package, skill, and template versions share the release line", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8"));
    const sv = JSON.parse(readFileSync(join(REPO_ROOT, "assets", "skill-version.json"), "utf-8"));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.version).toBe(sv.version);
    expect(pkg.version).toBe(sv.templateVersion);
  });

  test("SKILL.md frontmatter follows the new skill-creator contract", () => {
    const skill = readFileSync(join(REPO_ROOT, "SKILL.md"), "utf-8");
    const frontmatterMatch = skill.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch).not.toBeNull();
    expect(frontmatterMatch?.[1]).toContain("name:");
    expect(frontmatterMatch?.[1]).toContain("description:");
    expect(frontmatterMatch?.[1]).toContain("when_to_use:");
    expect(frontmatterMatch?.[1]).not.toContain("version:");
  });

  test("SKILL.md retires the repo-harness-skill and project-initializer triggers", () => {
    const skill = readFileSync(join(REPO_ROOT, "SKILL.md"), "utf-8");
    const frontmatterMatch = skill.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch?.[1]).toContain("name: repo-harness");
    expect(frontmatterMatch?.[1]).not.toContain("repo-harness-skill");
    expect(frontmatterMatch?.[1]).not.toContain("project-initializer");
  });

  test("checkConsistency returns consistent=true for current repo", () => {
    const result = checkConsistency();
    expect(result.consistent).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("checkConsistency reports package, skill-version and README sources", () => {
    const result = checkConsistency();
    expect(result.packageJsonVersion).toBeDefined();
    expect(result.skillVersionJsonVersion).toBeDefined();
    expect(result.templateVersionJsonVersion).toBeDefined();
    expect(result.readmeVersionPin).toEqual({
      npm: result.skillVersionJsonVersion,
      skill: result.skillVersionJsonVersion,
      template: result.templateVersionJsonVersion,
    });
    expect("skillMdVersion" in result).toBe(false);
  });

  test("checkConsistency reports a README release line that names another version", () => {
    const root = scratchRepo(releaseLine("0.1.2"));
    try {
      const result = checkConsistency(root);
      expect(result.consistent).toBe(false);
      expect(result.errors).toContainEqual(
        `README.md npm pin (0.1.2) must match package.json.version (${result.packageJsonVersion})`,
      );
      expect(result.errors.filter((error) => error.startsWith("README.md"))).toHaveLength(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("checkConsistency needs the complete release line, not its versions alone", () => {
    const version = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8")).version;
    // Each line carries both release versions, but not in the release form.
    const candidates = [
      releaseLine(version).replace("- npm: ", ""),
      `<!-- ${releaseLine(version)} -->`,
    ];
    for (const candidate of candidates) {
      const root = scratchRepo(candidate);
      try {
        const result = checkConsistency(root);
        expect(result.readmeVersionPin).toBeNull();
        expect(result.consistent).toBe(false);
        expect(result.errors.some((error) => error.startsWith("README.md has no release line"))).toBe(true);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });
});

describe("Skill Version Manifest Structure", () => {
  const sv = JSON.parse(readFileSync(join(REPO_ROOT, "assets", "skill-version.json"), "utf-8"));

  test("has required version field", () => {
    expect(sv.version).toBeDefined();
    expect(typeof sv.version).toBe("string");
    expect(sv.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("has required templateVersion field", () => {
    expect(sv.templateVersion).toBeDefined();
    expect(typeof sv.templateVersion).toBe("string");
    expect(sv.templateVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("has compatibility section", () => {
    expect(sv.compatibility).toBeDefined();
    expect(sv.compatibility.minClaudeCodeVersion).toBeDefined();
    expect(sv.compatibility.minBunVersion).toBeDefined();
  });

  test("has breakingChanges array", () => {
    expect(Array.isArray(sv.breakingChanges)).toBe(true);
    for (const change of sv.breakingChanges) {
      expect(change.version).toBeDefined();
      expect(change.description).toBeDefined();
    }
  });

  test("has generatedProjectStamp config", () => {
    expect(sv.generatedProjectStamp).toBeDefined();
    expect(sv.generatedProjectStamp.format).toBeDefined();
    expect(sv.generatedProjectStamp.location).toBe(".claude/.skill-version");
  });
});
