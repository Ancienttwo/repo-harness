#!/bin/bash
set -euo pipefail

if [[ -f ".ai/hooks/lib/workflow-state.sh" ]]; then
  # shellcheck source=/dev/null
  . ".ai/hooks/lib/workflow-state.sh"
fi

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/summarize-failures.sh [--file <path>] [--run-id <id>]
USAGE_EOF
}

resolve_js_runtime() {
  if command -v bun >/dev/null 2>&1; then
    printf 'bun'
    return 0
  fi

  if [[ -x "${HOME}/.bun/bin/bun" ]]; then
    printf '%s' "${HOME}/.bun/bin/bun"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    printf 'node'
    return 0
  fi

  return 1
}

if declare -F workflow_failure_log_file >/dev/null 2>&1; then
  log_file="$(workflow_failure_log_file)"
else
  log_file=".ai/harness/failures/latest.jsonl"
fi
filter_run_id=""
js_runtime=""
js_code=""

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

if [[ ! -f "$log_file" ]]; then
  echo "[FailureSummary] No failure log found at $log_file"
  exit 0
fi

js_runtime="$(resolve_js_runtime || true)"
if [[ -z "$js_runtime" ]]; then
  echo "[FailureSummary] Missing JavaScript runtime (expected bun or node)" >&2
  exit 1
fi

js_code="$(cat <<'NODE_EOF'
const fs = require("fs");

const file = process.env.JSONL_FILE;
const filterRunId = process.env.FILTER_RUN_ID || "";

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
NODE_EOF
)"

JSONL_FILE="$log_file" FILTER_RUN_ID="$filter_run_id" "$js_runtime" -e "$js_code"
