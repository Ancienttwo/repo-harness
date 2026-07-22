#!/usr/bin/env bun
// Standalone helper: materializes the handoff/resume recovery views (and
// optionally the Codex-global packet) from the last-published checkpoint
// plus live workflow context. Self-contained by necessity -- this file is
// distributed to adopting downstream repos (mirrored byte-identically to
// assets/templates/helpers/recovery-view-cli.ts) which never receive this
// package's own src/ tree, so it imports Node/Bun builtins only and
// duplicates (by inspection, kept consistent with) the rendering logic in
// src/effects/evidence/recovery-materializer.ts, the authoritative
// in-process implementation src/cli/hook/stop-handler.ts imports directly
// at real Stop time. See
// tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md
// for the full design record.
//
// This tool's checkpoint read is intentionally lighter-weight than the
// authoritative reader (src/effects/evidence/checkpoint-store.ts): it does
// not re-verify content_hash/full schema completeness, since it is a
// manual/CI regeneration convenience, not the Stop-time authority. It still
// never fabricates an evidence claim -- any read/parse failure degrades to
// the same typed "unavailable" state a renderer shows honestly.
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";

const RECOVERY_SCHEMA_VERSION = 1;
const RECOVERY_MATERIALIZER_VERSION = "1";
const LEGACY_RESUME_MARKER = "<!-- generated-by: repo-harness codex-handoff-resume v1 -->";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDisplay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function formatCompact(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

function yymmdd(date: Date): string {
  return `${String(date.getFullYear()).slice(-2)}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

function policy(repoRoot: string): Record<string, unknown> {
  try {
    const value = JSON.parse(readFileSync(join(repoRoot, ".ai/harness/policy.json"), "utf8"));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function nestedString(root: Record<string, unknown>, keys: readonly string[]): string {
  let value: unknown = root;
  for (const key of keys) {
    if (!value || typeof value !== "object") return "";
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === "string" ? value : "";
}

/** Rejects absolute paths, `..` escapes, and anything outside `.ai/harness/`
 * -- port of `codex-handoff-resume.sh`'s existing `safe_repo_file` guard
 * (frozen behavior: `tests/helper-scripts.test.ts`'s "reject policy paths
 * outside the repo/harness surface" characterize this exact fallback). */
function safeHarnessPath(value: string, fallback: string): string {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\n") || value.includes("\r")) return fallback;
  if (value === ".." || value.startsWith("../") || value.includes("/../")) return fallback;
  if (!value.startsWith(".ai/harness/")) return fallback;
  return value;
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function metadataValue(path: string, label: string): string {
  try {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = readFileSync(path, "utf8").match(new RegExp(`^> \\*\\*${escaped}\\*\\*:\\s*(.+)$`, "m"));
    return match?.[1]?.replace(/`/g, "").trim() ?? "";
  } catch {
    return "";
  }
}

