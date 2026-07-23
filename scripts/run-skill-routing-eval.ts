#!/usr/bin/env bun
// Focused, deterministic validator/selector for the SSD skill-routing corpus.
// Deliberately separate from scripts/run-skill-evals.ts (a two-arm provider
// comparison harness over evals/evals.json) rather than an extension of it —
// see tasks/notes/20260715-1140-skill-surface-discovery-convergence.notes.md,
// "## SSD-01" for the rationale. No provider is invoked here; SSD-07 owns the
// one frozen provider-routing run.
import { readdirSync, readFileSync, readlinkSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const SKILL_ROUTING_DIR = join(REPO_ROOT, "evals", "skill-routing");
export const CORPUS_PATH = join(SKILL_ROUTING_DIR, "routing-corpus.json");
export const BASELINE_PATH = join(SKILL_ROUTING_DIR, "discovery-baseline.json");
export const SCHEMA_PATH = join(SKILL_ROUTING_DIR, "routing-corpus.schema.json");

export const CASE_KINDS = [
  "positive", "ambiguous", "quoted-name", "negated", "hypothetical", "status-only", "ordinary-qa",
] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

// The plan's overlap-vocabulary dimensions; "merge-gate vs cross-review" is one
// dimension covered by tagging both literal terms on the same case.
export const REQUIRED_OVERLAP_TERMS: readonly string[] =
  ["review", "check", "plan", "ship", "merge-gate", "gptpro", "architecture"];

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const LANGS = ["zh", "en"];
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

/**
 * SSD-01 carried advisory: routing-corpus.schema.json existed but nothing
 * ever loaded or cross-checked it against this runner's own constants, so it
 * could silently drift. This binds the schema's case-shape enums/pattern to
 * the runner's own CASE_KINDS/LANGS/ID_PATTERN/canonical-routes constants.
 */
export function schemaDriftIssues(canonicalRoutes: readonly string[]): string[] {
  const issues: string[] = [];
  let schema: unknown;
  try {
    schema = loadJson(SCHEMA_PATH);
  } catch (error) {
    return [`routing-corpus.schema.json: unreadable or invalid JSON: ${(error as Error).message}`];
  }
  const props = (schema as {
    definitions?: { case?: { properties?: Record<string, { enum?: unknown[]; pattern?: string }> } };
  }).definitions?.case?.properties;
  if (!props) {
    return ["routing-corpus.schema.json: definitions.case.properties is missing"];
  }

  const sameSet = (left: readonly unknown[], right: readonly string[]): boolean => {
    if (left.length !== right.length) return false;
    const a = [...left].map(String).sort();
    const b = [...right].sort();
    return a.every((value, index) => value === b[index]);
  };

  const kindEnum = props.kind?.enum;
  if (!Array.isArray(kindEnum) || !sameSet(kindEnum, CASE_KINDS)) {
    issues.push(`schema kind enum ${JSON.stringify(kindEnum)} drifted from runner CASE_KINDS ${JSON.stringify(CASE_KINDS)}`);
  }
  const langEnum = props.lang?.enum;
  if (!Array.isArray(langEnum) || !sameSet(langEnum, LANGS)) {
    issues.push(`schema lang enum ${JSON.stringify(langEnum)} drifted from runner LANGS ${JSON.stringify(LANGS)}`);
  }
  const expectedRouteEnum = props.expected_route?.enum;
  const runnerRoutes = [...canonicalRoutes, "none"];
  if (!Array.isArray(expectedRouteEnum) || !sameSet(expectedRouteEnum, runnerRoutes)) {
    issues.push(`schema expected_route enum ${JSON.stringify(expectedRouteEnum)} drifted from discovery-baseline canonical routes ${JSON.stringify(runnerRoutes)}`);
  }
  const idPattern = props.id?.pattern;
  if (idPattern !== ID_PATTERN.source) {
    issues.push(`schema id pattern ${JSON.stringify(idPattern)} drifted from runner ID_PATTERN ${JSON.stringify(ID_PATTERN.source)}`);
  }
  return issues;
}

// ============================================================================
// Provider mode (SSD-07 phase A / D1): executes the frozen 68-case corpus
// against a real provider ONCE per case, for one specified profile/host
// context, and scores canonical top-1 accuracy, per-route recall,
// double-trigger/ambiguous activation, and ordinary-QA false activation.
//
// This phase implements the mechanism but does NOT invoke a real provider —
// per the orchestrator's R3 ruling, the one authoritative matrix run happens
// only after an explicit user go. `--dry-run` exercises the full pipeline
// with a built-in stub provider; deterministic tests (below, in
// tests/skill-routing-eval.test.ts) exercise metrics/report-shape/hash-
// binding/threshold-evaluation via the same stub with configurable behavior.
//
// No single profile/host run discovers all 10 canonical routes (see the
// notes file's D5 entry), so each run's metrics/thresholds are scoped to
// its OWN reachable route subset (RoutingRunRecord.excluded_unreachable,
// RouteRecallStat.reachable) and its overall_pass is labeled PARTIAL
// evidence, never package acceptance on its own (RoutingRunReport
// .evidence_scope/.evidence_note). The `aggregate` subcommand
// (buildAggregateReport, below) combines 2+ runs into the actual
// package-acceptance signal across all 10 canonical routes.
// ============================================================================

import { spawnSync } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import {
  parseSkillSurfaceCatalog,
  facadesForProfile,
  hostSkillPlacements,
  SKILL_SURFACE_HOSTS,
  SKILL_SURFACE_PROFILES,
  type SkillSurfaceCatalog,
  type SkillSurfaceHost,
  type SkillSurfaceProfile,
} from "../src/core/skill-surface/catalog";
import {
  parseClaudeStructuredOutput,
  parseCodexStructuredOutput,
  type ProviderStructuredEvidence,
} from "./run-skill-evals";

export const MANIFEST_PATH = join(REPO_ROOT, "assets", "skill-commands", "manifest.json");

export function loadLiveCatalog(manifestPath: string = MANIFEST_PATH): SkillSurfaceCatalog {
  const raw = readFileSync(manifestPath, "utf-8");
  const resolution = parseSkillSurfaceCatalog(raw, { declared: true });
  if (resolution.status !== "valid") {
    throw new CliError(
      `run: live manifest ${manifestPath} is invalid: ${resolution.diagnostics.map((d) => `${d.code} ${d.path}: ${d.message}`).join("; ")}`,
    );
  }
  return resolution.catalog;
}

// --- discovered skill surface (pure; no fs beyond the already-loaded catalog) ---

export type DiscoveryReason = "always" | "profile-facade" | "cross-model" | "cli-reference" | "explicit-setup";

export interface DiscoveredSkillSurfaceEntry {
  readonly name: string;
  readonly sourcePath: string;
  readonly reason: DiscoveryReason;
}

/**
 * The Skill directories a real host would actually project for this
 * profile/host (root always; profile-gated facades; host-aware provider
 * skills) -- exactly what installProfileHostMutationPaths()/
 * sync-codex-installed-copies.sh materialize today, computed from the same
 * catalog selectors (facadesForProfile/hostSkillPlacements) SSD-02 made the
 * runtime authority.
 */
export function buildDiscoveredSkillSurface(
  catalog: SkillSurfaceCatalog,
  profile: SkillSurfaceProfile,
  host: SkillSurfaceHost,
): DiscoveredSkillSurfaceEntry[] {
  const entries: DiscoveredSkillSurfaceEntry[] = [];
  const seen = new Set<string>();
  const add = (name: string, reason: DiscoveryReason): void => {
    if (seen.has(name)) return;
    const pkg = catalog.packages.find((p) => p.name === name);
    if (!pkg || pkg.source === null) return;
    seen.add(name);
    entries.push({ name, sourcePath: resolve(REPO_ROOT, pkg.source), reason });
  };
  for (const pkg of catalog.packages) {
    if (pkg.discoverability === "always" && pkg.hosts.includes(host)) add(pkg.name, "always");
  }
  for (const name of facadesForProfile(catalog, profile)) add(name, "profile-facade");
  const placements = hostSkillPlacements(catalog, profile);
  for (const name of host === "claude" ? placements.claude : placements.codex) add(name, "cross-model");
  // discoverability:"explicit-setup" (repo-harness-chatgpt today) is never
  // profile-gated -- neither facadesForProfile (kind:"facade" only) nor
  // hostSkillPlacements (kind:"provider-skill" only) covers its
  // kind:"integration". Real production discovery is "additive only after
  // an explicit ChatGPT setup action, orthogonal to profile" (per the
  // plan's target-discovery-matrix notes); for THIS eval's purposes it is
  // modeled as always reachable regardless of --profile, so a chatgpt-
  // positive case is genuinely testable (and so the ordinary-qa cases that
  // mention "GPT Pro" without invoking it are tested against a surface
  // where repo-harness-chatgpt really is visible, not trivially absent).
  for (const pkg of catalog.packages) {
    if (pkg.discoverability === "explicit-setup" && pkg.hosts.includes(host)) add(pkg.name, "explicit-setup");
  }
  return entries;
}

/**
 * Packages with discoverability:"cli-reference" (repo-harness-setup,
 * repo-harness-architecture today) are never separately projected as a host
 * Skill directory -- they are reachable only through the root router's own
 * routing prose plus direct file access under the eval workspace's
 * `--add-dir`-equivalent repo mount, exactly like a real npm-installed
 * package ships every source file while only a profile-gated subset gets
 * symlinked into `.claude/skills`/`.codex/skills`. merge-gate (source: null)
 * is excluded here by construction (no source to read) -- see
 * extractMergeGateTextualSignal below for how its selection is detected.
 */
export function referenceOnlySkillPackages(catalog: SkillSurfaceCatalog): DiscoveredSkillSurfaceEntry[] {
  return catalog.packages
    .filter((pkg) => pkg.discoverability === "cli-reference" && pkg.source !== null)
    .map((pkg) => ({ name: pkg.name, sourcePath: resolve(REPO_ROOT, pkg.source as string), reason: "cli-reference" as const }));
}

/** Symlinks every discovered package's directory into the host's native Skill root inside a disposable workspace (mirrors sync-codex-installed-copies.sh's real link-mode projection, not run-skill-evals.ts's older AGENTS.md-embedding convention, since the whole point of this eval is testing the real post-cutover native discovery mechanism). */
export function materializeDiscoveredSurface(
  workspacePath: string,
  host: SkillSurfaceHost,
  discovered: readonly DiscoveredSkillSurfaceEntry[],
): void {
  const skillsRoot = join(workspacePath, host === "claude" ? ".claude" : ".codex", "skills");
  mkdirSync(skillsRoot, { recursive: true });
  for (const entry of discovered) {
    const dest = join(skillsRoot, entry.name);
    rmSync(dest, { recursive: true, force: true });
    symlinkSync(entry.sourcePath, dest, "dir");
  }
}

// --- route-selection signal extraction ---

/**
 * Scans a provider's raw structured JSONL output for a route-invocation
 * signal against a candidate list (discovered + reference-only packages).
 * Two independent mechanisms, unioned, first-seen order preserved:
 *
 * 1. Precise: Claude's dedicated `Skill` tool_use block naming a candidate
 *    directly (Claude Code's own Skill tool takes a `skill`/`command` input).
 * 2. Coarse fallback (both hosts): the raw JSONL line's serialized text
 *    mentions a candidate's `<source>/SKILL.md` path. This is the ONLY
 *    signal available for cli-reference packages (no dedicated Skill-tool
 *    call exists for a non-projected Skill) and for Codex, which has no
 *    Skill-tool concept at all -- Codex instead reads SKILL.md files
 *    directly per the plan's Trace B ("SKILL.md loads one mode reference on
 *    demand"). Codex's exact tool/function-call JSONL event field names are
 *    NOT validated against a real session in this phase (R3: no real
 *    provider invoked) -- this coarse whole-line substring match is
 *    deliberately robust to that uncertainty at the cost of precision; spot
 *    check against one real Codex sample before trusting this signal in the
 *    Phase B authoritative run (see the notes file's SSD-07 phase A entry).
 */
export function extractToolInvokedRoutes(
  rawOutput: string,
  candidates: readonly DiscoveredSkillSurfaceEntry[],
): string[] {
  const found: string[] = [];
  const pushOnce = (name: string): void => {
    if (!found.includes(name)) found.push(name);
  };

  for (const line of rawOutput.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const record = parsed as Record<string, unknown>;

    if (record.type === "assistant" && isSkillRecord(record.message)) {
      const content = (record.message as Record<string, unknown>).content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            isSkillRecord(block) &&
            (block as Record<string, unknown>).type === "tool_use" &&
            (block as Record<string, unknown>).name === "Skill"
          ) {
            const input = (block as Record<string, unknown>).input;
            const named = isSkillRecord(input)
              ? (typeof (input as Record<string, unknown>).skill === "string"
                  ? ((input as Record<string, unknown>).skill as string)
                  : typeof (input as Record<string, unknown>).command === "string"
                    ? ((input as Record<string, unknown>).command as string)
                    : null)
              : null;
            if (named && candidates.some((c) => c.name === named)) pushOnce(named);
          }
        }
      }
    }

    for (const candidate of candidates) {
      const needle = `${candidate.sourcePath}/SKILL.md`;
      if (trimmed.includes(needle)) pushOnce(candidate.name);
    }
  }
  return found;
}

function isSkillRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * merge-gate has no Skill file (kind:"judge", source:null in the manifest --
 * it is a CLI/workflow concept described in the root router's own prose, not
 * a projected Skill), so no tool/file signal is structurally possible for
 * it. This narrowly-scoped textual check against the PROVIDER'S OWN FINAL
 * RESPONSE TEXT ONLY (never the raw JSONL, which echoes the user's prompt --
 * several corpus cases, e.g. the merge-gate-vs-cross-review ambiguous case,
 * literally contain the word "merge-gate" in the PROMPT itself, so scanning
 * raw output would false-positive on every one of them) is the only
 * available mechanism. Flagged as needing Phase-B empirical review of
 * merge-gate-tagged case results specifically before trusting this metric.
 */
const MERGE_GATE_MENTION_PATTERN = /merge-gate/i;
export function extractMergeGateTextualSignal(finalResponseText: string): boolean {
  return MERGE_GATE_MENTION_PATTERN.test(finalResponseText);
}

// --- provider adapter ---

export type ProviderKind = "stub" | "claude" | "codex";

export interface RouteInvocationResult {
  readonly outcome: "routed" | "provider_error";
  readonly routes: readonly string[];
  readonly errorReason?: string;
  readonly rawExitCode: number | null;
  readonly durationMs: number;
  readonly finalResponseExcerpt?: string;
}

export interface ProviderInvokeParams {
  readonly routingCase: RoutingCase;
  readonly workspacePath: string;
  readonly host: SkillSurfaceHost;
  readonly discovered: readonly DiscoveredSkillSurfaceEntry[];
  readonly referenceOnly: readonly DiscoveredSkillSurfaceEntry[];
}

export interface ProviderAdapter {
  readonly kind: ProviderKind;
  invoke(params: ProviderInvokeParams): RouteInvocationResult;
}

export interface StubProviderOptions {
  /** Defaults to always returning the single literal route "repo-harness" for every case (a genuinely FIXED, case-independent echo) -- the CLI's own `--dry-run` uses this default unmodified to smoke-test the pipeline end to end, including the FAIL path of threshold evaluation. Tests inject a custom routeFor to exercise other scenarios (perfect echo, double-trigger, small-sample, etc). */
  readonly routeFor?: (routingCase: RoutingCase) => readonly string[];
}

