#!/bin/bash
# Pre-Edit Guard — PreToolUse on Edit|Write
# Combines asset-layer warnings with TDD/BDD reminders.

set -eo pipefail
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

FILE_PATH="$(hook_get_file_path "${1:-}")"
WRITE_PAYLOAD="$(hook_get_write_payload "${1:-}")"
[[ -z "$FILE_PATH" ]] && exit 0

is_private_ops_path() {
  case "$1" in
    _ops/*) return 0 ;;
    *)
      return 1
      ;;
  esac
}

is_repo_scoped_path() {
  [[ -n "$1" && "$1" != /* ]]
}

if [[ "$FILE_PATH" == _ref/* ]]; then
  echo "[ExternalReferenceGuard] $FILE_PATH is under _ref/."
  hook_structured_error \
    "ExternalReferenceGuard" \
    "_ref/ is external comparison material and is not a product edit surface." \
    "Refresh _ref/ from upstream sources when needed, keep it ignored, and do not edit it as repo implementation." \
    "state_violation"
  exit 2
fi

if is_private_ops_path "$FILE_PATH"; then
  echo "[OpsPrivateGuard] $FILE_PATH is under ignored private operations state."
  hook_structured_error \
    "OpsPrivateGuard" \
    "_ops/ is local private operations state for secrets, real env files, provider state, artifacts, logs, and scratch files." \
    "Commit deploy/ runbooks, release checklists, scripts, submissions, and env examples; do not write _ops/* through agent edits." \
    "state_violation"
  exit 2
fi

if [[ "$FILE_PATH" == deploy/* ]]; then
  echo "[DeployAsset] Deployment operations asset detected: $FILE_PATH"
  echo "  deploy/ is trackable for runbooks, submission materials, release checklists, scripts, ordered SQL, and env examples."
  echo "  Keep deployment SQL directly under deploy/sql/ with 4-digit ascending prefixes."
fi

resolve_edit_workflow_profile() {
  local source_cli output args
  source_cli="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/src/cli/index.ts"
  args=(state resolve --json --target-path "$FILE_PATH" --operation edit)
  if [[ -n "${REPO_HARNESS_WORKFLOW_PROFILE:-}" ]]; then
    args+=(--profile "$REPO_HARNESS_WORKFLOW_PROFILE")
  fi
  if [[ -n "${REPO_HARNESS_CLI:-}" && -f "${REPO_HARNESS_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    output="$(bun "$REPO_HARNESS_CLI" "${args[@]}" 2>/dev/null || true)"
  elif command -v repo-harness >/dev/null 2>&1; then
    output="$(repo-harness "${args[@]}" 2>/dev/null || true)"
  elif [[ -f "$source_cli" ]] && command -v bun >/dev/null 2>&1; then
    output="$(bun "$source_cli" "${args[@]}" 2>/dev/null || true)"
  else
    output=""
  fi
  [[ -n "$output" ]] || return 1
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$output" | jq -r '.workflow_profile // empty'
  elif command -v bun >/dev/null 2>&1; then
    STATE_JSON="$output" bun -e 'const s=JSON.parse(process.env.STATE_JSON); if (s.workflow_profile) console.log(s.workflow_profile)'
  fi
}

WORKFLOW_PROFILE="$(resolve_edit_workflow_profile || true)"
case "$WORKFLOW_PROFILE" in
  lite|standard|strict) ;;
  *)
    echo "[WorkflowProfileGuard] Unable to resolve a deterministic workflow profile for $FILE_PATH"
    hook_structured_error \
      "WorkflowProfileGuard" \
      "Deterministic workflow profile resolution failed for $FILE_PATH." \
      "Run repo-harness state resolve --json --target-path '$FILE_PATH' --operation edit and resolve its blockers." \
      "state_violation"
    exit 2
    ;;
esac

active_contract="$(workflow_active_contract || true)"
if is_repo_scoped_path "$FILE_PATH" && [[ -n "$active_contract" && -f "$active_contract" ]]; then
  if ! workflow_contract_allows_path "$active_contract" "$FILE_PATH"; then
    echo "[ContractScopeGuard] $FILE_PATH is outside the active sprint contract: $active_contract"
    hook_structured_error \
      "ContractScopeGuard" \
      "$FILE_PATH is outside the allowed_paths declared in $active_contract." \
      "Update the sprint contract allowed_paths or keep edits within the approved scope." \
      "contract_failure"
    exit 2
  fi
fi

# Workflow surfaces (plans, tasks, docs, harness state, markdown) stay
# editable without an active plan; everything else is an implementation edit.
is_workflow_surface_path() {
  case "$1" in
    plans/*|tasks/*|docs/*|deploy/*|.ai/*|.claude/*|.codex/*|.github/*) return 0 ;;
    *.md|*.markdown) return 0 ;;
    *) return 1 ;;
  esac
}

edit_plan_gate_mode() {
  local mode="${REPO_HARNESS_EDIT_PLAN_GATE:-}"
  if [[ -z "$mode" ]]; then
    mode="$(workflow_policy_get '.guards.edit_plan_gate' 'enforce')"
  fi
  printf '%s' "$mode"
}

# Edit-layer plan gate: the deterministic enforcement point for "no
# implementation edits without an approved plan". The prompt layer only
# advises (natural-language intent guessing is unreliable); this gate keys
# off path + plan state. Modes: enforce (default) | advice | off, via
# REPO_HARNESS_EDIT_PLAN_GATE or policy .guards.edit_plan_gate.
run_edit_plan_gate() {
  local mode gate_plan gate_status
  mode="$(edit_plan_gate_mode)"
  [[ "$mode" == "off" ]] && return 0
  is_repo_scoped_path "$FILE_PATH" || return 0
  is_workflow_surface_path "$FILE_PATH" && return 0
  [[ "$WORKFLOW_PROFILE" == "lite" ]] && return 0

  if [[ ! -f "docs/spec.md" ]]; then
    echo "[SpecGuard] Implementation edit without docs/spec.md: $FILE_PATH"
    if [[ "$mode" == "advice" ]]; then
      echo "[SpecGuard] Advisory: run repo-harness run new-spec and capture stable product intent."
    else
      hook_structured_error \
        "SpecGuard" \
        "Implementation edit to $FILE_PATH without docs/spec.md." \
        "Run repo-harness run new-spec and capture stable product intent before implementing." \
        "missing_artifact"
      exit 2
    fi
  fi

  gate_plan="$(get_active_plan || true)"
  if [[ -z "$gate_plan" || ! -f "$gate_plan" ]]; then
    echo "[PlanStatusGuard] No active plan covers implementation edit: $FILE_PATH"
    if [[ "$mode" == "advice" ]]; then
      echo "[PlanStatusGuard] Advisory: capture the approved plan with repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --execute"
    else
      hook_structured_error \
        "PlanStatusGuard" \
        "Implementation edit to $FILE_PATH without an active plan." \
        "Capture the approved planning output with repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --execute, or set policy .guards.edit_plan_gate to advice/off for this repo." \
        "missing_artifact"
      exit 2
    fi
    return 0
  fi

  gate_status="$(get_plan_status "$gate_plan")"
  case "$gate_status" in
    Draft|Annotating)
      echo "[PlanStatusGuard] Plan status is '$gate_status' in $gate_plan; implementation edit: $FILE_PATH"
      if [[ "$mode" == "advice" ]]; then
        echo "[PlanStatusGuard] Advisory: complete the annotation cycle and move the plan to Approved before implementation."
      else
        hook_structured_error \
          "PlanStatusGuard" \
          "Implementation edit to $FILE_PATH while plan status is $gate_status in $gate_plan." \
          "Complete the annotation cycle and move the plan to Approved before implementation." \
          "state_violation"
        exit 2
      fi
      ;;
  esac
}

run_edit_plan_gate

if [[ "$WORKFLOW_PROFILE" == "strict" ]] && is_repo_scoped_path "$FILE_PATH" && ! is_workflow_surface_path "$FILE_PATH"; then
  if [[ -z "$active_contract" || ! -f "$active_contract" ]]; then
    echo "[StrictContractGuard] Strict profile requires an active contract for $FILE_PATH"
    hook_structured_error \
      "StrictContractGuard" \
      "Strict workflow edit to $FILE_PATH has no active contract." \
      "Create the plan/contract worktree with repo-harness run plan-to-todo before editing." \
      "missing_artifact"
    exit 2
  fi
  if ! workflow_is_linked_worktree; then
    echo "[StrictWorktreeGuard] Strict profile requires an isolated contract worktree for $FILE_PATH"
    hook_structured_error \
      "StrictWorktreeGuard" \
      "Strict workflow edit to $FILE_PATH is not running in a linked contract worktree." \
      "Start or enter the contract worktree before editing high-risk implementation paths." \
      "state_violation"
    exit 2
  fi
fi

if [[ "$FILE_PATH" =~ ^plans/plan-.*\.md$ ]] && [[ -f "$FILE_PATH" || -n "$WRITE_PAYLOAD" ]]; then
  current_status=""
  if [[ -f "$FILE_PATH" ]]; then
    current_status="$(get_plan_status "$FILE_PATH" || true)"
  fi
  next_status="$(workflow_extract_status_from_text "$WRITE_PAYLOAD")"

  if [[ -n "$current_status" && -n "$next_status" && "$current_status" != "$next_status" ]]; then
    if [[ "$WRITE_PAYLOAD" == *"[NOTE]:"* ]]; then
      note_count="$(workflow_plan_note_count_in_text "$WRITE_PAYLOAD")"
    else
      note_count="$(workflow_plan_note_count "$FILE_PATH")"
    fi

    if ! transition_error="$(validate_plan_transition "$current_status" "$next_status" "$note_count")"; then
      echo "[PlanTransitionGuard] $transition_error"
      hook_structured_error \
        "PlanTransitionGuard" \
        "$transition_error" \
        "Respect the Draft -> Annotating -> Approved flow and resolve required [NOTE]: annotations before changing status." \
        "state_violation"
      exit 2
    fi
  fi
fi

if echo "$FILE_PATH" | grep -qE "(^|/)(interfaces|tests)(/|$)|(^|/)docs/spec\.md$|(^|/)specs/|(^|/)tasks/contracts/|(\.contract\.|\.spec\.)"; then
  echo "[AssetLayer] Immutable file detected: $FILE_PATH"
  echo "  资产层文件被修改，需同步重写下游实现。"
fi

[[ ! "$FILE_PATH" =~ \.(ts|tsx|js|jsx|py)$ ]] && exit 0

is_pure_barrel_file() {
  local file="$1"
  local saw_export="false"

  [[ -f "$file" ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="${line#${line%%[![:space:]]*}}"
    line="${line%${line##*[![:space:]]}}"

    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^// ]] && continue
    [[ "$line" =~ ^/\* ]] && continue
    [[ "$line" =~ ^\* ]] && continue
    [[ "$line" =~ ^\*/$ ]] && continue

    if [[ "$line" =~ ^export([[:space:]]+type)?[[:space:]] ]]; then
      saw_export="true"
      continue
    fi

    return 1
  done < "$file"

  [[ "$saw_export" == "true" ]]
}

