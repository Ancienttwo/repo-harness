#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  cd "$REPO_HARNESS_TARGET_REPO_ROOT"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
else
  cd "$SCRIPT_DIR/.."
fi

reason="manual"
mode="write"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --reason)
      reason="${2:-}"
      [[ -n "$reason" ]] || { echo "prepare-handoff: --reason requires a value" >&2; exit 2; }
      shift 2
      ;;
    --status)
      mode="status"
      shift
      ;;
    --help|-h)
      cat <<'USAGE_EOF'
Usage: scripts/prepare-handoff.sh [reason]
       scripts/prepare-handoff.sh --reason <reason>
       scripts/prepare-handoff.sh --status
USAGE_EOF
      exit 0
      ;;
    *)
      reason="$1"
      shift
      ;;
  esac
done

# The recovery materializer comes from the same helper runtime as this script.
recovery_view_cli="$SCRIPT_DIR/recovery-view-cli.ts"
if [[ ! -f "$recovery_view_cli" ]]; then
  echo "prepare-handoff: recovery materializer is missing: $recovery_view_cli" >&2
  exit 1
fi
bun_bin="${REPO_HARNESS_BUN_BIN:-bun}"

if [[ "$mode" == "status" ]]; then
  exec "$bun_bin" "$recovery_view_cli" --status
fi

"$bun_bin" "$recovery_view_cli" --reason "$reason"
if [[ "${REPO_HARNESS_SKIP_RESUME_REFRESH:-0}" != "1" && -f "$SCRIPT_DIR/codex-handoff-resume.sh" ]]; then
  bash "$SCRIPT_DIR/codex-handoff-resume.sh" --cwd "$(pwd -P)" --reason "$reason" >/dev/null
fi