export function createStubProvider(options: StubProviderOptions = {}): ProviderAdapter {
  const routeFor = options.routeFor ?? ((): readonly string[] => ["repo-harness"]);
  return {
    kind: "stub",
    invoke({ routingCase }) {
      return { outcome: "routed", routes: routeFor(routingCase), rawExitCode: 0, durationMs: 0 };
    },
  };
}

/** Perfect-echo stub used by this file's own deterministic pipeline tests: always returns the case's own expected_route (empty array for "none"), proving the full pipeline computes ceiling metrics and an all-PASS threshold evaluation when routing is perfect. */
export function perfectEchoRouteFor(routingCase: RoutingCase): readonly string[] {
  return routingCase.expected_route === "none" ? [] : [routingCase.expected_route];
}

const DEFAULT_PROVIDER_TIMEOUT_MS = 10 * 60 * 1000;

export interface ProcessProviderOptions {
  readonly claudeCommand?: string;
  readonly codexCommand?: string;
  readonly claudeArgs?: readonly string[];
  readonly codexArgs?: readonly string[];
  readonly timeoutMs?: number;
}

function runBoundedProcess(
  command: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
): { status: number | null; stdout: string; stderr: string; timedOut: boolean } {
  const result = spawnSync(command, [...args], { cwd, encoding: "utf-8", timeout: timeoutMs });
  const timedOut = result.signal !== null && result.status === null;
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "", timedOut };
}

/**
 * Uses `--output-format stream-json` (not run-skill-evals.ts's `json`), a
 * deliberate divergence: the routing eval needs tool-use visibility to
 * detect which Skill got invoked, which the single-object `json` format
 * (final result only) never exposes and `--no-session-persistence`'s
 * companion session-transcript-file recovery would require guessing at
 * Claude Code's internal project-directory path-encoding scheme. The
 * streamed JSONL already contains everything needed directly in stdout, so
 * no side-channel file read is required at all. The final `type:"result"`
 * line has the IDENTICAL shape run-skill-evals.ts's own
 * parseClaudeStructuredOutput already parses -- reused verbatim below.
 */
function buildClaudeRoutingCommand(prompt: string, opts: ProcessProviderOptions): { command: string; args: string[] } {
  return {
    command: opts.claudeCommand ?? "claude",
    args: [
      ...(opts.claudeArgs ?? []),
      "-p",
      "--setting-sources",
      "project",
      "--output-format",
      "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--permission-mode",
      "bypassPermissions",
      prompt,
    ],
  };
}

function buildCodexRoutingCommand(
  prompt: string,
  workspacePath: string,
  finalResponsePath: string,
  opts: ProcessProviderOptions,
): { command: string; args: string[] } {
  return {
    command: opts.codexCommand ?? "codex",
    args: [
      ...(opts.codexArgs ?? []),
      "exec",
      "-C",
      workspacePath,
      "--dangerously-bypass-approvals-and-sandbox",
      "-o",
      finalResponsePath,
      "--json",
      prompt,
    ],
  };
}

function lastResultLine(stdout: string): string {
  const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (isSkillRecord(parsed) && parsed.type === "result") return lines[i];
    } catch {
      /* not JSON on this line; keep scanning backward */
    }
  }
  return "";
}

export function parseClaudeStreamJson(stdout: string): ProviderStructuredEvidence {
  return parseClaudeStructuredOutput(lastResultLine(stdout));
}

/**
 * Real (non-stub) provider adapter. NOT exercised by this phase's tests
 * (R3: no real provider invoked) -- reviewed for correctness of mechanism
 * only. Each case gets exactly one invocation, no retries (D5's stated
 * retry policy: none; a provider_error is recorded and excluded from
 * routing metrics rather than silently retried or coerced to "none").
 */
export function createProcessProvider(kind: "claude" | "codex", options: ProcessProviderOptions = {}): ProviderAdapter {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  return {
    kind,
    invoke({ routingCase, workspacePath, discovered, referenceOnly }) {
      const startedAt = Date.now();
      const candidates = [...discovered, ...referenceOnly];

      if (kind === "claude") {
        const { command, args } = buildClaudeRoutingCommand(routingCase.prompt, options);
        const result = runBoundedProcess(command, args, workspacePath, timeoutMs);
        const durationMs = Date.now() - startedAt;
        if (result.timedOut) {
          return { outcome: "provider_error", routes: [], errorReason: "timeout", rawExitCode: result.status, durationMs };
        }
        const structured = parseClaudeStreamJson(result.stdout);
        if (structured.usageAuthority === "unavailable" && result.status !== 0) {
          return {
            outcome: "provider_error",
            routes: [],
            errorReason: `provider_nonzero:${String(result.status)}`,
            rawExitCode: result.status,
            durationMs,
          };
        }
        const routes = extractToolInvokedRoutes(result.stdout, candidates);
        const finalResponseText = structured.finalResponse ?? "";
        if (extractMergeGateTextualSignal(finalResponseText) && !routes.includes("merge-gate")) routes.push("merge-gate");
        return { outcome: "routed", routes, rawExitCode: result.status, durationMs, finalResponseExcerpt: finalResponseText.slice(0, 200) };
      }

      const finalResponsePath = join(workspacePath, "final-response.md");
      const { command, args } = buildCodexRoutingCommand(routingCase.prompt, workspacePath, finalResponsePath, options);
      const result = runBoundedProcess(command, args, workspacePath, timeoutMs);
      const durationMs = Date.now() - startedAt;
      if (result.timedOut) {
        return { outcome: "provider_error", routes: [], errorReason: "timeout", rawExitCode: result.status, durationMs };
      }
      if (result.status !== 0) {
        return {
          outcome: "provider_error",
          routes: [],
          errorReason: `provider_nonzero:${String(result.status)}`,
          rawExitCode: result.status,
          durationMs,
        };
      }
      const routes = extractToolInvokedRoutes(result.stdout, candidates);
      const finalResponseText = existsSync(finalResponsePath) ? readFileSync(finalResponsePath, "utf-8") : "";
      if (extractMergeGateTextualSignal(finalResponseText) && !routes.includes("merge-gate")) routes.push("merge-gate");
      return { outcome: "routed", routes, rawExitCode: result.status, durationMs, finalResponseExcerpt: finalResponseText.slice(0, 200) };
    },
  };
}

// --- per-case records, metrics, thresholds ---

export interface RoutingRunRecord {
  readonly id: string;
  readonly lang: "zh" | "en";
  readonly kind: CaseKind;
  readonly expected_route: string;
  readonly outcome: "routed" | "provider_error";
  readonly selected_routes: readonly string[];
  readonly primary_route: string;
  readonly correct_top1: boolean;
  readonly double_trigger: boolean;
  /**
   * True when `expected_route` names a canonical route that is structurally
   * outside THIS run's reachable set (profile/host-gated discovered surface
   * plus reference-only packages plus merge-gate, which is always reachable
   * regardless of profile -- see runProviderEval's `reachableRoutes`).
   * Optional/absent means "not excluded" (false) -- kept optional so
   * hand-built fixtures in tests/skill-routing-eval.test.ts that predate this
   * field still type-check and behave exactly as before. A case marked true
   * here can never be routed to correctly no matter how good the provider is
   * (the candidate isn't even present in the environment), so it is removed
   * from top1/per-route denominators rather than mechanically scored as a
   * miss -- see computeRoutingMetrics.
   */
  readonly excluded_unreachable?: boolean;
  readonly error_reason?: string;
  readonly duration_ms: number;
}

export interface RateStat {
  readonly numerator: number;
  readonly denominator: number;
  readonly rate: number | null;
}

