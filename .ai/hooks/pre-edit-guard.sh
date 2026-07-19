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

if [[ "${REPO_HARNESS_APPLY_PATCH_PATH_EXPANDED:-0}" != "1" ]]; then
  APPLY_PATCH_COMMAND="$(hook_json_get '.tool_input.command' '')"
  if [[ -n "$APPLY_PATCH_COMMAND" ]]; then
    APPLY_PATCH_PATHS="$(hook_get_apply_patch_paths | sed '/^[[:space:]]*$/d')"
    if [[ -z "$APPLY_PATCH_PATHS" ]]; then
      hook_structured_error \
        "ApplyPatchScopeGuard" \
        "Codex apply_patch input did not expose a parseable target path." \
        "Use a standard *** Add/Update/Delete File patch header so every target can be checked before the write." \
        "state_violation"
      exit 2
    fi
    while IFS= read -r expanded_path || [[ -n "$expanded_path" ]]; do
      [[ -n "$expanded_path" ]] || continue
      expanded_payload="{\"tool_input\":{\"file_path\":\"$(hook_json_escape "$expanded_path")\",\"command\":\"$(hook_json_escape "$APPLY_PATCH_COMMAND")\"}}"
      set +e
      printf '%s' "$expanded_payload" | REPO_HARNESS_APPLY_PATCH_PATH_EXPANDED=1 bash "$0"
      expanded_status=$?
      set -e
      [[ "$expanded_status" -eq 0 ]] || exit "$expanded_status"
    done <<< "$APPLY_PATCH_PATHS"
    exit 0
  fi
fi

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
  echo "  Follow operations.deploy_sql in .ai/harness/policy.json when configured; otherwise keep SQL directly under deploy/sql/ with 4-digit ascending prefixes."
fi

