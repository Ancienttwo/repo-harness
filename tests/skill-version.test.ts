import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { checkConsistency } from "../scripts/check-skill-version";

const REPO_ROOT = join(import.meta.dir, "..");

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

  test("checkConsistency reports only package and skill-version sources", () => {
    const result = checkConsistency();
    expect(result.packageJsonVersion).toBeDefined();
    expect(result.skillVersionJsonVersion).toBeDefined();
    expect(result.templateVersionJsonVersion).toBeDefined();
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
