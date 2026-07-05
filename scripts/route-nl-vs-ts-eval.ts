#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { runPromptGuardVerdictFromPrompt, type PromptGuardVerdict } from "../src/cli/commands/prompt-guard-decision";
import {
  PROMPT_GUARD_ACTIONS,
  PROMPT_GUARD_INTENTS,
  type PromptGuardAction,
  type PromptGuardIntent,
  type PromptGuardState,
} from "../src/cli/hook/prompt-guard-decision";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const REPO_ROOT = join(__dirname, "..");
export const NL_DECISION_TABLE_PATH = join(REPO_ROOT, "docs/reference-configs/loop-engine-nl-decision-table.md");
export const DEFAULT_REPORT_PATH = ".ai/harness/runs/route-nl-vs-ts-report.json";

export interface RouteScenario {
  id: string;
  title: string;
  lessonSource: string;
  prompt: string;
  state: PromptGuardState;
  expected: {
    intent: string;
    action: PromptGuardAction;
  };
}

export interface RouteNlDecision {
  scenario_id: string;
  intent: string;
  action: PromptGuardAction | string;
  rationale?: string;
}

export interface RouteScenarioPack {
  protocol: "route-nl-vs-ts/scenarios/v1";
  decision_table: string;
  allowed_intents: readonly PromptGuardIntent[];
  allowed_actions: readonly PromptGuardAction[];
  instructions: string[];
  scenarios: Array<{
    scenario_id: string;
    title: string;
    lesson_source: string;
    prompt: string;
    state_snapshot: PromptGuardState;
  }>;
}

interface ArmComparison {
  compliance_rate: number;
  compliant_count: number;
  normalization_count: number;
  false_positive_count: number;
  false_negative_count: number;
  mismatch_count: number;
  missing_count: number;
  results: Array<{
    scenario_id: string;
    expected_intent: string;
    expected_action: PromptGuardAction;
    actual_intent: string | null;
    actual_action: string | null;
    raw_intent?: string | null;
    raw_action?: string | null;
    compliant: boolean;
    error_type: "false_positive" | "false_negative" | "mismatch" | "missing" | null;
  }>;
}

export interface RouteNlVsTsReport {
  protocol: "route-nl-vs-ts/report/v1";
  generated_at: string;
  agent: string;
  scenario_count: number;
  inputs: {
    scenarios: string;
    nl_decision_table: string;
    note: string;
  };
  arms: {
    ts_verdict: ArmComparison & {
      verdicts: Array<{
        scenario_id: string;
        intent: string;
        action: PromptGuardAction;
      }>;
    };
    nl_decision_table: ArmComparison;
  };
  token_metrics: {
    snapshot_bytes_max: number;
    nl_table_bytes: number;
    ts_verdict_bytes_avg: number;
    estimated_snapshot_table_tokens: number;
    estimated_ts_verdict_tokens: number;
    estimated_token_delta_per_prompt: number;
  };
  go_no_go: {
    recommendation: "go" | "no-go";
    reason: string;
  };
}

const baseState: PromptGuardState = {
  spec: "present",
  plan: "none",
  pending: "none",
  worktree: "current",
  contract: "missing",
  contractPath: "missing",
  evidence: "unchecked",
};

