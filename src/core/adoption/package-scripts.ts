/** The package scripts that init owns: init writes each key with this value on every run. */
export const MANAGED_PACKAGE_SCRIPTS: Readonly<Record<string, string>> = {
  "check:brain": "rh brain check",
  "check:context-files": "rh run check-context-files",
  "check:deploy-sql": "rh run check-deploy-sql-order",
  "sync:brain": "rh brain sync",
};

/** Retired package script keys that init deletes when their value is a released value. */
export const RETIRED_PACKAGE_SCRIPT_KEYS: readonly string[] = ["check:architecture-sync", "check:brain-manifest", "check:task-workflow", "sync:brain-docs"];
