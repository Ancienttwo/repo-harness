import type { AdoptionOperation, AdoptionRollbackMetadata } from "./operations";

function noRollback(description: string): AdoptionRollbackMetadata {
  return {
    strategy: "none",
    backup: "not-needed",
    description,
  };
}

export function rollbackMetadataForOperation(operation: AdoptionOperation): AdoptionRollbackMetadata {
  if (operation.status === "skipped") {
    return noRollback("No rollback is needed because this operation is skipped.");
  }

  switch (operation.kind) {
    case "mkdir":
      return {
        strategy: "remove-empty-directory",
        paths: [operation.path],
        backup: "not-needed",
        description: "Remove the created directory if it is still empty.",
      };
    case "writeFile":
      if (operation.ifMissing === true) {
        return {
          strategy: "delete-created-file",
          paths: [operation.path],
          backup: "not-needed",
          description: "Delete the file created by this if-missing operation.",
        };
      }
      return {
        strategy: "restore-or-delete-file",
        paths: [operation.path],
        backup: "runtime-fs-transaction",
        description: "Restore the fs-transaction backup when present; delete the file if no backup was produced.",
      };
    case "appendManagedBlock":
      return {
        strategy: "restore-or-delete-file",
        paths: [operation.path],
        backup: "runtime-fs-transaction",
        description: "Restore the fs-transaction backup when present; delete the file if no backup was produced.",
      };
    case "runCheck":
      return noRollback("No rollback is needed because this operation is a verification boundary.");
    default:
      return {
        strategy: "manual",
        paths: operation.path ? [operation.path] : undefined,
        description: "Manual rollback review is required for this reserved operation kind.",
      };
  }
}

export function withRollbackMetadata<T extends AdoptionOperation>(operation: T): T {
  return {
    ...operation,
    rollback: operation.rollback ?? rollbackMetadataForOperation(operation),
  };
}