/** Per-route recall plus whether the route was reachable at all in this run
 * (denominator > 0 after excluded_unreachable filtering). Unreachable routes
 * report {numerator: 0, denominator: 0, rate: null, reachable: false} rather
 * than being scored as a 0% miss -- see computeRoutingMetrics. */
export interface RouteRecallStat extends RateStat {
  readonly reachable: boolean;
}

export interface RoutingMetrics {
  readonly evaluated_cases: number;
  readonly provider_error_count: number;
  /** Visible count of positive cases excluded from top1/per-route denominators
   * because their expected_route was structurally unreachable in this run --
   * mirrors provider_error_count's honest-exclusion-with-visible-count shape. */
  readonly excluded_unreachable_count: number;
  readonly top1_accuracy: RateStat;
  readonly per_route_recall: Record<string, RouteRecallStat>;
  readonly double_trigger: { readonly count: number; readonly denominator: number; readonly rate: number };
  readonly ordinary_qa_false_activation: RateStat & { readonly small_sample: boolean };
  readonly non_positive_false_activation_by_kind: Record<string, RateStat>;
}

export const ROUTING_FLOORS = {
  top1AccuracyMin: 0.95,
  perRouteRecallMin: 0.9,
  doubleTriggerMax: 0.02,
  ordinaryQaFalseActivationMax: 0.01,
  smallSampleThreshold: 100,
} as const;

export interface ThresholdResult {
  readonly floor?: number;
  readonly ceiling?: number;
  readonly actual: number | null;
  readonly pass: boolean;
  readonly small_sample?: boolean;
  /** Per-route only: whether this route was reachable in this run. An
   * unreachable route is not gated (pass is vacuously true) so it cannot drag
   * down allRoutesPass/overall_pass -- see evaluateThresholds. */
  readonly reachable?: boolean;
}

export interface ThresholdEvaluation {
  readonly top1_accuracy: ThresholdResult;
  readonly per_route_recall: Record<string, ThresholdResult>;
  readonly double_trigger: ThresholdResult;
  readonly ordinary_qa_false_activation: ThresholdResult;
  readonly overall_pass: boolean;
}

export function computeRoutingMetrics(
  records: readonly RoutingRunRecord[],
  canonicalRoutes: readonly string[],
): RoutingMetrics {
  const routed = records.filter((r) => r.outcome === "routed");
  const providerErrorCount = records.length - routed.length;
  const excludedUnreachableCount = records.filter((r) => r.excluded_unreachable === true).length;

  // HIGH finding fix (SSD-07 phase A acceptance-gate): a case whose expected
  // route is structurally unreachable in this run (excluded_unreachable) can
  // never be routed to correctly regardless of provider quality, so it is
  // removed from the positives population entirely rather than mechanically
  // scored as a miss -- see RoutingRunRecord.excluded_unreachable.
  const positives = routed.filter((r) => r.expected_route !== "none" && r.excluded_unreachable !== true);
  const top1Correct = positives.filter((r) => r.correct_top1).length;

  const perRouteRecall: Record<string, RouteRecallStat> = {};
  for (const route of canonicalRoutes) {
    const routeCases = positives.filter((r) => r.expected_route === route);
    const correct = routeCases.filter((r) => r.correct_top1).length;
    perRouteRecall[route] = {
      numerator: correct,
      denominator: routeCases.length,
      rate: routeCases.length > 0 ? correct / routeCases.length : null,
      // routeCases is already positives-with-excluded_unreachable-removed, so
      // denominator 0 here means EVERY positive case for this route was
      // unreachable this run (reachability is all-or-nothing per route per
      // run) -- not a corpus gap (validateCoverage guarantees every canonical
      // route has real positives) and not a scored 0% miss.
      reachable: routeCases.length > 0,
    };
  }

  const doubleTriggerCount = routed.filter((r) => r.double_trigger).length;

  const ordinaryQaCases = routed.filter((r) => r.kind === "ordinary-qa");
  const ordinaryQaFalse = ordinaryQaCases.filter((r) => r.primary_route !== "none").length;

  const nonPositiveByKind: Record<string, RateStat> = {};
  for (const kind of CASE_KINDS) {
    if (kind === "positive") continue;
    const kindCases = routed.filter((r) => r.kind === kind);
    const falseCount = kindCases.filter((r) => r.primary_route !== "none").length;
    nonPositiveByKind[kind] = {
      numerator: falseCount,
      denominator: kindCases.length,
      rate: kindCases.length > 0 ? falseCount / kindCases.length : null,
    };
  }

  return {
    evaluated_cases: routed.length,
    provider_error_count: providerErrorCount,
    excluded_unreachable_count: excludedUnreachableCount,
    top1_accuracy: {
      numerator: top1Correct,
      denominator: positives.length,
      rate: positives.length > 0 ? top1Correct / positives.length : null,
    },
    per_route_recall: perRouteRecall,
    double_trigger: {
      count: doubleTriggerCount,
      denominator: routed.length,
      rate: routed.length > 0 ? doubleTriggerCount / routed.length : 0,
    },
    ordinary_qa_false_activation: {
      numerator: ordinaryQaFalse,
      denominator: ordinaryQaCases.length,
      rate: ordinaryQaCases.length > 0 ? ordinaryQaFalse / ordinaryQaCases.length : null,
      small_sample: ordinaryQaCases.length < ROUTING_FLOORS.smallSampleThreshold,
    },
    non_positive_false_activation_by_kind: nonPositiveByKind,
  };
}

/**
 * Every floor/ceiling below is the plan's own SSD-07 acceptance line, applied
 * verbatim: top-1 >=95%, per-route recall >=90% (every REACHABLE route, not
 * just the aggregate -- a single zero-recall reachable route fails the whole
 * gate even if everything else is perfect), double-trigger <=2%, ordinary-QA
 * false activation <=1% UNLESS the negative sample is below 100 (it always is
 * for this frozen 68-case/4-case-ordinary-qa corpus), in which case the rule
 * is "require zero false activations, report small-sample" rather than a raw
 * percentage comparison.
 *
 * HIGH finding fix (SSD-07 phase A acceptance-gate): no single profile/host
 * run discovers all 10 canonical routes (see the notes file's D5 entry), so a
 * route that is structurally unreachable this run (per_route_recall[route]
 * .reachable === false, denominator 0) is NOT gated here -- it cannot drag
 * down allRoutesPass/overall_pass. This makes a single run's overall_pass
 * mean "all floors met over THIS run's reachable subset" -- PARTIAL evidence,
 * not package acceptance (see RoutingRunReport.evidence_scope/evidence_note).
 * Package acceptance across the full 10-route canonical set requires the
 * `aggregate` subcommand over 2+ runs (buildAggregateReport, below), which
 * reuses this exact function verbatim over the unioned records.
 */
export function evaluateThresholds(
  metrics: RoutingMetrics,
  floors: typeof ROUTING_FLOORS = ROUTING_FLOORS,
): ThresholdEvaluation {
  const top1Pass = metrics.top1_accuracy.rate !== null && metrics.top1_accuracy.rate >= floors.top1AccuracyMin;

  const perRoutePass: Record<string, ThresholdResult> = {};
  let allRoutesPass = true;
  for (const [route, stat] of Object.entries(metrics.per_route_recall)) {
    const pass = !stat.reachable || (stat.rate !== null && stat.rate >= floors.perRouteRecallMin);
    if (stat.reachable && !pass) allRoutesPass = false;
    perRoutePass[route] = { floor: floors.perRouteRecallMin, actual: stat.rate, pass, reachable: stat.reachable };
  }

  const doubleTriggerPass = metrics.double_trigger.rate <= floors.doubleTriggerMax;

  const oqa = metrics.ordinary_qa_false_activation;
  const oqaPass = oqa.small_sample
    ? oqa.numerator === 0
    : oqa.rate !== null && oqa.rate <= floors.ordinaryQaFalseActivationMax;

  return {
    top1_accuracy: { floor: floors.top1AccuracyMin, actual: metrics.top1_accuracy.rate, pass: top1Pass },
    per_route_recall: perRoutePass,
    double_trigger: { ceiling: floors.doubleTriggerMax, actual: metrics.double_trigger.rate, pass: doubleTriggerPass },
    ordinary_qa_false_activation: {
      ceiling: floors.ordinaryQaFalseActivationMax,
      actual: oqa.rate,
      small_sample: oqa.small_sample,
      pass: oqaPass,
    },
    overall_pass: top1Pass && allRoutesPass && doubleTriggerPass && oqaPass,
  };
}

