#!/usr/bin/env bun
// Focused, deterministic validator/selector for the SSD skill-routing corpus.
// Deliberately separate from scripts/run-skill-evals.ts (a two-arm provider
// comparison harness over evals/evals.json) rather than an extension of it —
// see tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md,
// "## SSD-01" for the rationale. No provider is invoked here; SSD-07 owns the
// one frozen provider-routing run.
import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const SKILL_ROUTING_DIR = join(REPO_ROOT, "evals", "skill-routing");
export const CORPUS_PATH = join(SKILL_ROUTING_DIR, "routing-corpus.json");
export const BASELINE_PATH = join(SKILL_ROUTING_DIR, "discovery-baseline.json");

export const CASE_KINDS = [
  "positive", "ambiguous", "quoted-name", "negated", "hypothetical", "status-only", "ordinary-qa",
] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

// The plan's overlap-vocabulary dimensions; "merge-gate vs cross-review" is one
// dimension covered by tagging both literal terms on the same case.
export const REQUIRED_OVERLAP_TERMS: readonly string[] =
  ["review", "check", "plan", "ship", "merge-gate", "gptpro", "architecture"];

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LANGS = ["zh", "en"];
const CASE_FIELDS = ["id", "lang", "kind", "prompt", "expected_route", "overlap_terms", "notes"];

export interface RoutingCase {
  id: string;
  lang: "zh" | "en";
  kind: CaseKind;
  prompt: string;
  expected_route: string;
  overlap_terms?: string[];
  notes?: string;
}

export interface RoutingCorpus {
  version: number;
  cases: RoutingCase[];
}

export class CliError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
  }
}

export function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}
export function loadCorpus(path: string = CORPUS_PATH): RoutingCorpus {
  return loadJson(path) as RoutingCorpus;
}
export function loadBaseline(path: string = BASELINE_PATH): Record<string, unknown> {
  return loadJson(path) as Record<string, unknown>;
}
export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalRoutesFromBaseline(baseline: Record<string, unknown>): string[] {
  const target = baseline.target_discovered_sets as { canonical_routes?: unknown } | undefined;
  const routes = target?.canonical_routes;
  if (!Array.isArray(routes) || routes.length === 0 || routes.some((r) => typeof r !== "string")) {
    throw new CliError("discovery-baseline.json target_discovered_sets.canonical_routes must be a non-empty string array");
  }
  return routes as string[];
}

/** Validates one case's shape. Returns human-readable issue strings, empty when valid. */
export function validateCaseShape(entry: unknown, index: number): string[] {
  const label = `case[${index}]`;
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [`${label}: must be an object`];
  const c = entry as Record<string, unknown>;
  const id = typeof c.id === "string" && c.id.length > 0 ? c.id : label;
  const issues: string[] = [];
  if (typeof c.id !== "string" || !ID_PATTERN.test(c.id)) issues.push(`${label} (${id}): id must be a unique kebab-case string`);
  if (typeof c.lang !== "string" || !LANGS.includes(c.lang)) issues.push(`${id}: lang must be "zh" or "en"`);
  if (typeof c.kind !== "string" || !(CASE_KINDS as readonly string[]).includes(c.kind)) {
    issues.push(`${id}: kind must be one of ${CASE_KINDS.join(", ")}`);
  }
  if (typeof c.prompt !== "string" || c.prompt.trim().length === 0) issues.push(`${id}: prompt must be a non-empty string`);
  if (typeof c.expected_route !== "string" || c.expected_route.trim().length === 0) {
    issues.push(`${id}: expected_route must be a non-empty string`);
  }
  if (c.overlap_terms !== undefined) {
    const ok = Array.isArray(c.overlap_terms) && c.overlap_terms.every((t) => typeof t === "string" && t.length > 0);
    if (!ok) issues.push(`${id}: overlap_terms must be a non-empty string array when present`);
  }
  if (c.notes !== undefined && typeof c.notes !== "string") issues.push(`${id}: notes must be a string when present`);
  const extraKeys = Object.keys(c).filter((key) => !CASE_FIELDS.includes(key));
  if (extraKeys.length > 0) issues.push(`${id}: unexpected field(s) ${extraKeys.join(", ")}`);
  return issues;
}

/** Validates the whole corpus document shape (version + every case). */
export function validateCorpusShape(corpus: unknown): string[] {
  if (typeof corpus !== "object" || corpus === null || Array.isArray(corpus)) return ["corpus root must be an object"];
  const c = corpus as Record<string, unknown>;
  const issues: string[] = [];
  if (c.version !== 1) issues.push("corpus.version must be 1");
  if (!Array.isArray(c.cases) || c.cases.length === 0) {
    issues.push("corpus.cases must be a non-empty array");
    return issues;
  }
  c.cases.forEach((entry, index) => issues.push(...validateCaseShape(entry, index)));
  return issues;
}

/** Coverage requirements from the SSD-01 brief: per-route zh+en positives, kind
 * floors, overlap-term coverage, id uniqueness, and total case count in range. */
