#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/check-task-workflow.sh [--strict]
USAGE_EOF
}

strict=0

while [[ $# -gt 0 ]]; do
  case "$1" in
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

issues=0
WORKFLOW_CONTRACT_PATH=".ai/harness/workflow-contract.json"
policy_file=".ai/harness/policy.json"

report_issue() {
  local message="$1"
  echo "[workflow] $message"
  issues=$((issues + 1))
}

resolve_json_runtime() {
  if command -v node >/dev/null 2>&1; then
    printf 'node'
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    printf 'bun'
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
    return 0
  fi

  return 1
}

contract_query_lines() {
  local selector="$1"
  local runtime

  runtime="$(resolve_json_runtime || true)"
  if [[ -z "$runtime" || ! -f "$WORKFLOW_CONTRACT_PATH" ]]; then
    return 1
  fi

  case "$runtime" in
    python3)
      "$runtime" - "$WORKFLOW_CONTRACT_PATH" "$selector" <<'PY_EOF'
import json
import sys

path, selector = sys.argv[1], sys.argv[2]
value = json.load(open(path, "r", encoding="utf-8"))
for part in selector.split("."):
    value = value.get(part) if isinstance(value, dict) else None
if isinstance(value, list):
    for item in value:
        print(item)
elif value is not None:
    print(value)
PY_EOF
      ;;
    *)
      "$runtime" -e '
const fs = require("fs");
const [, filePath, selector] = process.argv;
let value = JSON.parse(fs.readFileSync(filePath, "utf8"));
for (const part of selector.split(".")) {
  value = value && typeof value === "object" ? value[part] : undefined;
}
if (Array.isArray(value)) {
  for (const item of value) {
    console.log(item);
  }
} else if (value !== undefined && value !== null) {
  console.log(value);
}
' "$WORKFLOW_CONTRACT_PATH" "$selector"
      ;;
  esac
}

get_active_plan() {
  if [[ -f ".claude/.active-plan" ]]; then
    local marker_plan
    marker_plan="$(cat ".claude/.active-plan" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" && -f "$marker_plan" ]]; then
      printf '%s' "$marker_plan"
      return 0
    fi
  fi
  local latest
  latest="$(find plans -maxdepth 1 -type f -name 'plan-*.md' 2>/dev/null | sort | tail -1)"
  if [[ -n "$latest" ]]; then
    printf '%s' "$latest"
    return 0
  fi
  return 1
}

extract_status() {
  local file="$1"
  awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" | xargs
}

todo_source_plan() {
  if [[ ! -f "${todo_file:-tasks/todo.md}" ]]; then
    return 1
  fi
  awk -F': ' '/^\> \*\*Source Plan\*\*:/ {print $2; exit}' "${todo_file:-tasks/todo.md}" | xargs
}

derive_slug() {
  basename "$1" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//'
}

derive_contract_path() {
  local plan_file="$1"
  local slug
  slug="$(derive_slug "$plan_file")"
  printf 'tasks/contracts/%s.contract.md' "$slug"
}

check_required_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    report_issue "Missing required file: $path"
  fi
}

check_required_dir() {
  local path="$1"
  if [[ ! -d "$path" ]]; then
    report_issue "Missing required directory: $path"
  fi
}