// --- orchestration + report ---

/**
 * "single_run_partial": one run's overall_pass reflects floors met over ITS
 * OWN reachable route subset only (profile/host-gated) -- PARTIAL evidence,
 * never package acceptance on its own (see SINGLE_RUN_EVIDENCE_NOTE).
 * "aggregate_package_acceptance": buildAggregateReport's output, below --
 * overall_pass here IS the package acceptance signal (all 10 canonical
 * routes evaluated, each from a run where it was actually reachable).
 */
export type EvidenceScope = "single_run_partial" | "aggregate_package_acceptance";

export const SINGLE_RUN_EVIDENCE_NOTE =
  "PARTIAL evidence only: no single profile/host run discovers all 10 " +
  "canonical routes, so this run's overall_pass reflects floors met over " +
  "ITS OWN reachable route subset only, not full package acceptance. " +
  "Package acceptance requires the `aggregate` subcommand over 2+ runs " +
  "whose union covers every canonical route.";

export interface RunOptions {
  readonly profile: SkillSurfaceProfile;
  readonly host: SkillSurfaceHost;
  readonly provider: ProviderKind;
  readonly reportPath: string;
  readonly dryRun: boolean;
  readonly stubOptions?: StubProviderOptions;
  readonly providerOverride?: ProviderAdapter;
  readonly corpus?: RoutingCorpus;
  readonly catalog?: SkillSurfaceCatalog;
  readonly workspaceRoot?: string;
  readonly processProviderOptions?: ProcessProviderOptions;
}

export interface RoutingRunReport {
  readonly protocol: 1;
  readonly evidence_scope: "single_run_partial";
  readonly evidence_note: string;
  readonly generated_at: string;
  readonly profile: SkillSurfaceProfile;
  readonly host: SkillSurfaceHost;
  readonly provider: ProviderKind;
  readonly dry_run: boolean;
  readonly corpus_sha256: string;
  readonly manifest_sha256: string;
  readonly discovered_surface: ReadonlyArray<{ readonly name: string; readonly reason: DiscoveryReason }>;
  readonly reference_only_surface: ReadonlyArray<{ readonly name: string; readonly reason: DiscoveryReason }>;
  readonly records: readonly RoutingRunRecord[];
  readonly metrics: RoutingMetrics;
  readonly thresholds: ThresholdEvaluation;
}

// ============================================================================
// Aggregate subcommand (SSD-07 phase A HIGH-finding fix, layer 2): the plan's
// acceptance line -- "Every canonical route meets its floor; aggregate
// accuracy cannot hide a zero-recall route" -- cannot be evaluated from any
// single run (no profile/host discovers all 10 routes). This consumes 2+
// single-run reports, verifies they are comparable (identical corpus/manifest
// sha256, fail closed otherwise), for each corpus case picks a record from a
// run where its expected route was reachable (deterministic tie-break when
// reachable in more than one: the OPERATOR'S GIVEN INPUT ORDER on the
// command line -- never a re-sort by file path; SSD-07 Phase B found the
// original path-sort tie-break silently discarded correct records purely
// because of file-naming accidents), fails closed if any canonical route is
// unreachable in EVERY input, and reuses
// computeRoutingMetrics/evaluateThresholds VERBATIM over the union so the
// four plan floors are applied identically to a single run -- just with zero
// excluded_unreachable records left (every route reachable somewhere).
// ============================================================================

export interface AggregateInputReport {
  readonly path: string;
  readonly report: RoutingRunReport;
}

export interface AggregateCaseSource {
  readonly id: string;
  readonly source_report: string;
}

export const AGGREGATE_EVIDENCE_NOTE =
  "Package acceptance signal: overall_pass here evaluates all four plan " +
  "floors over the union of 2+ runs, with every canonical route scored from " +
  "a run where it was actually reachable. A zero-recall route cannot hide " +
  "behind a flattering aggregate -- every one of the 10 canonical routes is " +
  "independently gated.";

export interface AggregateRunReport {
  readonly protocol: 1;
  readonly evidence_scope: "aggregate_package_acceptance";
  readonly evidence_note: string;
  readonly generated_at: string;
  readonly corpus_sha256: string;
  readonly manifest_sha256: string;
  readonly inputs: ReadonlyArray<{
    readonly path: string;
    readonly profile: SkillSurfaceProfile;
    readonly host: SkillSurfaceHost;
    readonly provider: ProviderKind;
  }>;
  readonly case_sources: readonly AggregateCaseSource[];
  readonly records: readonly RoutingRunRecord[];
  readonly metrics: RoutingMetrics;
  readonly thresholds: ThresholdEvaluation;
}

/**
 * Pure: takes already-loaded {path, report} pairs (path is a caller-supplied
 * identifier used only for the deterministic tie-break and case_sources
 * labeling, not read from disk here -- see runAggregate for the disk-reading
 * CLI wrapper). Fails closed (throws CliError) on: fewer than 2 inputs, an
 * input that isn't a single-run report, mismatched corpus_sha256 or
 * manifest_sha256 across inputs, or a canonical route unreachable in every
 * input. Does not throw on a floor violation in the union -- that is a normal
 * evaluation outcome surfaced as thresholds.overall_pass === false.
 */
