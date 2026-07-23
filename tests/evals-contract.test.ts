import { describe, test, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

describe("Skill eval assets", () => {
  const evals = JSON.parse(readFileSync(join(ROOT, "evals", "evals.json"), "utf-8")) as {
    skill_name: string;
    evals: Array<{
      id: number;
      slug: string;
      prompt: string;
      expected_output: string;
      files: string[];
      graders: {
        files_exist?: string[];
        files_contain?: Array<{ path: string; pattern: string }>;
        commands_succeed?: string[];
      };
      anti_graders?: {
        files_not_exist?: string[];
        files_not_contain?: Array<{ path: string; pattern: string }>;
      };
      expectations: string[];
    }>;
  };

  test("eval asset uses the correct skill name", () => {
    expect(evals.skill_name).toBe("repo-harness");
  });

  test("eval asset covers the core workflows", () => {
    expect(evals.evals.length).toBeGreaterThanOrEqual(4);
    const prompts = evals.evals.map((entry) => entry.prompt).join("\n");
    expect(prompts).toContain("Initialize a new");
    expect(prompts).toContain("Fix AGENTS.md");
    expect(prompts).toContain("Migrate this older Claude Code repo");
    expect(prompts).toContain("Audit this AI-assisted coding setup");
  });

  // SSD-06 migration: the pre-cutover 19-name facade list collapses into 8
  // canonical packages this eval asset actually exercises (repo-harness
  // itself, plus setup/plan/product/check/ship/architecture/chatgpt).
  // repo-harness-cross-review and merge-gate were never covered by this
  // day-to-day workflow eval asset either before or after the cutover.
  test("eval asset covers the public repo-harness action commands", () => {
    const combined = evals.evals
      .flatMap((entry) => [entry.prompt, entry.expected_output, ...entry.expectations])
      .join("\n");
    for (const command of [
      "repo-harness",
      "repo-harness-setup",
      "repo-harness-plan",
      "repo-harness-product",
      "repo-harness-check",
      "repo-harness-ship",
      "repo-harness-architecture",
      "repo-harness-chatgpt",
    ]) {
      expect(combined).toContain(command);
    }
    expect(combined).toContain("existing repo");
    expect(combined).toContain("new project");
  });

  test("eval asset covers shared .ai hook routing expectations", () => {
    const combined = evals.evals
      .flatMap((entry) => [entry.expected_output, ...entry.expectations])
      .join("\n");
    expect(combined).toContain(".ai/");
  });

  test("eval asset covers the route NL vs TS shadow benchmark", () => {
    const entry = evals.evals.find((candidate) => candidate.slug === "route-nl-vs-ts");
    expect(entry).toBeDefined();
    expect(entry?.prompt).toContain("route-nl-vs-ts");
    expect(entry?.prompt).toContain("loop-engine-nl-decision-table.md");
    expect(entry?.expected_output).toContain(".ai/harness/runs/");
    expect(entry?.expectations.join("\n")).toContain("false positives");
  });

  test("eval asset defines deterministic graders", () => {
    for (const entry of evals.evals) {
      expect(entry.graders).toBeDefined();
      expect(
        (entry.graders.files_exist?.length ?? 0) +
          (entry.graders.files_contain?.length ?? 0) +
          (entry.graders.commands_succeed?.length ?? 0)
      ).toBeGreaterThan(0);
    }
  });

  test("eval ids and slugs are unique and outputs are non-empty", () => {
    const ids = new Set<number>();
    const slugs = new Set<string>();

    for (const entry of evals.evals) {
      expect(ids.has(entry.id)).toBe(false);
      expect(slugs.has(entry.slug)).toBe(false);
      ids.add(entry.id);
      slugs.add(entry.slug);
      expect(entry.slug.length).toBeGreaterThan(3);
      expect(entry.prompt.length).toBeGreaterThan(20);
      expect(entry.expected_output.length).toBeGreaterThan(20);
      expect(entry.files.length).toBeGreaterThan(0);
      for (const file of entry.files) {
        expect(existsSync(join(ROOT, file))).toBe(true);
      }
      if (entry.graders.files_contain) {
        for (const grader of entry.graders.files_contain) {
          expect(grader.path.length).toBeGreaterThan(0);
          expect(grader.pattern.length).toBeGreaterThan(0);
        }
      }
      if (entry.anti_graders?.files_not_contain) {
        for (const grader of entry.anti_graders.files_not_contain) {
          expect(grader.path.length).toBeGreaterThan(0);
          expect(grader.pattern.length).toBeGreaterThan(0);
        }
      }
      expect(entry.expectations.length).toBeGreaterThan(0);
      for (const expectation of entry.expectations) {
        expect(expectation.length).toBeGreaterThan(10);
      }
    }
  });
});
