#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

export interface LoopEngineShadowEvent {
  ts: string;
  loop_engine_shadow?: {
    protocol?: string;
    enabled?: boolean;
    g1?: string;
    authoritative?: string;
    state_snapshot?: unknown;
    nl_decision_table?: string;
    ts_verdict?: {
      intent?: string;
      action?: string;
    };
    nl_decision?: {
      intent?: string;
      action?: string;
      source?: string;
    };
    divergence?: boolean;
    timebox?: {
      max_prompt_count?: number;
      max_days?: number;
    };
  };
}

export interface LoopEngineShadowSummary {
  protocol: "loop-engine-shadow-summary/v1";
  generated_at: string;
  trace_file: string;
  prompt_count: number;
  divergence_count: number;
  divergence_rate: number;
  first_prompt_at: string | null;
  last_prompt_at: string | null;
  timebox: {
    max_prompt_count: number;
    max_days: number;
    ends_at: string | null;
    complete: boolean;
    completion_reason: "prompt_count" | "elapsed_days" | null;
  };
  authoritative: "ts_verdict";
  nl_decision_table: string;
  actions: Array<{
    ts_action: string;
    nl_action: string;
    count: number;
  }>;
  recommendation: "continue_shadow" | "ready_for_cutover_review" | "no_go";
}

export const DEFAULT_TRACE_PATH = ".claude/.trace.jsonl";
export const DEFAULT_OUT_PATH = ".ai/harness/runs/loop-engine-03-shadow-summary.json";
const DEFAULT_MAX_PROMPTS = 100;
const DEFAULT_MAX_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readTraceEvents(traceFile: string): LoopEngineShadowEvent[] {
  if (!existsSync(traceFile)) return [];
  return readFileSync(traceFile, "utf-8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as LoopEngineShadowEvent];
      } catch {
        return [];
      }
    })
    .filter((event) => {
      const shadow = event.loop_engine_shadow;
      return (
        shadow?.protocol === "loop-engine-shadow/v1" &&
        shadow.enabled === true &&
        shadow.g1 === "go"
      );
    });
}

function summarizeActionPairs(events: LoopEngineShadowEvent[]): LoopEngineShadowSummary["actions"] {
  const counts = new Map<string, { ts_action: string; nl_action: string; count: number }>();
  for (const event of events) {
    const tsAction = event.loop_engine_shadow?.ts_verdict?.action ?? "unknown";
    const nlAction = event.loop_engine_shadow?.nl_decision?.action ?? "unknown";
    const key = `${tsAction}\t${nlAction}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { ts_action: tsAction, nl_action: nlAction, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.ts_action.localeCompare(b.ts_action));
}

export function buildLoopEngineShadowSummary(params: {
  traceFile?: string;
  now?: Date;
  maxPromptCount?: number;
  maxDays?: number;
}): LoopEngineShadowSummary {
  const traceFile = params.traceFile ?? DEFAULT_TRACE_PATH;
  const events = readTraceEvents(traceFile);
  const promptCount = events.length;
  const divergenceCount = events.filter((event) => event.loop_engine_shadow?.divergence === true).length;
  const firstPromptAt = events[0]?.ts ?? null;
  const lastPromptAt = events[events.length - 1]?.ts ?? null;
  const maxPromptCount =
    params.maxPromptCount ?? events[0]?.loop_engine_shadow?.timebox?.max_prompt_count ?? DEFAULT_MAX_PROMPTS;
  const maxDays = params.maxDays ?? events[0]?.loop_engine_shadow?.timebox?.max_days ?? DEFAULT_MAX_DAYS;
  const firstDate = parseDate(firstPromptAt);
  const now = params.now ?? new Date();
  const endsAt = firstDate ? new Date(firstDate.getTime() + maxDays * DAY_MS) : null;
  const promptCountComplete = promptCount >= maxPromptCount;
  const elapsedDaysComplete = Boolean(endsAt && now.getTime() >= endsAt.getTime());
  const complete = promptCountComplete || elapsedDaysComplete;
  const completionReason = promptCountComplete ? "prompt_count" : elapsedDaysComplete ? "elapsed_days" : null;
  const divergenceRate = promptCount === 0 ? 0 : divergenceCount / promptCount;
  const recommendation =
    divergenceCount > 0 ? "no_go" : complete ? "ready_for_cutover_review" : "continue_shadow";

  return {
    protocol: "loop-engine-shadow-summary/v1",
    generated_at: now.toISOString(),
    trace_file: traceFile,
    prompt_count: promptCount,
    divergence_count: divergenceCount,
    divergence_rate: divergenceRate,
    first_prompt_at: firstPromptAt,
    last_prompt_at: lastPromptAt,
    timebox: {
      max_prompt_count: maxPromptCount,
      max_days: maxDays,
      ends_at: endsAt?.toISOString() ?? null,
      complete,
      completion_reason: completionReason,
    },
    authoritative: "ts_verdict",
    nl_decision_table: events[0]?.loop_engine_shadow?.nl_decision_table ?? "docs/reference-configs/loop-engine-nl-decision-table.md",
    actions: summarizeActionPairs(events),
    recommendation,
  };
}

export function writeLoopEngineShadowSummary(path: string, summary: LoopEngineShadowSummary): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
}

function printSummary(summary: LoopEngineShadowSummary): void {
  console.log(
    [
      "loop-engine-shadow",
      `prompts=${summary.prompt_count}`,
      `divergence_count=${summary.divergence_count}`,
      `timebox_complete=${summary.timebox.complete}`,
      `recommendation=${summary.recommendation}`,
    ].join(" "),
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const traceFile = typeof args.trace === "string" ? args.trace : DEFAULT_TRACE_PATH;
  const out = typeof args.out === "string" ? args.out : DEFAULT_OUT_PATH;
  const maxPromptCount = typeof args["max-prompts"] === "string" ? Number(args["max-prompts"]) : undefined;
  const maxDays = typeof args["max-days"] === "string" ? Number(args["max-days"]) : undefined;
  const now = typeof args.now === "string" ? new Date(args.now) : undefined;
  const summary = buildLoopEngineShadowSummary({
    traceFile,
    now,
    maxPromptCount,
    maxDays,
  });

  if (args.check) {
    if (!existsSync(out)) {
      throw new Error(`summary file does not exist: ${out}`);
    }
    const existing = JSON.parse(readFileSync(out, "utf-8")) as LoopEngineShadowSummary;
    if (existing.protocol !== "loop-engine-shadow-summary/v1") {
      throw new Error(`unexpected summary protocol: ${existing.protocol}`);
    }
    printSummary(existing);
    return;
  }

  writeLoopEngineShadowSummary(out, summary);
  printSummary(summary);
}

if (import.meta.main) {
  main();
}
