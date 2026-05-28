import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

type Mode = "dry-run" | "apply";

type MigrationRecord = {
  source: string;
  target: string;
  action: "archive" | "rewrite" | "append" | "skip";
  note: string;
};

type MigrationSummary = {
  repo: string;
  mode: Mode;
  migrated: MigrationRecord[];
  skipped: string[];
  manual_followups: string[];
};

function parseArgs(argv: string[]) {
  let repo = process.cwd();
  let mode: Mode = "dry-run";
  let format: "json" | "text" = "text";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo") {
      repo = argv[i + 1] ? resolve(argv[i + 1]) : repo;
      i += 1;
      continue;
    }
    if (arg === "--apply") {
      mode = "apply";
      continue;
    }
    if (arg === "--dry-run") {
      mode = "dry-run";
      continue;
    }
    if (arg === "--format") {
      format = argv[i + 1] === "json" ? "json" : "text";
      i += 1;
    }
  }

  return { repo, mode, format };
}

function ensureDir(path: string, mode: Mode) {
  if (mode === "apply") {
    mkdirSync(path, { recursive: true });
  }
}

function appendIfMissing(target: string, marker: string, block: string, mode: Mode) {
  const existing = existsSync(target) ? readFileSync(target, "utf-8") : "";
  if (existing.includes(marker)) return false;
  if (mode === "apply") {
    ensureDir(dirname(target), mode);
    const next = existing ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`;
    writeFileSync(target, next);
  }
  return true;
}

function hasCanonicalTodoHeader(content: string): boolean {
  return /^# Deferred Goal Ledger\s*$/m.test(content) && /^\> \*\*Status\*\*:\s*Backlog\s*$/m.test(content);
}

function writeCanonicalTodo(target: string, mode: Mode) {
  if (existsSync(target)) return;
  const content = [
    "# Deferred Goal Ledger",
    "",
    "> **Status**: Backlog",
    "> **Updated**: (migration)",
    "> **Scope**: Medium/long-term goals deferred from active plan execution",
    "",
    "Current plan tasks live in the active plan's `## Task Breakdown`.",
    "Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.",
    "",
    "## Deferred Goals",
    "",
    "| Goal | Why Deferred | Tradeoff | Revisit Trigger |",
    "|------|--------------|----------|-----------------|",
    "| (none) | No deferred medium/long-term goal recorded yet. | Keep migrated workflow state bounded. | Add a row when a real follow-up is postponed. |",
  ].join("\n");
  if (mode === "apply") {
    ensureDir(dirname(target), mode);
    writeFileSync(target, `${content}\n`);
  }
}

function normalizeLegacyTodo(target: string, archivePath: string, mode: Mode) {
  if (!existsSync(target)) return false;

  const existing = readFileSync(target, "utf-8");
  if (hasCanonicalTodoHeader(existing)) return false;

  const content = [
    "# Deferred Goal Ledger",
    "",
    "> **Status**: Backlog",
    "> **Updated**: (migration)",
    "> **Scope**: Medium/long-term goals deferred from active plan execution",
    "",
    "Current plan tasks live in the active plan's `## Task Breakdown`.",
    "Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.",
    "",
    "## Deferred Goals",
    "",
    "| Goal | Why Deferred | Tradeoff | Revisit Trigger |",
    "|------|--------------|----------|-----------------|",
    "| Review archived legacy checklist | Legacy tasks/todo.md contained execution checklist content before migration. | Preserve user-authored task text in tasks/archive instead of guessing which items still matter. | Open the archive and promote real follow-up work into a new plan or a deferred-goal row. |",
  ].join("\n");

  if (mode === "apply") {
    ensureDir(dirname(target), mode);
    ensureDir(dirname(archivePath), mode);
    if (!existsSync(archivePath)) {
      writeFileSync(archivePath, `${existing.trimEnd()}\n`);
    }
    writeFileSync(target, `${content}\n`);
  }

  return true;
}

