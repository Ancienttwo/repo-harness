import { createHash } from "crypto";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "fs";
import { basename, dirname, join, relative, resolve, sep } from "path";
import type { AdoptionMode } from "./modes";
import type { AdoptionOperation, AdoptionWarning, WriteFileOperation } from "./operations";
import { makeOperationId } from "./operations";
import { adoptionTemplateFile } from "./manifest-templates";
import { gitignoreManagedBlockOperation } from "./gitignore-plan";
import { managedBlockNeedsUpdate } from "./managed-block";
import { loadWorkflowContractAsset, readWorkflowContractAsset } from "./workflow-contract-asset";

const ASSET_ROOT = join(import.meta.dir, "..", "..", "..", "assets");
const PACKAGE_ROOT = join(import.meta.dir, "..", "..", "..");
const TEMPLATE_ROOT = join(ASSET_ROOT, "templates");
const HOOK_ROOT = join(ASSET_ROOT, "hooks");
const REFERENCE_ROOT = join(ASSET_ROOT, "reference-configs");

const STANDARD_DIRS = [
  "plans",
  "plans/archive",
  "plans/prds",
  "plans/sprints",
  "tasks",
  "tasks/archive",
  "tasks/contracts",
  "tasks/reviews",
  "tasks/notes",
  "tasks/workstreams",
  "docs",
  "docs/researches",
  "docs/reference-configs",
  "docs/architecture/domains",
  "docs/architecture/modules",
  "docs/architecture/requests",
  "docs/architecture/snapshots",
  "docs/architecture/diagrams",
  ".ai/context",
  ".ai/harness/checks",
  ".ai/harness/handoff",
  ".ai/harness/failures",
  ".ai/harness/architecture",
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
  "plans",
  "tasks",
  "tasks/contracts",
  "tasks/reviews",
  "tasks/notes",
  "docs",
  ".ai/harness/checks",
  ".ai/harness/handoff",
] as const;

