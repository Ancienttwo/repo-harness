import { existsSync, readFileSync, statSync } from "fs";
import { resolve } from "path";
import type { AdoptionMode } from "./modes";
import type { AdoptionOperation, AdoptionPlan, AdoptionWarning } from "./operations";
import { makeOperationId } from "./operations";
import { gitignoreManagedBlockOperation } from "./gitignore-plan";
import { summarizeOperations } from "./summary";
import { managedBlockNeedsUpdate } from "./managed-block";
import { workflowContractInstallOperation } from "./workflow-contract-plan";
import { adoptionTemplateFile } from "./manifest-templates";
import { withRollbackMetadata } from "./rollback";

export interface PlanAdoptionOptions {
  readonly repoRoot: string;
  readonly mode?: AdoptionMode;
  readonly apply?: boolean;
}

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

const STANDARD_EXTRA_DIRS = [
  "plans/archive",
  "plans/prds",
  "plans/sprints",
  "tasks/workstreams",
  "docs/reference-configs",
  ".ai/context",
  ".ai/harness/failures",
  ".ai/harness/architecture",
  ".ai/harness/runs",
] as const;

function directoryPaths(mode: AdoptionMode): readonly string[] {
  return mode === "minimal" ? MINIMAL_DIRS : [...MINIMAL_DIRS, ...STANDARD_EXTRA_DIRS];
}

function repoFileStatus(repoRoot: string, relPath: string): "planned" | "skipped" {
  return existsSync(resolve(repoRoot, relPath)) ? "skipped" : "planned";
}

function repoDirStatus(repoRoot: string, relPath: string): "planned" | "skipped" {
  const target = resolve(repoRoot, relPath);
  return existsSync(target) && statSync(target).isDirectory() ? "skipped" : "planned";
}

function writeIfMissingOperations(repoRoot: string): AdoptionOperation[] {
  const files = [
    adoptionTemplateFile(repoRoot, "spec"),
    adoptionTemplateFile(repoRoot, "deferredGoalLedger"),
    adoptionTemplateFile(repoRoot, "currentStatus"),
    adoptionTemplateFile(repoRoot, "lessonsLog"),
  ] as const;

  return files.map((file) => ({
    id: makeOperationId("writeFile", file.path, "ifMissing"),
    kind: "writeFile",
    path: file.path,
    content: file.content,
    ifMissing: true,
    reason: file.reason,
    risk: "low",
    status: repoFileStatus(repoRoot, file.path),
  }));
}

function workflowContractOperations(repoRoot: string): AdoptionOperation[] {
  return [workflowContractInstallOperation(repoRoot)];
}

function selfHostOperations(mode: AdoptionMode): AdoptionOperation[] {
  if (mode !== "self-host") return [];
  return [
    {
      id: makeOperationId("runCheck", "self-host-adoption-boundary-review"),
      kind: "runCheck",
      command: "manual:self-host-hook-helper-pin-review",
      reason: "Self-host adoption must preserve repo-pinned hook/helper runtime boundaries",
      risk: "medium",
      status: "skipped",
    },
  ];
}

function selfHostWarnings(mode: AdoptionMode): AdoptionWarning[] {
  if (mode !== "self-host") return [];
  return [
    {
      code: "self-host-hook-helper-pin",
      message: "Self-host mode only records the hook/helper pin review boundary in this sprint; it does not migrate hooks.",
      risk: "medium",
    },
  ];
}

export function planAdoption(opts: PlanAdoptionOptions): AdoptionPlan {
  const repoRoot = resolve(opts.repoRoot);
  const mode = opts.mode ?? "standard";
  const operations: AdoptionOperation[] = [
    ...directoryPaths(mode).map((path) => ({
      id: makeOperationId("mkdir", path),
      kind: "mkdir" as const,
      path,
      reason: "Ensure repo-harness workflow surface directory exists",
      risk: "low" as const,
      status: repoDirStatus(repoRoot, path),
    })),
    ...writeIfMissingOperations(repoRoot),
    ...workflowContractOperations(repoRoot),
  ];

  const gitignorePath = resolve(repoRoot, ".gitignore");
  const gitignoreExtraContent = "";
  const plannedGitignoreOperation = gitignoreManagedBlockOperation("planned", gitignoreExtraContent);
  const gitignoreOperation = gitignoreManagedBlockOperation(
    managedBlockNeedsUpdate(existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "", plannedGitignoreOperation)
      ? "planned"
      : "skipped",
    gitignoreExtraContent,
  );

  operations.push(gitignoreOperation, ...selfHostOperations(mode));
  const operationsWithRollback = operations.map(withRollbackMetadata);

  return {
    protocol: 1,
    command: "adopt",
    repoRoot,
    mode,
    apply: opts.apply === true,
    operations: operationsWithRollback,
    summary: summarizeOperations(operationsWithRollback),
    warnings: selfHostWarnings(mode),
  };
}
