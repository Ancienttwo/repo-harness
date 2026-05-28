import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { assembleTemplate, loadSkillVersion } from "../scripts/assemble-template";
import { checkConsistency } from "../scripts/check-skill-version";

const REPO_ROOT = join(import.meta.dir, "..");

describe("Skill Version Consistency", () => {
  test("package release version is independent from workflow skill-version", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf-8"));
    const sv = JSON.parse(readFileSync(join(REPO_ROOT, "assets", "skill-version.json"), "utf-8"));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.version).not.toBe(sv.version);
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

  test("SKILL.md keeps the current compatibility trigger and retires project-initializer", () => {
    const skill = readFileSync(join(REPO_ROOT, "SKILL.md"), "utf-8");
    const frontmatterMatch = skill.match(/^---\n([\s\S]*?)\n---/);
    expect(frontmatterMatch?.[1]).toContain("name: agentic-dev");
    expect(frontmatterMatch?.[1]).toContain("agentic-dev-skill");
    expect(frontmatterMatch?.[1]).not.toContain("project-initializer");
  });

  test("checkConsistency returns consistent=true for current repo", () => {
    const result = checkConsistency();
    expect(result.consistent).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("checkConsistency reports only package and skill-version sources", () => {
    const result = checkConsistency();
    expect(result.packageJsonVersion).toBeDefined();
    expect(result.skillVersionJsonVersion).toBeDefined();
    expect("skillMdVersion" in result).toBe(false);
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

describe("Footer Partial Uses Template Variables", () => {
  test("07-footer.partial.md uses {{TEMPLATE_VERSION}} not hardcoded version", () => {
    const footer = readFileSync(
      join(REPO_ROOT, "assets", "partials", "07-footer.partial.md"),
      "utf-8"
    );
    expect(footer).toContain("{{TEMPLATE_VERSION}}");
    expect(footer).toContain("{{SKILL_VERSION}}");
    expect(footer).not.toMatch(/Template Version: \d+\.\d+\.\d+/);
  });
});

describe("Assembled Output Contains Version Info", () => {
  const output = assembleTemplate({
    planType: "C",
    variables: { PROJECT_NAME: "VersionTest" },
  });

  test("output contains SKILL_VERSION value", () => {
    const sv = loadSkillVersion();
    expect(output).toContain(`agentic-dev@${sv.version}`);
  });

  test("output contains TEMPLATE_VERSION value", () => {
    const sv = loadSkillVersion();
    expect(output).toContain(`Template Version: ${sv.templateVersion}`);
  });

  test("output does not contain raw SKILL_VERSION placeholder", () => {
    expect(output).not.toContain("{{SKILL_VERSION}}");
    expect(output).not.toContain("{{TEMPLATE_VERSION}}");
  });
});