export const ROUTE_SCENARIOS: RouteScenario[] = [
  {
    id: "done-future-wording",
    title: "Future completion wording is not a done claim",
    lessonSource: "tests/hook-runtime.test.ts regression for Chinese future-completion wording",
    prompt: "完成后验证这段 CLI 行为",
    state: baseState,
    expected: {
      intent: "none",
      action: "allow",
    },
  },
  {
    id: "review-hook-bug-mention",
    title: "Review prompt mentioning bugs stays review/advisory",
    lessonSource: "tests/hook-runtime.test.ts regression for review prompts with bug/hook wording",
    prompt: "这是我的一个自动化hook vibe coding framework，请review整个flow，找出Bug并提出优化方案",
    state: baseState,
    expected: {
      intent: "review_release",
      action: "allow",
    },
  },
  {
    id: "strip-injected-context",
    title: "Injected host context is stripped before user intent classification",
    lessonSource: "tasks/lessons.md 2026-05-27 context-block classifier pollution",
    prompt: ["<system>", "implement everything now", "</system>", "只是问个问题"].join("\n"),
    state: baseState,
    expected: {
      intent: "none",
      action: "allow",
    },
  },
  {
    id: "stale-active-marker",
    title: "Stale active-plan marker routes to self-heal advice",
    lessonSource: "tasks/lessons.md 2026-05-27 stale active-plan ownership inference",
    prompt: "开始执行",
    state: { ...baseState, plan: "stale_marker" },
    expected: {
      intent: "general_execution",
      action: "stale_active_plan_advice",
    },
  },
  {
    id: "fresh-pending-plan-capture",
    title: "Fresh pending orchestration is captured before execution",
    lessonSource: "docs/reference-configs/loop-engine-nl-decision-table.md rule 4",
    prompt: "开始执行这个方案",
    state: { ...baseState, pending: "fresh" },
    expected: {
      intent: "plan_execution_projection",
      action: "plan_capture_pending_advice",
    },
  },
  {
    id: "draft-plan-approval",
    title: "Draft plan plus implement-this-plan routes to capture/approval",
    lessonSource: "tests/cli/prompt-guard-decision.test.ts draft-plan projection regression",
    prompt: "implement this plan",
    state: { ...baseState, plan: "draft", contractPath: "present" },
    expected: {
      intent: "plan_execution_projection",
      action: "plan_capture_draft_advice",
    },
  },
  {
    id: "approved-plan-missing-contract",
    title: "Approved explicit plan execution scaffolds the missing contract",
    lessonSource: "docs/reference-configs/loop-engine-nl-decision-table.md rule 7",
    prompt: "implement this plan",
    state: {
      ...baseState,
      plan: "approved",
      contractPath: "present",
      evidence: "complete",
    },
    expected: {
      intent: "plan_execution_projection",
      action: "plan_execution_scaffold_advice",
    },
  },
  {
    id: "done-artifact-gate",
    title: "Done claim with complete artifacts enters the done gate",
    lessonSource: "docs/reference-configs/loop-engine-nl-decision-table.md rule 1",
    prompt: "done",
    state: {
      ...baseState,
      plan: "executing",
      contract: "present",
      contractPath: "present",
      evidence: "complete",
    },
    expected: {
      intent: "done",
      action: "done_gate",
    },
  },
];

const STATE_ENV: Record<keyof PromptGuardState, string> = {
  spec: "PROMPT_GUARD_SPEC_STATE",
  plan: "PROMPT_GUARD_PLAN_STATE",
  pending: "PROMPT_GUARD_PENDING_STATE",
  worktree: "PROMPT_GUARD_WORKTREE_STATE",
  contract: "PROMPT_GUARD_CONTRACT_STATE",
  contractPath: "PROMPT_GUARD_CONTRACT_PATH_STATE",
  evidence: "PROMPT_GUARD_EVIDENCE_STATE",
};

export const ROUTE_NL_ALLOWED_INTENTS = PROMPT_GUARD_INTENTS;
export const ROUTE_NL_ALLOWED_ACTIONS = PROMPT_GUARD_ACTIONS;

const ACTION_ALIASES: Record<string, PromptGuardAction> = {
  emit_stale_marker_advice: "stale_active_plan_advice",
  stale_marker_advice: "stale_active_plan_advice",
  clear_stale_marker_advice: "stale_active_plan_advice",
  capture_pending_plan: "plan_capture_pending_advice",
  pending_plan_capture: "plan_capture_pending_advice",
  request_plan_capture_approval: "plan_capture_draft_advice",
  request_plan_approval: "plan_capture_draft_advice",
  scaffold_contract: "plan_execution_scaffold_advice",
  project_contract: "plan_execution_scaffold_advice",
  enter_done_gate: "done_gate",
  completion_gate: "done_gate",
};

const INTENT_ALIASES: Record<string, PromptGuardIntent> = {
  question: "none",
  informational: "none",
  information: "none",
  no_execution: "none",
};

const NON_EXECUTION_ALLOW_INTENTS = new Set<PromptGuardIntent>([
  "planning_start",
  "planning_discussion",
  "review_release",
  "passive_worktree_status",
  "passive_completion_report",
  "passive_next_slice_report",
  "none",
]);

function cloneState(state: PromptGuardState): PromptGuardState {
  return { ...state };
}

function withStateEnv<T>(state: PromptGuardState, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, envName] of Object.entries(STATE_ENV) as Array<[keyof PromptGuardState, string]>) {
    previous.set(envName, process.env[envName]);
    process.env[envName] = state[key];
  }

  try {
    return fn();
  } finally {
    for (const [envName, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[envName];
      } else {
        process.env[envName] = value;
      }
    }
  }
}