const STATE_FILES: ReadonlyArray<{ path: string; content: string }> = [
  { path: ".ai/harness/checks/latest.json", content: "{}\n" },
  { path: ".ai/harness/handoff/current.md", content: "# Harness Handoff\n\n> **Reason**: bootstrap\n" },
  { path: ".ai/harness/handoff/resume.md", content: "# Codex Resume Packet\n\n> **Reason**: bootstrap\n" },
  { path: ".ai/context/capability-source-map.json", content: '{\n  "version": 1,\n  "capabilities": {}\n}\n' },
  { path: ".ai/harness/events.jsonl", content: "" },
  { path: ".ai/harness/architecture/events.jsonl", content: "" },
  { path: ".ai/harness/architecture/.gitkeep", content: "" },
  { path: ".ai/harness/failures/latest.jsonl", content: "" },
  { path: ".ai/harness/security/.gitkeep", content: "" },
  { path: ".ai/harness/planning/.gitkeep", content: "" },
  { path: ".ai/harness/worktrees/.gitkeep", content: "" },
  { path: ".ai/harness/runs/.gitkeep", content: "" },
  { path: ".ai/harness/triage/.gitkeep", content: "" },
  { path: "tasks/workstreams/.gitkeep", content: "" },
  { path: "docs/architecture/domains/.gitkeep", content: "" },
  { path: "docs/architecture/modules/.gitkeep", content: "" },
  { path: "docs/architecture/requests/.gitkeep", content: "" },
  { path: "docs/architecture/snapshots/.gitkeep", content: "" },
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

interface WorkflowContractAsset {
  readonly migrations?: {
    readonly upgrade?: {
      readonly actions?: ReadonlyArray<{
        readonly action?: string;
        readonly ownership?: string;
        readonly paths?: readonly string[];
      }>;
    };
  };
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

function moveOperation(repoRoot: string, path: string, to: string, reason: string): AdoptionOperation | undefined {
  const source = safePath(repoRoot, path);
  const target = safePath(repoRoot, to);
  if (!existsSync(source)) return undefined;
  if (existsSync(target)) {
    throw new Error(`migration destination already exists; refusing to overwrite user-owned path: ${to}`);
  }
  if (!lstatSync(source).isFile()) {
    throw new Error(`migration source is not a regular file: ${path}`);
  }
  const existing = readFileSync(source, "utf-8");
  return {
    id: makeOperationId("move", path, to),
    kind: "move",
    path,
    to,
    reason,
    risk: "medium",
    status: "planned",
    expectedContentHash: contentHash(existing),
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

function defaultPolicy(documentationProfile: string): JsonObject {
  return {
    version: 1,
    hook_source: "central",
    active_plan: {
      marker_file: ".ai/harness/active-plan",
      directory: "plans",
      archive_directory: "plans/archive",
      glob: "plan-*.md",
      active_worktree_marker_file: ".ai/harness/active-worktree",
      source_of_truth: "per-worktree explicit marker with active-worktree owner",
    },
    tasks: {
      todo_file: "tasks/todos.md",
      current_status_file: "tasks/current.md",
      lessons_file: "tasks/lessons.md",
      research_dir: "docs/researches",
      workstreams_dir: "tasks/workstreams",
      contracts_dir: "tasks/contracts",
      reviews_dir: "tasks/reviews",
      notes_dir: "tasks/notes",
    },
    context: {
      map_file: ".ai/context/context-map.json",
      capability_registry_file: ".ai/context/capabilities.json",
      capability_match_rule: "longest-prefix; same-length ambiguity fails",
    },
    worktree_strategy: {
      base_branch: "main",
      review_base: "main",
      merge_back: {
        target: "main",
      },
    },
    harness: {
      policy_file: ".ai/harness/policy.json",
      checks_file: ".ai/harness/checks/latest.json",
      handoff_file: ".ai/harness/handoff/current.md",
      helper_runtime_dir: "package:assets/templates/helpers",
      helper_source: "package",
    },
    operations: {
      dir: "deploy",
      private_dir: "_ops",
      rule: "Track deployment material in deploy/ and keep private local operations state in ignored _ops/.",
    },
    documentation: {
      profile: documentationProfile,
      reference_source: "user-level-runtime-docs",
      reference_stub_marker: "<!-- repo-harness: reference-config-stub v1 -->",
      reference_resolver: "repo-harness docs path <doc-id>",
    },
    upgrade: {
      strategy_version: 1,
      remove_only_ownership: "known_generated",
      unknown_files: "preserve-or-archive",
    },
  };
}

function rootContextContent(): string {
  return `# Repo Agent Context

This is the root routing contract for Claude Code and Codex. Load this before task-local artifacts.

## Workflow Contract

- Use first principles, one source of truth, and no steady-state compatibility paths.
- Treat \`docs/spec.md\` as product truth; \`tasks/current.md\` is derived state and \`tasks/todos.md\` is the deferred-goal ledger.
- Keep current execution in the active plan's \`## Task Breakdown\`; use contracts, reviews, notes, workstreams, and handoff artifacts for durable progress.
- Read \`.ai/context/capabilities.json\` and \`.ai/context/context-map.json\` before adding scoped agent context.
- Keep \`_ref/\` ignored external reference material and \`_ops/\` ignored local operations state.
`;
}

function architectureIndexContent(): string {
  return `# Architecture Index

> Umbrella architecture ledger for current boundaries, drift requests, snapshots, and diagrams.

## Current Snapshot

- Latest snapshot: (none yet)
- Semantic diagram source: (none yet)
- Latest human diagram: (none yet)

## Pending Requests

<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->
- (none)
<!-- END ARCHITECTURE PENDING REQUESTS -->
`;
}

function deployReadmeContent(): string {
  return `# Deployment Operations

\`deploy/\` is the tracked deployment and operations surface for runbooks, submission material, release checklists, helper scripts, ordered SQL files, and env examples. Keep private keys, real env values, provider state, artifacts, logs, and scratch files in ignored \`_ops/\` only.
`;
}

function researchReadmeContent(): string {
  return `# Research Reports

Durable research reports live in this directory as topic-scoped Markdown files. Keep task-local implementation decisions in \`tasks/notes/\` and correction-derived rules in \`tasks/lessons.md\`.
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

function knownGeneratedFile(repoRoot: string, path: string): boolean {
  const target = safePath(repoRoot, path);
  if (!existsSync(target) || !lstatSync(target).isFile()) return false;
  const content = readFileSync(target, "utf-8");
  const helperAsset = join(TEMPLATE_ROOT, "helpers", path.replace(/^scripts\//, ""));
  if (path.startsWith("scripts/") && existsSync(helperAsset) && readFileSync(helperAsset, "utf-8") === content) return true;
  if (path.startsWith(".ai/hooks/") && existsSync(join(HOOK_ROOT, path.slice(".ai/hooks/".length)))) {
    return readFileSync(join(HOOK_ROOT, path.slice(".ai/hooks/".length)), "utf-8") === content;
  }
  return false;
}

function isSelfHostedSourceRepo(repoRoot: string): boolean {
  try {
    return realpathSync(repoRoot) === realpathSync(PACKAGE_ROOT);
  } catch {
    return resolve(repoRoot) === resolve(PACKAGE_ROOT);
  }
}

function isCanonicalDeferredLedger(content: string): boolean {
  return /^# Deferred Goal Ledger\s*$/m.test(content) && /^> \*\*Status\*\*:\s*Backlog\s*$/m.test(content);
}

function archiveLegacyContent(repoRoot: string, operations: AdoptionOperation[], path: string, content: string, reason: string): void {
  const existing = fileContent(repoRoot, path);
  if (existing !== undefined) {
    if (existing !== content) {
      throw new Error(`legacy archive collision; refusing to overwrite user-owned evidence: ${path}`);
    }
    return;
  }
  operations.push(writeOperation(repoRoot, path, content, reason, { risk: "medium" }));
}

function addTodoMigrations(repoRoot: string, operations: AdoptionOperation[]): void {
  const ledger = adoptionTemplateFile(repoRoot, "deferredGoalLedger");
  const current = fileContent(repoRoot, "tasks/todos.md");
  const legacyPlural = current !== undefined && !isCanonicalDeferredLedger(current) ? current : undefined;
  const singular = fileContent(repoRoot, "tasks/todo.md");
  if (legacyPlural !== undefined || singular !== undefined) {
    const archive = "tasks/archive/legacy-tasks-todo.md";
    const archived = [
      legacyPlural === undefined ? undefined : `# Legacy Tasks Todos Import\n\n${legacyPlural.trimEnd()}\n`,
      singular === undefined ? undefined : `# Legacy Tasks Todo Import\n\n${singular.trimEnd()}\n`,
    ].filter((entry): entry is string => entry !== undefined).join("\n");
    archiveLegacyContent(repoRoot, operations, archive, archived, "Archive legacy todo ledgers before normalizing the canonical deferred-goal ledger");
  }
  if (legacyPlural !== undefined) {
    operations.push(writeOperation(repoRoot, ledger.path, ledger.content, "Normalize tasks/todos.md as the canonical deferred-goal ledger", { risk: "medium" }));
  }
  if (singular !== undefined) {
    const move = moveOperation(repoRoot, "tasks/todo.md", "tasks/todo.md.migrated.bak", "Retire legacy singular todo file after archival");
    if (move) operations.push(move);
  }
}

function addLegacyDocumentMigrations(repoRoot: string, operations: AdoptionOperation[]): void {
  const legacyDocs: ReadonlyArray<{ readonly path: string; readonly archive: string; readonly title: string }> = [
    { path: "docs/plan.md", archive: "plans/archive/legacy-docs-plan.md", title: "Legacy Plan Import" },
    { path: "docs/TODO.md", archive: "tasks/archive/legacy-docs-TODO.md", title: "Legacy TODO Import" },
    { path: "docs/PROGRESS.md", archive: "tasks/archive/legacy-docs-PROGRESS.md", title: "Legacy Progress Import" },
    { path: "docs/contract.md", archive: "tasks/archive/legacy-docs-contract.md", title: "Legacy Contract Import" },
    { path: "docs/review.md", archive: "tasks/archive/legacy-docs-review.md", title: "Legacy Review Import" },
    { path: "docs/handoff.md", archive: "tasks/archive/legacy-docs-handoff.md", title: "Legacy Handoff Import" },
    { path: "HANDOFF.md", archive: "tasks/archive/legacy-root-HANDOFF.md", title: "Legacy Root Handoff Import" },
  ];
  for (const legacy of legacyDocs) {
    const content = fileContent(repoRoot, legacy.path);
    if (content === undefined) continue;
    archiveLegacyContent(
      repoRoot,
      operations,
      legacy.archive,
      `# ${legacy.title}\n\n${content.trimEnd()}\n`,
      "Archive legacy workflow document before retirement",
    );
    if (legacy.path === "docs/PROGRESS.md") {
      archiveLegacyContent(
        repoRoot,
        operations,
        "docs/researches/legacy-progress-import.md",
        "# Legacy Progress Import\n\n<!-- repo-harness: legacy-docs-import docs/PROGRESS.md -->\n\n" + content.trimEnd() + "\n",
        "Preserve legacy progress observations in the canonical research surface",
      );
    }
    const moved = moveOperation(repoRoot, legacy.path, `${legacy.path}.migrated.bak`, "Retire archived legacy workflow document");
    if (moved) operations.push(moved);
  }

  const legacyResearch = fileContent(repoRoot, "tasks/research.md");
  if (legacyResearch !== undefined && !legacyResearch.includes("**Canonical Surface**: `docs/researches/`")) {
    archiveLegacyContent(repoRoot, operations, "docs/researches/legacy-research-notes.md", `${legacyResearch.trimEnd()}\n`, "Archive legacy singleton research notes");
    operations.push(writeOperation(
      repoRoot,
      "tasks/research.md",
      "# Research Notes Moved\n\n> **Status**: Retired tombstone\n> **Canonical Surface**: `docs/researches/`\n> **Legacy Archive**: `docs/researches/legacy-research-notes.md`\n\nDurable research reports now live under `docs/researches/*.md`.\n",
      "Replace legacy research surface with a canonical tombstone",
      { risk: "medium" },
    ));
  }
}

function addLegacySprintMoves(repoRoot: string, operations: AdoptionOperation[]): void {
  const sourceDir = safePath(repoRoot, "tasks/sprints");
  if (existsSync(sourceDir) && lstatSync(sourceDir).isDirectory()) {
    for (const entry of readdirSync(sourceDir).sort()) {
      if (!entry.endsWith(".sprint.md")) continue;
      if (!lstatSync(safePath(repoRoot, `tasks/sprints/${entry}`)).isFile()) continue;
      const move = moveOperation(repoRoot, `tasks/sprints/${entry}`, `plans/sprints/${entry}`, "Move legacy sprint backlog into plans/sprints");
      if (move) operations.push(move);
    }
  }

  const prdDir = safePath(repoRoot, "plans/prds");
  if (existsSync(prdDir) && lstatSync(prdDir).isDirectory()) {
    for (const entry of readdirSync(prdDir).sort()) {
      if (!entry.endsWith(".prd.md")) continue;
      if (!lstatSync(safePath(repoRoot, `plans/prds/${entry}`)).isFile()) continue;
      const content = fileContent(repoRoot, `plans/prds/${entry}`) ?? "";
      if (!/^(# Sprint:|## Backlog\s*$)/m.test(content)) continue;
      const move = moveOperation(repoRoot, `plans/prds/${entry}`, `plans/sprints/${entry.replace(/\.prd\.md$/, ".sprint.md")}`, "Move sprint-shaped PRD into plans/sprints");
      if (move) operations.push(move);
    }
  }
}

function addKnownGeneratedCleanup(repoRoot: string, operations: AdoptionOperation[]): void {
  // The source package owns its canonical scripts. They may be byte-identical
  // to package helpers, but that is not evidence that this source repo is a
  // downstream generated runtime copy.
  if (isSelfHostedSourceRepo(repoRoot)) return;
  const contract = loadWorkflowContractAsset<WorkflowContractAsset>();
  const actions = contract.migrations?.upgrade?.actions ?? [];
  for (const action of actions) {
    if (action.action !== "remove" || action.ownership !== "known_generated") continue;
    for (const path of action.paths ?? []) {
      if (path.includes("*")) continue;
      if (!knownGeneratedFile(repoRoot, path)) continue;
      const remove = removeOperation(repoRoot, path, "Remove known-generated retired workflow asset");
      if (remove) operations.push(remove);
      const untrack: AdoptionOperation = {
        id: makeOperationId("gitUntrack", path),
        kind: "gitUntrack",
        path,
        reason: "Untrack removed known-generated workflow asset from the git index",
        risk: "medium",
        status: "planned",
      };
      operations.push(untrack);
    }
  }
}

function addTemplateOperations(repoRoot: string, operations: AdoptionOperation[]): void {
  const names = [
    "research.template.md",
    "spec.template.md",
    "plan.template.md",
    "contract.template.md",
    "review.template.md",
    "implementation-notes.template.md",
    "sprint.template.md",
    "prd.template.md",
    "design-brief.template.md",
  ];
  for (const name of names) {
    const source = join(TEMPLATE_ROOT, name);
    if (!existsSync(source)) continue;
    operations.push(writeOperation(repoRoot, `.claude/templates/${name}`, readFileSync(source, "utf-8"), "Install canonical repo-harness workflow template", { risk: "medium" }));
  }
}

function addHookOperations(repoRoot: string, policy: JsonObject, operations: AdoptionOperation[]): void {
  const repoPinned = policy.hook_source === "repo";
  if (repoPinned) {
    const visit = (dir: string, prefix = "") => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) visit(join(dir, entry.name), rel);
        if (!entry.isFile() || ["projection.json", "codex.hooks.template.json", "settings.template.json"].includes(rel)) continue;
        operations.push(writeOperation(repoRoot, `.ai/hooks/${rel}`, readFileSync(join(dir, entry.name), "utf-8"), "Install repo-pinned hook runtime", { mode: (lstatSync(join(dir, entry.name)).mode & 0o111) ? 0o755 : 0o644, risk: "medium" }));
      }
    };
    visit(HOOK_ROOT);
    return;
  }

  const hookFiles = readdirSync(HOOK_ROOT).filter((name) => name.endsWith(".sh"));
  for (const name of hookFiles) {
    const target = `.ai/hooks/${name}`;
    if (knownGeneratedFile(repoRoot, target)) {
      const remove = removeOperation(repoRoot, target, "Remove stale repo-local hook runtime for central hook authority");
      if (remove) operations.push(remove);
    }
  }
  for (const name of readdirSync(join(HOOK_ROOT, "lib")).filter((entry) => entry.endsWith(".sh")).sort()) {
    const source = join(HOOK_ROOT, "lib", name);
    operations.push(writeOperation(repoRoot, `.ai/hooks/lib/${name}`, readFileSync(source, "utf-8"), "Install repo-local hook helper library", { mode: 0o755, risk: "medium" }));
  }
  operations.push(writeOperation(
    repoRoot,
    ".ai/hooks/README.md",
    "# Repo-Local Hook Fallback\n\nActive hook execution is user-level and central-first. Files under `.ai/hooks/lib/` support repo workflow helpers; full hook runtime scripts are not vendored unless `.ai/harness/policy.json` explicitly sets `hook_source` to `repo`.\n",
    "Document central-first hook authority",
    { risk: "medium" },
  ));
}

function addReferenceOperations(repoRoot: string, documentationProfile: string, operations: AdoptionOperation[]): void {
  const minimal = new Set([
    "harness-overview.md",
    "agentic-development-flow.md",
    "external-tooling.md",
    "sprint-contracts.md",
    "heartbeat-triage.md",
    "handoff-protocol.md",
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
    "check:brain-manifest": "repo-harness run check-brain-manifest",
    "check:context-files": "repo-harness run check-context-files",
    "check:deploy-sql": "repo-harness run check-deploy-sql-order",
    "check:architecture-sync": "repo-harness run check-architecture-sync",
    "check:task-sync": "repo-harness run check-task-sync",
    "check:task-workflow": "repo-harness run check-task-workflow --strict",
    "sync:brain-docs": "repo-harness run sync-brain-docs --all",
  });
  operations.push(writeOperation(repoRoot, "package.json", jsonContent({ ...current, private: current.private ?? true, scripts }), "Install canonical repo-harness workflow package scripts", { risk: "medium" }));
}

function addActivePlanMigration(repoRoot: string, operations: AdoptionOperation[]): void {
  const legacy = fileContent(repoRoot, ".claude/.active-plan")?.trim();
  const canonical = fileContent(repoRoot, ".ai/harness/active-plan")?.trim();
  if (!canonical && legacy) {
    operations.push(writeOperation(repoRoot, ".ai/harness/active-plan", `${legacy}\n`, "Migrate legacy active-plan marker to its canonical path", { risk: "medium" }));
  }
  if (legacy !== undefined) {
    const remove = removeOperation(repoRoot, ".claude/.active-plan", "Remove retired active-plan compatibility marker");
    if (remove) operations.push(remove);
  }
}

export function planStandardAdoption(opts: StandardPlanOptions): { operations: AdoptionOperation[]; warnings: AdoptionWarning[] } {
  const operations: AdoptionOperation[] = [];
  const documentationProfile = opts.env?.REPO_HARNESS_DOCUMENTATION_PROFILE ?? "minimal-agentic";
  const policyCurrent = jsonFile(opts.repoRoot, ".ai/harness/policy.json");
  const policy = deepMergeDefaults(defaultPolicy(documentationProfile), policyCurrent);

  for (const path of opts.mode === "minimal" ? MINIMAL_DIRS : STANDARD_DIRS) {
    operations.push(mkdirOperation(opts.repoRoot, path, "Ensure canonical repo-harness workflow directory exists"));
  }
  for (const template of ["spec", "deferredGoalLedger", "currentStatus", "lessonsLog"] as const) {
    const file = adoptionTemplateFile(opts.repoRoot, template);
    operations.push(writeOperation(opts.repoRoot, file.path, file.content, file.reason, { ifMissing: true }));
  }
  addTodoMigrations(opts.repoRoot, operations);
  operations.push(writeOperation(opts.repoRoot, ".ai/harness/workflow-contract.json", readWorkflowContractAsset(), "Install canonical repo-harness workflow contract manifest"));

  const gitignore = fileContent(opts.repoRoot, ".gitignore") ?? "";
  const gitignoreOperation = gitignoreManagedBlockOperation("planned");
  operations.push({
    ...gitignoreOperation,
    status: managedBlockNeedsUpdate(gitignore, gitignoreOperation) ? "planned" : "skipped",
    expectedAbsent: fileContent(opts.repoRoot, ".gitignore") === undefined,
    expectedContentHash: fileContent(opts.repoRoot, ".gitignore") === undefined ? undefined : contentHash(gitignore),
  });

  if (opts.mode === "minimal") {
    return { operations, warnings: [] };
  }

  operations.push(writeOperation(opts.repoRoot, ".ai/harness/policy.json", jsonContent(policy), "Merge canonical harness policy defaults without discarding explicit repo settings", { risk: "medium" }));
  operations.push(writeOperation(opts.repoRoot, ".ai/context/capabilities.json", jsonContent(jsonFile(opts.repoRoot, ".ai/context/capabilities.json") ?? { version: 1, capabilities: [] }), "Install canonical empty capability registry when absent", { ifMissing: true }));
  operations.push(writeOperation(opts.repoRoot, ".ai/context/context-map.json", jsonContent(jsonFile(opts.repoRoot, ".ai/context/context-map.json") ?? {
    version: 1,
    root_context_files: ["CLAUDE.md", "AGENTS.md", "docs/spec.md", "tasks/current.md", "tasks/todos.md", ".ai/context/capabilities.json", ".ai/harness/policy.json"],
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

  addActivePlanMigration(opts.repoRoot, operations);
  addTemplateOperations(opts.repoRoot, operations);
  addHookOperations(opts.repoRoot, policy, operations);
  addReferenceOperations(opts.repoRoot, documentationProfile, operations);
  addLegacyDocumentMigrations(opts.repoRoot, operations);
  addLegacySprintMoves(opts.repoRoot, operations);
  addPackageOperation(opts.repoRoot, operations);
  addKnownGeneratedCleanup(opts.repoRoot, operations);

  const warnings: AdoptionWarning[] = opts.mode === "self-host"
    ? [{ code: "self-host-review", message: "Self-host adoption requires an explicit hook/runtime review and is intentionally not applied by the public command.", risk: "high" }]
    : [];
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
