import { existsSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { loadWorkflowContract, resolveWorkflowContractForRepo } from "./workflow-contract.ts";

type Mode = "initialize" | "migrate" | "audit" | "repair";

type InspectionResult = {
  repo: string;
  mode: Mode;
  legacy_contract_version: string;
  drift_signals: string[];
  required_decisions: string[];
  safe_defaults: string[];
  detected_paths: string[];
  upgrade_plan: UpgradePlanItem[];
};

type UpgradePlanItem = {
  id: string;
  signal: string;
  action: string;
  risk: string;
  ownership: string;
  paths: string[];
  target_paths?: string[];
  summary: string;
};

function parseArgs(argv: string[]) {
  let repo = process.cwd();
  let format: "json" | "text" = "json";

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo") {
      repo = argv[i + 1] ? resolve(argv[i + 1]) : repo;
      i += 1;
      continue;
    }
    if (arg === "--format") {
      format = argv[i + 1] === "text" ? "text" : "json";
      i += 1;
    }
  }

  return { repo, format };
}

function fileHasContent(path: string, pattern: RegExp): boolean {
  if (!existsSync(path)) return false;
  return pattern.test(readFileSync(path, "utf-8"));
}

function jsonPathExists(path: string, keys: string[]): boolean {
  if (!existsSync(path)) return false;
  try {
    let value: unknown = JSON.parse(readFileSync(path, "utf-8"));
    for (const key of keys) {
      if (!value || typeof value !== "object" || !(key in value)) return false;
      value = (value as Record<string, unknown>)[key];
    }
    return true;
  } catch {
    return false;
  }
}

function hasAnyPath(repo: string, relPaths: string[]): boolean {
  return relPaths.some((relPath) => existsSync(join(repo, relPath)));
}

function hasCustomClaudeHooks(repo: string): boolean {
  const hooksDir = join(repo, ".claude", "hooks");
  if (!existsSync(hooksDir)) return false;
  try {
    return readdirSync(hooksDir).some((entry) => /^custom-.*\.sh$/.test(entry));
  } catch {
    return false;
  }
}

function detectMode(repo: string): Mode {
  const hasTasks = existsSync(join(repo, "tasks"));
  const hasPlan = existsSync(join(repo, "plans"));
  const hasLegacyDocs =
    existsSync(join(repo, "docs", "plan.md")) || existsSync(join(repo, "docs", "TODO.md"));
  const hasLegacySkillFactory =
    existsSync(join(repo, ".claude", "skill-factory")) ||
    existsSync(join(repo, "scripts", "skill-factory-check.sh")) ||
    existsSync(join(repo, "scripts", "skill-factory-create.sh")) ||
    existsSync(join(repo, ".ai", "hooks", "memory-intake.sh")) ||
    existsSync(join(repo, ".ai", "hooks", "skill-factory-session-end.sh"));

  if (hasTasks && hasPlan) return "audit";
  if (hasLegacyDocs || hasLegacySkillFactory) return "migrate";
  if (!hasTasks && !hasPlan && !hasLegacyDocs) return "initialize";
  return "repair";
}

