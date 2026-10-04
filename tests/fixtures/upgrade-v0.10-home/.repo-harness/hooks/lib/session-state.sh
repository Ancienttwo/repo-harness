#!/bin/bash
# Shared session-id and tool-call count helpers.

session_state_new_session_id() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen
    return
  fi

  local agent_name="${CLAUDE_AGENT_NAME:-${CODEX_AGENT_NAME:-unknown}}"
  local entropy
  entropy="$(head -c 16 /dev/urandom 2>/dev/null | od -An -tx1 2>/dev/null | tr -d ' \n')"
  [[ -n "$entropy" ]] || entropy="${RANDOM}${RANDOM}"
  printf 'session-%s-%s-%s-%s' "$(date +%Y%m%d%H%M%S)" "$agent_name" "$$" "$entropy"
}

session_state_resolve_key() {
  local session_id_file="$1"
  local arg="${2:-}"
  local session_key="${HOOK_SESSION_ID:-}"

  if [[ -z "$session_key" ]] && declare -F hook_get_session_id >/dev/null 2>&1; then
    session_key="$(hook_get_session_id "$arg")"
  fi

  if [[ -z "$session_key" ]]; then
    session_key="${CLAUDE_SESSION_ID:-${CODEX_SESSION_ID:-${SESSION_KEY:-}}}"
  fi

  if [[ -n "$session_key" ]]; then
    mkdir -p "$(dirname "$session_id_file")" 2>/dev/null || true
    printf '%s\n' "$session_key" > "$session_id_file" 2>/dev/null || true
    printf '%s' "$session_key"
    return
  fi

  if [[ -z "$session_key" ]] && [[ -s "$session_id_file" ]]; then
    session_key="$(cat "$session_id_file" 2>/dev/null || true)"
  fi

  if [[ -z "$session_key" ]]; then
    session_key="$(session_state_new_session_id)"
    mkdir -p "$(dirname "$session_id_file")" 2>/dev/null || true
    printf '%s\n' "$session_key" > "$session_id_file" 2>/dev/null || true
  fi

  printf '%s' "$session_key"
}

session_state_safe_key() {
  local key="$1"
  echo "$key" | tr -c 'A-Za-z0-9._-' '_'
}

session_state_read_count() {
  local count_file="$1"
  local count=0

  if [[ -f "$count_file" ]]; then
    count="$(cat "$count_file" 2>/dev/null || echo 0)"
  fi

  if ! [[ "$count" =~ ^[0-9]+$ ]]; then
    count=0
  fi

  printf '%s' "$count"
}

session_state_codegraph_dir() {
  printf '%s' ".claude/.codegraph-state"
}

session_state_codegraph_marker_file() {
  local key="$1"
  local suffix="$2"
  local safe_key
  safe_key="$(session_state_safe_key "$key")"
  printf '%s/%s.%s' "$(session_state_codegraph_dir)" "$safe_key" "$suffix"
}

session_state_mark_codegraph_used() {
  local key="$1"
  local marker
  marker="$(session_state_codegraph_marker_file "$key" "used")"
  mkdir -p "$(dirname "$marker")"
  : > "$marker"
}

session_state_codegraph_used() {
  local key="$1"
  [[ -f "$(session_state_codegraph_marker_file "$key" "used")" ]]
}

session_state_mark_codegraph_nudged() {
  local key="$1"
  local marker
  marker="$(session_state_codegraph_marker_file "$key" "nudged")"
  mkdir -p "$(dirname "$marker")"
  : > "$marker"
}

session_state_codegraph_nudged() {
  local key="$1"
  [[ -f "$(session_state_codegraph_marker_file "$key" "nudged")" ]]
}
