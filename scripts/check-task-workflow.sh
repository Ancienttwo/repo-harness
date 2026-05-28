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
json_runtime=""

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

ACTIVE_PLAN_MARKER=".ai/harness/active-plan"
LEGACY_ACTIVE_PLAN_MARKER=".claude/.active-plan"
ACTIVE_WORKTREE_MARKER=".ai/harness/active-worktree"

read_active_plan_marker() {
  local marker_file="$1"
  local marker_plan

  if [[ -f "$marker_file" ]]; then
    marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" && -f "$marker_plan" ]]; then
      printf '%s' "$marker_plan"
      return 0
    fi
  fi

  return 1
}

get_active_plan() {
  read_active_plan_marker "$ACTIVE_PLAN_MARKER" \
    || read_active_plan_marker "$LEGACY_ACTIVE_PLAN_MARKER"
}

extract_status() {
  local file="$1"
  awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" | xargs
}

plan_evidence_contract_error() {
  local file="$1"
  local section=""
  local missing=0

  section="$(awk '
    BEGIN { in_section = 0 }
    /^## Evidence Contract[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    in_section { print }
  ' "$file")"

  if [[ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]]; then
    echo "missing ## Evidence Contract section"
    return 1
  fi

  local label line value
  for label in "State/progress path" "Verification evidence" "Evaluator rubric" "Stop condition" "Rollback surface"; do
    line="$(printf '%s\n' "$section" | grep -Ei "^[[:space:]]*-[[:space:]]*(\\*\\*)?${label}(\\*\\*)?[[:space:]]*:" | head -1 || true)"
    if [[ -z "$line" ]]; then
      echo "missing field: ${label}"
      missing=1
      continue
    fi

    value="${line#*:}"
    value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    if [[ -z "$value" ]] || printf '%s' "$value" | grep -Eiq '^(tbd|todo|n/a|none|unknown|\.\.\.)$'; then
      echo "field has no concrete value: ${label}"
      missing=1
    fi
  done

  [[ "$missing" -eq 0 ]]
}

check_plan_template_evidence_contract() {
  local file="$1"
  local label

  grep -Eq '^## Evidence Contract[[:space:]]*$' "$file" || {
    report_issue "Plan template is missing ## Evidence Contract: $file"
    return
  }

  for label in "State/progress path" "Verification evidence" "Evaluator rubric" "Stop condition" "Rollback surface"; do
    if ! grep -Eiq "^[[:space:]]*-[[:space:]]*(\\*\\*)?${label}(\\*\\*)?[[:space:]]*:" "$file"; then
      report_issue "Plan template Evidence Contract is missing field '${label}': $file"
    fi
  done
}

todo_source_plan() {
  if [[ ! -f "${todo_file:-tasks/todo.md}" ]]; then
    return 1
  fi
  awk -F': ' '/^\> \*\*Source Plan\*\*:/ {print $2; exit}' "${todo_file:-tasks/todo.md}" | xargs
}

todo_is_deferred_ledger() {
  local file="${1:-${todo_file:-tasks/todo.md}}"
  [[ -f "$file" ]] || return 1
  grep -Eq '^# Deferred Goal Ledger[[:space:]]*$' "$file" \
    && grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' "$file"
}

