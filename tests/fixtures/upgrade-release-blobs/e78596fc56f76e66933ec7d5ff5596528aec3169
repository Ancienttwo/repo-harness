#!/bin/bash
# Changelog Guard Hook — PostToolUse on Bash
# Soft reminder to update CHANGELOG before releasing.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

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

# Only trigger on release/tag-related commands.
if ! echo "$TOOL_COMMAND" | grep -Eiq '(npm version|git tag|bun version|pnpm version|yarn version)'; then
  exit 0
fi

CHANGELOG="docs/CHANGELOG.md"

# If no changelog file exists, remind and exit.
if [[ ! -f "$CHANGELOG" ]]; then
  echo "[ChangelogGuard] ⚠ Release command detected but $CHANGELOG not found. Consider creating one before releasing."
  exit 0
fi

# Check if [Unreleased] section has meaningful content (not just template placeholders).
unreleased_content=""
if command -v awk >/dev/null 2>&1; then
  unreleased_content="$(awk '
    /^\#\# \[Unreleased\]/ { found=1; next }
    found && /^\#\# \[/ { exit }
    found { print }
  ' "$CHANGELOG" | sed '/^$/d' | sed '/^---/d' | sed '/^\*Format based on/d')"
fi

# Check via git diff as a secondary signal.
has_diff=false
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if ! git diff --quiet -- "$CHANGELOG" 2>/dev/null || ! git diff --cached --quiet -- "$CHANGELOG" 2>/dev/null; then
    has_diff=true
  fi
fi

# If there's meaningful content or recent changes, stay silent.
if [[ -n "$unreleased_content" ]] && echo "$unreleased_content" | grep -Eiq '(^### |^- )'; then
  exit 0
fi

if [[ "$has_diff" == "true" ]]; then
  exit 0
fi

echo "[ChangelogGuard] ⚠ Release command detected but $CHANGELOG [Unreleased] section appears empty. Consider updating before releasing."
exit 0
