import { DEFAULT_WORKTREE_TEMPLATE } from "../../core/worktree-location.mjs";
import { createHash } from "crypto";
import { existsSync, lstatSync, readdirSync, readFileSync } from "fs";
import { basename, dirname, join, relative, resolve, sep } from "path";
import type { AdoptionMode } from "../../core/adoption/modes";
import type { AdoptionOperation, AdoptionWarning, WriteFileOperation } from "../../core/adoption/operations";
import { makeOperationId } from "../../core/adoption/operations";
import { adoptionTemplateFile } from "./manifest-templates";
import { gitignoreManagedBlockOperation } from "./gitignore-plan";
import { managedBlockNeedsUpdate } from "../../core/adoption/managed-block";
import { renderWorkflowContractMarker } from "../../core/adoption/workflow-contract-asset";
import { minimumHarnessVersionOf } from "../../core/adoption/minimum-harness-version";
import { planLegacyLeftovers, stripLegacyHookEntries } from "../upgrade/legacy-inventory";

const ASSET_ROOT = join(import.meta.dir, "..", "..", "..", "assets");
const TEMPLATE_ROOT = join(ASSET_ROOT, "templates");
const REFERENCE_ROOT = join(ASSET_ROOT, "reference-configs");

const STANDARD_DIRS = [
  "tasks",
  "docs",
  "docs/prds",
  "docs/researches",
  "docs/reference-configs",
  "docs/architecture/modules",
  "docs/architecture/diagrams",
  ".ai/context",
  ".ai/harness/checks",
  ".ai/harness/failures",
  ".ai/harness/security",
  ".ai/harness/planning",
  ".ai/harness/delegation",
  ".ai/harness/worktrees",
  ".ai/harness/triage",
  ".ai/harness/runs",
  "deploy/env",
  "deploy/scripts",
  "deploy/submissions",
  "deploy/runbooks",
  "deploy/release-checklists",
  "deploy/sql",
  "_ops/env",
  "_ops/secrets",
  "_ops/artifacts",
  "_ops/logs",
  "_ops/state",
  "_ops/scratch",
] as const;

const MINIMAL_DIRS = [
  "tasks",
  "docs",
  ".ai/harness/checks",
] as const;

const STATE_FILES: ReadonlyArray<{ path: string; content: string }> = [
  { path: ".ai/context/capability-source-map.json", content: '{\n  "version": 1,\n  "capabilities": {}\n}\n' },
  { path: ".ai/harness/events.jsonl", content: "" },
  { path: ".ai/harness/failures/latest.jsonl", content: "" },
  { path: ".ai/harness/security/.gitkeep", content: "" },
  { path: ".ai/harness/planning/.gitkeep", content: "" },
  { path: ".ai/harness/worktrees/.gitkeep", content: "" },
  { path: ".ai/harness/runs/.gitkeep", content: "" },
  { path: ".ai/harness/triage/.gitkeep", content: "" },
  { path: "docs/architecture/modules/.gitkeep", content: "" },
  { path: "docs/architecture/diagrams/.gitkeep", content: "" },
  { path: "deploy/env/.gitkeep", content: "" },
  { path: "deploy/scripts/.gitkeep", content: "" },
  { path: "deploy/submissions/.gitkeep", content: "" },
  { path: "deploy/runbooks/.gitkeep", content: "" },
  { path: "deploy/release-checklists/.gitkeep", content: "" },
  { path: "deploy/sql/.gitkeep", content: "" },
];

type JsonObject = Record<string, unknown>;

export interface StandardPlanOptions {
  readonly repoRoot: string;
  readonly mode: AdoptionMode;
  readonly env?: NodeJS.ProcessEnv;
}

function safePath(repoRoot: string, path: string): string {
  if (!path || path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error(`unsafe adoption path: ${path}`);
  }
  const root = resolve(repoRoot);
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === "..") throw new Error(`adoption path escapes repo root: ${path}`);
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`symlink is not allowed in adoption path: ${path}`);
    }
  }
  return target;
}

function fileContent(repoRoot: string, path: string): string | undefined {
  const target = safePath(repoRoot, path);
  if (!existsSync(target)) return undefined;
  if (!lstatSync(target).isFile()) throw new Error(`adoption file target is not a regular file: ${path}`);
  return readFileSync(target, "utf-8");
}

function directoryExists(repoRoot: string, path: string): boolean {
  const target = safePath(repoRoot, path);
  if (!existsSync(target)) return false;
  if (!lstatSync(target).isDirectory()) throw new Error(`adoption directory target is not a directory: ${path}`);
  return true;
}