policy_get() {
  local jq_path="$1"
  local default_value="$2"

  if [[ -f "$policy_file" ]] && command -v jq >/dev/null 2>&1; then
    local value
    value="$(jq -r "$jq_path // empty" "$policy_file" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

todo_file="$(policy_get '.tasks.todo_file' 'tasks/todo.md')"
lessons_file="$(policy_get '.tasks.lessons_file' 'tasks/lessons.md')"
research_file="$(policy_get '.tasks.research_file' 'tasks/research.md')"
contracts_dir="$(policy_get '.tasks.contracts_dir' 'tasks/contracts')"
reviews_dir="$(policy_get '.tasks.reviews_dir' 'tasks/reviews')"
progress_file="$(policy_get '.progress.file' 'docs/PROGRESS.md')"
runs_dir="$(policy_get '.harness.runs_dir' '.ai/harness/runs')"
context_map_file="$(policy_get '.context.map_file' '.ai/context/context-map.json')"

check_required_dir "plans"
check_required_dir "plans/archive"
check_required_dir "tasks"
check_required_dir "tasks/archive"
check_required_dir "$contracts_dir"
check_required_dir "$reviews_dir"
check_required_dir ".claude/templates"
check_required_dir ".ai/context"
check_required_dir ".ai/harness"
check_required_dir "$runs_dir"

check_required_file "docs/spec.md"
check_required_file ".claude/templates/spec.template.md"
check_required_file ".claude/templates/plan.template.md"
check_required_file ".claude/templates/research.template.md"
check_required_file ".claude/templates/contract.template.md"
check_required_file ".claude/templates/review.template.md"
check_required_file "scripts/new-spec.sh"
check_required_file "scripts/new-sprint.sh"
check_required_file "scripts/new-plan.sh"
check_required_file "scripts/plan-to-todo.sh"
check_required_file "scripts/archive-workflow.sh"
check_required_file "scripts/prepare-handoff.sh"
check_required_file "scripts/verify-contract.sh"
check_required_file "scripts/verify-sprint.sh"
check_required_file "scripts/check-task-sync.sh"
check_required_file "scripts/check-context-files.sh"
check_required_file "scripts/ensure-task-workflow.sh"
check_required_file "scripts/check-task-workflow.sh"
check_required_file "scripts/maintenance-triage.sh"
check_required_file "$todo_file"
check_required_file "$lessons_file"
check_required_file "$research_file"
check_required_file "$progress_file"
check_required_file "$context_map_file"
check_required_file "$policy_file"

if [[ ! -f "$WORKFLOW_CONTRACT_PATH" ]]; then
  report_issue "Missing workflow contract manifest: $WORKFLOW_CONTRACT_PATH"
else
  while IFS= read -r rel_dir; do
    [[ -z "$rel_dir" ]] && continue
    check_required_dir "$rel_dir"
  done < <(contract_query_lines "artifacts.requiredDirectories" || true)

  while IFS= read -r rel_file; do
    [[ -z "$rel_file" ]] && continue
    check_required_file "$rel_file"
  done < <(contract_query_lines "artifacts.requiredFiles" || true)
fi

if [[ -f "docs/plan.md" ]]; then
  report_issue "Legacy docs/plan.md detected; migrate or archive it into plans/."
fi

if [[ -f "docs/TODO.md" ]]; then
  report_issue "Legacy docs/TODO.md detected; migrate it into tasks/todo.md."
fi

if [[ -f "$progress_file" ]] && ! grep -Fq "milestone checkpoints only" "$progress_file"; then
  report_issue "${progress_file} is not normalized for milestone-only usage."
fi

todo_source="$(todo_source_plan || true)"
if [[ -f "$todo_file" ]]; then
  if [[ -z "$todo_source" ]]; then
    if grep -q '[^[:space:]]' "$todo_file"; then
      report_issue "Legacy ${todo_file} detected; expected a '> **Source Plan**:' header."
    fi
  elif [[ "$todo_source" != "(none)" && ! -f "$todo_source" ]]; then
    report_issue "${todo_file} points to a missing source plan: $todo_source"
  fi
fi

active_plan="$(get_active_plan || true)"
if [[ -z "$active_plan" ]]; then
  if [[ "$todo_source" != "" && "$todo_source" != "(none)" ]]; then
    report_issue "tasks/todo.md points to $todo_source but no active plan exists in plans/."
  fi
else
  plan_status="$(extract_status "$active_plan")"
  if [[ -z "$plan_status" ]]; then
    report_issue "Active plan is missing a '**Status**' line: $active_plan"
  fi

  if [[ "$plan_status" == "Approved" || "$plan_status" == "Executing" ]]; then
    contract_file="$(derive_contract_path "$active_plan")"
    if [[ ! -f "$contract_file" ]]; then
      report_issue "Active $plan_status plan is missing its task contract: $contract_file"
    fi
  fi

  if [[ "$plan_status" == "Executing" ]]; then
    if [[ "$todo_source" != "$active_plan" ]]; then
      report_issue "Executing plan is $active_plan but ${todo_file} is sourced from ${todo_source:-missing header}."
    fi
  fi
fi

if [[ "$issues" -eq 0 ]]; then
  echo "[workflow] OK"
  exit 0
fi

if [[ "$strict" -eq 1 ]]; then
  exit 1
fi

echo "[workflow] Found $issues issue(s); rerun with --strict to fail the check."
