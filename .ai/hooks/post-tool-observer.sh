#!/bin/bash
# Post-Tool Observer — PostToolUse (all tools)
# Single pass per tool call: JSONL trace logging plus lightweight advisories.
# Replaces the former split observers so the always-route costs one dispatch,
# one stdin parse, and one library load instead of two.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/session-state.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

mkdir -p .claude

TRACE_FILE="$(workflow_trace_file)"
SESSION_ID_FILE=".claude/.session-id"

observer_load_fast_fields() {
  local arg="${1:-}"
  local -a fields=()
  local field
  local session_id=""

  hook_read_stdin_once
  [[ -n "$HOOK_STDIN_JSON" ]] || return 1
  command -v jq >/dev/null 2>&1 || return 1

  while IFS= read -r -d '' field; do
    fields+=("$field")
  done < <(
    printf '%s' "$HOOK_STDIN_JSON" | jq -j '
      def scalar:
        if . == null then ""
        elif type == "array" or type == "object" then tojson
        else tostring
        end;
      [
        (.hook_event_name // "PostToolUse"),
        (.tool_name // .hook_event_name // ""),
        (.file_path // .tool_input.file_path // .trigger_file_path // .parent_file_path // ""),
        (.tool_response.exit_code // .exit_code // ""),
        (.duration_ms // .tool_response.duration_ms // ""),
        (.run_id // .tool_input.run_id // ""),
        (.session_id // ""),
        (.source // "")
      ] | map(scalar) | .[] | ., "\u0000"
    ' 2>/dev/null
  )

  [[ "${#fields[@]}" -eq 8 ]] || return 1

  HOOK_STDIN_JSON_VALID=1
  export HOOK_STDIN_JSON_VALID

  event_type="${fields[0]}"
  tool_name="${fields[1]}"
  file_path="${fields[2]}"
  exit_code="${fields[3]}"
  duration_ms="${fields[4]}"
  run_id="${fields[5]}"
  session_id="${fields[6]}"
  session_source="${fields[7]:-${CLAUDE_SESSION_SOURCE:-}}"

  if [[ -n "$file_path" ]]; then
    file_path="$(hook_normalize_file_path "$file_path")"
  elif [[ -n "${CLAUDE_FILE_PATH:-}" ]]; then
    file_path="$(hook_normalize_file_path "$CLAUDE_FILE_PATH")"
  fi

  tool_name="${tool_name:-${HOOK_TOOL_NAME:-}}"
  exit_code="${exit_code:-${EXIT_CODE:-0}}"
  duration_ms="${duration_ms:-${HOOK_DURATION_MS:-0}}"

  if [[ -n "$session_id" ]]; then
    HOOK_SESSION_ID="$session_id"
    export HOOK_SESSION_ID
  fi

  if [[ -n "$run_id" ]]; then
    HOOK_RUN_ID="$run_id"
    export HOOK_RUN_ID
  elif [[ -n "${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-}}" ]]; then
    run_id="${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-}}"
    HOOK_RUN_ID="$run_id"
    export HOOK_RUN_ID
  elif [[ -n "$session_id" ]]; then
    run_id="run-$(hook_sanitize_token "${session_source:-session}")-$(hook_sanitize_token "$session_id")"
    HOOK_RUN_ID="$run_id"
    export HOOK_RUN_ID
  else
    run_id="$(hook_get_run_id "$arg")"
  fi
}

observer_load_compat_fields() {
  local arg="${1:-}"

  event_type="$(hook_json_get '.hook_event_name' 'PostToolUse')"
  tool_name="$(hook_get_tool_name "$arg")"
  file_path="$(hook_get_file_path "$arg")"
  exit_code="$(hook_get_exit_code "$arg")"
  duration_ms="$(hook_get_duration_ms "$arg")"
  run_id="$(hook_get_run_id "$arg")"
  session_source="$(hook_get_session_source "$arg")"
}

# --- Trace logging ---

observer_load_fast_fields "${1:-}" || observer_load_compat_fields "${1:-}"

SESSION_KEY="$(session_state_resolve_key "$SESSION_ID_FILE" "${1:-}")"

agent_name="${CLAUDE_AGENT_NAME:-${CODEX_AGENT_NAME:-${HOOK_AGENT_NAME:-unknown}}}"
session_source="${session_source:-${CODEX_SESSION_SOURCE:-}}"
host="unknown"

tool_name="${tool_name:-unknown}"
file_path="${file_path:-}"
exit_code="${exit_code:-0}"
duration_ms="${duration_ms:-0}"
run_id="${run_id:-unknown}"
session_source="${session_source:-unknown}"

case "$tool_name" in
  mcp__codegraph__*|codegraph_*)
    session_state_mark_codegraph_used "$SESSION_KEY" || true
    ;;
esac

if [[ -n "${CODEX_SESSION_ID:-${CODEX_AGENT_NAME:-}}" ]] || [[ "$session_source" =~ [Cc]odex ]]; then
  host="codex"
elif [[ -n "${CLAUDE_SESSION_ID:-${CLAUDE_AGENT_NAME:-}}" ]] || [[ "$session_source" =~ [Cc]laude ]]; then
  host="claude"
fi

# Rotate trace log when it exceeds MAX_TRACE_LINES
MAX_TRACE_LINES=10000
KEEP_TRACE_LINES=5000
if [[ -f "$TRACE_FILE" ]]; then
  line_count="$(wc -l < "$TRACE_FILE" | tr -d ' ')"
  if [[ "$line_count" -gt "$MAX_TRACE_LINES" ]]; then
    tmp_trace="$(mktemp)"
    tail -n "$KEEP_TRACE_LINES" "$TRACE_FILE" > "$tmp_trace"
    mv "$tmp_trace" "$TRACE_FILE"
  fi
fi

# The trace file is the single tool-trace record; handoff "Commands Run"
# reads it directly instead of a duplicate events.jsonl append per call.
printf '{"ts":"%s","event_type":"%s","tool_name":"%s","file_path":"%s","exit_code":%s,"duration_ms":%s,"session_key":"%s","run_id":"%s","host":"%s","agent_name":"%s","session_source":"%s"}\n' \
  "$(hook_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")" \
  "$(hook_json_escape "$event_type")" \
  "$(hook_json_escape "$tool_name")" \
  "$(hook_json_escape "$file_path")" \
  "$exit_code" \
  "$duration_ms" \
  "$(hook_json_escape "$SESSION_KEY")" \
  "$(hook_json_escape "$run_id")" \
  "$(hook_json_escape "$host")" \
  "$(hook_json_escape "$agent_name")" \
  "$(hook_json_escape "$session_source")" \
  >> "$TRACE_FILE"

# --- Codex plan-change advisory ---

emit_codex_plan_change_guard() {
  local changed_plan

  if [[ "$tool_name" != "apply_patch" ]]; then
    return 0
  fi

  changed_plan="$(has_changes_glob '^plans/plan-.*\.md$' || true)"
  if [[ -n "$changed_plan" ]]; then
    echo "[AnnotationGuard] ${changed_plan} has annotations. Process all notes and revise. Do not implement yet."
  fi
}

emit_codex_plan_change_guard