export function inspectRepo(repo: string): InspectionResult {
  const contract = loadWorkflowContract(resolveWorkflowContractForRepo(repo));
  const latestContract = loadWorkflowContract();
  const upgradeActions = latestContract.migrations.upgrade?.actions ?? contract.migrations.upgrade?.actions ?? [];
  const detectedPathSet = new Set(
    [...new Set([...contract.migrations.legacyPaths, ...latestContract.migrations.legacyPaths])]
      .map((relPath) => relPath)
      .filter((relPath) => existsSync(join(repo, relPath)))
  );
  const driftSignals: string[] = [];
  const requiredDecisions: string[] = [];
  const safeDefaults = [
    "Preserve repo-local tasks-first workflow",
    "Archive uncertain legacy content instead of overwriting it",
    "Delete only manifest-owned known_generated legacy files",
    "Distill repeated corrections into tasks/lessons.md and hidden contracts into tasks/research.md",
  ];

  const runtimeManifest = join(repo, contract.artifacts.runtimeManifest);
  const todoFile = join(repo, contract.documents.deferredGoalLedger ?? contract.documents.taskChecklist ?? "tasks/todo.md");
  const policyFile = join(repo, ".ai", "harness", "policy.json");
  const generatedClaudeHookPaths = [
    ".claude/hooks/run-hook.sh",
    ".claude/hooks/finalize-handoff.sh",
    ".claude/hooks/session-start-context.sh",
    ".claude/hooks/hook-input.sh",
    ".claude/hooks/lib/workflow-state.sh",
    ".claude/hooks/lib/session-state.sh",
  ];
  const ignoredReferenceOrSecretPaths = [
    "_ref",
    "_ops",
  ];

  if (!existsSync(runtimeManifest)) {
    driftSignals.push("missing-runtime-contract-manifest");
  }
  if (existsSync(policyFile) && !jsonPathExists(policyFile, ["upgrade", "strategy_version"])) {
    driftSignals.push("policy-missing-upgrade-strategy");
  }
  if (existsSync(join(repo, "docs", "plan.md"))) {
    driftSignals.push("legacy-docs-plan");
  }
  if (existsSync(join(repo, "docs", "TODO.md"))) {
    driftSignals.push("legacy-docs-todo");
  }
  if (
    existsSync(join(repo, ".claude", "skill-factory")) ||
    existsSync(join(repo, "scripts", "skill-factory-check.sh")) ||
    existsSync(join(repo, "scripts", "skill-factory-create.sh")) ||
    existsSync(join(repo, ".ai", "hooks", "memory-intake.sh")) ||
    existsSync(join(repo, ".ai", "hooks", "skill-factory-session-end.sh"))
  ) {
    driftSignals.push("legacy-skill-factory-surface");
  }
  if (existsSync(join(repo, "docs", "PROGRESS.md"))) {
    driftSignals.push("legacy-docs-progress");
  }
  if (
    existsSync(todoFile) &&
    (
      !fileHasContent(todoFile, /^# Deferred Goal Ledger\s*$/m) ||
      !fileHasContent(todoFile, /^\> \*\*Status\*\*:\s*Backlog\s*$/m)
    )
  ) {
    driftSignals.push("legacy-task-checklist-format");
  }
  if (hasAnyPath(repo, generatedClaudeHookPaths)) {
    driftSignals.push("stale-generated-claude-hook-shims");
  }

  if (driftSignals.includes("missing-runtime-contract-manifest")) {
    requiredDecisions.push("Install runtime workflow contract manifest");
  }
  if (driftSignals.includes("policy-missing-upgrade-strategy")) {
    requiredDecisions.push("Merge versioned upgrade strategy into harness policy");
  }
  if (driftSignals.includes("legacy-docs-plan") || driftSignals.includes("legacy-docs-todo")) {
    requiredDecisions.push("Run legacy document migration before template refresh");
  }
  if (driftSignals.includes("legacy-docs-progress")) {
    requiredDecisions.push("Archive legacy docs/PROGRESS.md into task research or changelog surfaces");
  }
  if (driftSignals.includes("legacy-skill-factory-surface")) {
    requiredDecisions.push("Remove repo-local Skill Factory and auto-memory surfaces");
  }
  if (driftSignals.includes("stale-generated-claude-hook-shims")) {
    requiredDecisions.push("Remove manifest-owned generated .claude/hooks shims and keep .ai/hooks as source of truth");
  }

  const upgradeSignals = new Set(driftSignals);
  if (hasCustomClaudeHooks(repo)) {
    upgradeSignals.add("custom-claude-hooks");
  }
  if (hasAnyPath(repo, ignoredReferenceOrSecretPaths)) {
    upgradeSignals.add("ignored-reference-or-secret-surfaces");
  }
  const upgradePlan = upgradeActions
    .filter((action) => upgradeSignals.has(action.signal))
    .map((action) => {
      for (const relPath of action.paths) {
        if (!relPath.includes("*") && existsSync(join(repo, relPath))) {
          detectedPathSet.add(relPath);
        }
      }
      return {
        id: action.id,
        signal: action.signal,
        action: action.action,
        risk: action.risk,
        ownership: action.ownership,
        paths: action.paths,
        target_paths: action.targetPaths,
        summary: action.summary,
      };
    });

  let legacyContractVersion = "current-v1";
  if (driftSignals.includes("legacy-docs-plan") || driftSignals.includes("legacy-docs-todo")) {
    legacyContractVersion = "pre-tasks-first";
  } else if (driftSignals.includes("missing-runtime-contract-manifest")) {
    legacyContractVersion = "tasks-first-without-contract-manifest";
  }

  return {
    repo,
    mode: detectMode(repo),
    legacy_contract_version: legacyContractVersion,
    drift_signals: driftSignals,
    required_decisions: requiredDecisions,
    safe_defaults: safeDefaults,
    detected_paths: [...detectedPathSet].sort(),
    upgrade_plan: upgradePlan,
  };
}

function renderText(result: InspectionResult): string {
  const lines = [
    `repo: ${result.repo}`,
    `mode: ${result.mode}`,
    `legacy_contract_version: ${result.legacy_contract_version}`,
    `drift_signals: ${result.drift_signals.join(", ") || "(none)"}`,
    `required_decisions: ${result.required_decisions.join(" | ") || "(none)"}`,
    `safe_defaults: ${result.safe_defaults.join(" | ")}`,
    `upgrade_plan:`,
  ];
  if (result.upgrade_plan.length === 0) {
    lines.push("- (none)");
  } else {
    for (const item of result.upgrade_plan) {
      const target = item.target_paths?.length ? ` -> ${item.target_paths.join(", ")}` : "";
      lines.push(
        `- ${item.action} ${item.id} [${item.risk}, ${item.ownership}]: ${item.paths.join(", ")}${target}`
      );
    }
  }
  return lines.join("\n");
}

const { repo, format } = parseArgs(process.argv.slice(2));
const result = inspectRepo(repo);

if (format === "text") {
  console.log(renderText(result));
} else {
  console.log(JSON.stringify(result, null, 2));
}
