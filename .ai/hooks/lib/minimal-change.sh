#!/bin/bash
# Shared minimal-change hook adapter helpers.

minimal_change_post_edit_enabled() {
  local repo_root policy_file mode observer compact

  repo_root="${HOOK_REPO_ROOT:-$(pwd)}"
  policy_file="$repo_root/.ai/harness/policy.json"
  [[ -f "$policy_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    mode="$(jq -r '.minimal_change.mode // "off"' "$policy_file" 2>/dev/null || true)"
    observer="$(jq -r '.minimal_change.post_edit_observer // false' "$policy_file" 2>/dev/null || true)"
    [[ "$mode" != "off" && "$observer" == "true" ]]
    return $?
  fi

  compact="$(tr -d '[:space:]' < "$policy_file" 2>/dev/null || true)"
  [[ "$compact" == *'"minimal_change":{'* ]] || return 1
  [[ "$compact" == *'"mode":"advice"'* || "$compact" == *'"mode":"enforce"'* ]] || return 1
  [[ "$compact" == *'"post_edit_observer":true'* ]]
}

minimal_change_hook_entry() {
  local lib_dir hooks_dir source_hook_cli

  lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  hooks_dir="$(cd "$lib_dir/.." && pwd)"
  source_hook_cli="$(cd "$hooks_dir/../.." 2>/dev/null && pwd)/src/cli/hook-entry.ts"

  if [[ -n "${REPO_HARNESS_HOOK_CLI:-}" && -f "${REPO_HARNESS_HOOK_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_HOOK_CLI" minimal-change "$@"
    return $?
  fi

  if [[ -f "$source_hook_cli" ]] && command -v bun >/dev/null 2>&1; then
    bun "$source_hook_cli" minimal-change "$@"
    return $?
  fi

  if [[ -n "${HOOK_REPO_ROOT:-}" && -f "$HOOK_REPO_ROOT/src/cli/hook-entry.ts" ]] && command -v bun >/dev/null 2>&1; then
    bun "$HOOK_REPO_ROOT/src/cli/hook-entry.ts" minimal-change "$@"
    return $?
  fi

  if command -v repo-harness-hook >/dev/null 2>&1; then
    repo-harness-hook minimal-change "$@"
    return $?
  fi

  return 127
}