resolve_edit_workflow_profile() {
  local source_cli output args target_paths patch_command patch_paths path cli_status
  source_cli="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/src/cli/index.ts"

  # A recursive apply_patch expansion still carries the original patch command
  # in its payload (see the expansion loop above). Re-extract the full batch
  # path set so every recursive check evaluates the same atomic action's full
  # pending write scope instead of only its own single expanded path — batch
  # siblings are not yet on disk, so the diff-merge in state-snapshot.ts can't
  # see them on its own. Non-patch edits keep the single-path call untouched.
  target_paths=()
  patch_command=""
  if [[ "${REPO_HARNESS_APPLY_PATCH_PATH_EXPANDED:-0}" == "1" ]]; then
    patch_command="$(hook_json_get '.tool_input.command' '')"
  fi
  if [[ -n "$patch_command" ]]; then
    patch_paths="$(hook_get_apply_patch_paths | sed '/^[[:space:]]*$/d')"
    while IFS= read -r path || [[ -n "$path" ]]; do
      [[ -n "$path" ]] || continue
      target_paths+=("$path")
    done <<< "$patch_paths"
  fi
  [[ "${#target_paths[@]}" -gt 0 ]] || target_paths=("$FILE_PATH")

  # --field workflow_profile is a pure output projection on top of the same
  # resolver (src/cli/commands/state.ts): it prints just the resolved profile
  # instead of the full JSON document, so this needs exactly one Bun cold
  # start instead of one to resolve state plus a second `bun -e` just to
  # parse `workflow_profile` back out of the JSON it already produced.
  args=(state resolve --json --field workflow_profile)
  if [[ -n "${REPO_HARNESS_WORKFLOW_PROFILE:-}" ]]; then
    args+=(--profile "$REPO_HARNESS_WORKFLOW_PROFILE")
  fi
  args+=(--operation edit --target-path "${target_paths[@]}")
  # The CLI's real exit code is the authoritative blocked/ok signal (state.ts
  # exits non-zero whenever `blockers` is non-empty, e.g. an invalid capability
  # registry) -- it must be captured, not discarded, or a blocker that still
  # happens to leave a resolvable profile value on stdout (registry corruption
  # alongside an otherwise-valid risk floor) silently bypasses every downstream
  # guard. set +e/-e brackets the call so a non-zero exit here does not trip
  # this script's own `set -e` before the status can be read (same idiom as
  # the apply_patch recursion above).
  set +e
  if [[ -n "${REPO_HARNESS_CLI:-}" && -f "${REPO_HARNESS_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    output="$(bun "$REPO_HARNESS_CLI" "${args[@]}" 2>/dev/null)"
    cli_status=$?
  elif command -v repo-harness >/dev/null 2>&1; then
    output="$(repo-harness "${args[@]}" 2>/dev/null)"
    cli_status=$?
  elif [[ -f "$source_cli" ]] && command -v bun >/dev/null 2>&1; then
    output="$(bun "$source_cli" "${args[@]}" 2>/dev/null)"
    cli_status=$?
  else
    output=""
    cli_status=1
  fi
  set -e
  [[ "$cli_status" -eq 0 && -n "$output" ]] || return 1
  printf '%s' "$output"
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
# Canonical source: src/effects/review/diff-fingerprint.ts's
# WORKFLOW_SURFACE_DIR_PREFIXES / WORKFLOW_SURFACE_EXTENSIONS
# (isWorkflowSurfacePath / isImplementationSurfacePath). This case list must
# stay in the same shape as that TS source; `bun run check:hooks`
# (scripts/sync-hook-sources.ts) fails on drift between the two.
is_workflow_surface_path() {
  case "$1" in
    plans/*|tasks/*|docs/*|.ai/*|.claude/*|.codex/*) return 0 ;;
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

# Single authority for the known-good plan-status vocabulary: reads
# .ai/harness/policy.json's active_plan.statuses array (owner-decided,
# 2026-07-20 falsifier resolution) rather than hardcoding a second list in
# this guard. Prints one known status per line. Empty output covers every
# "authority unavailable" case alike (missing policy.json, missing jq,
# missing active_plan.statuses key, or an empty array) -- the caller must
# treat empty output as fail-closed, not as "nothing to check against".
plan_status_known_values() {
  local policy_file=".ai/harness/policy.json"
  [[ -f "$policy_file" ]] || return 0
  command -v jq >/dev/null 2>&1 || return 0
  jq -r '.active_plan.statuses[]? // empty' "$policy_file" 2>/dev/null
}

# True (0) when $1 exactly matches one line of the newline-separated known
# statuses in $2. Byte-equal comparison: no case-folding, no trimming.
plan_status_is_known() {
  local status="$1"
  local known_values="$2"
  local candidate
  while IFS= read -r candidate; do
    [[ "$candidate" == "$status" ]] && return 0
  done <<< "$known_values"
  return 1
}

# Edit-layer plan gate: the deterministic enforcement point for "no
# implementation edits without an approved plan". The prompt layer only
# advises (natural-language intent guessing is unreliable); this gate keys
# off path + plan state. Modes: enforce (default) | advice | off, via
# REPO_HARNESS_EDIT_PLAN_GATE or policy .guards.edit_plan_gate.
run_edit_plan_gate() {
  local mode gate_plan gate_status known_statuses
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
    *)
      known_statuses="$(plan_status_known_values)"
      if [[ -z "$known_statuses" ]]; then
        echo "[PlanStatusGuard] Plan-status authority unavailable (.ai/harness/policy.json active_plan.statuses is missing, empty, or unreadable); implementation edit: $FILE_PATH"
        if [[ "$mode" == "advice" ]]; then
          echo "[PlanStatusGuard] Advisory: restore active_plan.statuses in .ai/harness/policy.json (the single known-status authority) before implementation."
        else
          hook_structured_error \
            "PlanStatusGuard" \
            "Implementation edit to $FILE_PATH could not be checked against plan-status authority: .ai/harness/policy.json is missing, unreadable, or has no active_plan.statuses array." \
            "Restore active_plan.statuses in .ai/harness/policy.json (the single known-status authority) before implementation." \
            "missing_artifact"
          exit 2
        fi
      elif ! plan_status_is_known "$gate_status" "$known_statuses"; then
        echo "[PlanStatusGuard] Plan status '$gate_status' in $gate_plan is not in the known-status authority; implementation edit: $FILE_PATH"
        if [[ "$mode" == "advice" ]]; then
          echo "[PlanStatusGuard] Advisory: fix the plan Status header in $gate_plan to a known value, or add '$gate_status' to active_plan.statuses in .ai/harness/policy.json if it is a legitimate new status."
        else
          hook_structured_error \
            "PlanStatusGuard" \
            "Implementation edit to $FILE_PATH while plan status '$gate_status' in $gate_plan is not in the known-status authority (.ai/harness/policy.json active_plan.statuses)." \
            "Fix the plan Status header in $gate_plan to a known value, or add '$gate_status' to active_plan.statuses in .ai/harness/policy.json if it is a legitimate new status." \
            "state_violation"
          exit 2
        fi
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
