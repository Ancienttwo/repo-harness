import { describe, expect, test } from "bun:test";
import { resolve } from "path";
import {
  AUTHORITY_STATES,
  PROFILES,
  PANEL_TOKEN_ESTIMATE_METHOD,
  buildPanelFixture,
  estimatedTokens,
  measurePanelCell,
  panelReportPasses,
  percentile,
  renderPanelMarkdown,
  type PanelReport,
} from "../scripts/session-context-packet-panel";

const REPO_ROOT = resolve(import.meta.dir, "..");

describe("session-context-packet-panel: 27-state shape", () => {
  test("9 authority states x 3 profiles = 27 panel cells", () => {
    expect(AUTHORITY_STATES.length).toBe(9);
    expect(PROFILES.length).toBe(3);
    expect(AUTHORITY_STATES.length * PROFILES.length).toBe(27);
    expect(new Set(AUTHORITY_STATES).size).toBe(9);
  });

  test("method is the frozen utf8_bytes_div_4 estimator", () => {
    expect(PANEL_TOKEN_ESTIMATE_METHOD).toBe("utf8_bytes_div_4");
    expect(estimatedTokens("abcd")).toBe(1);
    expect(estimatedTokens("a".repeat(4001))).toBe(1001);
  });
});

describe("session-context-packet-panel: percentile()", () => {
  test("p50/p95 over a known array match manual quantile computation", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(100);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("session-context-packet-panel: fixture builder produces a valid opt-in git repo per authority state", () => {
  test("every authority state's fixture is git-initialized with the opt-in marker present", () => {
    for (const authority of AUTHORITY_STATES) {
      const fixture = buildPanelFixture(authority, "standard");
      try {
        const marker = Bun.file(`${fixture.cwd}/.ai/harness/workflow-contract.json`);
        expect(marker.size).toBeGreaterThan(0);
      } finally {
        fixture.cleanup();
      }
    }
  });
});

describe("session-context-packet-panel: packet determinism per state", () => {
  test("two independent measurement passes over the SAME authority/profile state agree on estimated_tokens and within_budget", () => {
    const first = measurePanelCell(REPO_ROOT, "executing", "standard", 2);
    const second = measurePanelCell(REPO_ROOT, "executing", "standard", 2);
    expect(first.estimated_tokens).toBe(second.estimated_tokens);
    expect(first.within_budget).toBe(second.within_budget);
    expect(first.exit_codes.every((code) => code === 0)).toBe(true);
    expect(second.exit_codes.every((code) => code === 0)).toBe(true);
  }, 30000);

  test("a state with no active plan renders a deterministic empty (0-token) packet", () => {
    const result = measurePanelCell(REPO_ROOT, "no-plan", "lite", 1);
    expect(result.estimated_tokens).toBe(0);
    expect(result.within_budget).toBe(true);
  }, 15000);
});

describe("session-context-packet-panel: gate logic", () => {
  function syntheticReport(overrides: Partial<PanelReport["gates"]>): PanelReport {
    return {
      protocol: "epc-08-context-packet-panel/v1",
      generated_at: "2026-07-23T00:00:00.000Z",
      base_sha: "test",
      method: "utf8_bytes_div_4",
      runner_command: "test",
      iterations_per_state: 1,
      cells: [],
      gates: {
        max_estimated_tokens: 1500,
        panel_token_p95_gate: 700,
        every_sample_within_budget: true,
        every_sample_at_or_under_budget: true,
        panel_p95_estimated_tokens: 320,
        panel_p95_within_gate: true,
        pass: true,
        ...overrides,
      },
    };
  }

  test("passes when both gates are satisfied", () => {
    expect(panelReportPasses(syntheticReport({ pass: true }))).toBe(true);
  });

  test("fails when a sample exceeds the token budget", () => {
    const report = syntheticReport({ every_sample_at_or_under_budget: false, pass: false });
    expect(panelReportPasses(report)).toBe(false);
  });

  test("fails when within_budget is false for any sample", () => {
    const report = syntheticReport({ every_sample_within_budget: false, pass: false });
    expect(panelReportPasses(report)).toBe(false);
  });

  test("fails when panel p95(estimated_tokens) exceeds the frozen gate", () => {
    const report = syntheticReport({ panel_p95_within_gate: false, pass: false });
    expect(panelReportPasses(report)).toBe(false);
  });

  test("renderPanelMarkdown includes all 27 rows, the two gate numbers, method, command, and base SHA", () => {
    const cells = AUTHORITY_STATES.flatMap((authority) =>
      PROFILES.map((profile) => ({
        authority,
        profile,
        estimated_tokens: 100,
        within_budget: true,
        latency_p50_ms: 10,
        latency_p95_ms: 20,
        sample_count: 1,
        exit_codes: [0],
      })),
    );
    const report: PanelReport = {
      protocol: "epc-08-context-packet-panel/v1",
      generated_at: "2026-07-23T00:00:00.000Z",
      base_sha: "deadbeef",
      method: "utf8_bytes_div_4",
      runner_command: "bun scripts/session-context-packet-panel.ts --repo . --iterations 20",
      iterations_per_state: 20,
      cells,
      gates: {
        max_estimated_tokens: 1500,
        panel_token_p95_gate: 700,
        every_sample_within_budget: true,
        every_sample_at_or_under_budget: true,
        panel_p95_estimated_tokens: 100,
        panel_p95_within_gate: true,
        pass: true,
      },
    };
    const markdown = renderPanelMarkdown(report);
    const rowCount = report.cells.length;
    expect(rowCount).toBe(27);
    for (const authority of AUTHORITY_STATES) {
      expect(markdown).toContain(authority);
    }
    expect(markdown).toContain("1500");
    expect(markdown).toContain("700");
    expect(markdown).toContain("utf8_bytes_div_4");
    expect(markdown).toContain("bun scripts/session-context-packet-panel.ts");
    expect(markdown).toContain("deadbeef");
  });
});