for p in "\.config\." "\.d\.ts$" "types\.ts$" "constants\." \
         "\.test\." "\.spec\." "__tests__" "__mocks__" "\.stories\."; do
  [[ "$FILE_PATH" =~ $p ]] && exit 0
done

if [[ "$FILE_PATH" =~ (^|/)index\.(ts|tsx|js|jsx)$ ]] && is_pure_barrel_file "$FILE_PATH"; then
  exit 0
fi

dir=$(dirname "$FILE_PATH")
name="${FILE_PATH##*/}"; name="${name%.*}"
ext="${FILE_PATH##*.}"

found=false
for candidate in \
  "${dir}/${name}.test.${ext}" \
  "${dir}/__tests__/${name}.test.${ext}" \
  "${dir/\/src\//\/tests\/}/${name}.test.${ext}"; do
  [[ -f "$candidate" ]] && found=true && break
done

if [[ "$found" == false ]]; then
  if [[ "$FILE_PATH" =~ \.(tsx|jsx)$ ]]; then
    echo "[BDD Guard] No scenario test found for $(basename "$FILE_PATH")"
    echo "  UI component detected: define Given-When-Then acceptance scenarios first."
  else
    echo "[TDD Guard] No test file found for $(basename "$FILE_PATH")"
    echo "  Reminder: write a failing test first, then implement."
  fi
fi
