import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import {
  BASELINE_PATH,
  CASE_KINDS,
  CORPUS_PATH,
  REQUIRED_OVERLAP_TERMS,
  canonicalRoutesFromBaseline,
  loadBaseline,
  loadCorpus,
  loadJson,
  sha256Hex,
  validateCaseShape,
  validateCorpusShape,
  validateCoverage,
} from "../scripts/run-skill-routing-eval";

const ROOT = join(import.meta.dir, "..");

interface DiscoveryBaseline {
  pins: Record<string, { sha: string; note?: string }>;
  source_inventory: Array<{ name: string; path: string; kind: string }>;
  corpus_sha256: string;
  target_discovered_sets: { canonical_routes: string[] };
}

function runCli(args: string[]) {
  return spawnSync("bun", ["scripts/run-skill-routing-eval.ts", ...args], {
    cwd: ROOT,
    encoding: "utf-8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

describe("skill-routing corpus (evals/skill-routing/routing-corpus.json)", () => {
  const corpus = loadCorpus();
  const baseline = loadBaseline();
  const canonicalRoutes = canonicalRoutesFromBaseline(baseline);

  test("corpus is version 1 and every case validates against the schema shape", () => {
    expect(validateCorpusShape(corpus)).toEqual([]);
    expect(corpus.version).toBe(1);
    corpus.cases.forEach((entry, index) => {
      expect(validateCaseShape(entry, index)).toEqual([]);
    });
  });

  test("total case count is between 60 and 90", () => {
    expect(corpus.cases.length).toBeGreaterThanOrEqual(60);
    expect(corpus.cases.length).toBeLessThanOrEqual(90);
  });

  test("every case id is unique kebab-case", () => {
    const ids = corpus.cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  test("discovery-baseline.json's canonical_routes has exactly the 10 target routes", () => {
    expect(canonicalRoutes).toEqual([
      "repo-harness",
      "repo-harness-setup",
      "repo-harness-plan",
      "repo-harness-product",
      "repo-harness-check",
      "repo-harness-ship",
      "repo-harness-architecture",
      "repo-harness-cross-review",
      "merge-gate",
      "repo-harness-chatgpt",
    ]);
  });

  test("every canonical route has at least one zh and one en positive case", () => {
    for (const route of canonicalRoutes) {
      const zh = corpus.cases.some((c) => c.kind === "positive" && c.lang === "zh" && c.expected_route === route);
      const en = corpus.cases.some((c) => c.kind === "positive" && c.lang === "en" && c.expected_route === route);
      expect({ route, zh }).toEqual({ route, zh: true });
      expect({ route, en }).toEqual({ route, en: true });
    }
  });

  test("every case kind appears at least 3 times", () => {
    expect(CASE_KINDS.length).toBe(7);
    for (const kind of CASE_KINDS) {
      const count = corpus.cases.filter((c) => c.kind === kind).length;
      expect({ kind, count: count >= 3 }).toEqual({ kind, count: true });
    }
  });

  test("every required overlap term has at least one non-positive case tagging it", () => {
    expect(REQUIRED_OVERLAP_TERMS).toEqual(["review", "check", "plan", "ship", "merge-gate", "gptpro", "architecture"]);
    for (const term of REQUIRED_OVERLAP_TERMS) {
      const covered = corpus.cases.some((c) => c.kind !== "positive" && (c.overlap_terms ?? []).includes(term));
      expect({ term, covered }).toEqual({ term, covered: true });
    }
  });

  test("validateCoverage (the runner's own coverage gate) reports no issues", () => {
    expect(validateCoverage(corpus, canonicalRoutes)).toEqual([]);
  });

  test("zh and en cases are both present and roughly balanced", () => {
    const zh = corpus.cases.filter((c) => c.lang === "zh").length;
    const en = corpus.cases.filter((c) => c.lang === "en").length;
    expect(zh).toBeGreaterThan(0);
    expect(en).toBeGreaterThan(0);
    expect(Math.abs(zh - en)).toBeLessThanOrEqual(Math.ceil(corpus.cases.length * 0.2));
  });

  test("no prompt is empty and none look template-stamped (no exact-duplicate prompts)", () => {
    const prompts = corpus.cases.map((c) => c.prompt.trim());
    for (const prompt of prompts) expect(prompt.length).toBeGreaterThan(0);
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});

describe("discovery-baseline.json (evals/skill-routing/discovery-baseline.json)", () => {
  const baseline = loadJson(BASELINE_PATH) as DiscoveryBaseline;

  test("pins are present and well-formed 40-hex SHAs", () => {
    for (const key of ["post_esa_program_pin", "post_epc_sha", "worktree_base", "discovery_audit_baseline"]) {
      const pin = baseline.pins[key];
      expect(pin).toBeDefined();
      expect(pin.sha).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  test("source_inventory has exactly 25 entries and every recorded path exists on disk", () => {
    expect(baseline.source_inventory.length).toBe(25);
    for (const entry of baseline.source_inventory) {
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.kind).toBe("string");
      expect(existsSync(join(ROOT, entry.path))).toBe(true);
    }
  });

  test("the 19 command-facade entries match the actual assets/skill-commands/ directory listing", () => {
    const facadeDir = join(ROOT, "assets", "skill-commands");
    const actualFacades = readdirSync(facadeDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("repo-harness-"))
      .map((entry) => entry.name)
      .sort();
    const recordedFacades = baseline.source_inventory
      .filter((entry) => entry.kind === "command-facade")
      .map((entry) => entry.name)
      .sort();
    expect(recordedFacades).toEqual(actualFacades);
    expect(recordedFacades.length).toBe(19);
  });

  test("corpus_sha256 equals a freshly computed sha256 of routing-corpus.json's exact bytes", () => {
    const bytes = readFileSync(CORPUS_PATH);
    expect(baseline.corpus_sha256).toBe(sha256Hex(bytes));
    expect(baseline.corpus_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("scripts/run-skill-routing-eval.ts CLI", () => {
  test("validate exits 0 on the committed corpus", () => {
    const result = runCli(["validate"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("validate OK");
  });

  test("hash exits 0 (verify-only) on the committed corpus", () => {
    const result = runCli(["hash"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("hash OK");
  });

  test("dry-run exits 0 and prints a count for every canonical route plus none", () => {
    const result = runCli(["dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("dry-run selection OK");
    for (const route of [
      "repo-harness", "repo-harness-setup", "repo-harness-plan", "repo-harness-product",
      "repo-harness-check", "repo-harness-ship", "repo-harness-architecture",
      "repo-harness-cross-review", "merge-gate", "repo-harness-chatgpt", "none",
    ]) {
      expect(result.stdout).toContain(`${route}:`);
    }
  });

  test("an unknown subcommand exits non-zero with usage on stderr", () => {
    const result = runCli(["bogus"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unknown or missing subcommand");
  });

  test("missing subcommand exits non-zero", () => {
    const result = runCli([]);
    expect(result.status).not.toBe(0);
  });
});
