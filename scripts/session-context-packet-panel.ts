#!/usr/bin/env bun
/**
 * EPC-08 Context Packet panel measurement runner.
 *
 * Renders the full SessionStart Context Packet -- exactly as a live host
 * receives it: the `effective-state` section, the post-edit-journal
 * section, and the three `buildSessionStartSections()` sections, all
 * budgeted by the existing `budgetSessionContext` -- across a 27-state
 * Authority×Profile panel (9 authority states x {lite, standard, strict}
 * profiles) via the real `bun src/cli/hook-entry.ts SessionStart --route
 * default` subprocess. One deterministic sample per state is recorded for
 * the two EPC-00-frozen token gates: every sample's `estimated_tokens <=
 * SESSION_CONTEXT_TOKEN_BUDGET` (1500) with `within_budget == true`, and
 * panel `p95(estimated_tokens) <= 700` -- both computed over the token
 * counts themselves, method `utf8_bytes_div_4`. SessionStart LATENCY is
 * reported purely descriptively (>=20 iterations per state, p50/p95 ms)
 * and carries no gate at all -- EPC-00 confirmation: "the audit sets no
 * SessionStart-latency gate, so EPC-08 gates only on the two token
 * numbers."
 *
 * Sibling to `scripts/hook-dispatch-diet-report.ts` (HRD-08): this script
 * mirrors, rather than imports, that script's `percentile()` /
 * `utf8_bytes_div_4` token-estimator / synthetic-subprocess-probe shape,
 * since none of those are exported from that file and this repo's own
 * convention is to duplicate small cross-boundary helpers rather than
 * import them (see `recovery-materializer.ts` / `checks-materializer.ts`'s
 * own module docs for the same "necessarily duplicated, not imported"
 * reasoning). The `>=20` iteration default mirrors HRD-08's own
 * `HRD08_CHARACTERIZATION_CYCLES=20` characterization-cycle precedent.
 *
 * `SESSION_CONTEXT_TOKEN_BUDGET` itself IS imported (not duplicated) from
 * `session-context-budget.ts` -- it is an exported, frozen constant, so
 * importing it (read-only) is the single-source-of-truth choice; only the
 * *estimator formula* (`utf8_bytes_div_4`, a private, unexported one-liner
 * in that module) is duplicated, matching HRD-08's own script, which
 * duplicates the exact same formula for the exact same reason.
 *
 * Fixture builder mirrors, rather than imports, the shape of
 * `tests/state/effective-state-fixture.ts`'s `createEffectiveStateFixture` /
 * `EFFECTIVE_STATE_SCENARIOS` / `replaceContractProfile` (a git-initialized
 * repo with a plan/contract/review/`checks/latest.json`/`tasks/current.md`,
 * scenario setups including `foreign-worktree-owner` and
 * `invalid-capability-registry`, and a Workflow-Profile-field rewrite
 * helper) -- no script in this repo imports from `tests/`, and
 * `tsconfig.json`'s `include` never covers `scripts/**` (so `bun run
 * check:type` never even typechecks this file), so this is a small,
 * self-contained duplicate of that same fixture shape, not a parallel state
 * factory invented from scratch.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { spawnSync } from "child_process";
import { performance } from "perf_hooks";
import { fileURLToPath } from "url";
import { SESSION_CONTEXT_TOKEN_BUDGET } from "../src/cli/hook/session-context-budget";

export const PANEL_PROTOCOL = "epc-08-context-packet-panel/v1" as const;
export const PANEL_TOKEN_ESTIMATE_METHOD = "utf8_bytes_div_4" as const;
/** Frozen EPC-00 gate: panel p95(estimated_tokens) <= 700 -- a token count,
 * NOT a latency figure. SessionStart latency (see PanelCellResult's own
 * latency_p50_ms/latency_p95_ms) is reported purely descriptively and
 * carries no gate at all. */
export const PANEL_TOKEN_P95_GATE = 700;
export const DEFAULT_ITERATIONS = 20;
export const SCRIPT_PATH = "scripts/session-context-packet-panel.ts";

const REPO_ROOT_SELF = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export type AuthorityState =
  | "no-plan"
  | "draft-plan"
  | "approved-work-package"
  | "executing"
  | "completed"
  | "foreign-worktree"
  | "corrupt-policy"
  | "invalid-capability-registry"
  | "conflicting-active-markers";

export const AUTHORITY_STATES: readonly AuthorityState[] = [
  "no-plan",
  "draft-plan",
  "approved-work-package",
  "executing",
  "completed",
  "foreign-worktree",
  "corrupt-policy",
  "invalid-capability-registry",
  "conflicting-active-markers",
];