export function validateCoverage(corpus: RoutingCorpus, canonicalRoutes: readonly string[]): string[] {
  const issues: string[] = [];
  const seenIds = new Set<string>();
  for (const c of corpus.cases) {
    if (seenIds.has(c.id)) issues.push(`duplicate case id: ${c.id}`);
    seenIds.add(c.id);
  }
  for (const route of canonicalRoutes) {
    if (!corpus.cases.some((c) => c.kind === "positive" && c.lang === "zh" && c.expected_route === route)) {
      issues.push(`route ${route}: missing a zh positive case`);
    }
    if (!corpus.cases.some((c) => c.kind === "positive" && c.lang === "en" && c.expected_route === route)) {
      issues.push(`route ${route}: missing an en positive case`);
    }
  }
  for (const kind of CASE_KINDS) {
    const count = corpus.cases.filter((c) => c.kind === kind).length;
    if (count < 3) issues.push(`kind ${kind}: only ${count} case(s), need at least 3`);
  }
  for (const term of REQUIRED_OVERLAP_TERMS) {
    if (!corpus.cases.some((c) => c.kind !== "positive" && (c.overlap_terms ?? []).includes(term))) {
      issues.push(`overlap term "${term}": no non-positive case tags it`);
    }
  }
  if (corpus.cases.length < 60 || corpus.cases.length > 90) {
    issues.push(`total case count ${corpus.cases.length} is outside the required [60, 90] range`);
  }
  return issues;
}

function usage(): string {
  return [
    "Usage:",
    "  bun scripts/run-skill-routing-eval.ts validate",
    "  bun scripts/run-skill-routing-eval.ts hash [--write]",
    "  bun scripts/run-skill-routing-eval.ts dry-run",
    "",
    "validate: schema-shape plus coverage requirements (per-route zh+en positives,",
    "kind floors, overlap-term coverage, unique ids, total case count in [60,90]).",
    "hash: sha256 of routing-corpus.json vs discovery-baseline.json's corpus_sha256;",
    "verify-only by default, --write updates the baseline file in place.",
    "dry-run: asserts every expected_route is \"none\" or a baseline canonical route,",
    "then prints per-route case counts. No provider call; SSD-07 owns that run.",
  ].join("\n");
}

interface Options {
  mode: "validate" | "hash" | "dry-run";
  write: boolean;
}

function parseArgs(argv: string[]): Options {
  const mode = argv[0];
  if (mode === "--help" || mode === "-h") {
    console.log(usage());
    process.exit(0);
  }
  if (mode !== "validate" && mode !== "hash" && mode !== "dry-run") {
    throw new CliError(`unknown or missing subcommand${mode ? ` "${mode}"` : ""}\n\n${usage()}`, 2);
  }
  let write = false;
  for (const arg of argv.slice(1)) {
    if (arg === "--write" && mode === "hash") { write = true; continue; }
    if (arg === "--help" || arg === "-h") { console.log(usage()); process.exit(0); }
    throw new CliError(`unknown argument ${arg}`, 2);
  }
  return { mode, write };
}

function runValidate(): number {
  const corpusRaw = loadJson(CORPUS_PATH);
  const shapeIssues = validateCorpusShape(corpusRaw);
  if (shapeIssues.length > 0) {
    for (const issue of shapeIssues) console.error(`run-skill-routing-eval: validate: ${issue}`);
    return 1;
  }
  const corpus = corpusRaw as RoutingCorpus;
  const coverageIssues = validateCoverage(corpus, canonicalRoutesFromBaseline(loadBaseline()));
  if (coverageIssues.length > 0) {
    for (const issue of coverageIssues) console.error(`run-skill-routing-eval: validate: ${issue}`);
    return 1;
  }
  console.log(`run-skill-routing-eval: validate OK: ${corpus.cases.length} cases`);
  return 0;
}

function runHash(write: boolean): number {
  const computed = sha256Hex(readFileSync(CORPUS_PATH));
  const baseline = loadBaseline();
  if (write) {
    if (baseline.corpus_sha256 === computed) {
      console.log(`run-skill-routing-eval: hash unchanged: ${computed}`);
      return 0;
    }
    baseline.corpus_sha256 = computed;
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, "utf-8");
    console.log(`run-skill-routing-eval: wrote corpus_sha256=${computed} to ${relative(REPO_ROOT, BASELINE_PATH)}`);
    return 0;
  }
  if (baseline.corpus_sha256 !== computed) {
    console.error("run-skill-routing-eval: hash mismatch");
    console.error(`  routing-corpus.json sha256            = ${computed}`);
    console.error(`  discovery-baseline.json corpus_sha256 = ${String(baseline.corpus_sha256)}`);
    console.error("  run with --write to update discovery-baseline.json, or regenerate the corpus");
    return 1;
  }
  console.log(`run-skill-routing-eval: hash OK: ${computed}`);
  return 0;
}

function runDryRun(): number {
  const corpus = loadCorpus();
  const canonicalRoutes = canonicalRoutesFromBaseline(loadBaseline());
  const allowedRoutes = [...canonicalRoutes, "none"];
  const allowed = new Set(allowedRoutes);
  const counts = new Map<string, number>(allowedRoutes.map((name) => [name, 0]));
  const violations: string[] = [];
  for (const c of corpus.cases) {
    if (!allowed.has(c.expected_route)) {
      violations.push(`${c.id}: expected_route "${c.expected_route}" is not "none" or a target canonical route`);
      continue;
    }
    counts.set(c.expected_route, (counts.get(c.expected_route) ?? 0) + 1);
  }
  if (violations.length > 0) {
    for (const violation of violations) console.error(`run-skill-routing-eval: dry-run: ${violation}`);
    return 1;
  }
  console.log(`run-skill-routing-eval: dry-run selection OK: ${corpus.cases.length} cases`);
  for (const name of allowedRoutes) console.log(`  ${name}: ${counts.get(name)}`);
  return 0;
}

export function runCli(argv: string[]): number {
  const opts = parseArgs(argv);
  if (opts.mode === "validate") return runValidate();
  if (opts.mode === "hash") return runHash(opts.write);
  return runDryRun();
}

if (import.meta.main) {
  try {
    process.exit(runCli(process.argv.slice(2)));
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    console.error(`run-skill-routing-eval: ${(error as Error).message}`);
    process.exit(exitCode);
  }
}