function declaredPath(repoRoot: string, plan: string, label: string): string {
  if (!plan || !existsSync(join(repoRoot, plan))) return "";
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = readFileSync(join(repoRoot, plan), "utf8").match(new RegExp(`^> \\*\\*${escaped}\\*\\*:\\s*(.+)$`, "m"));
  return match?.[1]?.replace(/`/g, "").trim() ?? "";
}

function worktreeIdFor(contractRelative: string): string {
  const base = contractRelative.split("/").pop() ?? contractRelative;
  return base.replace(/\.contract\.md$/, "");
}

interface ArtifactPaths {
  readonly plan: string;
  readonly contract: string;
  readonly review: string;
  readonly notes: string;
}

function planSlugFromPath(planFile: string): string {
  const base = basename(planFile);
  const slug = base.replace(/^plan-\d{8}-\d{4}-/, "").replace(/\.md$/, "");
  return slug.length > 0 && slug !== base ? slug : "";
}

function planStemFromPath(planFile: string): string {
  const base = basename(planFile);
  const stem = base.replace(/^plan-/, "").replace(/\.md$/, "");
  return /^\d{8}-\d{4}-.+/.test(stem) ? stem : planSlugFromPath(planFile);
}

/** `workflow_preferred_or_legacy_path` port: preferred (stamped-stem)
 * candidate wins if it exists; else the legacy (slug-only) candidate wins
 * if IT exists; else fall back to the preferred candidate as a best-guess
 * pointer (matches bash's `workflow_active_contract`/`_review`/`_notes` --
 * a recovery view may legitimately point at where an artifact SHOULD live
 * before it has been created). */
function preferredOrLegacyArtifactPath(repoRoot: string, preferred: string, legacy: string): string {
  if (existsSync(join(repoRoot, preferred))) return preferred;
  if (!existsSync(join(repoRoot, legacy))) return preferred;
  return legacy;
}

function activeArtifacts(repoRoot: string, activePlan: string | null): ArtifactPaths {
  const plan = activePlan && existsSync(join(repoRoot, activePlan)) ? activePlan : "";
  if (!plan) return { plan: "", contract: "", review: "", notes: "" };
  const stem = planStemFromPath(plan);
  const slug = planSlugFromPath(plan);
  const derived = (directory: string, suffix: string): string => {
    if (!stem || !slug) return "";
    return preferredOrLegacyArtifactPath(repoRoot, `${directory}/${stem}${suffix}`, `${directory}/${slug}${suffix}`);
  };
  return {
    plan,
    contract: declaredPath(repoRoot, plan, "Task Contract") || declaredPath(repoRoot, plan, "Sprint Contract") || derived("tasks/contracts", ".contract.md"),
    review: declaredPath(repoRoot, plan, "Task Review") || declaredPath(repoRoot, plan, "Sprint Review") || derived("tasks/reviews", ".review.md"),
    notes: declaredPath(repoRoot, plan, "Implementation Notes") || declaredPath(repoRoot, plan, "Notes File") || derived("tasks/notes", ".notes.md"),
  };
}

function todoSourcePlan(repoRoot: string): string {
  const value = metadataValue(join(repoRoot, "tasks/todos.md"), "Source Plan");
  return value === "(none)" ? "" : value;
}

function activeSprintRow(repoRoot: string, activePlan: string): string {
  let sprint = "";
  try {
    sprint = readFileSync(join(repoRoot, ".ai/harness/sprint/active-sprint"), "utf8").trim();
  } catch {
    return "(none)";
  }
  if (!sprint || sprint.startsWith("/") || sprint === ".." || sprint.startsWith("../") || sprint.includes("/../")) return "(none)";
  try {
    const row = readFileSync(join(repoRoot, sprint), "utf8")
      .split("\n")
      .find((line) => /^\|\s*\d+\s*\|/.test(line) && activePlan && line.includes(activePlan));
    return row || `Active sprint: ${sprint}`;
  } catch {
    return "(none)";
  }
}

function firstTaskBreakdown(planText: string): { total: number; done: number; next: string } {
  const lines = planText.split("\n");
  let inSection = false;
  let total = 0;
  let done = 0;
  let next = "";
  for (const line of lines) {
    if (!inSection && /^## Task Breakdown\s*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^## /.test(line)) break;
    const match = inSection ? line.match(/^\s*-\s*\[([ xX])\]\s+(.+)$/) : null;
    if (!match) continue;
    total += 1;
    if (match[1]!.toLowerCase() === "x") done += 1;
    else if (!next) next = match[2]!.replace(/\r/g, "");
  }
  return { total, done, next };
}

interface NextAction {
  readonly stage: string;
  readonly command: string;
  readonly message: string;
}

function nextAction(repoRoot: string, artifacts: ArtifactPaths): NextAction {
  if (!artifacts.plan) return { stage: "none", command: "", message: "(none)" };
  let taskState = { total: 0, done: 0, next: "" };
  try {
    taskState = firstTaskBreakdown(readFileSync(join(repoRoot, artifacts.plan), "utf8"));
  } catch {
    // Missing/unreadable plan is treated as no active execution checklist.
  }
  if (taskState.total > taskState.done) {
    const pending = taskState.next || "continue active plan Task Breakdown";
    return {
      stage: "task",
      command: "",
      message: `If a major module was just completed, stage its coherent diff first; then continue the next Task Breakdown item: ${pending}`,
    };
  }
  return {
    stage: "check",
    command: "/check",
    message: "Stage the completed module diff first; then run /check and let canonical workflow gates determine whether review, external acceptance, verification, or worktree finish is next.",
  };
}

function recentCommands(repoRoot: string): string {
  try {
    const lines = readFileSync(join(repoRoot, ".claude/.trace.jsonl"), "utf8").trimEnd().split("\n").slice(-5);
    return lines.length > 0 && lines.some(Boolean) ? lines.map((line) => `- ${line}`).join("\n") : "- (none captured)";
  } catch {
    return "- (none captured)";
  }
}

function supersededPlan(repoRoot: string): string {
  const state = readJson(join(repoRoot, ".claude/.task-state.json"));
  return typeof state?.source_plan === "string" && state.source_plan ? state.source_plan : "(none)";
}

function changedFiles(repoRoot: string): { files: string; summary: string } {
  try {
    const tracked = execFileSync("git", ["-C", repoRoot, "diff", "--name-only", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const untrackedRaw = execFileSync("git", ["-C", repoRoot, "ls-files", "--others", "--exclude-standard"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const files = [...new Set(`${tracked}\n${untrackedRaw}`.split("\n").map((line) => line.trim()).filter(Boolean))].sort();
    const visible = files.length > 80 ? [...files.slice(0, 80), `... (${files.length} total changed/untracked paths; inspect git status --short)`] : files;

    // workflow_write_handoff's `diff_stat`/`untracked_count` port: a
    // human-readable tracked-diff shortstat plus an explicit untracked
    // count, not a flat "N changed/untracked paths" total.
    let diffStat = "";
    try {
      diffStat = execFileSync("git", ["-C", repoRoot, "diff", "--shortstat", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).replace(/\n/g, "");
    } catch {
      diffStat = "";
    }
    const untrackedCount = untrackedRaw.split("\n").map((line) => line.trim()).filter(Boolean).length;
    const summary = untrackedCount > 0
      ? `${diffStat || "no tracked diff"}; ${untrackedCount} untracked files`
      : (diffStat || "no uncommitted diff against HEAD");

    return {
      files: visible.length > 0 ? visible.join("\n") : "(none)",
      summary,
    };
  } catch {
    return { files: "(none)", summary: "git repository not detected" };
  }
}

function latestGlobalHandoff(codexHome: string): string {
  try {
    const dir = join(codexHome, "handoffs");
    if (!existsSync(dir)) return "";
    const entries = execFileSync("find", [dir, "-maxdepth", "1", "-type", "f", "-name", "handoff-*.md"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .sort();
    return entries.length > 0 ? entries[entries.length - 1]! : "";
  } catch {
    return "";
  }
}

function resolveActivePlanMarker(repoRoot: string): string | null {
  try {
    const marker = readFileSync(join(repoRoot, ".ai/harness/active-plan"), "utf8").trim();
    if (marker && existsSync(join(repoRoot, marker))) return marker;
    return null;
  } catch {
    return null;
  }
}

interface WorkflowContext {
  readonly reason: string;
  readonly runId: string;
  readonly generatedAtDisplay: string;
  readonly generatedAtIso: string;
  readonly workingDirectory: string;
  readonly artifacts: ArtifactPaths;
  readonly sourcePlan: string;
  readonly activeSprintRowText: string;
  readonly action: NextAction;
  readonly nextTask: string;
  readonly goal: string;
  readonly changed: { readonly files: string; readonly summary: string };
  readonly recentCommandsText: string;
  readonly supersedes: string;
  readonly paths: {
    readonly checks: string;
    readonly handoff: string;
    readonly resume: string;
    readonly policyFile: string;
    readonly contextMap: string;
    readonly researchDir: string;
    readonly todoFile: string;
  };
  readonly globalHandoffPath: string;
}

function buildContext(repoRoot: string, reason: string, codexHome: string): WorkflowContext {
  const now = new Date();
  const config = policy(repoRoot);
  const checks = safeHarnessPath(nestedString(config, ["harness", "checks_file"]), ".ai/harness/checks/latest.json");
  const handoff = safeHarnessPath(nestedString(config, ["harness", "handoff_file"]), ".ai/harness/handoff/current.md");
  const resume = safeHarnessPath(nestedString(config, ["handoff_resume", "resume_packet_file"]), ".ai/harness/handoff/resume.md");
  const policyFile = ".ai/harness/policy.json";
  const contextMap = safeHarnessPath(nestedString(config, ["context", "map_file"]), ".ai/context/context-map.json");
  const researchDir = nestedString(config, ["tasks", "research_dir"]) || "docs/researches";
  const todoFile = safeHarnessPath(nestedString(config, ["tasks", "todo_file"]), "tasks/todos.md");
  const runId = process.env.HOOK_RUN_ID ?? process.env.CLAUDE_RUN_ID ?? process.env.CODEX_RUN_ID ?? `run-${formatCompact(now)}-${process.pid}`;
  const activePlan = resolveActivePlanMarker(repoRoot);
  const artifacts = activeArtifacts(repoRoot, activePlan);
  const changed = changedFiles(repoRoot);
  const sourcePlan = todoSourcePlan(repoRoot);
  const action = nextAction(repoRoot, artifacts);
  const nextTask = action.command ? `${action.message} Command: ${action.command}` : action.message;
  const goal = sourcePlan
    ? `Continue task checklist sourced from ${sourcePlan}.`
    : artifacts.plan
      ? `Continue active plan ${artifacts.plan}.`
      : nextTask !== "(none)"
        ? nextTask
        : "No active plan. Continue from the latest user request and filesystem state.";

  return {
    reason,
    runId,
    generatedAtDisplay: formatDisplay(now),
    generatedAtIso: now.toISOString(),
    workingDirectory: repoRoot,
    artifacts,
    sourcePlan,
    activeSprintRowText: activeSprintRow(repoRoot, artifacts.plan),
    action,
    nextTask,
    goal,
    changed,
    recentCommandsText: recentCommands(repoRoot),
    supersedes: supersededPlan(repoRoot),
    paths: { checks, handoff, resume, policyFile, contextMap, researchDir, todoFile },
    globalHandoffPath: latestGlobalHandoff(codexHome),
  };
}

interface EvidenceLatestByType {
  readonly event_type: string;
  readonly event_id: string;
  readonly trust_class: string;
  readonly created_at: string;
}

type Evidence =
  | {
      readonly available: true;
      readonly checkpointId: string;
      readonly worktreeId: string;
      readonly generatedAt: string;
      readonly coveredEventCount: number;
      readonly sourceEventIds: readonly string[];
      readonly latestByEventType: readonly EvidenceLatestByType[];
    }
  | {
      readonly available: false;
      readonly reason: "no-checkpoint" | "checkpoint-invalid";
      readonly detail?: string;
    };

/** Best-effort, gracefully-degrading checkpoint read -- see module doc. */
function resolveEvidence(repoRoot: string): Evidence {
  const markerPath = join(repoRoot, ".ai/harness/evidence/checkpoints/last-published.json");
  const markerText = readTextOrNull(markerPath);
  if (markerText === null) return { available: false, reason: "no-checkpoint" };
  try {
    const marker = JSON.parse(markerText) as Record<string, unknown>;
    if (typeof marker.checkpoint_id !== "string" || typeof marker.machine_path !== "string") {
      return { available: false, reason: "checkpoint-invalid", detail: "marker missing required field" };
    }
    const machineText = readTextOrNull(join(repoRoot, marker.machine_path));
    if (machineText === null) {
      return { available: false, reason: "checkpoint-invalid", detail: `checkpoint file missing: ${marker.machine_path}` };
    }
    const projection = JSON.parse(machineText) as Record<string, unknown>;
    if (projection.checkpoint_id !== marker.checkpoint_id) {
      return { available: false, reason: "checkpoint-invalid", detail: "checkpoint_id mismatch" };
    }
    const provenance = (projection.provenance ?? {}) as Record<string, unknown>;
    const sourceEventIds = Array.isArray(provenance.source_event_ids) ? (provenance.source_event_ids as string[]) : [];
    const latestByEventType = Array.isArray(projection.latest_by_event_type) ? (projection.latest_by_event_type as EvidenceLatestByType[]) : [];
    return {
      available: true,
      checkpointId: String(projection.checkpoint_id),
      worktreeId: typeof projection.worktree_id === "string" ? projection.worktree_id : "unbound",
      generatedAt: typeof provenance.generated_at === "string" ? provenance.generated_at : "",
      coveredEventCount: typeof projection.covered_event_count === "number" ? projection.covered_event_count : 0,
      sourceEventIds,
      latestByEventType,
    };
  } catch (error) {
    return { available: false, reason: "checkpoint-invalid", detail: error instanceof Error ? error.message : String(error) };
  }
}

function evidenceLines(evidence: Evidence): string[] {
  const lines: string[] = [];
  if (evidence.available) {
    lines.push(`- Checkpoint: ${evidence.checkpointId} (generated ${evidence.generatedAt})`);
    lines.push(`- Covered events: ${evidence.coveredEventCount}`);
    lines.push("- Latest by type:");
    if (evidence.latestByEventType.length === 0) {
      lines.push("  (none)");
    } else {
      for (const entry of evidence.latestByEventType) {
        lines.push(`  - ${entry.event_type}: ${entry.event_id} (${entry.trust_class}, accepted ${entry.created_at})`);
      }
    }
  } else if (evidence.reason === "no-checkpoint") {
    lines.push("- Checkpoint: (none published yet -- no ledger evidence recorded in this worktree)");
    lines.push("- Covered events: 0");
    lines.push("- Latest by type:");
    lines.push("  (none)");
  } else {
    lines.push(`- Checkpoint: (unavailable -- last-published checkpoint failed validation: ${evidence.detail ?? evidence.reason})`);
    lines.push("- Covered events: 0");
    lines.push("- Latest by type:");
    lines.push("  (none)");
  }
  return lines;
}

interface Provenance {
  readonly schema_version: number;
  readonly generated_at: string;
  readonly materializer_version: string;
  readonly source_event_ids: readonly string[];
  readonly source_checkpoint_id: string | null;
  readonly worktree_id: string;
  readonly contract_id: string | null;
  readonly content_hash: string;
}

function resolveWorktreeId(evidence: Evidence, contractPath: string): string {
  if (evidence.available) return evidence.worktreeId;
  if (contractPath) return worktreeIdFor(contractPath);
  return "unbound";
}

function buildProvenance(context: WorkflowContext, evidence: Evidence, contractPath: string, body: string): Provenance {
  return {
    schema_version: RECOVERY_SCHEMA_VERSION,
    generated_at: context.generatedAtIso,
    materializer_version: RECOVERY_MATERIALIZER_VERSION,
    source_event_ids: evidence.available ? evidence.sourceEventIds : [],
    source_checkpoint_id: evidence.available ? evidence.checkpointId : null,
    worktree_id: resolveWorktreeId(evidence, contractPath),
    contract_id: contractPath || null,
    content_hash: `sha256:${sha256Hex(body)}`,
  };
}

function renderProvenanceSection(provenance: Provenance): string[] {
  return [
    "## Provenance",
    "",
    `- Schema version: ${provenance.schema_version}`,
    `- Generated at: ${provenance.generated_at}`,
    `- Materializer version: ${provenance.materializer_version}`,
    `- Source checkpoint id: ${provenance.source_checkpoint_id ?? "(none -- no checkpoint published yet)"}`,
    `- Source event ids: ${provenance.source_event_ids.length > 0 ? `${provenance.source_event_ids.length} covered` : "(none)"}`,
    "- Subject hash: (none -- recovery view is not subject-bound)",
    `- Worktree: ${provenance.worktree_id}`,
    `- Contract: ${provenance.contract_id ?? "(none)"}`,
    `- Content hash: ${provenance.content_hash}`,
  ];
}

function renderHandoff(context: WorkflowContext, evidence: Evidence, contractPath: string): string {
  const bodyLines = [
    "# Harness Handoff",
    "",
    `> **Generated**: ${context.generatedAtDisplay}`,
    `> **Reason**: ${context.reason}`,
    "",
    "## Goal",
    "",
    context.goal,
    "",
    "## Decisions",
    "",
    "- Use filesystem artifacts as source of truth; treat SQLite/thread state as a rebuildable read model only.",
    "",
    "## Files Touched",
    "",
    "```",
    context.changed.files,
    "```",
    "",
    "## Commands Run",
    "",
    context.recentCommandsText,
    "",
    "## Evidence",
    "",
    ...evidenceLines(evidence),
    "",
    "## Blockers",
    "",
    "- (none recorded)",
    "",
    "## Active Artifacts",
    "",
    `- Active plan: ${context.artifacts.plan || "(none)"}`,
    `- Active contract: ${context.artifacts.contract || "(none)"}`,
    `- Active sprint row: ${context.activeSprintRowText}`,
    `- Review file: ${context.artifacts.review || "(none)"}`,
    `- Resume packet: ${context.paths.resume}`,
    "",
    "## Exact Next Step",
    "",
    `- ${context.nextTask}`,
    "",
    "## Resume Prompt",
    "",
    `- Resume packet: ${context.paths.resume}`,
    "- Start a fresh Codex session and read source artifacts first, then this handoff, before continuing; do not rely on auto-compact.",
    "",
    "## Source Artifacts",
    "",
    "- Spec: docs/spec.md",
    `- Plan: ${context.artifacts.plan || "(none)"}`,
    `- Todo Source Plan: ${context.sourcePlan || "(none)"}`,
    `- Contract: ${context.artifacts.contract || "(none)"}`,
    `- Review: ${context.artifacts.review || "(none)"}`,
    `- Notes: ${context.artifacts.notes || "(none)"}`,
    `- Checks: ${context.paths.checks}`,
    `- Resume Packet: ${context.paths.resume}`,
    `- Policy: ${context.paths.policyFile}`,
    `- Context Map: ${context.paths.contextMap}`,
    "",
    "## Current Status",
    "",
    `- Next action stage: ${context.action.stage}`,
    `- Next recommended action: ${context.nextTask}`,
    `- Working tree: ${context.changed.summary}`,
    `- Parent Run ID: ${context.runId}`,
    `- Supersedes: ${context.supersedes}`,
    "",
    "## Changed Files",
    "",
    "```",
    context.changed.files,
    "```",
    "",
  ];
  const body = bodyLines.join("\n");
  const provenance = buildProvenance(context, evidence, contractPath, body);
  return `${body}\n${renderProvenanceSection(provenance).join("\n")}\n`;
}

