#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_root="$SCRIPT_DIR/.."
[[ "$(basename "$SCRIPT_DIR")" == "helpers" ]] && package_root="$SCRIPT_DIR/../../.."

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/summarize-failures.sh [--file <path>] [--run-id <id>]
USAGE_EOF
}

log_file=""
filter_run_id=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      [[ -n "${2:-}" ]] || { echo "Error: --file requires a value" >&2; usage; exit 2; }
      log_file="$2"
      shift 2
      ;;
    --run-id)
      [[ -n "${2:-}" ]] || { echo "Error: --run-id requires a value" >&2; usage; exit 2; }
      filter_run_id="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

# The edit guard writes the failure log at FAILURE_LOG_FILE; this summary reads it.
"${REPO_HARNESS_BUN_BIN:-bun}" -e '
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const [packageRoot, explicitFile, filterRunId] = process.argv.slice(1);
const { FAILURE_LOG_FILE } = await import(pathToFileURL(path.join(packageRoot, "src/effects/state/resolve-effective-state.ts")).href);
const file = explicitFile || FAILURE_LOG_FILE;

if (!fs.existsSync(file)) {
  console.log(`[FailureSummary] No failure log found at ${file}`);
  process.exit(0);
}

const rows = fs
  .readFileSync(file, "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .filter((row) => !filterRunId || row.run_id === filterRunId);

if (rows.length === 0) {
  console.log(
    filterRunId
      ? `[FailureSummary] No failure records found for run_id=${filterRunId}`
      : "[FailureSummary] No failure records found"
  );
  process.exit(0);
}

const classCounts = new Map();
const guardCounts = new Map();

for (const row of rows) {
  classCounts.set(row.failure_class, (classCounts.get(row.failure_class) || 0) + 1);
  guardCounts.set(row.guard, (guardCounts.get(row.guard) || 0) + 1);
}

const sortEntries = (map) =>
  [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const latestRunId = rows[rows.length - 1]?.run_id || "unknown";
console.log(`[FailureSummary] records=${rows.length} run_id=${filterRunId || latestRunId}`);
console.log("Failure classes:");
for (const [name, count] of sortEntries(classCounts)) {
  console.log(`- ${name}: ${count}`);
}
console.log("Guards:");
for (const [name, count] of sortEntries(guardCounts)) {
  console.log(`- ${name}: ${count}`);
}
' "$package_root" "$log_file" "$filter_run_id"