export function buildAggregateReport(
  inputs: readonly AggregateInputReport[],
  canonicalRoutes: readonly string[],
): AggregateRunReport {
  if (inputs.length < 2) {
    throw new CliError(`aggregate: requires at least 2 input reports, got ${inputs.length}`);
  }

  // Precedence for a case reachable in more than one input is the ORDER THE
  // OPERATOR GAVE THE REPORTS ON THE COMMAND LINE -- an explicit, visible,
  // operator-chosen tie-break, never a re-sort by file path. An earlier
  // version sorted inputs lexicographically by path, which silently
  // discarded correct records whenever a report's path happened to sort
  // after another report covering the same case (found during SSD-07 Phase
  // B: "routing-report-product-planning-claude.json" < "...-strict-....json"
  // meant every case reachable under both profiles was always sourced from
  // product-planning, even when strict's own record was correct and
  // product-planning's was not). Preserving input order makes the
  // precedence a deliberate choice the operator states on the command line,
  // not an accident of file naming.
  const sorted = inputs;
  const first = sorted[0];

  for (const entry of sorted) {
    if (entry.report.evidence_scope !== "single_run_partial") {
      throw new CliError(
        `aggregate: ${entry.path}: expected a single-run report (evidence_scope "single_run_partial"), got ${JSON.stringify((entry.report as { evidence_scope?: unknown }).evidence_scope)}`,
      );
    }
  }

  for (const entry of sorted) {
    if (entry.report.corpus_sha256 !== first.report.corpus_sha256) {
      throw new CliError(
        `aggregate: corpus_sha256 mismatch: ${first.path} has ${first.report.corpus_sha256}, ${entry.path} has ${entry.report.corpus_sha256} -- inputs must be evaluated against byte-identical corpus`,
      );
    }
    if (entry.report.manifest_sha256 !== first.report.manifest_sha256) {
      throw new CliError(
        `aggregate: manifest_sha256 mismatch: ${first.path} has ${first.report.manifest_sha256}, ${entry.path} has ${entry.report.manifest_sha256} -- inputs must be evaluated against byte-identical manifest`,
      );
    }
  }

  const unreachableEverywhere = canonicalRoutes.filter(
    (route) => !sorted.some((entry) => entry.report.metrics.per_route_recall[route]?.reachable === true),
  );
  if (unreachableEverywhere.length > 0) {
    throw new CliError(
      `aggregate: canonical route(s) unreachable in every input report, cannot evaluate package acceptance: ${unreachableEverywhere.join(", ")} (inputs: ${sorted.map((e) => e.path).join(", ")})`,
    );
  }

  const records: RoutingRunRecord[] = [];
  const caseSources: AggregateCaseSource[] = [];
  for (const caseId of first.report.records.map((r) => r.id)) {
    let picked: { path: string; record: RoutingRunRecord } | undefined;
    for (const entry of sorted) {
      const candidate = entry.report.records.find((r) => r.id === caseId);
      if (candidate && candidate.excluded_unreachable !== true) {
        picked = { path: entry.path, record: candidate };
        break;
      }
    }
    if (!picked) {
      // Defensive only: the route-level fail-closed check above already
      // guarantees every case's route is reachable in at least one input
      // (reachability is all-or-nothing per route per run), so this should
      // be unreachable in practice -- fail closed rather than silently drop
      // the case if it ever is.
      throw new CliError(`aggregate: case "${caseId}" has no input report where its expected route is reachable`);
    }
    records.push(picked.record);
    caseSources.push({ id: caseId, source_report: picked.path });
  }

  const metrics = computeRoutingMetrics(records, canonicalRoutes);
  const thresholds = evaluateThresholds(metrics);

  return {
    protocol: 1,
    evidence_scope: "aggregate_package_acceptance",
    evidence_note: AGGREGATE_EVIDENCE_NOTE,
    generated_at: new Date().toISOString(),
    corpus_sha256: first.report.corpus_sha256,
    manifest_sha256: first.report.manifest_sha256,
    inputs: sorted.map((entry) => ({
      path: entry.path,
      profile: entry.report.profile,
      host: entry.report.host,
      provider: entry.report.provider,
    })),
    case_sources: caseSources,
    records,
    metrics,
    thresholds,
  };
}

export function runProviderEval(options: RunOptions): RoutingRunReport {
  const corpus = options.corpus ?? loadCorpus();
  const catalog = options.catalog ?? loadLiveCatalog();
  const canonicalRoutes = canonicalRoutesFromBaseline(loadBaseline());
  const discovered = buildDiscoveredSkillSurface(catalog, options.profile, options.host);
  const referenceOnly = referenceOnlySkillPackages(catalog);
  const candidates = [...discovered, ...referenceOnly];
  // Mirrors the selectedRoutes filter below exactly (candidates by name, plus
  // merge-gate which is always reachable regardless of profile/host -- it has
  // no discovered-surface presence at all, kind:"judge", source: null, and is
  // detected purely via extractMergeGateTextualSignal): the set of expected
  // routes this run could possibly score correctly.
  const reachableRoutes = new Set<string>([...candidates.map((c) => c.name), "merge-gate"]);

  const provider: ProviderAdapter =
    options.providerOverride ??
    (options.provider === "stub" ? createStubProvider(options.stubOptions) : createProcessProvider(options.provider, options.processProviderOptions));

  const workspaceRoot = options.workspaceRoot ?? mkdtempSync(join(tmpdir(), "repo-harness-routing-run-"));

  const records: RoutingRunRecord[] = corpus.cases.map((routingCase) => {
    const casePath = join(workspaceRoot, routingCase.id);
    mkdirSync(casePath, { recursive: true });
    if (provider.kind !== "stub") materializeDiscoveredSurface(casePath, options.host, discovered);

    const result = provider.invoke({ routingCase, workspacePath: casePath, host: options.host, discovered, referenceOnly });
    const selectedRoutes = result.routes.filter(
      (route) => candidates.some((c) => c.name === route) || route === "merge-gate",
    );
    const primaryRoute = selectedRoutes[0] ?? "none";

    const record: RoutingRunRecord = {
      id: routingCase.id,
      lang: routingCase.lang,
      kind: routingCase.kind,
      expected_route: routingCase.expected_route,
      outcome: result.outcome,
      selected_routes: selectedRoutes,
      primary_route: primaryRoute,
      correct_top1: result.outcome === "routed" && primaryRoute === routingCase.expected_route,
      double_trigger: result.outcome === "routed" && selectedRoutes.length > 1,
      excluded_unreachable: routingCase.expected_route !== "none" && !reachableRoutes.has(routingCase.expected_route),
      duration_ms: result.durationMs,
      ...(result.errorReason ? { error_reason: result.errorReason } : {}),
    };
    return record;
  });

  const metrics = computeRoutingMetrics(records, canonicalRoutes);
  const thresholds = evaluateThresholds(metrics);

  const report: RoutingRunReport = {
    protocol: 1,
    evidence_scope: "single_run_partial",
    evidence_note: SINGLE_RUN_EVIDENCE_NOTE,
    generated_at: new Date().toISOString(),
    profile: options.profile,
    host: options.host,
    provider: options.provider,
    dry_run: options.dryRun,
    corpus_sha256: sha256Hex(readFileSync(CORPUS_PATH)),
    manifest_sha256: sha256Hex(readFileSync(MANIFEST_PATH)),
    discovered_surface: discovered.map((d) => ({ name: d.name, reason: d.reason })),
    reference_only_surface: referenceOnly.map((d) => ({ name: d.name, reason: d.reason })),
    records,
    metrics,
    thresholds,
  };

  const json = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(options.reportPath, json, "utf-8");
  const sidecarPath = `${options.reportPath}.sha256`;
  writeFileSync(sidecarPath, `${sha256Hex(Buffer.from(json, "utf-8"))}  ${relative(REPO_ROOT, options.reportPath)}\n`, "utf-8");

  return report;
}

function parseRunArgs(argv: string[]): RunOptions {
  let profile: SkillSurfaceProfile | undefined;
  let host: SkillSurfaceHost | undefined;
  let provider: ProviderKind | undefined;
  let reportPath: string | undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--profile") {
      const value = argv[++i];
      if (!(SKILL_SURFACE_PROFILES as readonly string[]).includes(value)) {
        throw new CliError(`run: --profile must be one of ${SKILL_SURFACE_PROFILES.join(", ")}`, 2);
      }
      profile = value as SkillSurfaceProfile;
    } else if (arg === "--host") {
      const value = argv[++i];
      if (!(SKILL_SURFACE_HOSTS as readonly string[]).includes(value)) {
        throw new CliError(`run: --host must be one of ${SKILL_SURFACE_HOSTS.join(", ")}`, 2);
      }
      host = value as SkillSurfaceHost;
    } else if (arg === "--provider") {
      const value = argv[++i];
      if (value !== "claude" && value !== "codex" && value !== "stub") {
        throw new CliError("run: --provider must be one of claude, codex, stub", 2);
      }
      provider = value;
    } else if (arg === "--report") {
      reportPath = argv[++i];
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new CliError(`run: unknown argument ${arg}`, 2);
    }
  }

  if (!profile) throw new CliError("run: --profile is required", 2);
  if (!host) throw new CliError("run: --host is required", 2);
  if (!reportPath) throw new CliError("run: --report is required (both --dry-run and the real mode write a report + .sha256 sidecar)", 2);

  if (dryRun) {
    // --dry-run always overrides to the built-in stub, regardless of any
    // --provider value supplied alongside it (see StubProviderOptions'
    // default: a single fixed literal route, "repo-harness", echoed for
    // every case -- this smoke-tests the full pipeline including the FAIL
    // path of threshold evaluation, not just an artificially perfect run).
    return { profile, host, provider: "stub", reportPath, dryRun: true };
  }

  if (!provider || provider === "stub") {
    throw new CliError("run: --provider claude|codex is required for the real (non-dry-run) mode", 2);
  }
  return { profile, host, provider, reportPath, dryRun: false };
}