todo_deferred_ledger_error() {
  local file="${1:-${todo_file:-tasks/todo.md}}"
  local missing=0

  grep -Eq '^# Deferred Goal Ledger[[:space:]]*$' "$file" || {
    echo "missing '# Deferred Goal Ledger' heading"
    missing=1
  }
  grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' "$file" || {
    echo "missing Backlog status"
    missing=1
  }
  grep -Eq '^## Deferred Goals[[:space:]]*$' "$file" || {
    echo "missing ## Deferred Goals section"
    missing=1
  }
  grep -Eq '\|[[:space:]]*Goal[[:space:]]*\|[[:space:]]*Why Deferred[[:space:]]*\|[[:space:]]*Tradeoff[[:space:]]*\|[[:space:]]*Revisit Trigger[[:space:]]*\|' "$file" || {
    echo "missing deferred-goal table with Tradeoff and Revisit Trigger"
    missing=1
  }

  [[ "$missing" -eq 0 ]]
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
notes_dir="$(policy_get '.tasks.notes_dir' 'tasks/notes')"
workstreams_dir="$(policy_get '.tasks.workstreams_dir' 'tasks/workstreams')"
runs_dir="$(policy_get '.harness.runs_dir' '.ai/harness/runs')"
context_map_file="$(policy_get '.context.map_file' '.ai/context/context-map.json')"
upgrade_strategy_version=""
if [[ -f "$policy_file" ]] && command -v jq >/dev/null 2>&1; then
  upgrade_strategy_version="$(policy_get '.upgrade.strategy_version' '')"
fi

check_required_dir "plans"
check_required_dir "plans/archive"
check_required_dir "tasks"
check_required_dir "tasks/archive"
check_required_dir "$contracts_dir"
check_required_dir "$reviews_dir"
check_required_dir "$notes_dir"
check_required_dir "$workstreams_dir"
check_required_dir ".claude/templates"
check_required_dir ".codex"
check_required_dir ".ai/context"
check_required_dir ".ai/harness"
check_required_dir "$runs_dir"

check_required_file "docs/spec.md"
check_required_file ".claude/templates/spec.template.md"
check_required_file ".claude/templates/plan.template.md"
check_required_file ".claude/templates/research.template.md"
check_required_file ".claude/templates/contract.template.md"
check_required_file ".claude/templates/review.template.md"
check_required_file ".claude/templates/implementation-notes.template.md"
check_required_file ".claude/settings.json"
check_required_file ".codex/hooks.json"
check_required_file "scripts/new-spec.sh"
check_required_file "scripts/new-sprint.sh"
check_required_file "scripts/new-plan.sh"
check_required_file "scripts/plan-to-todo.sh"
check_required_file "scripts/contract-worktree.sh"
check_required_file "scripts/archive-workflow.sh"
check_required_file "scripts/prepare-handoff.sh"
check_required_file "scripts/verify-contract.sh"
check_required_file "scripts/verify-sprint.sh"
check_required_file "scripts/check-task-sync.sh"
check_required_file "scripts/check-deploy-sql-order.sh"
check_required_file "scripts/check-context-files.sh"
check_required_file "scripts/check-brain-manifest.sh"
check_required_file "scripts/select-agent-context-blocks.sh"
check_required_file "scripts/capability-config.ts"
check_required_file "scripts/architecture-event.ts"
check_required_file "scripts/architecture-drift.sh"
check_required_file "scripts/archive-architecture-request.sh"
check_required_file "scripts/context-contract-sync.sh"
check_required_file "scripts/workstream-sync.sh"
check_required_file "scripts/ensure-task-workflow.sh"
check_required_file "scripts/check-task-workflow.sh"
check_required_file "scripts/maintenance-triage.sh"
check_required_file "$todo_file"
check_required_file "$lessons_file"
check_required_file "$research_file"
check_required_file "$context_map_file"
check_required_file "$policy_file"
check_required_file "$(policy_get '.information_lifecycle.external_knowledge.manifest_file' '.ai/harness/brain-manifest.json')"

if [[ -f ".claude/templates/plan.template.md" ]]; then
  check_plan_template_evidence_contract ".claude/templates/plan.template.md"
fi

if [[ -f "$policy_file" && -z "$upgrade_strategy_version" ]] && command -v jq >/dev/null 2>&1; then
  report_issue "Harness policy is missing upgrade.strategy_version; rerun migration to merge the versioned upgrade strategy."
fi

if [[ ! -f "$WORKFLOW_CONTRACT_PATH" ]]; then
  report_issue "Missing workflow contract manifest: $WORKFLOW_CONTRACT_PATH"
