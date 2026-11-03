#!/usr/bin/env bash
# The only way a shell script starts archctx or CodeGraph. Both belong to the
# architecture plugin, so a start runs only when the recorded install
# selection includes it. The selection comes from
# src/cli/installer/architecture-selection.ts, read once per call; this file
# parses no install state itself.

# Sets REPO_HARNESS_ARCHITECTURE_SELECTION to selected, not-selected or
# unreadable, and REPO_HARNESS_ARCHITECTURE_SELECTION_REASON to the reason for
# the last two. Usage: repo_harness_architecture_selection <package-root> [bun]
repo_harness_architecture_selection() {
  local package_root="$1" bun_bin="${2:-}" output status
  REPO_HARNESS_ARCHITECTURE_SELECTION=unreadable
  [[ -n "$bun_bin" ]] || bun_bin="$(command -v bun 2>/dev/null || true)"
  if [[ -z "$bun_bin" && -x "${HOME:-}/.bun/bin/bun" ]]; then bun_bin="$HOME/.bun/bin/bun"; fi
  if [[ -z "$bun_bin" ]]; then
    REPO_HARNESS_ARCHITECTURE_SELECTION_REASON="bun is not available, so the install selection cannot be read"
    return 0
  fi
  if ! output="$("$bun_bin" -e 'const m = await import(process.argv[1]); const r = m.architectureSelectionReport(m.readRecordedSelection()); console.log(`${r.status}\n${r.message}`);' \
      "$package_root/src/cli/installer/architecture-selection.ts" 2>&1)"; then
    REPO_HARNESS_ARCHITECTURE_SELECTION_REASON="the install selection cannot be read: ${output:-the selection reader failed}"
    return 0
  fi
  status="${output%%$'\n'*}"
  case "$status" in
    selected|not-selected|unreadable) REPO_HARNESS_ARCHITECTURE_SELECTION="$status" ;;
    *) REPO_HARNESS_ARCHITECTURE_SELECTION_REASON="the selection reader gave no status: $output"; return 0 ;;
  esac
  REPO_HARNESS_ARCHITECTURE_SELECTION_REASON="${output#*$'\n'}"
}

# Runs "<command...>" only for a selected plugin. Otherwise it prints one line
# that names the skipped step and the reason, starts nothing and returns 0, so
# the rest of the caller still runs.
# Usage: repo_harness_architecture_start <package-root> <bun|""> <step> <command...>
repo_harness_architecture_start() {
  local package_root="$1" bun_bin="$2" step="$3"
  shift 3
  repo_harness_architecture_selection "$package_root" "$bun_bin"
  if [[ "$REPO_HARNESS_ARCHITECTURE_SELECTION" != selected ]]; then
    printf '[architecture] skipped %s: %s\n' "$step" "$REPO_HARNESS_ARCHITECTURE_SELECTION_REASON" >&2
    return 0
  fi
  "$@"
}
