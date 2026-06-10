#!/bin/bash
# Post-Tool Observer — PostToolUse (all tools)
# Single pass per tool call: JSONL trace logging plus context-pressure
# monitoring. Replaces the former trace-event.sh + context-pressure-hook.sh
# pair so the always-route costs one dispatch, one stdin parse, and one
# library load instead of two.
# The recovery path is handoff + fresh-session resume, not remote compaction.

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
COUNTER_DIR=".claude/.context-pressure"
mkdir -p "$COUNTER_DIR"

SESSION_KEY="$(session_state_resolve_key "$SESSION_ID_FILE")"
SESSION_SAFE_KEY="$(session_state_safe_key "$SESSION_KEY")"
COUNT_FILE="$COUNTER_DIR/${SESSION_SAFE_KEY}.count"
WARN_FILE="$COUNTER_DIR/${SESSION_SAFE_KEY}.warned"
RED_FILE="$COUNTER_DIR/${SESSION_SAFE_KEY}.red"
# Locked read-increment-write: concurrent PostToolUse hooks used to lose
# increments and under-report context pressure.
COUNT="$(workflow_increment_counter "$COUNT_FILE")"
echo "$COUNT" > ".claude/.tool-call-count"

# --- Trace logging ---

event_type="$(hook_json_get '.hook_event_name' 'PostToolUse')"
tool_name="$(hook_get_tool_name "${1:-}")"
file_path="$(hook_get_file_path "${1:-}")"
exit_code="$(hook_get_exit_code "${1:-}")"
duration_ms="$(hook_get_duration_ms "${1:-}")"
run_id="$(hook_get_run_id "${1:-}")"
agent_name="${CLAUDE_AGENT_NAME:-${CODEX_AGENT_NAME:-${HOOK_AGENT_NAME:-unknown}}}"
session_source="$(hook_get_session_source "${1:-}")"
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

# --- Context pressure ---

SESSION_ID="$(hook_get_session_id "${1:-}")"
TRANSCRIPT_PATH="$(hook_get_transcript_path "${1:-}")"
HOOK_CWD="$(hook_get_cwd "${1:-}")"
BUDGET_JSON=""
ZONE=""
SOURCE=""
MESSAGE=""
BUDGET_STATUS_FILE="$(workflow_context_budget_status_file)"

# Token budgeting needs a bun cold start per probe; zone transitions do not
# need per-call precision, so sample every Nth call and reuse the cached
# status file in between.
BUDGET_SAMPLE_EVERY=5
budget_sample_due=false
if (( COUNT % BUDGET_SAMPLE_EVERY == 0 )) || [[ ! -s "$BUDGET_STATUS_FILE" ]]; then
  budget_sample_due=true
fi

if [[ "$budget_sample_due" == "true" ]] && command -v bun >/dev/null 2>&1 && [[ -f "scripts/context-budget.ts" ]]; then
  BUDGET_JSON="$(
    bun scripts/context-budget.ts \
      --format json \
      --cwd "$HOOK_CWD" \
      --session-id "$SESSION_ID" \
      --transcript-path "$TRANSCRIPT_PATH" \
      --tool-count "$COUNT" \
      --write-status 2>/dev/null || true
  )"
elif [[ -s "$BUDGET_STATUS_FILE" ]]; then
  BUDGET_JSON="$(cat "$BUDGET_STATUS_FILE" 2>/dev/null || true)"
fi

if [[ -n "$BUDGET_JSON" ]] && command -v jq >/dev/null 2>&1; then
  ZONE="$(printf '%s' "$BUDGET_JSON" | jq -r '.zone // empty' 2>/dev/null || true)"
  SOURCE="$(printf '%s' "$BUDGET_JSON" | jq -r '.source // empty' 2>/dev/null || true)"
  MESSAGE="$(printf '%s' "$BUDGET_JSON" | jq -r '.message // empty' 2>/dev/null || true)"
fi

if [[ -z "$ZONE" ]]; then
  if [[ "$COUNT" -ge 50 ]]; then
    ZONE="red"
    SOURCE="tool-call-count"
    MESSAGE="context red zone by tool-count fallback"
  elif [[ "$COUNT" -ge 40 ]]; then
    ZONE="orange"
    SOURCE="tool-call-count"
    MESSAGE="context orange zone by tool-count fallback"
  elif [[ "$COUNT" -ge 30 ]]; then
    ZONE="yellow"
    SOURCE="tool-call-count"
    MESSAGE="context yellow zone by tool-count fallback"
  else
    ZONE="green"
    SOURCE="tool-call-count"
    MESSAGE="context green zone by tool-count fallback"
  fi
fi

if [[ "$ZONE" == "yellow" && ! -f "$WARN_FILE" ]]; then
  echo "[ContextMonitor] Yellow zone (${SOURCE}). Persist research/todo/handoff state before continuing."
  touch "$WARN_FILE"
fi

if [[ "$ZONE" == "orange" && ! -f "$RED_FILE.orange" ]]; then
  echo "[ContextMonitor] Orange zone (${SOURCE}). Stop broad exploration and prepare a fresh-session resume packet."
  if [[ -f "scripts/prepare-codex-handoff.sh" ]]; then
    bash scripts/prepare-codex-handoff.sh --reason context-orange-zone >/dev/null 2>&1 || workflow_write_handoff "context-orange-zone"
  else
    workflow_write_handoff "context-orange-zone"
  fi
  touch "$RED_FILE.orange"
fi

if [[ "$ZONE" == "red" && ! -f "$RED_FILE" ]]; then
  echo "[ContextMonitor] Red zone (${SOURCE}). STOP after the current response; resume from the generated handoff in a fresh Codex session."
  if [[ -f "scripts/prepare-codex-handoff.sh" ]]; then
    bash scripts/prepare-codex-handoff.sh --reason context-red-zone >/dev/null 2>&1 || workflow_write_handoff "context-red-zone"
  else
    workflow_write_handoff "context-red-zone"
  fi

  touch "$RED_FILE"
fi
