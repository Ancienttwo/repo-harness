#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/harness-trace-grade.sh --run <trace.json> [--repo <repo>] [--strict]
USAGE_EOF
}

run_file=""
repo="."
strict=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --run)
      run_file="${2:-}"
      shift 2
      ;;
    --repo)
      repo="${2:-.}"
      shift 2
      ;;
    --strict)
      strict=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

[[ -n "$run_file" ]] || { usage >&2; exit 1; }
[[ -f "$run_file" ]] || { echo "Trace run file not found: $run_file" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required for harness trace grading" >&2; exit 1; }

if REPO_ROOT="$(cd "$repo" && pwd -P 2>/dev/null)"; then
  :
else
  echo "Repo path not found: $repo" >&2
  exit 1
fi

results_file="$(mktemp)"
trap 'rm -f "$results_file"' EXIT
: > "$results_file"

record() {
  local id="$1"
  local passed="$2"
  local message="$3"
  jq -n \
    --arg id "$id" \
    --argjson passed "$passed" \
    --arg message "$message" \
    '{id: $id, passed: $passed, message: $message}' >> "$results_file"
}

trace_get() {
  local query="$1"
  jq -r "$query // empty" "$run_file"
}

schema="$(trace_get '.schema')"
active_plan="$(trace_get '.active_plan')"
task_profile="$(trace_get '.task_profile')"
review_card_verdict="$(trace_get '.review.card.verdict')"
review_card_change_type="$(trace_get '.review.card.change_type')"
review_card_rollback="$(trace_get '.review.card.rollback')"
commands_count="$(jq '.commands | if type == "array" then length else 0 end' "$run_file")"
outside_count="$(jq '.allowed_paths_check.outside | if type == "array" then length else 0 end' "$run_file")"
allowed_status="$(trace_get '.allowed_paths_check.status')"

if [[ "$schema" == "repo-harness-run-trace.v1" ]]; then
  record "schema.v1" true "trace schema is repo-harness-run-trace.v1"
else
  record "schema.v1" false "trace schema is ${schema:-missing}"
fi

if [[ -n "$active_plan" && -f "$REPO_ROOT/$active_plan" ]]; then
  record "active_plan.resolves" true "active plan resolves: $active_plan"
else
  record "active_plan.resolves" false "active plan does not resolve: ${active_plan:-missing}"
fi

case "$task_profile" in
  code-change|docs-only|ledger-closeout|migration|eval-only|delegated-run)
    record "contract_profile.valid" true "contract profile is valid: $task_profile"
    ;;
  *)
    record "contract_profile.valid" false "contract profile is invalid: ${task_profile:-missing}"
    ;;
esac

if [[ "$review_card_verdict" == "pass" ]]; then
  record "review_card.pass" true "Human Review Card verdict is pass"
else
  record "review_card.pass" false "Human Review Card verdict is ${review_card_verdict:-missing}"
fi

if [[ -n "$review_card_change_type" && "$review_card_change_type" == "$task_profile" ]]; then
  record "review_card.change_type" true "Human Review Card change type matches task profile"
else
  record "review_card.change_type" false "Human Review Card change type ${review_card_change_type:-missing} does not match task profile ${task_profile:-missing}"
fi

rollback_token="$(printf '%s' "$review_card_rollback" | sed -E 's/[;,].*$//; s/[[:space:]].*$//; s/^[[:space:]]+//; s/[[:space:]]+$//' | tr '[:upper:]' '[:lower:]')"
case "$rollback_token" in
  ""|tbd|todo|n/a|na|none|unknown|unavailable|pending|...)
    record "review_card.rollback" false "Human Review Card rollback is missing or not concrete"
    ;;
  *)
    record "review_card.rollback" true "Human Review Card rollback is concrete"
    ;;
esac

if [[ "$commands_count" -gt 0 ]] && jq -e '.commands[]? | select((.command // "") | length > 0)' "$run_file" >/dev/null; then
  record "commands.present" true "commands evidence is present"
else
  record "commands.present" false "commands evidence is missing"
fi

if [[ "$outside_count" -eq 0 && "$allowed_status" == "pass" ]]; then
  record "allowed_paths.clean" true "no changed file is outside allowed paths"
else
  record "allowed_paths.clean" false "allowed_paths status is ${allowed_status:-missing}; changed files outside allowed paths: $outside_count"
fi

failed="$(jq -s '[.[] | select(.passed == false)] | length' "$results_file")"
total="$(jq -s 'length' "$results_file")"
status="pass"
[[ "$failed" -eq 0 ]] || status="fail"

jq -s \
  --arg status "$status" \
  --arg run "$run_file" \
  --argjson total "$total" \
  --argjson failed "$failed" \
  '{status: $status, run: $run, total: $total, failed: $failed, graders: .}' "$results_file"

if [[ "$strict" -eq 1 && "$failed" -ne 0 ]]; then
  exit 1
fi
