#!/bin/bash
# Stop Orchestrator Hook - Stop
# Refreshes handoff state and, for pending planning discussions, forces one
# self-review pass before the agent stops.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

plan_completeness_state_file() {
  workflow_repo_relative_path \
    "$(workflow_policy_get '.planning.completeness_state_file' '.ai/harness/planning/plan-completeness.json')" \
    '.ai/harness/planning/plan-completeness.json' \
    '.ai/harness/'
}

plan_completeness_signature() {
  local kind prompt_slug draft_path source_ref created_at

  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  prompt_slug="$(workflow_pending_orchestration_field prompt_slug 2>/dev/null || true)"
  draft_path="$(workflow_pending_orchestration_field draft_plan_path 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  created_at="$(workflow_pending_orchestration_field created_at 2>/dev/null || true)"

  printf '%s|%s|%s|%s|%s' \
    "${kind:-unknown}" \
    "${prompt_slug:-planning}" \
    "${draft_path:-none}" \
    "${source_ref:-none}" \
    "${created_at:-unknown}"
}

plan_completeness_last_signature() {
  local state_file value
  state_file="$(plan_completeness_state_file)"
  [[ -f "$state_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    value="$(jq -r '.last_signature // empty' "$state_file" 2>/dev/null || true)"
  else
    value="$(
      awk '
        /"last_signature"/ {
          line = $0
          sub(/^[^:]*:[[:space:]]*"/, "", line)
          sub(/"[[:space:]]*,?[[:space:]]*$/, "", line)
          print line
          exit
        }
      ' "$state_file"
    )"
  fi

  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

plan_completeness_record_signature() {
  local signature="$1"
  local state_file
  state_file="$(plan_completeness_state_file)"
  mkdir -p "$(dirname "$state_file")"

  if command -v jq >/dev/null 2>&1; then
    jq -nc \
      --arg signature "$signature" \
      --arg updated_at "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
      '{version:1,last_signature:$signature,updated_at:$updated_at}' > "$state_file"
    return 0
  fi

  cat > "$state_file" <<EOF_STATE
{"version":1,"last_signature":"$(workflow_json_escape "$signature")","updated_at":"$(workflow_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")"}
EOF_STATE
}

assistant_message_looks_like_plan() {
  local message="$1"
  local length

  length="$(printf '%s' "$message" | wc -c | tr -d ' ')"
  [[ "${length:-0}" -ge 240 ]] || return 1

  printf '%s\n' "$message" | grep -qEi \
    '(Approved design summary|Building|Not building|Approach|Key decisions|Unknowns|Task Breakdown|Evidence Contract|P1|P2|P3|plan|design|方案|计划|设计)'
}

emit_stop_block_json() {
  local reason="$1"

  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg reason "$reason" '{decision:"block",reason:$reason}'
    return 0
  fi

  printf '{"decision":"block","reason":"%s"}\n' "$(workflow_json_escape "$reason")"
}

refresh_handoff() {
  workflow_write_handoff "session-stop"
  echo "[FinalizeHandoff] Refreshed $(workflow_handoff_file)." >&2
}

should_run_plan_completeness_gate() {
  local stop_active="$1"
  local last_message="$2"
  local active_plan

  [[ "$stop_active" != "true" ]] || return 1
  workflow_pending_orchestration_is_fresh || return 1

  # If a repo plan is already active, the normal plan status gates own the next
  # transition. This gate only covers host planning output that still needs
  # capture.
  active_plan="$(get_active_plan || true)"
  [[ -z "$active_plan" || ! -f "$active_plan" ]] || return 1

  assistant_message_looks_like_plan "$last_message"
}

refresh_handoff

stop_hook_active="$(hook_json_get '.stop_hook_active' 'false')"
last_assistant_message="$(hook_json_get '.last_assistant_message' '')"

if should_run_plan_completeness_gate "$stop_hook_active" "$last_assistant_message"; then
  signature="$(plan_completeness_signature)"
  if [[ "$(plan_completeness_last_signature 2>/dev/null || true)" != "$signature" ]]; then
    plan_completeness_record_signature "$signature"
    summary="$(workflow_pending_orchestration_summary)"
    emit_stop_block_json "[PlanCompletenessGate] A first planning answer was produced while pending orchestration is still open: ${summary}

Before stopping, run one self-review pass on the plan. Do not implement. Check for missing goal/success criteria, scope/non-scope, constraints, P1 component map, P2 traced path, P3 decision rationale, fragile assumption, rejected alternative, public API/config/file-interface changes, external dependency/API key requirements, tests, rollback/failure handling, phase independence, and no placeholders. If the plan is already complete, say so explicitly and keep the revision concise. Then stop and wait for user approval."
  fi
fi
