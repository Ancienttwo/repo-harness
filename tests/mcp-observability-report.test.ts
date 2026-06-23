import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { buildMcpObservabilityReport, type McpObservabilityReport } from "../scripts/mcp-observability-report";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts/mcp-observability-report.ts");

function writeJsonl(path: string, entries: Record<string, unknown>[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf-8");
}

describe("MCP observability report", () => {
  test("aggregates metrics into dashboard rows and actionable alerts", () => {
    const cwd = mkdtempSync(join(tmpdir(), "mcp-observability-report-"));
    try {
      const metricsPath = join(cwd, ".ai/harness/mcp/metrics.jsonl");
      const tracePath = join(cwd, ".ai/harness/mcp/trace.jsonl");
      writeJsonl(metricsPath, [
        {
          event_type: "mcp_tool_metric",
          correlation_id: "corr_1",
          repo_id: "repo_a",
          tool: "read_file",
          status: "ok",
          duration_ms: 12,
          codegraph_revision: "index_a",
          bytes_returned: 20,
          fallback_used: true,
        },
        {
          event_type: "mcp_tool_metric",
          correlation_id: "corr_2",
          repo_id: "repo_a",
          tool: "repo_manifest",
          status: "ok",
          duration_ms: 30,
          codegraph_revision: "index_a",
          partial: true,
          manifest_parity_failure_count: 2,
          manifest_incomplete: true,
          index_lagging: true,
          index_lag_ms: 7000,
          lagging_path_count: 1,
        },
        {
          event_type: "mcp_tool_metric",
          correlation_id: "corr_3",
          repo_id: "repo_a",
          tool: "read_file",
          status: "blocked",
          error_code: "INVALID_RELATIVE_PATH",
          duration_ms: 5,
          codegraph_revision: "index_a",
          path_escape_attempt: true,
        },
        {
          event_type: "mcp_tool_metric",
          correlation_id: "corr_4",
          repo_id: "repo_a",
          tool: "refresh_repo_index",
          status: "failed",
          error_code: "INDEX_UNAVAILABLE",
          duration_ms: 8,
          codegraph_revision: "index_a",
          reindex_failure: true,
        },
      ]);
      writeJsonl(tracePath, [
        { event_type: "mcp_tool_trace", correlation_id: "corr_1", route: ["mcp_tool_gateway", "response"] },
        { event_type: "mcp_tool_trace", correlation_id: "corr_2", route: ["mcp_tool_gateway", "response"] },
        { event_type: "mcp_tool_trace", correlation_id: "corr_3", route: ["mcp_tool_gateway", "response"] },
      ]);

      const report = buildMcpObservabilityReport({
        repo: cwd,
        now: new Date("2026-06-23T00:00:00Z"),
        pathEscapeThreshold: 1,
        indexLagThresholdMs: 5000,
      });

      expect(report.protocol).toBe("repo-harness-mcp-observability-report/v1");
      expect(report.dashboard.totals).toMatchObject({
        calls: 4,
        errors: 1,
        blocked: 1,
        fallback_count: 1,
        manifest_parity_failures: 2,
        manifest_incomplete_count: 1,
        index_lag_max_ms: 7000,
        reindex_failures: 1,
        path_escape_attempts: 1,
      });
      expect(report.dashboard.by_repo_tool_codegraph.find((row) => row.tool === "read_file")).toMatchObject({
        repo_id: "repo_a",
        codegraph_revision: "index_a",
        calls: 2,
        errors: 0,
        blocked: 1,
        bytes_returned: 20,
        fallback_rate: 0.5,
      });
      expect(report.alerts.map((alert) => alert.id).sort()).toEqual([
        "index_lag_threshold",
        "manifest_incomplete",
        "path_escape_spike",
        "reindex_dead_letter",
      ]);
      expect(report.tracing).toMatchObject({
        correlated_metric_events: 3,
        missing_trace_events: 1,
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("handles long metric logs without argument-spread failures", () => {
    const cwd = mkdtempSync(join(tmpdir(), "mcp-observability-large-"));
    try {
      const metricsPath = join(cwd, ".ai/harness/mcp/metrics.jsonl");
      const tracePath = join(cwd, ".ai/harness/mcp/trace.jsonl");
      const metrics = Array.from({ length: 100_005 }, (_entry, index) => ({
        event_type: "mcp_tool_metric",
        correlation_id: `corr_${index}`,
        repo_id: "repo_a",
        tool: "read_file",
        status: "ok",
        duration_ms: index,
        codegraph_revision: "index_a",
      }));
      writeJsonl(metricsPath, metrics);
      writeJsonl(tracePath, []);

      const report = buildMcpObservabilityReport({ repo: cwd });

      expect(report.source.metric_events).toBe(100_000);
      expect(report.dashboard.totals.calls).toBe(100_000);
      expect(report.dashboard.totals.latency_max_ms).toBe(100_004);
      expect(report.tracing.missing_trace_events).toBe(100_000);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("CLI writes a report and exits cleanly when no alerts fire", () => {
    const cwd = mkdtempSync(join(tmpdir(), "mcp-observability-cli-"));
    try {
      const metricsPath = join(cwd, ".ai/harness/mcp/metrics.jsonl");
      const tracePath = join(cwd, ".ai/harness/mcp/trace.jsonl");
      const out = join(cwd, "report.json");
      writeJsonl(metricsPath, [{
        event_type: "mcp_tool_metric",
        correlation_id: "corr_ok",
        repo_id: "repo_a",
        tool: "stat_file",
        status: "ok",
        duration_ms: 3,
        codegraph_revision: "index_a",
      }]);
      writeJsonl(tracePath, [{ event_type: "mcp_tool_trace", correlation_id: "corr_ok" }]);

      const run = spawnSync(process.execPath, [
        SCRIPT,
        "--repo",
        cwd,
        "--out",
        out,
        "--json",
      ], { encoding: "utf-8" });
      const report = JSON.parse(run.stdout) as McpObservabilityReport;

      expect(run.status).toBe(0);
      expect(existsSync(out)).toBe(true);
      expect(JSON.parse(readFileSync(out, "utf-8")).source.metric_events).toBe(1);
      expect(report.alerts).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
