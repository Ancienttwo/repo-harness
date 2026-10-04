#!/bin/bash
# First-Principles Guard — PostToolUse on Edit|Write
# Warns when diffs add likely overengineering. Advisory only.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

FILE_PATH="$(hook_get_file_path "${1:-}")"
[[ -z "$FILE_PATH" ]] && exit 0

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

DIFF_CONTENT="$(git diff -- "$FILE_PATH" 2>/dev/null || true)"
[[ -z "$DIFF_CONTENT" ]] && exit 0

ADDED_LINES="$(printf '%s\n' "$DIFF_CONTENT" | grep -E '^\+[^+]' | sed 's/^+//' || true)"
[[ -z "$ADDED_LINES" ]] && exit 0

warned=0

count_matches() {
  local pattern="$1"
  { printf '%s\n' "$ADDED_LINES" | grep -Ei "$pattern" || true; } | wc -l | tr -d ' '
}

emit_warning() {
  local category="$1"
  local detail="$2"
  warned=1
  echo "[FirstPrinciples] ${category} in $FILE_PATH"
  echo "  Re-check: must this exist, does platform/stdlib/current dependency already cover it, can the diff collapse?"
  [[ -n "$detail" ]] && echo "  Trigger: $detail"
}

compat_count="$(count_matches '(^|[^[:alnum:]_])(legacy|compat|backward|polyfill|shim)([^[:alnum:]_]|$)')"
if [[ "$compat_count" -gt 0 ]]; then
  emit_warning "Compatibility debt additions detected" "${compat_count} compatibility-like line(s)"
fi

branch_count="$(count_matches '(^|[^[:alnum:]_])(if|else[[:space:]]+if|switch|case)([^[:alnum:]_]|$)')"
if [[ "$branch_count" -ge 4 ]]; then
  emit_warning "Branch-heavy additions detected" "${branch_count} new branch/control-flow line(s)"
fi

abstraction_count="$(count_matches '(^|[^[:alnum:]_])(interface|abstract[[:space:]]+class|factory|adapter|provider|strategy|manager|orchestrator|dispatcher|registry)([^[:alnum:]_]|$)')"
if [[ "$abstraction_count" -gt 0 ]]; then
  emit_warning "Abstraction-heavy additions detected" "${abstraction_count} abstraction-like line(s)"
fi

dependency_count="$(count_matches '(^|[[:space:]])(import[[:space:]].*from[[:space:]]*["'\''][^./]|import[[:space:]]*["'\''][^./]|require\(["'\''][^./]|"(dependencies|devDependencies|peerDependencies|optionalDependencies)"[[:space:]]*:|"[@A-Za-z0-9._/-]+"[[:space:]]*:[[:space:]]*"[~^0-9])')"
if [[ "$dependency_count" -gt 0 ]]; then
  emit_warning "Dependency-surface additions detected" "${dependency_count} dependency/import line(s)"
fi

config_count="$(count_matches '(^|[^[:alnum:]_])(process\.env|import\.meta\.env|feature[-_ ]?flag|FEATURE_|Config|config|Settings|settings)([^[:alnum:]_]|$)')"
if [[ "$config_count" -gt 1 ]]; then
  emit_warning "Config-surface additions detected" "${config_count} config/env/flag line(s)"
fi

state_machine_count="$(count_matches '(^|[^[:alnum:]_])(state[[:space:]_-]?machine|lifecycle|workflow|route|routing|registry|orchestrator)([^[:alnum:]_]|$)')"
if [[ "$state_machine_count" -gt 1 ]]; then
  emit_warning "Local orchestration additions detected" "${state_machine_count} orchestration-like line(s)"
fi

if [[ "$warned" -eq 1 ]]; then
  echo "  Boundary: keep trust-boundary validation, data-loss prevention, security, accessibility, and explicit user-requested behavior."
fi
