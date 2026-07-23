import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
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

  // SSD-06 migration (per plan Ruling R5): discovery-baseline.json is
  // untouchable historical pre-cutover evidence -- its source_inventory
  // records the PRE-cutover 25-source/19-facade world by design, and the
  // atomic public cutover deletes 15 of those facade directories plus the
  // two provider-skill dirs and two static ChatGPT dirs. Comparing this
  // frozen snapshot against the LIVE filesystem would therefore fail by
  // design (that is the whole point of the cutover). These two tests no
  // longer touch the live filesystem at all: the first checks
  // source_inventory's own shape is well-formed data (still exactly 25
  // historical entries), the second checks internal consistency between two
  // independent substructures recorded inside baseline.json itself -- the
  // full 19-name command-facade inventory and the (smaller) subset of names
  // current_discovered_sets.command_facade_matrix recorded as actually
  // selected by at least one profile at capture time. That subset relation
  // is a real invariant of the frozen snapshot, checkable without reading
  // any live path. The live post-cutover target state is separately pinned
  // in tests/skill-surface/catalog.test.ts's "target post-cutover discovery
  // matrix" describe block (manifest-derived, not baseline-derived).
  test("source_inventory has exactly 25 well-formed historical entries", () => {
    expect(baseline.source_inventory.length).toBe(25);
    const seen = new Set<string>();
    for (const entry of baseline.source_inventory) {
      expect(typeof entry.name).toBe("string");
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.kind).toBe("string");
      expect(typeof entry.path).toBe("string");
      expect(entry.path.length).toBeGreaterThan(0);
      expect(seen.has(entry.name)).toBe(false);
      seen.add(entry.name);
    }
  });

  test("the 19 recorded command-facade entries are internally consistent with command_facade_matrix's selected subset", () => {
    const recordedFacades = baseline.source_inventory
      .filter((entry) => entry.kind === "command-facade")
      .map((entry) => entry.name)
      .sort();
    expect(recordedFacades.length).toBe(19);
    expect(new Set(recordedFacades).size).toBe(19);

    const matrix = (baseline as unknown as {
      current_discovered_sets: { command_facade_matrix: Record<string, string[]> };
    }).current_discovered_sets.command_facade_matrix;
    const selectedFacades = new Set(Object.values(matrix).flat());
    expect(selectedFacades.size).toBeGreaterThan(0);
    for (const name of selectedFacades) {
      expect(recordedFacades).toContain(name);
    }
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
