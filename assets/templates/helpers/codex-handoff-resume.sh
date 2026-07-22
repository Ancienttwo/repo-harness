#!/bin/bash
set -euo pipefail

# Thin invoker (EPC-07 recovery-view cutover): zero independent content
# assembly. All handoff/resume rendering + checkpoint evidence resolution
# now lives in the single standalone materializer, scripts/recovery-view-cli.ts
# (mirrored to assets/templates/helpers/recovery-view-cli.ts), which
# src/effects/evidence/recovery-materializer.ts's authoritative in-process
# implementation is kept consistent with by inspection. This script's public
# name and flags are preserved -- hosts that call
# `repo-harness run codex-handoff-resume` or invoke this file directly are
# unaffected.

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/codex-handoff-resume.sh --cwd <repo> [--print-prompt] [--reason <reason>]
USAGE_EOF
}

cwd=""
print_prompt=0
reason="manual"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cwd)
      cwd="${2:-}"
      shift 2
      ;;
    --print-prompt)
      print_prompt=1
      shift
      ;;
    --reason)
      reason="${2:-manual}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$cwd" ]]; then
  cwd="$(pwd)"
fi

helper_source="$0"
if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
      && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
  helper_source="$REPO_HARNESS_HELPER_SOURCE_PATH"
fi
helper_dir="$(cd "$(dirname "$helper_source")" && pwd)"

bun_bin="${REPO_HARNESS_BUN_BIN:-bun}"
args=(--cwd "$cwd" --reason "$reason")
if [[ "$print_prompt" -eq 1 ]]; then
  args+=(--print-prompt)
fi

"$bun_bin" "$helper_dir/recovery-view-cli.ts" "${args[@]}"
