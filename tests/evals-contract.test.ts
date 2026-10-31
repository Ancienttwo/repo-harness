import { describe, test, expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "fs";
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

  test("eval asset uses the merged planning owner", () => {
    const combined = JSON.stringify(evals);
    expect(combined).not.toContain("repo-harness-plan");
    expect(combined).toContain("repo-harness-check");
  });

  test("eval asset covers shared .ai hook routing expectations", () => {
    const combined = evals.evals
      .flatMap((entry) => [entry.expected_output, ...entry.expectations])
      .join("\n");
    expect(combined).toContain(".ai/");
  });

  test("retired route shadow benchmark stays absent", () => {
    expect(evals.evals.some((entry) => entry.slug === "route-nl-vs-ts")).toBe(false);
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

describe("Eval fixture contract", () => {
  const PRIMARY_MANIFEST = join(ROOT, "evals", "evals.json");
  // Every other checked-in eval definition that seeds a fixture directory.
  const OTHER_EVAL_MANIFESTS = [join(ROOT, "evals", "frontier-stress-test", "evals.json")];
  const HARNESS_SCENARIOS = join(ROOT, "evals", "harness", "scenarios.json");

  function manifestFixtureRefs(manifestPath: string): string[] {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      evals: Array<{ files: string[] }>;
    };
    return manifest.evals
      .flatMap((entry) => entry.files)
      .filter((file) => file.startsWith("evals/fixtures/"));
  }

  const harnessSeed = (
    JSON.parse(readFileSync(HARNESS_SCENARIOS, "utf-8")) as { seed: string }
  ).seed;

  // The reverse check counts every eval definition that seeds a fixture: the
  // primary skill-eval manifest, the frontier stress-test manifest and the
  // harness benchmark scenario seed. A fixture directory that none of them
  // names is dead weight.
  const referencedFixtureDirs = new Set(
    [
      ...manifestFixtureRefs(PRIMARY_MANIFEST),
      ...OTHER_EVAL_MANIFESTS.flatMap(manifestFixtureRefs),
      harnessSeed,
    ]
      .filter((rel) => rel.startsWith("evals/fixtures/"))
      .map((rel) => rel.split("/").slice(0, 3).join("/")),
  );

  test("every fixture path referenced by evals.json exists", () => {
    const refs = manifestFixtureRefs(PRIMARY_MANIFEST);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(existsSync(join(ROOT, ref)), ref).toBe(true);
    }
  });

  test("every directory under evals/fixtures is referenced by at least one eval", () => {
    const fixtureRoot = join(ROOT, "evals", "fixtures");
    const dirs = readdirSync(fixtureRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `evals/fixtures/${entry.name}`);
    expect(dirs.length).toBeGreaterThan(0);
    expect(dirs.filter((dir) => !referencedFixtureDirs.has(dir))).toEqual([]);
  });
});