else
  json_runtime="$(resolve_json_runtime || true)"
  if [[ -z "$json_runtime" ]]; then
    report_issue "Missing node, bun, or python3 to read workflow contract manifest: $WORKFLOW_CONTRACT_PATH"
  else
    while IFS= read -r rel_dir; do
      [[ -z "$rel_dir" ]] && continue
      check_required_dir "$rel_dir"
    done < <(contract_query_lines "artifacts.requiredDirectories")

    while IFS= read -r rel_file; do
      [[ -z "$rel_file" ]] && continue
      check_required_file "$rel_file"
    done < <(contract_query_lines "artifacts.requiredFiles")
  fi
fi

if [[ -f "docs/plan.md" ]]; then
  report_issue "Legacy docs/plan.md detected; migrate or archive it into plans/."
fi

if [[ -f "docs/TODO.md" ]]; then
  report_issue "Legacy docs/TODO.md detected; migrate it into tasks/todo.md."
fi

if [[ -f "scripts/check-deploy-sql-order.sh" ]]; then
  if ! bash "scripts/check-deploy-sql-order.sh" --quiet; then
    report_issue "Deploy SQL order check failed."
  fi
fi

if [[ -f "scripts/check-brain-manifest.sh" ]]; then
  if ! bash "scripts/check-brain-manifest.sh"; then
    report_issue "Brain manifest check failed."
  fi
fi

if [[ -f "scripts/sync-brain-docs.sh" ]]; then
  if ! bash "scripts/sync-brain-docs.sh" --check; then
    report_issue "Brain doc sync check failed."
  fi
fi

todo_source="$(todo_source_plan || true)"
if [[ -f "$todo_file" ]]; then
  if grep -q '[^[:space:]]' "$todo_file"; then
    if ! todo_is_deferred_ledger "$todo_file"; then
      report_issue "Legacy ${todo_file} detected; expected a deferred-goal ledger, not an active execution checklist."
    elif ! ledger_error="$(todo_deferred_ledger_error "$todo_file")"; then
      report_issue "${todo_file} deferred ledger is incomplete: ${ledger_error//$'\n'/; }"
    fi
  fi
fi

active_plan="$(get_active_plan || true)"
if [[ -z "$active_plan" ]]; then
  if [[ -f "$ACTIVE_WORKTREE_MARKER" ]]; then
    report_issue "$ACTIVE_WORKTREE_MARKER exists but no active plan marker resolves to a plan."
  fi
else
  if [[ ! -f "$ACTIVE_WORKTREE_MARKER" ]]; then
    report_issue "Active plan marker exists but $ACTIVE_WORKTREE_MARKER is missing."
  else
    current_worktree="$(pwd -P)"
    marked_worktree="$(cat "$ACTIVE_WORKTREE_MARKER" 2>/dev/null | xargs || true)"
    if [[ -z "$marked_worktree" ]]; then
      report_issue "$ACTIVE_WORKTREE_MARKER is empty."
    elif [[ "$marked_worktree" != "$current_worktree" ]]; then
      report_issue "$ACTIVE_WORKTREE_MARKER points to $marked_worktree, expected $current_worktree."
    fi
  fi

  plan_status="$(extract_status "$active_plan")"
  if [[ -z "$plan_status" ]]; then
    report_issue "Active plan is missing a '**Status**' line: $active_plan"
  fi

  if [[ "$plan_status" == "Approved" || "$plan_status" == "Executing" ]]; then
    if ! evidence_error="$(plan_evidence_contract_error "$active_plan")"; then
      report_issue "Active $plan_status plan has incomplete Evidence Contract: $active_plan (${evidence_error//$'\n'/; })"
    fi

    contract_file="$(derive_contract_path "$active_plan")"
    if [[ ! -f "$contract_file" ]]; then
      report_issue "Active $plan_status plan is missing its task contract: $contract_file"
    elif ! grep -Eq '^> \*\*Capability ID\*\*: .+' "$contract_file"; then
      report_issue "Active task contract is missing a capability binding: $contract_file"
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