function renderResume(context: WorkflowContext, evidence: Evidence, contractPath: string): string {
  const bodyLines = [
    "# Codex Resume Packet",
    LEGACY_RESUME_MARKER,
    "",
    `> **Generated**: ${context.generatedAtDisplay}`,
    `> **Reason**: ${context.reason}`,
    `> **Working Directory**: ${context.workingDirectory}`,
    "",
    "## Resume Prompt",
    "",
    "You are starting a fresh Codex session for an existing long-running task. Do not rely on prior chat history or Codex auto-compact. First read the source artifacts listed below, then continue from the exact next step in the repo handoff.",
    "",
    "Current prompt files first:",
    "- If the current user message lists files under `# Files mentioned by the user`, references `pasted-text.txt`, or includes an explicit attachment/file path, read those current-input files before the repo recovery artifacts below.",
    "- Use handoff, resume, and `tasks/current.md` as recovery context only; they do not outrank the current user message.",
    "",
    "Required first reads:",
    "- AGENTS.md",
    `- ${context.paths.handoff}`,
    `- ${context.paths.todoFile}`,
    `- ${context.artifacts.notes || "(none)"}`,
    `- ${context.paths.researchDir}/`,
    `- ${context.paths.checks}`,
    "",
    "Conditional first reads:",
    `- Active plan: ${context.artifacts.plan || "(none)"}`,
    `- Active contract: ${context.artifacts.contract || "(none)"}`,
    `- Implementation notes: ${context.artifacts.notes || "(none)"}`,
    `- Global handoff: ${context.globalHandoffPath || "(none)"}`,
    "",
    "Execution rules:",
    "- Treat filesystem artifacts as the source of truth.",
    "- Decide in the main agent whether to use subagents, parallel sidecars, sidecar `codex exec --json`, or a bounded main-thread trace for broad research/log scans based on context impact and callable tools; do not ask the user for spawn confirmation.",
    `- Keep deep research conclusions in \`${context.paths.researchDir}/\`, not only in chat.`,
    "- Do not run `/compact` as the primary recovery path.",
    "- Preserve the current dirty worktree and do not touch unrelated untracked files.",
    "",
    "## Source Artifacts",
    "",
    `- Repo handoff: ${context.paths.handoff}`,
    `- Resume packet: ${context.paths.resume}`,
    `- Checks: ${context.paths.checks}`,
    `- Todo: ${context.paths.todoFile}`,
    `- Research: ${context.paths.researchDir}/`,
    `- Plan: ${context.artifacts.plan || "(none)"}`,
    `- Contract: ${context.artifacts.contract || "(none)"}`,
    `- Notes: ${context.artifacts.notes || "(none)"}`,
    `- Global handoff: ${context.globalHandoffPath || "(none)"}`,
    "",
  ];
  const body = bodyLines.join("\n");
  const provenance = buildProvenance(context, evidence, contractPath, body);
  return `${body}\n${renderProvenanceSection(provenance).join("\n")}\n`;
}

