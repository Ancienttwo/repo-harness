import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import {
  buildRouteReport,
  buildScenarioPack,
  checkTsArm,
  expectedNlDecisions,
  normalizeRouteAction,
  REQUIRED_ACTION_COVERAGE,
  REQUIRED_INTENT_COVERAGE,
  ROUTE_NL_ALLOWED_ACTIONS,
  ROUTE_NL_ALLOWED_INTENTS,
  ROUTE_SCENARIOS,
  runTsArm,
  validateReport,
  writeRouteReport,
} from "../scripts/route-nl-vs-ts-eval";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/route-nl-vs-ts-eval.ts");

function tempPath(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

describe("route-nl-vs-ts eval", () => {
  test("scenario pack hides expected answers but includes historical route regressions", () => {
    const pack = buildScenarioPack();
    const serialized = JSON.stringify(pack);

    expect(pack.protocol).toBe("route-nl-vs-ts/scenarios/v1");
    expect(pack.scenarios.length).toBeGreaterThanOrEqual(3);
    expect(pack.allowed_actions).toContain("done_gate");
    expect(pack.allowed_actions).toContain("plan_capture_pending_advice");
    expect(pack.instructions.join("\n")).toContain("exact strings");
    expect(serialized).toContain("done-future-wording");
    expect(serialized).toContain("review-hook-bug-mention");
    expect(serialized).toContain("strip-injected-context");
    expect(serialized).not.toContain("expected_action");
  });

  test("TS arm matches the current expected route table", () => {
    for (const scenario of ROUTE_SCENARIOS) {
      const verdict = runTsArm(scenario);
      expect(verdict.intent, scenario.id).toBe(scenario.expected.intent);
      expect(verdict.action, scenario.id).toBe(scenario.expected.action);
    }
  });

  test("--check-ts-arm passes on the shipped corpus and fails on a flipped expectation", () => {
    const run = spawnSync(process.execPath, [SCRIPT, "--check-ts-arm"], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    expect(run.stdout + run.stderr).toContain("route-eval ts-arm");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`covered intents ${REQUIRED_INTENT_COVERAGE.length}/${REQUIRED_INTENT_COVERAGE.length}`);
    expect(run.stdout).toContain(`covered actions ${REQUIRED_ACTION_COVERAGE.length}/${REQUIRED_ACTION_COVERAGE.length}`);
    expect(run.stdout).toContain("missing intents: (none)");
    expect(run.stdout).toContain("missing actions: (none)");
    expect(run.stdout).not.toContain("MISMATCH");

    const flipped = ROUTE_SCENARIOS.map((scenario, index) =>
      index === 0
        ? { ...scenario, expected: { ...scenario.expected, action: "done_gate" as const } }
        : scenario,
    );
    const flippedResult = checkTsArm(flipped);
    expect(flippedResult.ok).toBe(false);
    expect(flippedResult.mismatchCount).toBe(1);
    expect(flippedResult.scenarioLines[0]).toContain("MISMATCH");
    expect(flippedResult.summaryLines.join("\n")).toContain("result=fail");
  }, 30_000);

  test("ROUTE_SCENARIOS covers the pinned intent and action floors", () => {
    const result = checkTsArm();

    expect(result.missingIntents).toEqual([]);
    expect(result.missingActions).toEqual([]);
    expect(result.mismatchCount).toBe(0);
    expect(result.ok).toBe(true);

    for (const intent of REQUIRED_INTENT_COVERAGE) {
      expect(ROUTE_NL_ALLOWED_INTENTS, intent).toContain(intent);
    }
    for (const action of REQUIRED_ACTION_COVERAGE) {
      expect(ROUTE_NL_ALLOWED_ACTIONS, action).toContain(action);
    }
  });

  test("checkTsArm fails on a coverage shortfall even with zero mismatches", () => {
    const withoutDoneGate = checkTsArm(
      ROUTE_SCENARIOS.filter((scenario) => scenario.expected.action !== "done_gate"),
    );
    expect(withoutDoneGate.mismatchCount).toBe(0);
    expect(withoutDoneGate.ok).toBe(false);
    expect(withoutDoneGate.missingActions).toContain("done_gate");
    expect(withoutDoneGate.summaryLines.join("\n")).toContain("result=fail");

    const withoutPassiveWorktreeStatus = checkTsArm(
      ROUTE_SCENARIOS.filter((scenario) => scenario.expected.intent !== "passive_worktree_status"),
    );
    expect(withoutPassiveWorktreeStatus.mismatchCount).toBe(0);
    expect(withoutPassiveWorktreeStatus.ok).toBe(false);
    expect(withoutPassiveWorktreeStatus.missingIntents).toContain("passive_worktree_status");
  }, 30_000);

  test("every scenario cites a non-empty lessonSource", () => {
    const ids = new Set<string>();
    for (const scenario of ROUTE_SCENARIOS) {
      expect(scenario.lessonSource.trim().length, scenario.id).toBeGreaterThan(0);
      expect(scenario.prompt.trim().length, scenario.id).toBeGreaterThan(0);
      expect(ids.has(scenario.id), scenario.id).toBe(false);
      ids.add(scenario.id);
    }
  });

  test("matching NL decisions produce a go report with compliance and token metrics", () => {
    const report = buildRouteReport({
      agent: "unit",
      decisions: expectedNlDecisions(),
      now: new Date("2026-06-12T00:00:00Z"),
    });

    validateReport(report);
    expect(report.arms.ts_verdict.compliance_rate).toBe(1);
    expect(report.arms.nl_decision_table.compliance_rate).toBe(1);
    expect(report.arms.nl_decision_table.false_positive_count).toBe(0);
    expect(report.arms.nl_decision_table.false_negative_count).toBe(0);
    expect(report.token_metrics.estimated_token_delta_per_prompt).toBeGreaterThan(0);
    expect(report.go_no_go.recommendation).toBe("go");
  });

  test("Claude-style action aliases normalize to the controlled route vocabulary", () => {
    expect(normalizeRouteAction("enter_done_gate")).toBe("done_gate");
    expect(normalizeRouteAction("capture_pending_plan")).toBe("plan_capture_pending_advice");
    expect(normalizeRouteAction("scaffold_contract")).toBe("plan_execution_scaffold_advice");

    // Keep this independent of the corpus size: start from the expected route
    // table and rewrite only the entries whose alias behavior is under test.
    const actionAliases: Record<string, string> = {
      "stale-active-marker": "emit_stale_marker_advice",
      "fresh-pending-plan-capture": "capture_pending_plan",
      "draft-plan-approval": "request_plan_capture_approval",
      "approved-plan-missing-contract": "scaffold_contract",
      "done-artifact-gate": "enter_done_gate",
    };
    // Non-execution allow scenarios stay compliant under a different advisory
    // intent label, which is the leniency the NL arm relies on.
    const intentOverrides: Record<string, string> = {
      "done-future-wording": "review_release",
      "strip-injected-context": "planning_discussion",
    };
    const decisions = expectedNlDecisions().map((decision) => ({
      ...decision,
      intent: intentOverrides[decision.scenario_id] ?? decision.intent,
      action: actionAliases[decision.scenario_id] ?? decision.action,
    }));

    const report = buildRouteReport({
      agent: "claude-alias-unit",
      decisions,
      now: new Date("2026-06-12T00:00:00Z"),
    });

    validateReport(report);
    expect(report.arms.nl_decision_table.compliance_rate).toBe(1);
    expect(report.arms.nl_decision_table.normalization_count).toBeGreaterThan(0);
    expect(report.arms.nl_decision_table.false_positive_count).toBe(0);
    expect(report.arms.nl_decision_table.false_negative_count).toBe(0);
    expect(report.go_no_go.recommendation).toBe("go");
  });

  test("NL arm mismatches are recorded as no-go evidence", () => {
    const decisions = expectedNlDecisions();
    decisions[0] = {
      ...decisions[0],
      action: "done_gate",
      rationale: "intentional bad route for regression coverage",
    };
    decisions[3] = {
      ...decisions[3],
      action: "allow",
      rationale: "intentional missing block/advice for regression coverage",
    };

    const report = buildRouteReport({
      agent: "unit",
      decisions,
      now: new Date("2026-06-12T00:00:00Z"),
    });

    validateReport(report);
    expect(report.arms.nl_decision_table.compliance_rate).toBeLessThan(1);
    expect(report.arms.nl_decision_table.false_positive_count).toBe(1);
    expect(report.arms.nl_decision_table.false_negative_count).toBe(1);
    expect(report.go_no_go.recommendation).toBe("no-go");
  });

  test("CLI writes and validates a route report", () => {
    const cwd = tempPath("route-nl-vs-ts");
    try {
      const decisionsPath = join(cwd, "decisions.json");
      const reportPath = join(cwd, ".ai/harness/runs/route-nl-vs-ts-report.json");
      writeFileSync(
        decisionsPath,
        `${JSON.stringify({ decisions: expectedNlDecisions() }, null, 2)}\n`,
        "utf-8",
      );

      const run = spawnSync(
        process.execPath,
        [SCRIPT, "--agent", "unit", "--decisions", decisionsPath, "--out", reportPath],
        { cwd, encoding: "utf-8" },
      );

      expect(run.status).toBe(0);
      expect(run.stdout).toContain("route-nl-vs-ts");
      expect(run.stdout).toContain("go_no_go=go");
      expect(existsSync(reportPath)).toBe(true);

      const check = spawnSync(process.execPath, [SCRIPT, "--check-report", reportPath], {
        cwd,
        encoding: "utf-8",
      });
      expect(check.status).toBe(0);
      expect(check.stdout).toContain("nl_compliance=100.0%");

      const report = JSON.parse(readFileSync(reportPath, "utf-8"));
      validateReport(report);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("writeRouteReport creates parent directories", () => {
    const cwd = tempPath("route-nl-vs-ts-write");
    try {
      const reportPath = join(cwd, ".ai/harness/runs/route-nl-vs-ts-report.json");
      writeRouteReport(
        reportPath,
        buildRouteReport({
          agent: "unit",
          decisions: expectedNlDecisions(),
          now: new Date("2026-06-12T00:00:00Z"),
        }),
      );
      expect(existsSync(reportPath)).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
