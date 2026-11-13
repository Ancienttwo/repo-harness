/** The package scripts that init owns: init writes each key with this value on every run. */
export const MANAGED_PACKAGE_SCRIPTS: Readonly<Record<string, string>> = {
  "check:brain": "rh brain check",
  "check:context-files": "rh run check-context-files",
  "check:deploy-sql": "rh run check-deploy-sql-order",
  "sync:brain": "rh brain sync",
};
