import type { AdoptionMode } from "./modes";

export type AdoptionRisk = "low" | "medium" | "high";
export type AdoptionOperationStatus = "planned" | "skipped" | "applied" | "failed";
export type AdoptionRollbackStrategy =
  | "none"
  | "remove-empty-directory"
  | "delete-created-file"
  | "restore-or-delete-file"
  | "manual";

export interface AdoptionRollbackMetadata {
  readonly strategy: AdoptionRollbackStrategy;
  readonly paths?: readonly string[];
  readonly backup?: "not-needed" | "runtime-fs-transaction";
  readonly description: string;
}

export interface BaseOperation {
  readonly id: string;
  readonly kind: string;
  readonly path?: string;
  readonly reason: string;
  readonly risk: AdoptionRisk;
  readonly status: AdoptionOperationStatus;
  readonly rollback?: AdoptionRollbackMetadata;
}

export interface MkdirOperation extends BaseOperation {
  readonly kind: "mkdir";
  readonly path: string;
}

export interface WriteFileOperation extends BaseOperation {
  readonly kind: "writeFile";
  readonly path: string;
  readonly content: string;
  readonly ifMissing?: boolean;
  readonly mode?: number;
}

export interface ManagedBlockMarker {
  readonly begin: string;
  readonly end: string;
}

export interface AppendManagedBlockOperation extends BaseOperation {
  readonly kind: "appendManagedBlock";
  readonly path: string;
  readonly marker: string;
  readonly content: string;
  readonly legacyMarkers?: readonly ManagedBlockMarker[];
}

export interface MergeJsonOperation extends BaseOperation {
  readonly kind: "mergeJson";
  readonly path: string;
}

export interface MoveOperation extends BaseOperation {
  readonly kind: "move";
  readonly path: string;
  readonly to: string;
}

export interface RemoveOperation extends BaseOperation {
  readonly kind: "remove";
  readonly path: string;
}

export interface GitUntrackOperation extends BaseOperation {
  readonly kind: "gitUntrack";
  readonly path: string;
}

export interface RunCheckOperation extends BaseOperation {
  readonly kind: "runCheck";
  readonly command: string;
}

export type AdoptionOperation =
  | MkdirOperation
  | WriteFileOperation
  | AppendManagedBlockOperation
  | MergeJsonOperation
  | MoveOperation
  | RemoveOperation
  | GitUntrackOperation
  | RunCheckOperation;

export interface AdoptionWarning {
  readonly code: string;
  readonly message: string;
  readonly risk: AdoptionRisk;
}

export interface AdoptionPlan {
  readonly protocol: 1;
  readonly command: "adopt";
  readonly repoRoot: string;
  readonly mode: AdoptionMode;
  readonly apply: boolean;
  readonly operations: readonly AdoptionOperation[];
  readonly summary: AdoptionPlanSummary;
  readonly warnings: readonly AdoptionWarning[];
}

export interface AdoptionPlanSummary {
  readonly total: number;
  readonly byKind: Record<string, number>;
  readonly userOwnedFilesTouched: number;
  readonly generatedFiles: number;
  readonly repoHarnessOwnedFiles: number;
  readonly requiresVerification: boolean;
}

export function makeOperationId(kind: string, path?: string, qualifier?: string): string {
  const parts = [kind, path, qualifier]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .map((part) => part.replace(/[^a-zA-Z0-9._/-]+/g, "-").replace(/^-+|-+$/g, ""));
  return parts.join(":");
}