export function buildScenarioPack(): RouteScenarioPack {
  return {
    protocol: "route-nl-vs-ts/scenarios/v1",
    decision_table: "docs/reference-configs/loop-engine-nl-decision-table.md",
    allowed_intents: ROUTE_NL_ALLOWED_INTENTS,
    allowed_actions: ROUTE_NL_ALLOWED_ACTIONS,
    instructions: [
      "Use the NL decision table to choose exactly one intent and action for each scenario.",
      "The intent and action values must be exact strings from allowed_intents and allowed_actions.",
      "Do not invent synonyms such as enter_done_gate, capture_pending_plan, or scaffold_contract.",
      "Do not use the TypeScript prompt classifier for the NL arm.",
      "Write decisions as JSON with a top-level decisions array.",
    ],
    scenarios: ROUTE_SCENARIOS.map((scenario) => ({
      scenario_id: scenario.id,
      title: scenario.title,
      lesson_source: scenario.lessonSource,
      prompt: scenario.prompt,
      state_snapshot: cloneState(scenario.state),
    })),
  };
}

export function expectedNlDecisions(): RouteNlDecision[] {
  return ROUTE_SCENARIOS.map((scenario) => ({
    scenario_id: scenario.id,
    intent: scenario.expected.intent,
    action: scenario.expected.action,
    rationale: "Expected decision from the current route contract.",
  }));
}

export function runTsArm(scenario: RouteScenario): PromptGuardVerdict {
  return withStateEnv(scenario.state, () => runPromptGuardVerdictFromPrompt(scenario.prompt));
}

