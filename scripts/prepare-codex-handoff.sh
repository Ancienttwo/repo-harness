#!/bin/bash
set -euo pipefail

# Thin invoker (EPC-07 recovery-view cutover): zero independent content
# assembly. The task-handoff (Codex-global packet) payload is now an
# additional output target of the same single materializer,
# scripts/recovery-view-cli.ts (mirrored to
# assets/templates/helpers/recovery-view-cli.ts) -- the prior independent
# Node/Python heredoc that spliced the per-repo global-packet section is
# retired same-package. This script's public name and flags are preserved.

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/prepare-codex-handoff.sh [--reason <reason>] [--print-prompt]
USAGE_EOF
}

reason="manual"
print_prompt=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reason)
      reason="${2:-manual}"
      shift 2
      ;;
    --print-prompt)
      print_prompt=1
      shift
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

repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo"
helper_source="$0"
if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
      && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
  helper_source="$REPO_HARNESS_HELPER_SOURCE_PATH"
fi
helper_dir="$(cd "$(dirname "$helper_source")" && pwd)"

bun_bin="${REPO_HARNESS_BUN_BIN:-bun}"
args=(--cwd "$repo" --reason "$reason" --with-global-packet)
if [[ "$print_prompt" -eq 1 ]]; then
  args+=(--print-prompt)
fi

"$bun_bin" "$helper_dir/recovery-view-cli.ts" "${args[@]}"