function writeCanonicalResearch(target: string, mode: Mode) {
  if (existsSync(target)) return;
  const content = [
    "# Project — Research Notes",
    "",
    "> **Last Updated**: TBD",
    "> **Scope**: (what area of the codebase was researched)",
    "> **Usage**: Store deep codebase findings and hidden contracts here, not in chat-only summaries.",
    "",
    "## Codebase Map",
    "| File | Purpose | Key Exports |",
    "|------|---------|-------------|",
    "",
    "## Architecture Observations",
    "### Patterns & Conventions",
    "### Implicit Contracts",
    "### Edge Cases & Intricacies",
    "",
    "## Technical Debt / Risks",
    "",
    "## Research Conclusions",
    "### What to Preserve",
    "### What to Change",
    "### Open Questions",
  ].join("\n");
  if (mode === "apply") {
    ensureDir(dirname(target), mode);
    writeFileSync(target, `${content}\n`);
  }
}

export function migrate(repo: string, mode: Mode): MigrationSummary {
  const summary: MigrationSummary = {
    repo,
    mode,
    migrated: [],
    skipped: [],
    manual_followups: [],
  };

  const planDoc = join(repo, "docs", "plan.md");
  const todoDoc = join(repo, "docs", "TODO.md");
  const progressDoc = join(repo, "docs", "PROGRESS.md");
  const tasksTodo = join(repo, "tasks", "todo.md");
  const tasksResearch = join(repo, "tasks", "research.md");
  const plansArchive = join(repo, "plans", "archive");
  const tasksArchive = join(repo, "tasks", "archive");
  const legacyPlanArchive = join(plansArchive, "legacy-docs-plan.md");
  const legacyTodoArchive = join(tasksArchive, "legacy-docs-TODO.md");
  const legacyProgressArchive = join(tasksArchive, "legacy-docs-PROGRESS.md");
  const legacyTasksTodoArchive = join(tasksArchive, "legacy-tasks-todo.md");
  const legacyContractDoc = join(repo, "docs", "contract.md");
  const legacyReviewDoc = join(repo, "docs", "review.md");
  const legacyHandoffDoc = join(repo, "docs", "handoff.md");
  const rootHandoffDoc = join(repo, "HANDOFF.md");

  ensureDir(plansArchive, mode);
  ensureDir(tasksArchive, mode);
  writeCanonicalTodo(tasksTodo, mode);
  if (normalizeLegacyTodo(tasksTodo, legacyTasksTodoArchive, mode)) {
    summary.migrated.push({
      source: "tasks/todo.md",
      target: "tasks/todo.md",
      action: "rewrite",
      note: "Archived legacy task checklist content and normalized tasks/todo.md to the deferred-goal ledger.",
    });
  }
  writeCanonicalResearch(tasksResearch, mode);

  if (existsSync(planDoc)) {
    const content = readFileSync(planDoc, "utf-8");
    const archiveBlock = [
      "# Legacy Plan Import",
      "",
      "<!-- project-initializer: legacy-docs-import docs/plan.md -->",
      "",
      "Original `docs/plan.md` content was archived during migration.",
      "",
      "## Imported Content",
      "",
      content.trimEnd(),
    ].join("\n");

    if (mode === "apply" && !existsSync(legacyPlanArchive)) {
      writeFileSync(legacyPlanArchive, `${archiveBlock}\n`);
    }
    if (mode === "apply") {
      renameSync(planDoc, `${planDoc}.migrated.bak`);
    }
    summary.migrated.push({
      source: "docs/plan.md",
      target: "plans/archive/legacy-docs-plan.md",
      action: "archive",
      note: "Archived uncertain legacy plan content for manual review.",
    });
    summary.manual_followups.push("Review plans/archive/legacy-docs-plan.md and create a canonical plan if the content is still active.");
  }

  if (existsSync(todoDoc)) {
    const content = readFileSync(todoDoc, "utf-8").trimEnd();
    const hadCanonicalTodo = existsSync(tasksTodo);

    if (!hadCanonicalTodo) {
      writeCanonicalTodo(tasksTodo, mode);
    }

    if (mode === "apply" && !existsSync(legacyTodoArchive)) {
      writeFileSync(legacyTodoArchive, `${content}\n`);
      renameSync(todoDoc, `${todoDoc}.migrated.bak`);
    }
    summary.migrated.push({
      source: "docs/TODO.md",
      target: "tasks/todo.md",
      action: hadCanonicalTodo ? "skip" : "rewrite",
      note: hadCanonicalTodo
        ? "Archived the legacy todo without rewriting the existing deferred-goal ledger."
        : "Created the deferred-goal ledger and archived the legacy todo for manual plan triage.",
    });
    summary.manual_followups.push(
      "Review tasks/archive/legacy-docs-TODO.md and promote any still-relevant work into a new plan instead of rehydrating it into tasks/todo.md."
    );
  }

  if (existsSync(progressDoc)) {
    const content = readFileSync(progressDoc, "utf-8").trimEnd();
    if (!readFileSync(progressDoc, "utf-8").includes("milestone checkpoints only")) {
      const notesBlock = [
        "## Legacy Progress Import",
        "",
        "<!-- project-initializer: legacy-docs-import docs/PROGRESS.md -->",
        "",
        "Imported from a legacy execution log stored in `docs/PROGRESS.md`.",
        "",
        content,
      ].join("\n");

      appendIfMissing(tasksResearch, "<!-- project-initializer: legacy-docs-import docs/PROGRESS.md -->", notesBlock, mode);
    }

    if (mode === "apply") {
      if (!existsSync(legacyProgressArchive)) {
        writeFileSync(legacyProgressArchive, `${content}\n`);
      }
      renameSync(progressDoc, `${progressDoc}.migrated.bak`);
    }
    summary.migrated.push({
      source: "docs/PROGRESS.md",
      target: "tasks/archive/legacy-docs-PROGRESS.md",
      action: "archive",
      note: "Archived legacy progress notes; docs/PROGRESS.md is no longer a generated workflow surface.",
    });
  }

  const archiveDoc = (sourcePath: string, archiveName: string, note: string) => {
    if (!existsSync(sourcePath)) return;
    const target = join(tasksArchive, archiveName);
    if (mode === "apply" && !existsSync(target)) {
      writeFileSync(target, `${readFileSync(sourcePath, "utf-8").trimEnd()}\n`);
      renameSync(sourcePath, `${sourcePath}.migrated.bak`);
    }
    summary.migrated.push({
      source: sourcePath.replace(`${repo}/`, ""),
      target: target.replace(`${repo}/`, ""),
      action: "archive",
      note,
    });
    summary.manual_followups.push(`Review ${target.replace(`${repo}/`, "")} and re-home any still-relevant content.`);
  };

  archiveDoc(legacyContractDoc, "legacy-docs-contract.md", "Archived legacy contract notes for manual triage.");
  archiveDoc(legacyReviewDoc, "legacy-docs-review.md", "Archived legacy review notes for manual triage.");
  archiveDoc(legacyHandoffDoc, "legacy-docs-handoff.md", "Archived legacy handoff notes for manual triage.");
  archiveDoc(rootHandoffDoc, "legacy-root-HANDOFF.md", "Archived root handoff notes for manual triage.");

  return summary;
}

function renderText(summary: MigrationSummary): string {
  const lines = [
    `[migrate-docs] repo: ${summary.repo}`,
    `[migrate-docs] mode: ${summary.mode}`,
  ];

  for (const item of summary.migrated) {
    lines.push(`[migrate-docs] ${item.source} -> ${item.target} (${item.action})`);
    lines.push(`[migrate-docs] note: ${item.note}`);
  }
  for (const followup of summary.manual_followups) {
    lines.push(`[migrate-docs] follow-up: ${followup}`);
  }
  if (summary.migrated.length === 0) {
    lines.push("[migrate-docs] no legacy documents detected");
  }
  return lines.join("\n");
}

const { repo, mode, format } = parseArgs(process.argv.slice(2));
const summary = migrate(repo, mode);

if (format === "json") {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(renderText(summary));
}