function extractResumePrompt(resumeText: string): string {
  const lines = resumeText.split("\n");
  const out: string[] = [];
  let printing = false;
  for (const line of lines) {
    if (line === "## Resume Prompt") {
      printing = true;
      continue;
    }
    if (line === "## Source Artifacts") break;
    if (printing) out.push(line);
  }
  while (out.length > 0 && out[0] === "") out.shift();
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return `${out.join("\n")}\n`;
}

function repoKeyFor(repoPath: string): string {
  return createHash("sha1").update(repoPath, "utf-8").digest("hex").slice(0, 12);
}

function capText(text: string, limit = 8000): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}...`;
}

function renderGlobalSection(params: {
  readonly repoPath: string;
  readonly repoKey: string;
  readonly reason: string;
  readonly repoHandoffRelative: string;
  readonly resumeFileRelative: string;
  readonly handoffText: string;
  readonly resumeText: string;
  readonly now: Date;
}): string {
  const start = `<!-- repo:${params.repoKey} start -->`;
  const end = `<!-- repo:${params.repoKey} end -->`;
  const lines = [
    start,
    `## ${formatDisplay(params.now)} ${basename(params.repoPath)}`,
    "",
    `- cwd: \`${params.repoPath}\``,
    `- reason: \`${params.reason}\``,
    `- repo_handoff: \`${params.repoHandoffRelative}\``,
    `- resume_packet: \`${params.resumeFileRelative}\``,
    "",
    "### Repo Handoff",
    "",
    capText(params.handoffText).trim(),
    "",
    "### Resume Packet",
    "",
    capText(params.resumeText).trim(),
    "",
    end,
    "",
  ];
  return lines.join("\n");
}

