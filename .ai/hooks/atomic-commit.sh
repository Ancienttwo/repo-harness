#!/bin/bash
# Atomic Commit Hook — PostToolUse on Bash
# Commits a minimal checkpoint after successful validation commands.
# Deprecated: not enabled by the shared settings template; kept for legacy manual use.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

EXIT_CODE="${2:-${EXIT_CODE:-1}}"
MARKER=".claude/.atomic_pending"

get_tool_command() {
  local parsed=""

  parsed="$(hook_json_get '.tool_input.command' '')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  parsed="$(hook_json_get '.tool_input.raw_command' '')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  if [[ -n "${TOOL_INPUT:-}" ]] && command -v jq >/dev/null 2>&1 && printf '%s' "$TOOL_INPUT" | jq -e . >/dev/null 2>&1; then
    parsed="$(printf '%s' "$TOOL_INPUT" | jq -r '.command // .raw_command // empty' 2>/dev/null || true)"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi
  fi

  printf '%s' "${TOOL_COMMAND:-}"
}

TOOL_COMMAND="$(get_tool_command)"

# Only continue on successful commands.
if [[ "$EXIT_CODE" != "0" ]]; then
  exit 0
fi

# Only checkpoint after explicit validation commands.
if ! echo "$TOOL_COMMAND" | grep -Eiq '(^|[[:space:]])(test|typecheck|lint|build)([[:space:]]|$)'; then
  exit 0
fi

# Need pending mutations marker.
if [[ ! -f "$MARKER" ]]; then
  exit 0
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  rm -f "$MARKER" >/dev/null 2>&1 || true
  exit 0
fi

# No changed files => clear marker and exit.
if git diff --quiet && git diff --cached --quiet; then
  rm -f "$MARKER" >/dev/null 2>&1 || true
  exit 0
fi

git add -A
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
if git commit -m "chore(atom): checkpoint $STAMP" >/dev/null 2>&1; then
  echo "[AtomicCommit] Checkpoint committed: $STAMP"
  rm -f "$MARKER" >/dev/null 2>&1 || true
else
  echo "[AtomicCommit] Checkpoint commit skipped (commit failed)."
fi

exit 0