function actionIsAllow(action: string | null): boolean {
  return action === "allow";
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeRouteAction(action: string): string {
  const token = normalizeToken(action);
  if (ROUTE_NL_ALLOWED_ACTIONS.includes(token as PromptGuardAction)) return token;
  return ACTION_ALIASES[token] ?? token;
}

export function normalizeRouteIntent(intent: string): string {
  const token = normalizeToken(intent);
  if (ROUTE_NL_ALLOWED_INTENTS.includes(token as PromptGuardIntent)) return token;
  return INTENT_ALIASES[token] ?? token;
}

function intentIsCompliant(params: {
  expectedIntent: string;
  expectedAction: PromptGuardAction;
  actualIntent: string | null;
  actualAction: string | null;
}): boolean {
  if (params.actualIntent === params.expectedIntent) return true;
  if (
    params.expectedIntent === "none" &&
    params.expectedAction === "allow" &&
    params.actualAction === "allow" &&
    NON_EXECUTION_ALLOW_INTENTS.has(params.actualIntent as PromptGuardIntent)
  ) {
    return true;
  }
  return false;
}

function classifyError(
  expectedAction: PromptGuardAction,
  actualAction: string | null,
  compliant: boolean,
): "false_positive" | "false_negative" | "mismatch" | "missing" | null {
  if (compliant) return null;
  if (actualAction === null) return "missing";
  if (actionIsAllow(expectedAction) && !actionIsAllow(actualAction)) return "false_positive";
  if (!actionIsAllow(expectedAction) && actionIsAllow(actualAction)) return "false_negative";
  return "mismatch";
}

function summarizeComparison(actualByScenario: Map<string, { intent: string; action: string }>): ArmComparison {
  const results = ROUTE_SCENARIOS.map((scenario) => {
    const rawActual = actualByScenario.get(scenario.id) ?? null;
    const actual = rawActual
      ? {
          intent: normalizeRouteIntent(rawActual.intent),
          action: normalizeRouteAction(rawActual.action),
          rawIntent: rawActual.intent,
          rawAction: rawActual.action,
        }
      : null;
    const compliant =
      actual?.action === scenario.expected.action &&
      intentIsCompliant({
        expectedIntent: scenario.expected.intent,
        expectedAction: scenario.expected.action,
        actualIntent: actual?.intent ?? null,
        actualAction: actual?.action ?? null,
      });
    const errorType = classifyError(
      scenario.expected.action,
      actual?.action ?? null,
      compliant,
    );

    return {
      scenario_id: scenario.id,
      expected_intent: scenario.expected.intent,
      expected_action: scenario.expected.action,
      actual_intent: actual?.intent ?? null,
      actual_action: actual?.action ?? null,
      raw_intent: actual?.rawIntent === actual?.intent ? undefined : actual?.rawIntent ?? null,
      raw_action: actual?.rawAction === actual?.action ? undefined : actual?.rawAction ?? null,
      compliant,
      error_type: errorType,
    };
  });

  const compliantCount = results.filter((result) => result.compliant).length;
  const normalizationCount = results.filter((result) => result.raw_intent || result.raw_action).length;
  return {
    compliance_rate: ROUTE_SCENARIOS.length === 0 ? 0 : compliantCount / ROUTE_SCENARIOS.length,
    compliant_count: compliantCount,
    normalization_count: normalizationCount,
    false_positive_count: results.filter((result) => result.error_type === "false_positive").length,
    false_negative_count: results.filter((result) => result.error_type === "false_negative").length,
    mismatch_count: results.filter((result) => result.error_type === "mismatch").length,
    missing_count: results.filter((result) => result.error_type === "missing").length,
    results,
  };
}

function readNlTable(): string {
  return readFileSync(NL_DECISION_TABLE_PATH, "utf-8");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildTokenMetrics(tsVerdicts: PromptGuardVerdict[]): RouteNlVsTsReport["token_metrics"] {
  const nlTable = readNlTable();
  const snapshotBytes = ROUTE_SCENARIOS.map((scenario) =>
    Buffer.byteLength(JSON.stringify({ states: scenario.state }), "utf-8"),
  );
  const snapshotBytesMax = Math.max(...snapshotBytes);
  const tsVerdictBytes = tsVerdicts.map((verdict) =>
    Buffer.byteLength(JSON.stringify(verdict), "utf-8"),
  );
  const tsVerdictBytesAvg = Math.round(
    tsVerdictBytes.reduce((sum, value) => sum + value, 0) / tsVerdictBytes.length,
  );

  const nlTableBytes = Buffer.byteLength(nlTable, "utf-8");
  const estimatedSnapshotTableTokens = estimateTokens(
    nlTable + JSON.stringify({ states: ROUTE_SCENARIOS[0]?.state ?? {} }),
  );
  const estimatedTsVerdictTokens = estimateTokens(JSON.stringify(tsVerdicts[0] ?? {}));

  return {
    snapshot_bytes_max: snapshotBytesMax,
    nl_table_bytes: nlTableBytes,
    ts_verdict_bytes_avg: tsVerdictBytesAvg,
    estimated_snapshot_table_tokens: estimatedSnapshotTableTokens,
    estimated_ts_verdict_tokens: estimatedTsVerdictTokens,
    estimated_token_delta_per_prompt: estimatedSnapshotTableTokens - estimatedTsVerdictTokens,
  };
}

function normalizeDecisions(input: unknown): RouteNlDecision[] {
  const source = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { decisions?: unknown }).decisions)
      ? (input as { decisions: unknown[] }).decisions
      : [];

  return source
    .map((entry): RouteNlDecision | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const scenarioId = record.scenario_id ?? record.id;
      const intent = record.intent;
      const action = record.action;
      if (
        typeof scenarioId !== "string" ||
        typeof intent !== "string" ||
        typeof action !== "string"
      ) {
        return null;
      }
      const result: RouteNlDecision = {
        scenario_id: scenarioId,
        intent,
        action,
      };
      if (typeof record.rationale === "string") {
        result.rationale = record.rationale;
      }
      return result;
    })
    .filter((entry): entry is RouteNlDecision => entry !== null);
}

export function buildRouteReport(params: {
  agent?: string;
  decisions: RouteNlDecision[];
  now?: Date;
}): RouteNlVsTsReport {
  const tsVerdicts = ROUTE_SCENARIOS.map(runTsArm);
  const tsByScenario = new Map(
    ROUTE_SCENARIOS.map((scenario, index) => [
      scenario.id,
      {
        intent: tsVerdicts[index].intent,
        action: tsVerdicts[index].action,
      },
    ]),
  );
  const nlByScenario = new Map(
    params.decisions.map((decision) => [
      decision.scenario_id,
      {
        intent: decision.intent,
        action: String(decision.action),
      },
    ]),
  );

  const tsComparison = summarizeComparison(tsByScenario);
  const nlComparison = summarizeComparison(nlByScenario);
  const tokenMetrics = buildTokenMetrics(tsVerdicts);
  const go =
    tsComparison.false_positive_count === 0 &&
    tsComparison.false_negative_count === 0 &&
    nlComparison.false_positive_count === 0 &&
    nlComparison.false_negative_count === 0 &&
    nlComparison.missing_count === 0 &&
    nlComparison.compliance_rate >= tsComparison.compliance_rate;

  return {
    protocol: "route-nl-vs-ts/report/v1",
    generated_at: (params.now ?? new Date()).toISOString(),
    agent: params.agent ?? "unknown",
    scenario_count: ROUTE_SCENARIOS.length,
    inputs: {
      scenarios: "scripts/route-nl-vs-ts-eval.ts#ROUTE_SCENARIOS",
      nl_decision_table: "docs/reference-configs/loop-engine-nl-decision-table.md",
      note: "TS arm calls the current prompt guard verdict; NL arm is supplied by the benchmark agent from the decision table.",
    },
    arms: {
      ts_verdict: {
        ...tsComparison,
        verdicts: ROUTE_SCENARIOS.map((scenario, index) => ({
          scenario_id: scenario.id,
          intent: tsVerdicts[index].intent,
          action: tsVerdicts[index].action,
        })),
      },
      nl_decision_table: nlComparison,
    },
    token_metrics: tokenMetrics,
    go_no_go: {
      recommendation: go ? "go" : "no-go",
      reason: go
        ? "NL decision-table routing matched the current TS verdict expectations for all scenarios without false positives or false negatives."
        : "NL decision-table routing had missing or mismatched decisions; keep the TS classifier authoritative while collecting more evidence.",
    },
  };
}