function updateGlobalHandoffFile(codexHome: string, repoKey: string, section: string, now: Date): string {
  const globalDir = join(codexHome, "handoffs");
  mkdirSync(globalDir, { recursive: true });
  const globalFile = join(globalDir, `handoff-${yymmdd(now)}.md`);
  const start = `<!-- repo:${repoKey} start -->`;
  const end = `<!-- repo:${repoKey} end -->`;
  const header = `# Codex Handoff ${yymmdd(now)}\n\nFilesystem-first fallback handoffs for compact-independent Codex sessions.\n\n`;

  let content = existsSync(globalFile) ? readFileSync(globalFile, "utf-8") : header;
  const startIdx = content.indexOf(start);
  if (startIdx >= 0 && content.includes(end)) {
    const afterStart = content.slice(startIdx + start.length);
    const endIdx = afterStart.indexOf(end);
    const prefix = content.slice(0, startIdx);
    const suffix = afterStart.slice(endIdx + end.length).replace(/^\n+/, "");
    content = prefix + section + suffix;
  } else {
    if (!content.endsWith("\n")) content += "\n";
    content += section;
  }
  writeFileSync(globalFile, content, "utf-8");
  return globalFile;
}

function writeFileDurable(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: 0o600 });
}

function resolveRepoRoot(cwdOption: string | undefined): string {
  if (process.env.REPO_HARNESS_TARGET_REPO_ROOT) return process.env.REPO_HARNESS_TARGET_REPO_ROOT;
  const cwd = cwdOption ?? process.cwd();
  try {
    const out = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    return out || cwd;
  } catch {
    return cwd;
  }
}

