import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
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
  loadLiveCatalog,
  buildDiscoveredSkillSurface,
  referenceOnlySkillPackages,
  extractToolInvokedRoutes,
  extractMergeGateTextualSignal,
  computeRoutingMetrics,
  evaluateThresholds,
  runProviderEval,
  perfectEchoRouteFor,
  buildAggregateReport,
  type DiscoveredSkillSurfaceEntry,
  type RoutingRunRecord,
  type RoutingRunReport,
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

describe("scripts/run-skill-routing-eval.ts provider mode (run subcommand, SSD-07 phase A / D1)", () => {
  const baseline = loadBaseline();
  const canonicalRoutes = canonicalRoutesFromBaseline(baseline);
  const catalog = loadLiveCatalog();

  function tmpReportPath(label: string): string {
    const dir = mkdtempSync(join(tmpdir(), `repo-harness-routing-run-test-${label}-`));
    return join(dir, "report.json");
  }

  describe("buildDiscoveredSkillSurface (pure discovery-surface projection)", () => {
    test("minimal profile discovers only the always-on router plus explicit-setup chatgpt", () => {
      const names = buildDiscoveredSkillSurface(catalog, "minimal", "claude").map((e) => e.name).sort();
      expect(names).toEqual(["repo-harness", "repo-harness-chatgpt"]);
    });

    test("strict profile is host-aware: codex additionally gets claude-plan", () => {
      const claudeNames = buildDiscoveredSkillSurface(catalog, "strict", "claude").map((e) => e.name).sort();
      const codexNames = buildDiscoveredSkillSurface(catalog, "strict", "codex").map((e) => e.name).sort();
      expect(claudeNames).not.toContain("claude-plan");
      expect(codexNames).toContain("claude-plan");
      expect(codexNames.filter((n) => n !== "claude-plan").sort()).toEqual(claudeNames.sort());
    });

    test("product-planning discovers repo-harness-product; strict does not", () => {
      expect(buildDiscoveredSkillSurface(catalog, "product-planning", "claude").map((e) => e.name)).toContain("repo-harness-product");
      expect(buildDiscoveredSkillSurface(catalog, "strict", "claude").map((e) => e.name)).not.toContain("repo-harness-product");
    });

    test("merge-gate is never in the discovered surface (no source; kind:judge)", () => {
      for (const profile of ["minimal", "standard", "product-planning", "strict"] as const) {
        expect(buildDiscoveredSkillSurface(catalog, profile, "claude").map((e) => e.name)).not.toContain("merge-gate");
      }
    });
  });

  describe("referenceOnlySkillPackages (cli-reference packages, never profile-gated)", () => {
    test("repo-harness-setup and repo-harness-architecture are always reachable regardless of profile", () => {
      const names = referenceOnlySkillPackages(catalog).map((e) => e.name).sort();
      expect(names).toEqual(["repo-harness-architecture", "repo-harness-setup"]);
    });
  });

  describe("extractToolInvokedRoutes / extractMergeGateTextualSignal (pure extraction, synthetic fixtures)", () => {
    const candidates: DiscoveredSkillSurfaceEntry[] = [
      { name: "repo-harness-plan", sourcePath: "/repo/assets/skills/repo-harness-plan", reason: "profile-facade" },
      { name: "repo-harness-setup", sourcePath: "/repo/assets/skills/repo-harness-setup", reason: "cli-reference" },
    ];

    test("detects a Claude Skill tool_use block naming a candidate", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "repo-harness-plan" } }] },
      });
      expect(extractToolInvokedRoutes(line, candidates)).toEqual(["repo-harness-plan"]);
    });

    test("ignores a Skill tool_use block naming something outside the candidate list", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "not-a-real-package" } }] },
      });
      expect(extractToolInvokedRoutes(line, candidates)).toEqual([]);
    });

    test("detects a direct SKILL.md file read for a cli-reference candidate (no dedicated Skill tool)", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/repo/assets/skills/repo-harness-setup/SKILL.md" } }] },
      });
      expect(extractToolInvokedRoutes(line, candidates)).toEqual(["repo-harness-setup"]);
    });

    test("preserves first-seen order and dedupes repeated invocations of the same route", () => {
      const lines = [
        JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "repo-harness-plan" } }] } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/repo/assets/skills/repo-harness-setup/SKILL.md" } }] } }),
        JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "repo-harness-plan" } }] } }),
      ].join("\n");
      expect(extractToolInvokedRoutes(lines, candidates)).toEqual(["repo-harness-plan", "repo-harness-setup"]);
    });

    test("malformed/non-JSON lines are skipped without throwing", () => {
      const lines = ["not json at all", "", JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "repo-harness-plan" } }] } })].join("\n");
      expect(extractToolInvokedRoutes(lines, candidates)).toEqual(["repo-harness-plan"]);
    });

    test("merge-gate textual signal matches only on the final response text, case-insensitively", () => {
      expect(extractMergeGateTextualSignal("I'll run merge-gate against this candidate now.")).toBe(true);
      expect(extractMergeGateTextualSignal("Running MERGE-GATE now.")).toBe(true);
      expect(extractMergeGateTextualSignal("Nothing relevant here.")).toBe(false);
    });
  });

  describe("computeRoutingMetrics / evaluateThresholds (pure, synthetic records — proves both the small-sample and large-sample branches)", () => {
    function record(overrides: Partial<RoutingRunRecord> & Pick<RoutingRunRecord, "id" | "kind" | "expected_route">): RoutingRunRecord {
      return {
        lang: "en",
        outcome: "routed",
        selected_routes: [],
        primary_route: "none",
        correct_top1: false,
        double_trigger: false,
        duration_ms: 0,
        ...overrides,
      };
    }

    test("double_trigger is true exactly when more than one route was selected, independent of correctness", () => {
      const records: RoutingRunRecord[] = [
        record({ id: "a", kind: "positive", expected_route: "repo-harness-plan", selected_routes: ["repo-harness-plan", "merge-gate"], primary_route: "repo-harness-plan", correct_top1: true, double_trigger: true }),
        record({ id: "b", kind: "positive", expected_route: "repo-harness-check", selected_routes: ["repo-harness-check"], primary_route: "repo-harness-check", correct_top1: true, double_trigger: false }),
      ];
      const metrics = computeRoutingMetrics(records, canonicalRoutes);
      expect(metrics.double_trigger).toEqual({ count: 1, denominator: 2, rate: 0.5 });
      const thresholds = evaluateThresholds(metrics);
      expect(thresholds.double_trigger.pass).toBe(false); // 50% >> 2% ceiling
    });

    test("ordinary-qa small-sample rule: numerator 0 passes, numerator 1 (of 4) fails, even though neither is compared as a raw percentage", () => {
      const zeroFalse: RoutingRunRecord[] = [
        record({ id: "q1", kind: "ordinary-qa", expected_route: "none", primary_route: "none" }),
        record({ id: "q2", kind: "ordinary-qa", expected_route: "none", primary_route: "none" }),
        record({ id: "q3", kind: "ordinary-qa", expected_route: "none", primary_route: "none" }),
        record({ id: "q4", kind: "ordinary-qa", expected_route: "none", primary_route: "none" }),
      ];
      const zeroMetrics = computeRoutingMetrics(zeroFalse, canonicalRoutes);
      expect(zeroMetrics.ordinary_qa_false_activation).toEqual({ numerator: 0, denominator: 4, rate: 0, small_sample: true });
      expect(evaluateThresholds(zeroMetrics).ordinary_qa_false_activation.pass).toBe(true);

      const oneFalse: RoutingRunRecord[] = [
        record({ id: "q1", kind: "ordinary-qa", expected_route: "none", primary_route: "none" }),
        record({ id: "q2", kind: "ordinary-qa", expected_route: "none", primary_route: "none" }),
        record({ id: "q3", kind: "ordinary-qa", expected_route: "none", primary_route: "none" }),
        record({ id: "q4", kind: "ordinary-qa", expected_route: "none", primary_route: "repo-harness-chatgpt", selected_routes: ["repo-harness-chatgpt"] }),
      ];
      const oneMetrics = computeRoutingMetrics(oneFalse, canonicalRoutes);
      expect(oneMetrics.ordinary_qa_false_activation.small_sample).toBe(true);
      expect(evaluateThresholds(oneMetrics).ordinary_qa_false_activation.pass).toBe(false);
    });

    test("ordinary-qa large-sample rule: >=100 cases compares a raw percentage instead of requiring literal zero", () => {
      const large: RoutingRunRecord[] = [];
      for (let i = 0; i < 100; i += 1) {
        // 0.5% false-activation rate: 0 of the first 100 activate; well under the 1% ceiling.
        large.push(record({ id: `oqa-${i}`, kind: "ordinary-qa", expected_route: "none", primary_route: "none" }));
      }
      const metrics = computeRoutingMetrics(large, canonicalRoutes);
      expect(metrics.ordinary_qa_false_activation).toEqual({ numerator: 0, denominator: 100, rate: 0, small_sample: false });
      expect(evaluateThresholds(metrics).ordinary_qa_false_activation.pass).toBe(true);

      large[0] = record({ id: "oqa-0", kind: "ordinary-qa", expected_route: "none", primary_route: "repo-harness", selected_routes: ["repo-harness"] });
      const oneFalseOfHundred = computeRoutingMetrics(large, canonicalRoutes);
      expect(oneFalseOfHundred.ordinary_qa_false_activation).toEqual({ numerator: 1, denominator: 100, rate: 0.01, small_sample: false });
      // Exactly at the 1% ceiling: <=1% is a pass under the large-sample (non-small-sample) branch,
      // in contrast to the small-sample branch which would require literal zero.
      expect(evaluateThresholds(oneFalseOfHundred).ordinary_qa_false_activation.pass).toBe(true);
    });

    test("a single zero-recall route fails the gate even when every other route is perfect (per-route floor, not aggregate)", () => {
      const records: RoutingRunRecord[] = [];
      for (const route of canonicalRoutes) {
        for (let i = 0; i < 4; i += 1) {
          const isDeadRoute = route === "merge-gate";
          records.push(
            record({
              id: `${route}-${i}`,
              kind: "positive",
              expected_route: route,
              primary_route: isDeadRoute ? "none" : route,
              selected_routes: isDeadRoute ? [] : [route],
              correct_top1: !isDeadRoute,
            }),
          );
        }
      }
      const metrics = computeRoutingMetrics(records, canonicalRoutes);
      expect(metrics.per_route_recall["merge-gate"].rate).toBe(0);
      expect(metrics.top1_accuracy.rate).toBeCloseTo(36 / 40, 5); // 9 of 10 routes perfect, 1 dead
      const thresholds = evaluateThresholds(metrics);
      expect(thresholds.per_route_recall["merge-gate"].pass).toBe(false);
      expect(thresholds.overall_pass).toBe(false); // aggregate top-1 (90%) also misses the 95% floor here, but the point is the per-route gate alone is sufficient to fail
    });

    test("provider_error records are excluded from every rate but counted separately", () => {
      const records: RoutingRunRecord[] = [
        record({ id: "ok", kind: "positive", expected_route: "repo-harness", primary_route: "repo-harness", selected_routes: ["repo-harness"], correct_top1: true }),
        record({ id: "err", kind: "positive", expected_route: "repo-harness-plan", outcome: "provider_error", error_reason: "timeout" }),
      ];
      const metrics = computeRoutingMetrics(records, canonicalRoutes);
      expect(metrics.evaluated_cases).toBe(1);
      expect(metrics.provider_error_count).toBe(1);
      expect(metrics.top1_accuracy).toEqual({ numerator: 1, denominator: 1, rate: 1 });
    });
  });

  describe("runProviderEval against the real frozen corpus (perfect-echo stub)", () => {
    test("strict/claude: 9 of 10 routes reach ceiling recall; repo-harness-product is correctly unreachable (not a bug — strict never discovers it)", () => {
      const reportPath = tmpReportPath("strict-perfect");
      const report = runProviderEval({
        profile: "strict",
        host: "claude",
        provider: "stub",
        reportPath,
        dryRun: false,
        stubOptions: { routeFor: perfectEchoRouteFor },
      });
      // ADJUSTED (HIGH finding fix): the 4 repo-harness-product positives are
      // structurally unreachable under strict (excluded_unreachable), so they
      // are removed from the denominator (38 = 42 - 4) instead of mechanically
      // scored as a miss. Before the fix this was pinned at {38, 42, 38/42 ~=
      // 90.5%} -- a ceiling that can never clear the 95% floor no matter how
      // good the provider is. A flawless-within-reachable-scope provider must
      // read 100%, not be capped by cases it structurally cannot win.
      expect(report.metrics.top1_accuracy).toEqual({ numerator: 38, denominator: 38, rate: 1 });
      for (const route of canonicalRoutes) {
        if (route === "repo-harness-product") {
          // ADJUSTED: denominator/rate change from {4, 0} (scored a 0% miss)
          // to {0, null} (excluded, not gated) plus the new reachable flag.
          expect(report.metrics.per_route_recall[route]).toEqual({ numerator: 0, denominator: 0, rate: null, reachable: false });
        } else {
          expect(report.metrics.per_route_recall[route].rate).toBe(1);
          expect(report.metrics.per_route_recall[route].reachable).toBe(true);
        }
      }
      expect(report.metrics.excluded_unreachable_count).toBe(4);
      expect(report.metrics.double_trigger).toEqual({ count: 0, denominator: 68, rate: 0 });
      expect(report.metrics.provider_error_count).toBe(0);
      expect(report.discovered_surface.map((d) => d.name).sort()).toEqual(
        ["repo-harness", "repo-harness-check", "repo-harness-chatgpt", "repo-harness-cross-review", "repo-harness-plan", "repo-harness-ship"].sort(),
      );
    });

    test("product-planning/claude: repo-harness-product reaches ceiling; repo-harness-ship and repo-harness-cross-review are correctly unreachable", () => {
      const reportPath = tmpReportPath("planning-perfect");
      const report = runProviderEval({
        profile: "product-planning",
        host: "claude",
        provider: "stub",
        reportPath,
        dryRun: false,
        stubOptions: { routeFor: perfectEchoRouteFor },
      });
      // ADJUSTED (HIGH finding fix): reachable: true now included in the shape.
      expect(report.metrics.per_route_recall["repo-harness-product"]).toEqual({ numerator: 4, denominator: 4, rate: 1, reachable: true });
      // ADJUSTED: repo-harness-ship / repo-harness-cross-review are
      // structurally unreachable under product-planning -- {denominator: 0,
      // rate: null, reachable: false} (excluded), not the old {4, 0} (scored
      // a 0% miss).
      expect(report.metrics.per_route_recall["repo-harness-ship"]).toEqual({ numerator: 0, denominator: 0, rate: null, reachable: false });
      expect(report.metrics.per_route_recall["repo-harness-cross-review"]).toEqual({ numerator: 0, denominator: 0, rate: null, reachable: false });
      expect(report.metrics.excluded_unreachable_count).toBe(8);
    });

    test("host-awareness changes nothing about route SCORING for strict (claude-plan is not one of the 10 canonical routes)", () => {
      const claudeReport = runProviderEval({
        profile: "strict", host: "claude", provider: "stub", reportPath: tmpReportPath("host-claude"), dryRun: false,
        stubOptions: { routeFor: perfectEchoRouteFor },
      });
      const codexReport = runProviderEval({
        profile: "strict", host: "codex", provider: "stub", reportPath: tmpReportPath("host-codex"), dryRun: false,
        stubOptions: { routeFor: perfectEchoRouteFor },
      });
      expect(codexReport.metrics.top1_accuracy).toEqual(claudeReport.metrics.top1_accuracy);
      expect(codexReport.discovered_surface.map((d) => d.name)).toContain("claude-plan");
      expect(claudeReport.discovered_surface.map((d) => d.name)).not.toContain("claude-plan");
    });
  });

  describe("report shape, byte binding, and corpus/manifest sha256 embedding", () => {
    test("report embeds the frozen corpus_sha256 verbatim and a fresh manifest_sha256", () => {
      const reportPath = tmpReportPath("shape");
      const report = runProviderEval({
        profile: "minimal", host: "claude", provider: "stub", reportPath, dryRun: false,
      });
      expect(report.corpus_sha256).toBe(String(baseline.corpus_sha256));
      expect(report.manifest_sha256).toBe(sha256Hex(readFileSync(join(ROOT, "assets", "skill-commands", "manifest.json"))));
      expect(report.records).toHaveLength(68);
      expect(report.protocol).toBe(1);
    });

    test("the written report file and its .sha256 sidecar are byte-bound", () => {
      const reportPath = tmpReportPath("sidecar");
      runProviderEval({ profile: "minimal", host: "claude", provider: "stub", reportPath, dryRun: false });
      const bytes = readFileSync(reportPath);
      const sidecar = readFileSync(`${reportPath}.sha256`, "utf-8").trim();
      expect(sidecar.startsWith(sha256Hex(bytes))).toBe(true);
    });

    test("re-running with an identical stub produces byte-identical report JSON except generated_at", () => {
      const pathA = tmpReportPath("repeat-a");
      const pathB = tmpReportPath("repeat-b");
      const reportA = runProviderEval({ profile: "standard", host: "claude", provider: "stub", reportPath: pathA, dryRun: false, stubOptions: { routeFor: perfectEchoRouteFor } });
      const reportB = runProviderEval({ profile: "standard", host: "claude", provider: "stub", reportPath: pathB, dryRun: false, stubOptions: { routeFor: perfectEchoRouteFor } });
      const stripGeneratedAt = (r: unknown) => JSON.parse(JSON.stringify(r).replace(/"generated_at":"[^"]*"/, '"generated_at":""'));
      expect(stripGeneratedAt(reportA)).toEqual(stripGeneratedAt(reportB));
    });
  });

  describe("run subcommand CLI (--dry-run pipeline end to end via the real binary)", () => {
    function runCliRun(args: string[]) {
      return spawnSync("bun", ["scripts/run-skill-routing-eval.ts", "run", ...args], { cwd: ROOT, encoding: "utf-8" });
    }

    test("--dry-run with the default fixed-route stub produces a well-formed, all-metrics-computed, non-passing report", () => {
      const reportPath = tmpReportPath("cli-dry-run");
      const result = runCliRun(["--profile", "strict", "--host", "claude", "--report", reportPath, "--dry-run"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("run OK");
      expect(result.stdout).toContain("overall_pass=false");
      const report = JSON.parse(readFileSync(reportPath, "utf-8"));
      expect(report.provider).toBe("stub");
      expect(report.dry_run).toBe(true);
      expect(report.metrics.evaluated_cases).toBe(68);
      expect(report.metrics.per_route_recall["repo-harness"].rate).toBe(1);
      expect(report.metrics.ordinary_qa_false_activation.small_sample).toBe(true);
    });

    test("missing --report exits non-zero with a clear usage error", () => {
      const result = runCliRun(["--profile", "minimal", "--host", "claude", "--dry-run"]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("--report is required");
    });

    test("real (non-dry-run) mode without --provider exits non-zero", () => {
      const result = runCliRun(["--profile", "minimal", "--host", "claude", "--report", tmpReportPath("cli-noprov")]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("--provider claude|codex is required");
    });

    test("real (non-dry-run) mode with --provider stub is rejected (stub is dry-run-only)", () => {
      const result = runCliRun(["--profile", "minimal", "--host", "claude", "--provider", "stub", "--report", tmpReportPath("cli-stub-real")]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("--provider claude|codex is required");
    });

    test("an invalid --profile is rejected before any workspace is touched", () => {
      const result = runCliRun(["--profile", "bogus", "--host", "claude", "--report", tmpReportPath("cli-badprofile"), "--dry-run"]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("--profile must be one of");
    });

    test("--help prints run usage and exits 0", () => {
      const result = runCliRun(["--help"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("run --profile");
    });
  });

  describe("structural reachability exclusion (SSD-07 phase A HIGH-finding fix, layer 1)", () => {
    test("excluded_unreachable is stamped per-record, counted, and labeled PARTIAL evidence -- with a perfect echo, overall_pass now reflects the reachable subset (a structural impossibility before this fix)", () => {
      const reportPath = tmpReportPath("reach-strict");
      const report = runProviderEval({
        profile: "strict",
        host: "claude",
        provider: "stub",
        reportPath,
        dryRun: false,
        stubOptions: { routeFor: perfectEchoRouteFor },
      });

      const productRecords = report.records.filter((r) => r.expected_route === "repo-harness-product");
      expect(productRecords).toHaveLength(4);
      expect(productRecords.every((r) => r.excluded_unreachable === true)).toBe(true);
      expect(report.records.filter((r) => r.excluded_unreachable === true)).toHaveLength(4);
      expect(report.metrics.excluded_unreachable_count).toBe(4);

      expect(report.thresholds.per_route_recall["repo-harness-product"]).toEqual({
        floor: 0.9,
        actual: null,
        pass: true,
        reachable: false,
      });
      expect(report.thresholds.per_route_recall["repo-harness"]).toEqual({
        floor: 0.9,
        actual: 1,
        pass: true,
        reachable: true,
      });

      // Every reachable route is perfect -> the single-run gate CAN pass now
      // (before this fix, every run mechanically scored the always-
      // unreachable routes as a miss, so overall_pass was structurally always
      // false). Still explicitly labeled PARTIAL evidence, not package
      // acceptance -- see the aggregate describe block below for the signal
      // that actually is package acceptance.
      expect(report.thresholds.overall_pass).toBe(true);
      expect(report.evidence_scope).toBe("single_run_partial");
      expect(report.evidence_note).toContain("PARTIAL evidence");
      expect(report.evidence_note.toLowerCase()).toContain("aggregate");
    });

    test("a genuinely bad REACHABLE route still fails its own floor and overall_pass end to end (exclusion does not neuter real failures)", () => {
      const reportPath = tmpReportPath("reach-bad-reachable");
      const report = runProviderEval({
        profile: "strict",
        host: "claude",
        provider: "stub",
        reportPath,
        dryRun: false,
        stubOptions: {
          // repo-harness is reachable under strict (discoverability:"always");
          // never returning it is a genuine 0% recall, not a structural
          // unreachability artifact -- the per-route gate must still fire.
          routeFor: (c) => (c.expected_route === "repo-harness" ? [] : perfectEchoRouteFor(c)),
        },
      });
      expect(report.metrics.per_route_recall["repo-harness"]).toEqual({ numerator: 0, denominator: 4, rate: 0, reachable: true });
      expect(report.thresholds.per_route_recall["repo-harness"].pass).toBe(false);
      expect(report.thresholds.overall_pass).toBe(false);
    });
  });

  describe("buildAggregateReport / aggregate subcommand (SSD-07 phase A HIGH-finding fix, layer 2)", () => {
    function runTwoReports(routeFor: typeof perfectEchoRouteFor = perfectEchoRouteFor) {
      const strictPath = tmpReportPath("agg-strict");
      const planningPath = tmpReportPath("agg-planning");
      const strict = runProviderEval({
        profile: "strict",
        host: "claude",
        provider: "stub",
        reportPath: strictPath,
        dryRun: false,
        stubOptions: { routeFor },
      });
      const planning = runProviderEval({
        profile: "product-planning",
        host: "claude",
        provider: "stub",
        reportPath: planningPath,
        dryRun: false,
        stubOptions: { routeFor },
      });
      return { strict, planning, strictPath, planningPath };
    }

    test("aggregate over strict + product-planning (perfect echo) covers all 10 canonical routes, passes overall_pass, and records which run supplied each case", () => {
      const corpus = loadCorpus();
      const { strict, planning, strictPath, planningPath } = runTwoReports();

      // Deliberately out of lexicographic order on input -- the deterministic
      // tie-break sorts by path internally, not by input array order.
      const aggregate = buildAggregateReport(
        [
          { path: planningPath, report: planning },
          { path: strictPath, report: strict },
        ],
        canonicalRoutes,
      );

      expect(aggregate.protocol).toBe(1);
      expect(aggregate.evidence_scope).toBe("aggregate_package_acceptance");
      expect(aggregate.evidence_note).toContain("Package acceptance signal");
      expect(aggregate.records).toHaveLength(68);
      expect(aggregate.case_sources).toHaveLength(68);
      expect(aggregate.metrics.excluded_unreachable_count).toBe(0);

      for (const route of canonicalRoutes) {
        const expectedDenominator = corpus.cases.filter((c) => c.expected_route === route).length;
        expect(aggregate.metrics.per_route_recall[route]).toEqual({
          numerator: expectedDenominator,
          denominator: expectedDenominator,
          rate: 1,
          reachable: true,
        });
        expect(aggregate.thresholds.per_route_recall[route].pass).toBe(true);
      }
      const totalPositives = corpus.cases.filter((c) => c.expected_route !== "none").length;
      expect(aggregate.metrics.top1_accuracy).toEqual({ numerator: totalPositives, denominator: totalPositives, rate: 1 });
      expect(aggregate.thresholds.overall_pass).toBe(true);

      // repo-harness-product is unreachable under strict -> must be sourced
      // from planning; repo-harness-ship is unreachable under
      // product-planning -> must be sourced from strict.
      const productRecord = aggregate.records.find((r) => r.expected_route === "repo-harness-product");
      const productSource = aggregate.case_sources.find((cs) => cs.id === productRecord?.id);
      expect(productSource?.source_report).toBe(planningPath);

      const shipRecord = aggregate.records.find((r) => r.expected_route === "repo-harness-ship");
      const shipSource = aggregate.case_sources.find((cs) => cs.id === shipRecord?.id);
      expect(shipSource?.source_report).toBe(strictPath);

      // inputs are sorted lexicographically by path regardless of input array order
      expect(aggregate.inputs.map((i) => i.path)).toEqual([strictPath, planningPath].sort());
    });

    test("fails closed on mismatched corpus_sha256 across inputs", () => {
      const { strict, planning, strictPath, planningPath } = runTwoReports();
      const tampered: RoutingRunReport = { ...planning, corpus_sha256: "0".repeat(64) };
      expect(() =>
        buildAggregateReport(
          [
            { path: strictPath, report: strict },
            { path: planningPath, report: tampered },
          ],
          canonicalRoutes,
        ),
      ).toThrow(/corpus_sha256 mismatch/);
    });

    test("fails closed on mismatched manifest_sha256 across inputs", () => {
      const { strict, planning, strictPath, planningPath } = runTwoReports();
      const tampered: RoutingRunReport = { ...planning, manifest_sha256: "0".repeat(64) };
      expect(() =>
        buildAggregateReport(
          [
            { path: strictPath, report: strict },
            { path: planningPath, report: tampered },
          ],
          canonicalRoutes,
        ),
      ).toThrow(/manifest_sha256 mismatch/);
    });

    test("fails closed when a canonical route is unreachable in every input (two runs of the same profile)", () => {
      const pathA = tmpReportPath("agg-dup-a");
      const pathB = tmpReportPath("agg-dup-b");
      const reportA = runProviderEval({
        profile: "strict",
        host: "claude",
        provider: "stub",
        reportPath: pathA,
        dryRun: false,
        stubOptions: { routeFor: perfectEchoRouteFor },
      });
      const reportB = runProviderEval({
        profile: "strict",
        host: "claude",
        provider: "stub",
        reportPath: pathB,
        dryRun: false,
        stubOptions: { routeFor: perfectEchoRouteFor },
      });
      expect(() =>
        buildAggregateReport(
          [
            { path: pathA, report: reportA },
            { path: pathB, report: reportB },
          ],
          canonicalRoutes,
        ),
      ).toThrow(/repo-harness-product/);
    });

    test("fewer than 2 inputs is rejected", () => {
      const { strict, strictPath } = runTwoReports();
      expect(() => buildAggregateReport([{ path: strictPath, report: strict }], canonicalRoutes)).toThrow(/at least 2/);
    });

    test("a real floor violation in the union surfaces as overall_pass=false, not a thrown error (fail closed on the RESULT, not an exception)", () => {
      // Deliberately wrong for 2 of repo-harness-check's 4 positives, chosen
      // BY CASE ID (not a shared mutable run-order-dependent counter) so both
      // runs are identically flawed for these specific ids -- the aggregate's
      // deterministic tie-break (first-by-lexicographic-report-path) picks
      // between two byte-identical-for-these-ids records, so the union's
      // repo-harness-check recall is genuinely 50% (2/4) regardless of which
      // report supplies each case, not masked by pick order.
      const corpus = loadCorpus();
      const checkCaseIds = corpus.cases
        .filter((c) => c.expected_route === "repo-harness-check")
        .map((c) => c.id)
        .sort();
      expect(checkCaseIds.length).toBeGreaterThanOrEqual(2);
      const missIds = new Set(checkCaseIds.slice(0, 2));
      const flawedRouteFor: typeof perfectEchoRouteFor = (c) => (missIds.has(c.id) ? [] : perfectEchoRouteFor(c));

      const { strict, planning, strictPath, planningPath } = runTwoReports(flawedRouteFor);
      const aggregate = buildAggregateReport(
        [
          { path: strictPath, report: strict },
          { path: planningPath, report: planning },
        ],
        canonicalRoutes,
      );
      expect(aggregate.metrics.per_route_recall["repo-harness-check"]).toEqual({
        numerator: 2,
        denominator: 4,
        rate: 0.5,
        reachable: true,
      });
      expect(aggregate.thresholds.per_route_recall["repo-harness-check"].pass).toBe(false);
      expect(aggregate.thresholds.overall_pass).toBe(false);
    });

    test("aggregate CLI subcommand: --dry-run runs for both profiles, then aggregate, produce a well-formed, byte-bound report end to end", () => {
      const strictReportPath = tmpReportPath("agg-cli-strict");
      const planningReportPath = tmpReportPath("agg-cli-planning");
      const aggregateReportPath = tmpReportPath("agg-cli-out");

      const runStrict = spawnSync(
        "bun",
        ["scripts/run-skill-routing-eval.ts", "run", "--profile", "strict", "--host", "claude", "--report", strictReportPath, "--dry-run"],
        { cwd: ROOT, encoding: "utf-8" },
      );
      expect(runStrict.status).toBe(0);
      const runPlanning = spawnSync(
        "bun",
        ["scripts/run-skill-routing-eval.ts", "run", "--profile", "product-planning", "--host", "claude", "--report", planningReportPath, "--dry-run"],
        { cwd: ROOT, encoding: "utf-8" },
      );
      expect(runPlanning.status).toBe(0);

      const agg = spawnSync(
        "bun",
        ["scripts/run-skill-routing-eval.ts", "aggregate", "--report", aggregateReportPath, strictReportPath, planningReportPath],
        { cwd: ROOT, encoding: "utf-8" },
      );
      expect(agg.status).toBe(0);
      expect(agg.stdout).toContain("aggregate OK");

      const aggregateReport = JSON.parse(readFileSync(aggregateReportPath, "utf-8"));
      expect(aggregateReport.evidence_scope).toBe("aggregate_package_acceptance");
      expect(aggregateReport.records).toHaveLength(68);
      expect(aggregateReport.case_sources).toHaveLength(68);
      const sidecar = readFileSync(`${aggregateReportPath}.sha256`, "utf-8").trim();
      const bytes = readFileSync(aggregateReportPath);
      expect(sidecar.startsWith(sha256Hex(bytes))).toBe(true);
    });

    test("aggregate CLI: fewer than 2 input paths exits non-zero with a clear usage error", () => {
      const result = spawnSync(
        "bun",
        ["scripts/run-skill-routing-eval.ts", "aggregate", "--report", tmpReportPath("agg-cli-onearg"), "only-one.json"],
        { cwd: ROOT, encoding: "utf-8" },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("at least 2");
    });

    test("--help on aggregate prints usage and exits 0", () => {
      const result = spawnSync("bun", ["scripts/run-skill-routing-eval.ts", "aggregate", "--help"], { cwd: ROOT, encoding: "utf-8" });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("aggregate --report");
    });
  });
});