function formatRate(rate: number | null): string {
  return rate === null ? "n/a" : `${(rate * 100).toFixed(1)}%`;
}

/** Shared by printRunSummary and printAggregateSummary so both print the
 * identical metrics/thresholds body -- one source of truth for the console
 * shape, not two copies that can drift. */
function printMetricsAndThresholds(metrics: RoutingMetrics, thresholds: ThresholdEvaluation): void {
  console.log(
    `  evaluated=${metrics.evaluated_cases} provider_errors=${metrics.provider_error_count} excluded_unreachable=${metrics.excluded_unreachable_count}`,
  );
  console.log(
    `  top1_accuracy=${formatRate(metrics.top1_accuracy.rate)} (${metrics.top1_accuracy.numerator}/${metrics.top1_accuracy.denominator}) floor=${String(thresholds.top1_accuracy.floor)} pass=${String(thresholds.top1_accuracy.pass)}`,
  );
  for (const [route, stat] of Object.entries(metrics.per_route_recall)) {
    const t = thresholds.per_route_recall[route];
    const reachTag = stat.reachable ? "" : " (unreachable this run, not gated)";
    console.log(`  recall[${route}]=${formatRate(stat.rate)} (${stat.numerator}/${stat.denominator}) pass=${String(t.pass)}${reachTag}`);
  }
  console.log(
    `  double_trigger=${formatRate(metrics.double_trigger.rate)} (${metrics.double_trigger.count}/${metrics.double_trigger.denominator}) ceiling=${String(thresholds.double_trigger.ceiling)} pass=${String(thresholds.double_trigger.pass)}`,
  );
  const oqa = metrics.ordinary_qa_false_activation;
  console.log(
    `  ordinary_qa_false_activation=${formatRate(oqa.rate)} (${oqa.numerator}/${oqa.denominator}) small_sample=${String(oqa.small_sample)} pass=${String(thresholds.ordinary_qa_false_activation.pass)}`,
  );
  console.log(`  overall_pass=${String(thresholds.overall_pass)}`);
}

function printRunSummary(report: RoutingRunReport, reportPath: string): void {
  console.log(
    `run-skill-routing-eval: run OK: profile=${report.profile} host=${report.host} provider=${report.provider}${report.dry_run ? " (dry-run)" : ""}`,
  );
  printMetricsAndThresholds(report.metrics, report.thresholds);
  console.log(`  evidence_scope=${report.evidence_scope} -- ${report.evidence_note}`);
  console.log(`  report: ${reportPath}`);
  console.log(`  sidecar: ${reportPath}.sha256`);
}

function runRun(argv: string[]): number {
  const options = parseRunArgs(argv);
  const report = runProviderEval(options);
  printRunSummary(report, options.reportPath);
  return 0;
}

function parseAggregateArgs(argv: string[]): { reportPath: string; inputPaths: string[] } {
  let reportPath: string | undefined;
  const inputPaths: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--report") {
      reportPath = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else if (arg.startsWith("--")) {
      throw new CliError(`aggregate: unknown argument ${arg}`, 2);
    } else {
      inputPaths.push(arg);
    }
  }
  if (!reportPath) throw new CliError("aggregate: --report is required", 2);
  if (inputPaths.length < 2) {
    throw new CliError(`aggregate: at least 2 input report paths are required, got ${inputPaths.length}`, 2);
  }
  return { reportPath, inputPaths };
}

function printAggregateSummary(report: AggregateRunReport, reportPath: string): void {
  console.log(`run-skill-routing-eval: aggregate OK: ${report.inputs.length} input reports, ${report.records.length} cases`);
  for (const input of report.inputs) {
    console.log(`  input: profile=${input.profile} host=${input.host} provider=${input.provider} path=${input.path}`);
  }
  printMetricsAndThresholds(report.metrics, report.thresholds);
  console.log(`  evidence_scope=${report.evidence_scope} -- ${report.evidence_note}`);
  console.log(`  report: ${reportPath}`);
  console.log(`  sidecar: ${reportPath}.sha256`);
}

function runAggregate(argv: string[]): number {
  const { reportPath, inputPaths } = parseAggregateArgs(argv);
  const canonicalRoutes = canonicalRoutesFromBaseline(loadBaseline());
  const inputs: AggregateInputReport[] = inputPaths.map((path) => ({ path, report: loadJson(path) as RoutingRunReport }));
  const aggregate = buildAggregateReport(inputs, canonicalRoutes);

  const json = `${JSON.stringify(aggregate, null, 2)}\n`;
  writeFileSync(reportPath, json, "utf-8");
  const sidecarPath = `${reportPath}.sha256`;
  writeFileSync(sidecarPath, `${sha256Hex(Buffer.from(json, "utf-8"))}  ${relative(REPO_ROOT, reportPath)}\n`, "utf-8");

  printAggregateSummary(aggregate, reportPath);
  return 0;
}

// ============================================================================
// Subject freeze (SSD-07 phase A / D3): evals/skill-routing/final-subject-
// freeze.json binds every commit-INDEPENDENT piece of evidence now (manifest
// sha256, corpus sha256, per-canonical-package tree hashes, discovered-set
// projections per profile/host) and records head_sha as null-with-note,
// since the commit that will carry phase A's own changes does not exist yet.
// The orchestrator re-runs `freeze --write` after committing to stamp
// head_sha and refresh changed_files_since_base (which is git-history-based
// and will then include this phase's own commit).
// ============================================================================

const WORK_PACKAGE_BASE_SHA = "314ee1a7b630e9016b4e184030129fbc9e00a9ef";
export const DEFAULT_FREEZE_PATH = join(SKILL_ROUTING_DIR, "final-subject-freeze.json");

/** Reproduces install-profile.ts's internal hashManagedTree algorithm
 * (sorted relative paths, "F\0<path>\0"+content+"\0" for files,
 * "L\0<path>\0<target>\0" for symlinks) exactly -- that function is not
 * exported, so this is a deliberate, faithful re-implementation of the same
 * pattern for freeze evidence, not an import. */
export function hashPackageTree(root: string): string {
  const entries: Array<{ path: string; type: "file" | "symlink" }> = [];
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, relativePath);
      else if (entry.isFile()) entries.push({ path: relativePath, type: "file" });
      else if (entry.isSymbolicLink()) entries.push({ path: relativePath, type: "symlink" });
    }
  };
  visit(root, "");
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const hash = createHash("sha256");
  for (const entry of entries) {
    const absolute = join(root, entry.path);
    if (entry.type === "symlink") {
      hash.update(`L\0${entry.path}\0${readlinkSync(absolute)}\0`);
    } else {
      hash.update(`F\0${entry.path}\0`);
      hash.update(readFileSync(absolute));
      hash.update("\0");
    }
  }
  return `sha256:${hash.digest("hex")}`;
}

function runGit(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf-8" });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export interface SubjectFreeze {
  readonly protocol: 1;
  readonly generated_at: string;
  readonly slice: "SSD-07 phase A";
  readonly work_package_base_sha: string;
  readonly head_sha: string | null;
  readonly head_sha_note: string;
  readonly manifest_sha256: string;
  readonly corpus_sha256: string;
  readonly package_tree_hashes: Record<string, string>;
  readonly discovered_set_projections: Record<string, ReadonlyArray<{ readonly name: string; readonly reason: string }>>;
  readonly changed_files_since_base: readonly string[];
  readonly changed_files_note: string;
  readonly uncommitted_changes_at_freeze_time: {
    readonly modified: readonly string[];
    readonly added_or_untracked: readonly string[];
  };
}