interface Options {
  reason: string;
  cwd?: string;
  printPrompt: boolean;
  withGlobalPacket: boolean;
  quiet: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { reason: "manual", printPrompt: false, withGlobalPacket: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--reason") {
      options.reason = argv[i + 1] ?? "manual";
      i += 1;
    } else if (arg === "--cwd") {
      options.cwd = argv[i + 1];
      i += 1;
    } else if (arg === "--print-prompt") {
      options.printPrompt = true;
    } else if (arg === "--with-global-packet") {
      options.withGlobalPacket = true;
    } else if (arg === "--quiet") {
      options.quiet = true;
    }
  }
  return options;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot(options.cwd);
  const codexHome = process.env.CODEX_HOME || join(process.env.HOME || "", ".codex");
  const context = buildContext(repoRoot, options.reason, codexHome);
  const evidence = resolveEvidence(repoRoot);
  const contractPath = context.artifacts.contract;
  const handoffText = renderHandoff(context, evidence, contractPath);
  const resumeText = renderResume(context, evidence, contractPath);

  writeFileDurable(join(repoRoot, context.paths.handoff), handoffText);
  writeFileDurable(join(repoRoot, context.paths.resume), resumeText);

  let globalFile = "";
  if (options.withGlobalPacket) {
    const repoKey = repoKeyFor(repoRoot);
    const section = renderGlobalSection({
      repoPath: repoRoot,
      repoKey,
      reason: options.reason,
      repoHandoffRelative: context.paths.handoff,
      resumeFileRelative: context.paths.resume,
      handoffText,
      resumeText,
      now: new Date(),
    });
    globalFile = updateGlobalHandoffFile(codexHome, repoKey, section, new Date());
  }

  if (options.printPrompt) {
    process.stdout.write(extractResumePrompt(resumeText));
    return;
  }

  if (options.withGlobalPacket && globalFile) {
    console.log(globalFile);
  }
  if (!options.quiet) {
    console.log(`Updated ${context.paths.resume}`);
  }
}

main();