export function loadDecisionsFile(path: string): RouteNlDecision[] {
  return normalizeDecisions(JSON.parse(readFileSync(path, "utf-8")));
}

export function writeRouteReport(path: string, report: RouteNlVsTsReport): void {
  writeJsonFile(path, report);
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export function validateReport(report: RouteNlVsTsReport): void {
  if (report.protocol !== "route-nl-vs-ts/report/v1") {
    throw new Error(`unexpected report protocol: ${report.protocol}`);
  }
  if (report.scenario_count < 3) {
    throw new Error("route report must include at least three scenarios");
  }
  if (!["go", "no-go"].includes(report.go_no_go.recommendation)) {
    throw new Error("route report must include a go/no-go recommendation");
  }
  for (const arm of [report.arms.ts_verdict, report.arms.nl_decision_table]) {
    if (typeof arm.compliance_rate !== "number") {
      throw new Error("route report arm missing compliance_rate");
    }
    if (typeof arm.false_positive_count !== "number") {
      throw new Error("route report arm missing false_positive_count");
    }
    if (typeof arm.false_negative_count !== "number") {
      throw new Error("route report arm missing false_negative_count");
    }
  }
  if (typeof report.token_metrics.estimated_token_delta_per_prompt !== "number") {
    throw new Error("route report missing token delta");
  }
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (!current.startsWith("--")) continue;
    const key = current.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function printSummary(report: RouteNlVsTsReport): void {
  const nl = report.arms.nl_decision_table;
  const ts = report.arms.ts_verdict;
  console.log(
    [
      "route-nl-vs-ts",
      `agent=${report.agent}`,
      `ts_compliance=${(ts.compliance_rate * 100).toFixed(1)}%`,
      `nl_compliance=${(nl.compliance_rate * 100).toFixed(1)}%`,
      `false_positive_count=${nl.false_positive_count}`,
      `false_negative_count=${nl.false_negative_count}`,
      `token_delta=${report.token_metrics.estimated_token_delta_per_prompt}`,
      `go_no_go=${report.go_no_go.recommendation}`,
    ].join(" "),
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args["emit-scenarios"]) {
    console.log(JSON.stringify(buildScenarioPack(), null, 2));
    return;
  }

  if (typeof args["write-scenarios"] === "string") {
    writeJsonFile(args["write-scenarios"], buildScenarioPack());
    return;
  }

  if (typeof args["write-expected-decisions"] === "string") {
    const path = args["write-expected-decisions"];
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ decisions: expectedNlDecisions() }, null, 2)}\n`, "utf-8");
    return;
  }

  if (typeof args["check-report"] === "string") {
    if (!existsSync(args["check-report"])) {
      throw new Error(`report file does not exist: ${args["check-report"]}`);
    }
    const report = JSON.parse(readFileSync(args["check-report"], "utf-8")) as RouteNlVsTsReport;
    validateReport(report);
    printSummary(report);
    return;
  }

  if (typeof args.decisions !== "string") {
    throw new Error("missing --decisions <path>; use --emit-scenarios to generate the scenario pack");
  }

  const outPath = typeof args.out === "string" ? args.out : DEFAULT_REPORT_PATH;
  const report = buildRouteReport({
    agent: typeof args.agent === "string" ? args.agent : "unknown",
    decisions: loadDecisionsFile(args.decisions),
  });
  writeRouteReport(outPath, report);
  printSummary(report);
}

if (import.meta.main) {
  main();
}