export function buildSubjectFreeze(): SubjectFreeze {
  const catalog = loadLiveCatalog();

  const packageTreeHashes: Record<string, string> = {};
  for (const pkg of catalog.packages) {
    if (pkg.source === null) continue; // merge-gate (kind:"judge") and any future no-source entry: nothing to hash
    const absolute = pkg.source === "." ? REPO_ROOT : resolve(REPO_ROOT, pkg.source);
    if (pkg.source === ".") continue; // the root router's "source" is the whole repo tree, not a bounded package directory; SKILL.md itself is covered by the manifest_sha256/corpus_sha256 freeze fields instead
    packageTreeHashes[pkg.name] = hashPackageTree(absolute);
  }

  const discoveredSetProjections: SubjectFreeze["discovered_set_projections"] = {};
  for (const profile of SKILL_SURFACE_PROFILES) {
    for (const host of SKILL_SURFACE_HOSTS) {
      const key = `${profile}/${host}`;
      discoveredSetProjections[key] = buildDiscoveredSkillSurface(catalog, profile, host).map((e) => ({ name: e.name, reason: e.reason }));
    }
  }

  const diffResult = runGit(["diff", "--name-only", `${WORK_PACKAGE_BASE_SHA}..HEAD`]);
  if (diffResult.status !== 0) {
    throw new CliError(`freeze: git diff --name-only ${WORK_PACKAGE_BASE_SHA}..HEAD failed: ${diffResult.stderr.trim()}`);
  }
  const changedFilesSinceBase = diffResult.stdout.split("\n").map((l) => l.trim()).filter(Boolean).sort();

  const statusResult = runGit(["status", "--porcelain", "--untracked-files=all"]);
  const modified: string[] = [];
  const addedOrUntracked: string[] = [];
  for (const line of statusResult.stdout.split("\n")) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    const filePath = line.slice(3).trim();
    if (code.includes("?") || code.includes("A")) addedOrUntracked.push(filePath);
    else modified.push(filePath);
  }
  modified.sort();
  addedOrUntracked.sort();

  return {
    protocol: 1,
    generated_at: new Date().toISOString(),
    slice: "SSD-07 phase A",
    work_package_base_sha: WORK_PACKAGE_BASE_SHA,
    head_sha: null,
    head_sha_note:
      "Null by design: the commit that will carry this phase's own changes " +
      "does not exist yet (Phase A does not commit). Every other field in " +
      "this freeze is commit-independent (file/tree bytes on disk right " +
      "now); the orchestrator stamps head_sha with `git rev-parse HEAD` " +
      "immediately after committing this phase's work, and should re-run " +
      "`bun scripts/run-skill-routing-eval.ts freeze --write` at that point " +
      "so changed_files_since_base also picks up the new commit.",
    manifest_sha256: sha256Hex(readFileSync(MANIFEST_PATH)),
    corpus_sha256: sha256Hex(readFileSync(CORPUS_PATH)),
    package_tree_hashes: packageTreeHashes,
    discovered_set_projections: discoveredSetProjections,
    changed_files_since_base: changedFilesSinceBase,
    changed_files_note:
      `git diff --name-only ${WORK_PACKAGE_BASE_SHA}..HEAD at freeze-generation time: reflects committed ` +
      "history only (SSD-01 through SSD-06's own merged commits on this branch), NOT this phase's own " +
      "still-uncommitted changes (see uncommitted_changes_at_freeze_time below for those). Re-running the " +
      "identical command after the orchestrator commits phase A will include this phase's files too.",
    uncommitted_changes_at_freeze_time: { modified, added_or_untracked: addedOrUntracked },
  };
}

function runFreeze(argv: string[]): number {
  let write = false;
  let outPath = DEFAULT_FREEZE_PATH;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--write") write = true;
    else if (argv[i] === "--out") outPath = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(usage());
      return 0;
    } else throw new CliError(`freeze: unknown argument ${argv[i]}`, 2);
  }
  const freeze = buildSubjectFreeze();
  const json = `${JSON.stringify(freeze, null, 2)}\n`;
  if (write) {
    writeFileSync(outPath, json, "utf-8");
    console.log(`run-skill-routing-eval: freeze written to ${relative(REPO_ROOT, outPath)}`);
  } else {
    console.log(json);
  }
  console.log(`run-skill-routing-eval: freeze OK: ${Object.keys(freeze.package_tree_hashes).length} package tree hashes, ${freeze.changed_files_since_base.length} changed files since base`);
  return 0;
}

function usage(): string {
  return [
    "Usage:",
    "  bun scripts/run-skill-routing-eval.ts validate",
    "  bun scripts/run-skill-routing-eval.ts hash [--write]",
    "  bun scripts/run-skill-routing-eval.ts dry-run",
    "  bun scripts/run-skill-routing-eval.ts run --profile <p> --host <h> --report <path> [--dry-run] [--provider <claude|codex|stub>]",
    "  bun scripts/run-skill-routing-eval.ts aggregate --report <path> <run-report.json> <run-report.json> [...]",
    "",
    "validate: schema-shape plus coverage requirements (per-route zh+en positives,",
    "kind floors, overlap-term coverage, unique ids, total case count in [60,90]).",
    "hash: sha256 of routing-corpus.json vs discovery-baseline.json's corpus_sha256;",
    "verify-only by default, --write updates the baseline file in place.",
    "dry-run: asserts every expected_route is \"none\" or a baseline canonical route,",
    "then prints per-route case counts. No provider call; SSD-07 owns that run.",
    "run: executes the frozen corpus once per case against the post-cutover",
    "discovered Skill surface for --profile/--host, scores canonical top-1",
    "accuracy / per-route recall / double-trigger / ordinary-QA false",
    "activation against the plan's floors, and writes a report + .sha256",
    "sidecar to --report. --dry-run always uses a built-in stub provider (no",
    "real provider call, no network); the real mode requires an explicit",
    "--provider claude|codex. No single profile/host discovers all 10 canonical",
    "routes, so a route unreachable this run is excluded from top1/per-route",
    "denominators and not gated; overall_pass here is PARTIAL evidence over",
    "this run's reachable subset only, not package acceptance (see aggregate).",
    "aggregate --report <path> <report.json>...: consumes 2+ `run` reports,",
    "fails closed on mismatched corpus/manifest sha256 across inputs or a",
    "canonical route unreachable in every input, else evaluates all four plan",
    "floors over the union (each case scored from a run where its route was",
    "reachable) and writes a report + .sha256 sidecar whose overall_pass IS",
    "the package acceptance signal.",
    "freeze [--write] [--out <path>]: computes the SSD-07 subject-freeze",
    "record (manifest/corpus sha256, per-package tree hashes, discovered-set",
    "projections per profile/host, changed-files-since-base, head_sha:null-",
    "with-note). Prints to stdout by default; --write persists to --out",
    "(default evals/skill-routing/final-subject-freeze.json).",
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
  const canonicalRoutes = canonicalRoutesFromBaseline(loadBaseline());
  const coverageIssues = validateCoverage(corpus, canonicalRoutes);
  if (coverageIssues.length > 0) {
    for (const issue of coverageIssues) console.error(`run-skill-routing-eval: validate: ${issue}`);
    return 1;
  }
  const driftIssues = schemaDriftIssues(canonicalRoutes);
  if (driftIssues.length > 0) {
    for (const issue of driftIssues) console.error(`run-skill-routing-eval: validate: ${issue}`);
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
  if (argv[0] === "run") return runRun(argv.slice(1));
  if (argv[0] === "freeze") return runFreeze(argv.slice(1));
  if (argv[0] === "aggregate") return runAggregate(argv.slice(1));
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