function contentHash(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function writeOperation(
  repoRoot: string,
  path: string,
  content: string,
  reason: string,
  opts: { readonly ifMissing?: boolean; readonly mode?: number; readonly risk?: "low" | "medium" | "high" } = {},
): WriteFileOperation {
  const existing = fileContent(repoRoot, path);
  return {
    id: makeOperationId("writeFile", path, opts.ifMissing ? "ifMissing" : "replace"),
    kind: "writeFile",
    path,
    content,
    ifMissing: opts.ifMissing,
    mode: opts.mode,
    reason,
    risk: opts.risk ?? "low",
    status: existing === undefined ? "planned" : opts.ifMissing || existing === content ? "skipped" : "planned",
    expectedAbsent: existing === undefined,
    expectedContentHash: existing === undefined ? undefined : contentHash(existing),
  };
}

function mkdirOperation(repoRoot: string, path: string, reason: string): AdoptionOperation {
  return {
    id: makeOperationId("mkdir", path),
    kind: "mkdir",
    path,
    reason,
    risk: "low",
    status: directoryExists(repoRoot, path) ? "skipped" : "planned",
  };
}

function removeOperation(repoRoot: string, path: string, reason: string): AdoptionOperation | undefined {
  const target = safePath(repoRoot, path);
  if (!existsSync(target)) return undefined;
  const existing = lstatSync(target).isFile() ? readFileSync(target, "utf-8") : undefined;
  return {
    id: makeOperationId("remove", path),
    kind: "remove",
    path,
    reason,
    risk: "medium",
    status: "planned",
    expectedContentHash: existing === undefined ? undefined : contentHash(existing),
  };
}

function jsonFile(repoRoot: string, path: string): JsonObject | undefined {
  const raw = fileContent(repoRoot, path);
  if (raw === undefined) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("not an object");
    return value as JsonObject;
  } catch (error) {
    throw new Error(`invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * The target repo's capability authority selector, read from the merged policy.
 * Anything other than the explicit `archcontext` opt-in stays on the registry
 * default so downstream scaffolding is unaffected.
 */
function capabilitySourceOf(policy: JsonObject): "registry" | "archcontext" {
  const context = policy.context;
  const value = context && typeof context === "object" && !Array.isArray(context)
    ? (context as JsonObject).capability_source
    : undefined;
  return value === "archcontext" ? "archcontext" : "registry";
}

function deepMergeDefaults(defaults: JsonObject, current: JsonObject | undefined, path: readonly string[] = []): JsonObject {
  const result: JsonObject = { ...defaults };
  if (!current) return result;
  for (const [key, value] of Object.entries(current)) {
    const defaultValue = defaults[key];
    if (isObject(defaultValue) && isObject(value)) {
      result[key] = deepMergeDefaults(defaultValue, value, [...path, key]);
    } else if (Array.isArray(defaultValue) && Array.isArray(value) && [...path, key].join(".") === "documentation.reference_configs") {
      result[key] = [...value, ...defaultValue.filter((entry) => !value.includes(entry))];
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && !Array.isArray(value) && typeof value === "object";
}

function jsonContent(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export const DOCUMENTATION_LANGUAGES = ["en", "zh-CN", "follow-user"] as const;

export type DocumentationLanguage = (typeof DOCUMENTATION_LANGUAGES)[number];

/**
 * Human-facing document language is one repo-level datum. It is authored by
 * `REPO_HARNESS_DOCUMENTATION_LANGUAGE` at init and stored in
 * `.ai/harness/policy.json#documentation.language`; both the incoming env value
 * and an already-stored value are rejected fail-closed rather than silently
 * falling back to the default, because a silent default would make a typo look
 * like a deliberate English choice.
 */
function requireDocumentationLanguage(value: unknown): DocumentationLanguage {
  if (typeof value === "string" && (DOCUMENTATION_LANGUAGES as readonly string[]).includes(value)) {
    return value as DocumentationLanguage;
  }
  throw new Error(
    `invalid documentation language ${JSON.stringify(value)}: REPO_HARNESS_DOCUMENTATION_LANGUAGE and .ai/harness/policy.json#documentation.language accept only ${DOCUMENTATION_LANGUAGES.join(" | ")}`,
  );
}

export function defaultPolicy(documentationProfile: string, documentationLanguage: string): JsonObject {
  return {
    version: 1,
    tasks: {
      lessons_file: "tasks/lessons.md",
      research_dir: "docs/researches",
    },
    context: {
      map_file: ".ai/context/context-map.json",
      capability_registry_file: ".ai/context/capabilities.json",
      capability_match_rule: "longest-prefix; same-length ambiguity fails",
      capability_source: "registry",
      capability_source_rule: "single authority selected by capability_source; registry reads .ai/context/capabilities.json, archcontext reads .archcontext/model/nodes/*.yaml; no dual-read and no fallback",
    },
    worktree_strategy: {
      worktree_dir_template: DEFAULT_WORKTREE_TEMPLATE,
      base_branch: "main",
      review_base: "main",
      merge_back: {
        target: "main",
      },
    },
    harness: {
      policy_file: ".ai/harness/policy.json",
      helper_runtime_dir: "package:scripts",
      helper_source: "package",
    },
    operations: {
      dir: "deploy",
      private_dir: "_ops",
      rule: "Track deployment material in deploy/ and keep private local operations state in ignored _ops/.",
    },
    documentation: {
      profile: documentationProfile,
      language: requireDocumentationLanguage(documentationLanguage),
      reference_source: "user-level-runtime-docs",
      reference_stub_marker: "<!-- repo-harness: reference-config-stub v1 -->",
      reference_resolver: "repo-harness docs path <doc-id>",
    },
    external_tooling: {
      // Projection of the canonical repository pin; herdr-runtime-pin tests guard drift.
      herdr: {
        "min_version": "0.9.5",
        "release_assets": {
          "linux-x86_64": {
            "url": "https://github.com/herdrdev/herdr/releases/download/v0.9.5/herdr-linux-x86_64",
            "sha256": "14d9e8bc8b4a9e0118d77c32266f76d461f09b40342eb23752960bd89f59929d"
          },
          "macos-aarch64": {
            "url": "https://github.com/herdrdev/herdr/releases/download/v0.9.5/herdr-macos-aarch64",
            "sha256": "fb77c2232a05a8035421382c894392f4174e4e38a18e48af3dd0290157c3a7e2"
          },
          "macos-x86_64": {
            "url": "https://github.com/herdrdev/herdr/releases/download/v0.9.5/herdr-macos-x86_64",
            "sha256": "5fb0a908ec7f6745e3e245738b06bfad56c46391c391ab3c0955fbead01f1369"
          }
        }
      },
      routing: {
        simple: "waza",
      },
    },
    agentic_development: {
      routing: {
        product_discovery: "parent-agent:geju",
        complex_engineering_plan: "parent-agent:geju",
        design_plan: "parent-agent:geju",
        design_options_choice: "convention:design-options",
        small_or_medium_plan: "waza:think",
        bug_or_regression: "waza:hunt",
        post_implementation_review: "waza:check",
      },
      due_diligence: {
        levels: ["P1_GLOBAL_ARCHITECTURE", "P2_DATA_FLOW_TRACE", "P3_DESIGN_DECISION"],
        explicit_report_required_for: [
          "complex_engineering_plan",
          "hunt",
          "risky_refactor",
          "deployment",
          "auth_payment_data",
          "shared_contract",
        ],
      },
    },
    circuit_breakers: {
      guard_repeat: 2,
      review: { lite: 1, standard: 1, strict: 2 },
      semantic_reviews_per_work_package: 1,
      subagents: { default: 2, strict_explicit_contract: 3 },
      repair_loops: 2,
      cross_model_consults_default: 0,
    },
    upgrade: {
      strategy_version: 1,
      remove_only_ownership: "known_generated",
      unknown_files: "preserve-or-archive",
    },
    internal_pr_authors: [],
  };
}

/**
 * Adoption rewrites the marker but keeps a declared minimum harness version.
 * A marker that is not JSON is replaced as before. An invalid declared value
 * fails the plan.
 */
function declaredMinimumHarnessVersion(markerText: string | undefined): string | undefined {
  if (markerText === undefined) return undefined;
  let marker: unknown;
  try {
    marker = JSON.parse(markerText);
  } catch {
    return undefined;
  }
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return undefined;
  return minimumHarnessVersionOf(marker) ?? undefined;
}

/** The downstream root context. assets/templates/root-context.md is its only source. */
function rootContextContent(): string {
  return readFileSync(join(TEMPLATE_ROOT, "root-context.md"), "utf-8");
}

function architectureIndexContent(): string {
  return `# Architecture Index

> Umbrella architecture ledger for current boundaries and diagrams.

## Current Snapshot

- Semantic diagram source: (none yet)
`;
}

function deployReadmeContent(): string {
  return `# Deployment Operations

\`deploy/\` is the tracked deployment and operations surface for runbooks, submission material, release checklists, helper scripts, ordered SQL files, and env examples. Keep private keys, real env values, provider state, artifacts, logs, and scratch files in ignored \`_ops/\` only.
`;
}

function researchReadmeContent(): string {
  return `# Research Reports

Durable research reports live in this directory as topic-scoped Markdown files. Keep correction-derived rules in \`tasks/lessons.md\`.
`;
}

function referenceStub(name: string): string {
  const docId = name.replace(/\.md$/, "");
  return `<!-- repo-harness: reference-config-stub v1 -->
# repo-harness Reference: ${docId}

> **Runtime Docs**: user-level repo-harness reference
> **Doc ID**: ${docId}
> **Source Command**: \`repo-harness docs path ${docId}\`

This repo keeps workflow facts and runtime artifacts locally under \`.ai/\`.
Use \`repo-harness docs show ${docId}\` for the full generic runtime guide.
`;
}

function addLegacyCleanup(repoRoot: string, operations: AdoptionOperation[]): AdoptionWarning[] {
  const plan = planLegacyLeftovers({ scope: "project", cwd: repoRoot, home: repoRoot, packageRoot: join(ASSET_ROOT, "..") });
  const warnings: AdoptionWarning[] = [];
  const hookPaths = new Set<string>();
  for (const item of plan.items) {
    const path = relative(resolve(repoRoot), item.path).split(sep).join("/");
    if (item.action === "strip-entry") {
      hookPaths.add(path);
      continue;
    }
    if (item.action === "report") {
      if (item.reason === "Current bytes do not match the declared retired generated asset.") {
        warnings.push({ code: "known-generated-fingerprint-mismatch", message: `Preserving ${path}: current bytes do not match the declared retired generated asset`, risk: "medium" });
      }
      continue;
    }
    if (item.action !== "remove") continue;
    // Adoption's existing transaction format snapshots regular files only.
    if (item.surface !== "file") continue;
    const remove = removeOperation(repoRoot, path, "Remove known-generated retired workflow asset");
    if (remove) operations.push(remove);
    operations.push({
      id: makeOperationId("gitUntrack", path), kind: "gitUntrack", path,
      reason: "Untrack removed known-generated workflow asset from the git index", risk: "medium", status: "planned",
    });
  }
  for (const path of hookPaths) {
    const current = jsonFile(repoRoot, path);
    if (!current) continue;
    const stripped = stripLegacyHookEntries(current, { location: "project" });
    operations.push(writeOperation(repoRoot, path, jsonContent(stripped.config),
      "Remove repo-local repo-harness host adapters after the user-level typed adapter cutover", { risk: "medium" }));
  }
  return warnings;
}

function addTemplateOperations(repoRoot: string, operations: AdoptionOperation[]): void {
  const names = [
    "research.template.md",
    "spec.template.md",
    "prd.template.md",
    "design-brief.template.md",
  ];
  for (const name of names) {
    const source = join(TEMPLATE_ROOT, name);
    if (!existsSync(source)) continue;
    const target = name === "prd.template.md" ? `docs/prds/${name}` : `.claude/templates/${name}`;
    operations.push(writeOperation(repoRoot, target, readFileSync(source, "utf-8"), "Install canonical repo-harness workflow template", { risk: "medium" }));
  }
}

function addHookOperations(repoRoot: string, operations: AdoptionOperation[]): void {
  operations.push(writeOperation(
    repoRoot,
    ".ai/hooks/README.md",
    "# Workflow Helpers\n\nHost events use the user-level `repo-harness-hook` typed runtime. Operator helpers run from the installed package: use `repo-harness run <helper>`. Init preserves legacy files under `.ai/hooks/lib/`. Run `repo-harness doctor` for migration guidance.\n",
    "Document typed hook authority and operator-only helper boundary",
    { risk: "medium" },
  ));
}

function addReferenceOperations(repoRoot: string, documentationProfile: string, operations: AdoptionOperation[]): void {
  const minimal = new Set([
    "harness-overview.md",
    "agentic-development-flow.md",
    "design-options.md",
    "ux-feature-guard.md",
    "external-tooling.md",
    "heartbeat-triage.md",
    "document-generation.md",
    "global-working-rules.md",
    "minimal-change-hooks.md",
  ]);
  for (const name of readdirSync(REFERENCE_ROOT).filter((entry) => entry.endsWith(".md")).sort()) {
    if (!documentationProfile.startsWith("full") && !minimal.has(name)) continue;
    const target = `docs/reference-configs/${name}`;
    const existing = fileContent(repoRoot, target);
    const asset = readFileSync(join(REFERENCE_ROOT, name), "utf-8");
    const generated = existing === undefined || existing.includes("<!-- repo-harness: reference-config-stub v1 -->") || existing === asset;
    if (!generated) continue;
    operations.push(writeOperation(repoRoot, target, referenceStub(name), "Install deterministic reference-config runtime stub", { risk: "low" }));
  }
}

function addPackageOperation(repoRoot: string, operations: AdoptionOperation[]): void {
  const current = jsonFile(repoRoot, "package.json");
  if (!current) return;
  const scripts = isObject(current.scripts) ? { ...current.scripts } : {};
  Object.assign(scripts, {
    "check:brain": "repo-harness brain check",
    "check:context-files": "repo-harness run check-context-files",
    "check:deploy-sql": "repo-harness run check-deploy-sql-order",
    "sync:brain": "repo-harness brain sync",
  });
  if (scripts["check:brain-manifest"] === "repo-harness run check-brain-manifest") {
    delete scripts["check:brain-manifest"];
  }
  if (scripts["sync:brain-docs"] === "repo-harness run sync-brain-docs --all") {
    delete scripts["sync:brain-docs"];
  }
  if (scripts["check:task-workflow"] === "repo-harness run check-task-workflow --strict") {
    delete scripts["check:task-workflow"];
  }
  if (scripts["check:architecture-sync"] === "repo-harness run check-architecture-sync") {
    delete scripts["check:architecture-sync"];
  }
  const raw = fileContent(repoRoot, "package.json")!;
  const open = raw.indexOf("{");
  const content = `${raw.slice(0, open)}${editJsonObject(raw, open, { ...current, private: current.private ?? true, scripts }, "", topLevelIndentUnit(raw))}${raw.slice(jsonValueEnd(raw, open))}`;
  operations.push(writeOperation(repoRoot, "package.json", content, "Install canonical repo-harness workflow package scripts", { risk: "medium" }));
}

// package.json is user-authored. These helpers rewrite only the members whose
// value changes, so the user's indentation, key order and line endings stay.
// The input already passed JSON.parse, so the scanner assumes valid JSON.
interface JsonMember { readonly key: string; readonly start: number; readonly keyEnd: number; readonly valueStart: number; readonly valueEnd: number }

function skipJsonSpace(text: string, index: number): number {
  while (/\s/.test(text[index] ?? "")) index++;
  return index;
}

function jsonStringEnd(text: string, quote: number): number {
  let index = quote + 1;
  while (text[index] !== '"') index += text[index] === "\\" ? 2 : 1;
  return index + 1;
}

function jsonValueEnd(text: string, start: number): number {
  if (text[start] === '"') return jsonStringEnd(text, start);
  if (text[start] !== "{" && text[start] !== "[") return start + /^[^\s,\]}]*/.exec(text.slice(start))![0].length;
  let depth = 0;
  for (let index = start; ; index++) {
    if (text[index] === '"') index = jsonStringEnd(text, index) - 1;
    else if (text[index] === "{" || text[index] === "[") depth++;
    else if ((text[index] === "}" || text[index] === "]") && --depth === 0) return index + 1;
  }
}

function jsonMembers(text: string, open: number): { readonly members: JsonMember[]; readonly close: number } {
  const members: JsonMember[] = [];
  let index = open + 1;
  for (;;) {
    const start = index;
    const keyStart = skipJsonSpace(text, index);
    if (text[keyStart] === "}") return { members, close: keyStart };
    const keyEnd = jsonStringEnd(text, keyStart);
    const valueStart = skipJsonSpace(text, skipJsonSpace(text, keyEnd) + 1);
    const valueEnd = jsonValueEnd(text, valueStart);
    members.push({ key: JSON.parse(text.slice(keyStart, keyEnd)) as string, start, keyEnd, valueStart, valueEnd });
    index = skipJsonSpace(text, valueEnd);
    if (text[index] === ",") index++;
  }
}

function lineIndent(space: string): string {
  return space.slice(space.lastIndexOf("\n") + 1);
}

function topLevelIndentUnit(text: string): string {
  const first = jsonMembers(text, text.indexOf("{")).members[0];
  return first ? lineIndent(text.slice(first.start, skipJsonSpace(text, first.start))) : "  ";
}

/**
 * Return the object at `open` with the members of `next`. A kept member keeps
 * its bytes; a changed nested object is edited in place; a new member copies
 * the spacing of the last member.
 */
function editJsonObject(text: string, open: number, next: JsonObject, indent: string, unit: string): string {
  const { members, close } = jsonMembers(text, open);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const last = members.at(-1);
  const space = last ? text.slice(last.start, skipJsonSpace(text, last.start)) : unit ? `${eol}${indent}${unit}` : "";
  const separator = last ? text.slice(last.keyEnd, last.valueStart) : ": ";
  const render = (value: unknown, memberIndent: string): string => JSON.stringify(value, null, unit).replaceAll("\n", `${eol}${memberIndent}`);
  const parts: string[] = [];
  for (const member of members) {
    if (!Object.hasOwn(next, member.key)) continue;
    const value = next[member.key];
    const source = text.slice(member.valueStart, member.valueEnd);
    const memberSpace = text.slice(member.start, skipJsonSpace(text, member.start));
    const rendered = JSON.stringify(JSON.parse(source)) === JSON.stringify(value) ? source
      : text[member.valueStart] === "{" && isObject(value) ? editJsonObject(text, member.valueStart, value, lineIndent(memberSpace), unit)
      : render(value, lineIndent(memberSpace));
    parts.push(`${memberSpace}${text.slice(skipJsonSpace(text, member.start), member.valueStart)}${rendered}`);
  }
  const present = new Set(members.map((member) => member.key));
  for (const [key, value] of Object.entries(next)) {
    if (!present.has(key)) parts.push(`${space}${JSON.stringify(key)}${separator}${render(value, lineIndent(space))}`);
  }
  const trailing = last ? text.slice(last.valueEnd, close) : parts.length > 0 && unit ? `${eol}${indent}` : text.slice(open + 1, close);
  return `{${parts.join(",")}${trailing}}`;
}

// Generated repository architecture settings that no reader consumes after the
// projection queue and request-card queue retirement. Execution settings now
// live in the host configuration; architecture truth lives in .archcontext/.
const RETIRED_ARCHITECTURE_POLICY_KEYS = [
  'projection_provider', 'projection_apply', 'projection_failure_gate', 'projection_version', 'projection_timeout_ms',
  'index_file', 'requests_dir', 'snapshots_dir', 'diagrams_dir', 'domains_dir', 'modules_dir',
  'diagram_skill', 'diagram_skill_source', 'vendoring_policy', 'freshness_gate', 'gate_min_severity',
  'pending_card_scope', 'pending_block_begin', 'pending_block_end', 'queue_script',
  'contract_block_begin', 'contract_block_end',
] as const;
const GENERATED_ARCHITECTURE_RULES = new Set([
  'hooks record architecture queue cards and sync controlled local context blocks; agents author semantic snapshots and diagrams',
  'Architecture documents and the archctx model are on-demand references; update real responsibility changes explicitly. Hooks do not queue per-edit drift, sync workstreams or author agent-context blocks.',
]);

function retireArchitecturePolicy(policy: Record<string, unknown>): void {
  if (isObject(policy.harness)) delete policy.harness.architecture_events_file;
  if (!isObject(policy.architecture)) return;
  const architecture = policy.architecture;
  for (const key of RETIRED_ARCHITECTURE_POLICY_KEYS) delete architecture[key];
  if (typeof architecture.rule === 'string' && GENERATED_ARCHITECTURE_RULES.has(architecture.rule)) delete architecture.rule;
  if (Object.keys(architecture).length === 0) delete policy.architecture;
}

/** Policy keys that no reader consumes after the plan/task artifact and agent runtime retirements. */
const RETIRED_ADOPTION_POLICY_KEYS: ReadonlyArray<{ readonly path: readonly [string] | readonly [string, string]; readonly label: string }> = [
  { path: ["active_plan"], label: "active_plan" },
  { path: ["plan_capture"], label: "plan_capture" },
  { path: ["tasks", "current_status_file"], label: "tasks.current_status_file" },
  { path: ["tasks", "workstreams_dir"], label: "tasks.workstreams_dir" },
  { path: ["guards", "edit_plan_gate"], label: "guards.edit_plan_gate" },
  { path: ["guards", "edit_plan_gate_modes"], label: "guards.edit_plan_gate_modes" },
  { path: ["agent_runtime"], label: "agent_runtime" },
];

function retireAdoptionPolicy(policy: Record<string, unknown>): string[] {
  const removed: string[] = [];
  // A retired plan-gate block carries its rule and its planning authority text.
  // The gate key is the block marker, so a current guards.rule stays.
  const hadPlanGate = isObject(policy.guards) && Object.hasOwn(policy.guards, "edit_plan_gate");
  const hadPlanCapture = Object.hasOwn(policy, "plan_capture");
  for (const { path, label } of RETIRED_ADOPTION_POLICY_KEYS) {
    const parent = path.length === 2 ? policy[path[0]!] : policy;
    const key = path[path.length - 1]!;
    if (!isObject(parent) || !Object.hasOwn(parent, key)) continue;
    delete parent[key];
    removed.push(label);
  }
  if (hadPlanGate && isObject(policy.guards) && Object.hasOwn(policy.guards, "rule")) {
    delete policy.guards.rule;
    removed.push("guards.rule");
  }
  if (hadPlanCapture && isObject(policy.planning) && Object.hasOwn(policy.planning, "source_of_truth")) {
    delete policy.planning.source_of_truth;
    removed.push("planning.source_of_truth");
  }
  for (const key of ["tasks", "guards", "planning"] as const) {
    if (isObject(policy[key]) && Object.keys(policy[key]).length === 0) delete policy[key];
  }
  return removed;
}

export function planStandardAdoption(opts: StandardPlanOptions): { operations: AdoptionOperation[]; warnings: AdoptionWarning[] } {
  const operations: AdoptionOperation[] = [];
  const documentationProfile = opts.env?.REPO_HARNESS_DOCUMENTATION_PROFILE ?? "minimal-agentic";
  const documentationLanguage = opts.env?.REPO_HARNESS_DOCUMENTATION_LANGUAGE ?? "en";
  const policyCurrent = jsonFile(opts.repoRoot, ".ai/harness/policy.json");
  const policy = deepMergeDefaults(defaultPolicy(documentationProfile, documentationLanguage), policyCurrent);
  const mergedDocumentation = isObject(policy.documentation) ? policy.documentation : {};
  requireDocumentationLanguage(mergedDocumentation.language);
  delete policy.hook_source;
  // Operator-invoked adoption retires the old execution authority. Never copy
  // repository preferences into the host-wide configuration.
  retireArchitecturePolicy(policy);
  // Plan and task execution artifacts are retired; both adoption modes drop
  // their policy keys and report each one so downstream users can audit it.
  const retiredPolicyKeys = retireAdoptionPolicy(policy);
  // Refactor execution is retired; recommendations read no repository refactor policy.
  delete policy.refactor;
  const externalTooling = isObject(policy.external_tooling) ? policy.external_tooling : {};
  const externalRouting = isObject(externalTooling.routing) ? externalTooling.routing : {};
  const retiredComplexProvider = typeof externalRouting.complex === "string" ? externalRouting.complex : null;
  delete externalRouting.complex;
  if (externalRouting.knowledge === "gbrain") delete externalRouting.knowledge;
  delete externalTooling.gbrain;
  externalTooling.routing = externalRouting;
  policy.external_tooling = externalTooling;

  const agenticDevelopment = isObject(policy.agentic_development) ? policy.agentic_development : {};
  const planningRouting = isObject(agenticDevelopment.routing) ? agenticDevelopment.routing : {};
  const retiredReportLabels = new Map<string, string>();
  if (retiredComplexProvider) {
    const retiredPrefix = `${retiredComplexProvider}:`;
    for (const key of ["product_discovery", "complex_engineering_plan", "design_plan"] as const) {
      const route = planningRouting[key];
      if (typeof route === "string" && route.startsWith(retiredPrefix)) {
        retiredReportLabels.set(route.slice(retiredPrefix.length), key);
        planningRouting[key] = "parent-agent:geju";
      }
    }
  }
  agenticDevelopment.routing = planningRouting;
  const dueDiligence = isObject(agenticDevelopment.due_diligence) ? agenticDevelopment.due_diligence : {};
  if (retiredReportLabels.size > 0 && Array.isArray(dueDiligence.explicit_report_required_for)) {
    dueDiligence.explicit_report_required_for = [
      ...new Set(dueDiligence.explicit_report_required_for.map((entry) => (
        typeof entry === "string" ? (retiredReportLabels.get(entry) ?? entry) : entry
      ))),
    ];
  }
  agenticDevelopment.due_diligence = dueDiligence;
  policy.agentic_development = agenticDevelopment;

  for (const path of opts.mode === "minimal" ? MINIMAL_DIRS : STANDARD_DIRS) {
    operations.push(mkdirOperation(opts.repoRoot, path, "Ensure canonical repo-harness workflow directory exists"));
  }
  for (const template of ["spec", "lessonsLog"] as const) {
    const file = adoptionTemplateFile(opts.repoRoot, template);
    operations.push(writeOperation(opts.repoRoot, file.path, file.content, file.reason, { ifMissing: true }));
  }
  operations.push(writeOperation(opts.repoRoot, ".ai/harness/workflow-contract.json", renderWorkflowContractMarker(declaredMinimumHarnessVersion(fileContent(opts.repoRoot, ".ai/harness/workflow-contract.json"))), "Install the repo-harness opt-in marker"));

  const gitignore = fileContent(opts.repoRoot, ".gitignore") ?? "";
  const gitignoreOperation = gitignoreManagedBlockOperation(opts.repoRoot, "planned");
  operations.push({
    ...gitignoreOperation,
    status: managedBlockNeedsUpdate(gitignore, gitignoreOperation) ? "planned" : "skipped",
    expectedAbsent: fileContent(opts.repoRoot, ".gitignore") === undefined,
    expectedContentHash: fileContent(opts.repoRoot, ".gitignore") === undefined ? undefined : contentHash(gitignore),
  });

  const retiredPolicyWarnings: AdoptionWarning[] = retiredPolicyKeys.length > 0
    ? [{ code: "retired-policy-keys", message: `Removed retired harness policy keys: ${retiredPolicyKeys.join(", ")}`, risk: "medium" }]
    : [];
  if (opts.mode === "minimal") {
    // A minimal scaffold creates no policy. When one exists, the same retired
    // key cleanup runs and is reported, so retired flows cannot survive a
    // downgrade to minimal mode.
    if (policyCurrent !== undefined) {
      operations.push(writeOperation(opts.repoRoot, ".ai/harness/policy.json", jsonContent(policy), "Remove retired harness policy keys", { risk: "medium" }));
    }
    return { operations, warnings: [...addLegacyCleanup(opts.repoRoot, operations), ...retiredPolicyWarnings] };
  }

  operations.push(writeOperation(opts.repoRoot, ".ai/harness/policy.json", jsonContent(policy), "Merge canonical harness policy defaults without discarding explicit repo settings", { risk: "medium" }));
  // Seeding an empty registry into an archcontext-authority repo would
  // reinstate the retired second authority, so the capability_source selector
  // gates the seed. Registry-mode repos (the scaffold default) are unchanged.
  if (capabilitySourceOf(policy) === "registry") {
    operations.push(writeOperation(opts.repoRoot, ".ai/context/capabilities.json", jsonContent(jsonFile(opts.repoRoot, ".ai/context/capabilities.json") ?? { version: 1, capabilities: [] }), "Install canonical empty capability registry when absent", { ifMissing: true }));
  }
  operations.push(writeOperation(opts.repoRoot, ".ai/context/context-map.json", jsonContent(jsonFile(opts.repoRoot, ".ai/context/context-map.json") ?? {
    version: 1,
    root_context_files: ["CLAUDE.md", "AGENTS.md", "docs/spec.md", ".ai/context/capabilities.json", ".ai/harness/policy.json"],
    discoverable_contexts: [],
  }), "Install canonical context map when absent", { ifMissing: true }));
  operations.push(writeOperation(opts.repoRoot, ".ai/harness/brain-manifest.json", jsonContent(jsonFile(opts.repoRoot, ".ai/harness/brain-manifest.json") ?? {
    version: 1,
    project: basename(resolve(opts.repoRoot)),
    mode: "repo-contract-external-knowledge",
    default_brain_path: "brain/<project>/*",
    rules: [
      "repo-local contracts, hooks, scripts, checks, and evidence remain authoritative",
      "default brain stores long-lived explanations, runbooks, decisions, references, and patterns",
    ],
    entries: [],
  }), "Install canonical brain manifest when absent", { ifMissing: true }));
  for (const state of STATE_FILES) operations.push(writeOperation(opts.repoRoot, state.path, state.content, "Ensure canonical harness state artifact exists", { ifMissing: true }));
  for (const file of [
    { path: "docs/researches/README.md", content: researchReadmeContent() },
    { path: "docs/architecture/index.md", content: architectureIndexContent() },
    { path: "deploy/README.md", content: deployReadmeContent() },
    { path: "CLAUDE.md", content: rootContextContent() },
    { path: "AGENTS.md", content: rootContextContent() },
  ]) operations.push(writeOperation(opts.repoRoot, file.path, file.content, "Install canonical root workflow context when absent", { ifMissing: true, risk: "medium" }));

  addTemplateOperations(opts.repoRoot, operations);
  addHookOperations(opts.repoRoot, operations);
  addReferenceOperations(opts.repoRoot, documentationProfile, operations);
  addPackageOperation(opts.repoRoot, operations);
  const cleanupWarnings = addLegacyCleanup(opts.repoRoot, operations);

  const warnings: AdoptionWarning[] = [
    ...cleanupWarnings,
    ...retiredPolicyWarnings,
    ...(opts.mode === "self-host"
      ? [{ code: "self-host-review", message: "Self-host adoption requires an explicit hook/runtime review and is intentionally not applied by the public command.", risk: "high" } as const]
      : []),
  ];
  if (opts.mode === "self-host") {
    operations.push({
      id: makeOperationId("runCheck", "self-host-adoption-boundary-review"),
      kind: "runCheck",
      command: "manual:self-host-hook-helper-pin-review",
      reason: "Self-host adoption must fail before writes until the hook/helper runtime review is deterministic.",
      risk: "high",
      status: "planned",
    });
  }
  return { operations, warnings };
}