export type PanelProfile = "lite" | "standard" | "strict";
export const PROFILES: readonly PanelProfile[] = ["lite", "standard", "strict"];

// ---------------------------------------------------------------------------
// Fixture builder (mirrors tests/state/effective-state-fixture.ts; see
// module doc for why this is a duplicate rather than an import).
// ---------------------------------------------------------------------------

const FIXTURE_GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "epc08-panel-fixture",
  GIT_AUTHOR_EMAIL: "epc08-panel-fixture@example.com",
  GIT_COMMITTER_NAME: "epc08-panel-fixture",
  GIT_COMMITTER_EMAIL: "epc08-panel-fixture@example.com",
  GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
};

function gitFixture(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8", env: FIXTURE_GIT_ENV });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in fixture ${cwd}: ${result.stderr}`);
}

function writeFixtureFile(cwd: string, relPath: string, content: string): void {
  const target = join(cwd, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const PLAN_PATH = "plans/plan-20260723-0024-epc-08-panel-fixture.md";
const CONTRACT_PATH = "tasks/contracts/20260723-0024-epc-08-panel-fixture.contract.md";
const REVIEW_PATH = "tasks/reviews/20260723-0024-epc-08-panel-fixture.review.md";
const SECOND_PLAN_PATH = "plans/plan-20260723-0024-epc-08-panel-fixture-legacy.md";

function panelPlanBody(status: string): string {
  return [
    "# Plan: EPC-08 Panel Fixture",
    "",
    `> **Status**: ${status}`,
    `> **Task Contract**: \`${CONTRACT_PATH}\``,
    "",
    "## Task Breakdown",
    "- [ ] fixture task",
    "",
  ].join("\n");
}

function panelContractBody(profile: PanelProfile): string {
  return [
    "# Task Contract: epc-08-panel-fixture",
    "",
    "> **Status**: Active",
    `> **Plan**: ${PLAN_PATH}`,
    "> **Task Profile**: code-change",
    `> **Workflow Profile**: ${profile}`,
    `> **Review File**: \`${REVIEW_PATH}\``,
    "",
    "## Allowed Paths",
    "",
    "```yaml",
    "allowed_paths:",
    "  - src/",
    "```",
    "",
  ].join("\n");
}

function panelReviewBody(): string {
  return [
    "# Review",
    "> **Recommendation**: fail",
    "> **Reviewed Subject SHA256**: pending",
    "## External Acceptance Advice",
    "> **External Acceptance**: unavailable",
    "",
  ].join("\n");
}

export interface PanelFixture {
  readonly cwd: string;
  cleanup(): void;
}

/**
 * Builds one fresh git-initialized fixture repo for one (authority, profile)
 * panel cell. Every state carries the SAME base scaffold (plan, contract,
 * review, `checks/latest.json`, `tasks/current.md`, the
 * `workflow-contract.json` opt-in marker `isOptIn()` requires); the
 * authority-specific mutation is applied on top, matching the plan's own
 * 9-state naming.
 */
export function buildPanelFixture(authority: AuthorityState, profile: PanelProfile): PanelFixture {
  const cwd = mkdtempSync(join(tmpdir(), `epc08-panel-${authority}-`));
  try {
    for (const dir of ["plans", "tasks/contracts", "tasks/reviews", ".ai/harness/handoff", ".ai/harness/checks"]) {
      mkdirSync(join(cwd, dir), { recursive: true });
    }
    // Required for runtime.ts's isOptIn() gate -- absent this marker the
    // whole hook is a silent non-opt-in no-op (content: undefined), not a
    // measurable panel cell.
    writeFixtureFile(cwd, ".ai/harness/workflow-contract.json", "{}\n");
    writeFixtureFile(cwd, ".ai/harness/active-plan", `${PLAN_PATH}\n`);
    writeFixtureFile(cwd, ".ai/harness/active-worktree", `${cwd}\n`);
    writeFixtureFile(cwd, PLAN_PATH, panelPlanBody("Executing"));
    writeFixtureFile(cwd, CONTRACT_PATH, panelContractBody(profile));
    writeFixtureFile(cwd, REVIEW_PATH, panelReviewBody());
    writeFixtureFile(
      cwd,
      ".ai/harness/checks/latest.json",
      `${JSON.stringify({ schema: "repo-harness-run-trace.v1", status: "unsatisfied" })}\n`,
    );
    writeFixtureFile(cwd, "tasks/current.md", [
      "# Current",
      "> **Status**: Executing",
      "> **Updated At**: 2026-07-23T00:00:00.000Z",
      `- Active Plan: ${PLAN_PATH}`,
      "",
    ].join("\n"));
    writeFixtureFile(
      cwd,
      "tasks/todos.md",
      [
        "# Deferred Goal Ledger",
        "",
        "> **Status**: Backlog",
        "",
        "Current plan tasks live in the active plan's `## Task Breakdown`.",
        "",
      ].join("\n"),
    );
    writeFixtureFile(
      cwd,
      ".gitignore",
      [".ai/harness/state/", ".ai/harness/security/", ".ai/harness/evidence/", ""].join("\n"),
    );

    switch (authority) {
      case "no-plan":
        rmSync(join(cwd, ".ai/harness/active-plan"), { force: true });
        break;
      case "draft-plan":
        writeFixtureFile(cwd, PLAN_PATH, panelPlanBody("Draft"));
        break;
      case "approved-work-package":
        writeFixtureFile(cwd, PLAN_PATH, panelPlanBody("Approved"));
        break;
      case "executing":
        break; // base scaffold default
      case "completed":
        writeFixtureFile(cwd, PLAN_PATH, panelPlanBody("Completed"));
        break;
      case "foreign-worktree":
        writeFixtureFile(cwd, ".ai/harness/active-worktree", "/tmp/epc-08-panel-foreign-worktree\n");
        break;
      case "corrupt-policy":
        writeFixtureFile(cwd, ".ai/harness/policy.json", "{not json");
        break;
      case "invalid-capability-registry":
        writeFixtureFile(cwd, ".ai/context/capabilities.json", "{not json");
        break;
      case "conflicting-active-markers":
        writeFixtureFile(cwd, SECOND_PLAN_PATH, panelPlanBody("Draft"));
        writeFixtureFile(cwd, ".claude/.active-plan", `${SECOND_PLAN_PATH}\n`);
        break;
      default: {
        const exhaustive: never = authority;
        throw new Error(`unhandled authority state: ${exhaustive}`);
      }
    }

    gitFixture(cwd, ["init", "-q", "-b", "main"]);
    gitFixture(cwd, ["add", "."]);
    gitFixture(cwd, ["commit", "-q", "-m", `panel fixture: ${authority}/${profile}`]);
    return { cwd, cleanup: () => rmSync(cwd, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(cwd, { recursive: true, force: true });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Measurement (mirrors hook-dispatch-diet-report.ts's own percentile() /
// sessionStartContext() / defaultProbeRunner() shape -- duplicated, not
// imported; see module doc).
// ---------------------------------------------------------------------------

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

export function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return roundMs(sorted[index] ?? sorted[sorted.length - 1]!);
}

/** `utf8_bytes_div_4` -- the frozen estimator formula (mirrored from
 * `session-context-budget.ts`'s private `estimatedTokens`, which is not
 * exported; identical to `hook-dispatch-diet-report.ts`'s own duplicate). */
export function estimatedTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(text, "utf-8") / 4);
}

function parseSessionStartContext(stdout: string): string {
  const text = stdout.trim();
  if (text.length === 0) return "";
  if (!text.startsWith("{")) return "";
  try {
    const parsed = JSON.parse(text) as { hookSpecificOutput?: { hookEventName?: unknown; additionalContext?: unknown } };
    const specific = parsed.hookSpecificOutput;
    if (specific?.hookEventName === "SessionStart" && typeof specific.additionalContext === "string") {
      return specific.additionalContext;
    }
    return "";
  } catch {
    return "";
  }
}

export interface PanelSampleRun {
  readonly context: string;
  readonly durationMs: number;
  readonly exitCode: number;
}

function runSessionStartOnce(repoRoot: string, fixtureCwd: string): PanelSampleRun {
  const hookEntry = join(repoRoot, "src/cli/hook-entry.ts");
  const isolatedHome = join(fixtureCwd, ".panel-home");
  mkdirSync(isolatedHome, { recursive: true });
  const env = {
    ...process.env,
    // The panel must not inherit host Claude/Codex settings: those settings
    // are outside the fixture and would make the security section vary by
    // machine rather than by authority/profile state.
    HOME: isolatedHome,
    // Deterministic panel content: never let the tooling-advisory section
    // spawn a detached background populate or vary by ambient tool state.
    REPO_HARNESS_TOOLING_ADVISORY: "0",
  };
  const start = performance.now();
  const result = spawnSync(process.execPath, [hookEntry, "SessionStart", "--route", "default"], {
    cwd: fixtureCwd,
    encoding: "utf-8",
    env,
  });
  const durationMs = performance.now() - start;
  return {
    context: result.status === 0 ? parseSessionStartContext(result.stdout ?? "") : "",
    durationMs,
    exitCode: result.status ?? 1,
  };
}

export interface PanelCellResult {
  readonly authority: AuthorityState;
  readonly profile: PanelProfile;
  readonly estimated_tokens: number;
  readonly within_budget: boolean;
  readonly latency_p50_ms: number | null;
  readonly latency_p95_ms: number | null;
  readonly sample_count: number;
  readonly exit_codes: readonly number[];
}

export function measurePanelCell(
  repoRoot: string,
  authority: AuthorityState,
  profile: PanelProfile,
  iterations: number,
): PanelCellResult {
  const fixture = buildPanelFixture(authority, profile);
  try {
    const runs: PanelSampleRun[] = [];
    for (let i = 0; i < iterations; i += 1) {
      runs.push(runSessionStartOnce(repoRoot, fixture.cwd));
    }
    // One deterministic sample: packet content is deterministic per fixture
    // state (EPC-00 confirmation), so the first run's content is the
    // recorded sample for estimated_tokens/within_budget. Latency is NOT
    // deterministic and gets the full >=20-iteration descriptive treatment
    // (p50/p95 below) -- purely informational, never gated.
    const sampleContext = runs[0]!.context;
    const tokens = estimatedTokens(sampleContext);
    const durations = runs.map((run) => run.durationMs);
    return {
      authority,
      profile,
      estimated_tokens: tokens,
      within_budget: tokens <= SESSION_CONTEXT_TOKEN_BUDGET,
      latency_p50_ms: percentile(durations, 0.5),
      latency_p95_ms: percentile(durations, 0.95),
      sample_count: runs.length,
      exit_codes: runs.map((run) => run.exitCode),
    };
  } finally {
    fixture.cleanup();
  }
}

export interface PanelReport {
  readonly protocol: typeof PANEL_PROTOCOL;
  readonly generated_at: string;
  readonly base_sha: string;
  readonly method: typeof PANEL_TOKEN_ESTIMATE_METHOD;
  readonly runner_command: string;
  readonly iterations_per_state: number;
  readonly cells: readonly PanelCellResult[];
  readonly gates: {
    readonly max_estimated_tokens: number;
    readonly panel_token_p95_gate: number;
    readonly every_sample_within_budget: boolean;
    readonly every_sample_at_or_under_budget: boolean;
    readonly panel_p95_estimated_tokens: number | null;
    readonly panel_p95_within_gate: boolean;
    readonly pass: boolean;
  };
}

function resolveBaseSha(repoRoot: string): string {
  const result = spawnSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf-8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

export function buildPanelReport(options: { repo: string; iterations: number; now?: Date }): PanelReport {
  const repoRoot = resolve(options.repo);
  const cells: PanelCellResult[] = [];
  for (const authority of AUTHORITY_STATES) {
    for (const profile of PROFILES) {
      cells.push(measurePanelCell(repoRoot, authority, profile, options.iterations));
    }
  }
  const allTokenSamples = cells.map((cell) => cell.estimated_tokens);
  const everyAtOrUnderBudget = allTokenSamples.every((value) => value <= SESSION_CONTEXT_TOKEN_BUDGET);
  const everyWithinBudget = cells.every((cell) => cell.within_budget);
  // Frozen EPC-00 gate: panel p95(estimated_tokens) <= 700 -- computed over
  // the 27 token samples themselves, NOT over latency. Latency (p50/p95 ms,
  // per cell above) stays purely descriptive and is never gated.
  const panelP95Tokens = percentile(allTokenSamples, 0.95);
  const panelP95WithinGate = panelP95Tokens !== null && panelP95Tokens <= PANEL_TOKEN_P95_GATE;
  return {
    protocol: PANEL_PROTOCOL,
    generated_at: (options.now ?? new Date()).toISOString(),
    base_sha: resolveBaseSha(repoRoot),
    method: PANEL_TOKEN_ESTIMATE_METHOD,
    runner_command: `bun ${SCRIPT_PATH} --repo . --iterations ${options.iterations}`,
    iterations_per_state: options.iterations,
    cells,
    gates: {
      max_estimated_tokens: SESSION_CONTEXT_TOKEN_BUDGET,
      panel_token_p95_gate: PANEL_TOKEN_P95_GATE,
      every_sample_within_budget: everyWithinBudget,
      every_sample_at_or_under_budget: everyAtOrUnderBudget,
      panel_p95_estimated_tokens: panelP95Tokens,
      panel_p95_within_gate: panelP95WithinGate,
      pass: everyAtOrUnderBudget && everyWithinBudget && panelP95WithinGate,
    },
  };
}

export function panelReportPasses(report: PanelReport): boolean {
  return report.gates.pass;
}

export function renderPanelMarkdown(report: PanelReport): string {
  const rows = report.cells.map((cell) => `| ${cell.authority} | ${cell.profile} | ${cell.estimated_tokens} | ${cell.within_budget ? "true" : "false"} | ${cell.latency_p50_ms ?? "unavailable"} | ${cell.latency_p95_ms ?? "unavailable"} |`).join("\n");
  return [
    "# EPC-08 Context Packet Panel Report",
    "",
    `- Protocol: \`${report.protocol}\``,
    `- Generated: ${report.generated_at}`,
    `- Base SHA: \`${report.base_sha}\``,
    `- Method: \`${report.method}\``,
    `- Runner command: \`${report.runner_command}\``,
    `- Iterations per state (latency, descriptive): ${report.iterations_per_state}`,
    "",
    "## Panel (27 rows: 9 authority states x 3 profiles)",
    "",
    "| Authority state | Profile | estimated_tokens | within_budget | latency p50 (ms) | latency p95 (ms) |",
    "|---|---|---:|---|---:|---:|",
    rows,
    "",
    "## Gate numbers (frozen, EPC-00)",
    "",
    `- Max estimated_tokens per sample: ${report.gates.max_estimated_tokens}`,
    `- Panel p95(estimated_tokens) gate: ${report.gates.panel_token_p95_gate}`,
    `- Every sample <= ${report.gates.max_estimated_tokens} and within_budget == true: ${report.gates.every_sample_within_budget && report.gates.every_sample_at_or_under_budget ? "PASS" : "FAIL"}`,
    `- Panel p95(estimated_tokens): ${report.gates.panel_p95_estimated_tokens ?? "unavailable"} (${report.gates.panel_p95_within_gate ? "PASS" : "FAIL"}, gate <= ${report.gates.panel_token_p95_gate})`,
    `- Overall: ${report.gates.pass ? "PASS" : "FAIL"}`,
    "",
    "## Notes",
    "",
    "- One deterministic sample per state for `estimated_tokens`/`within_budget` (packet content is deterministic per fixture state, EPC-00 confirmation).",
    "- The panel p95 gate above is computed over the 27 `estimated_tokens` samples (method `utf8_bytes_div_4`), per the frozen EPC-00 acceptance line -- it is NOT a latency gate.",
    `- Latency is reported purely descriptively across ${report.iterations_per_state} iterations per state (p50/p95 ms in the table above); EPC-00 sets no SessionStart-latency gate at all.`,
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
  repo: string;
  iterations: number;
  out?: string;
  format: "json" | "markdown";
}

function usage(): string {
  return [
    "Usage: scripts/session-context-packet-panel.ts [--repo PATH] [--iterations N] [--out PATH] [--json|--markdown]",
    "",
    "Renders the SessionStart Context Packet across the 27-state Authority×Profile panel.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliOptions | { error: string; help?: boolean } {
  const opts: CliOptions = { repo: process.cwd(), iterations: DEFAULT_ITERATIONS, format: "markdown" };
  let formatExplicit = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { error: "", help: true };
    else if (arg === "--repo") opts.repo = argv[++i] ?? "";
    else if (arg === "--out") opts.out = argv[++i] ?? "";
    else if (arg === "--iterations") {
      const parsed = Number.parseInt(argv[++i] ?? "", 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return { error: "invalid --iterations" };
      opts.iterations = parsed;
    } else if (arg === "--json") {
      opts.format = "json";
      formatExplicit = true;
    } else if (arg === "--markdown") {
      opts.format = "markdown";
      formatExplicit = true;
    } else return { error: `unknown argument: ${arg}` };
  }
  if (!formatExplicit && opts.out && opts.out.toLowerCase().endsWith(".json")) opts.format = "json";
  if (!opts.repo) return { error: "missing --repo value" };
  return opts;
}

function main(argv: readonly string[]): number {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    if (parsed.help) {
      console.log(usage());
      return 0;
    }
    console.error(`session-context-packet-panel: ${parsed.error}`);
    console.error(usage());
    return 2;
  }
  const report = buildPanelReport({ repo: parsed.repo, iterations: parsed.iterations });
  const markdown = renderPanelMarkdown(report);
  const rendered = parsed.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : markdown;
  if (parsed.out) {
    const outPath = isAbsolute(parsed.out) ? parsed.out : resolve(parsed.repo, parsed.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, rendered);
  }
  console.log(parsed.format === "json" ? JSON.stringify(report) : markdown);
  return panelReportPasses(report) ? 0 : 1;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
