#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
elif [[ "$SCRIPT_DIR" == */.ai/harness/scripts ]]; then
  cd "$SCRIPT_DIR/../../.."
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

if [[ -f ".ai/hooks/lib/workflow-state.sh" ]]; then
  # shellcheck source=/dev/null
  . ".ai/hooks/lib/workflow-state.sh"
  if [[ "$mode" == "status" ]]; then
    echo "Active plan: $(get_active_plan || printf '(none)')"
    echo "Active contract: $(workflow_active_contract || printf '(none)')"
    echo "Review file: $(workflow_active_review || printf '(none)')"
    echo "Handoff: $(workflow_handoff_file)"
    echo "Resume packet: $(workflow_resume_packet_file)"
    echo "Checks: $(workflow_checks_file)"
    exit 0
  fi
  workflow_write_handoff "$reason"
  echo "Updated $(workflow_handoff_file)"
  if [[ "${REPO_HARNESS_SKIP_RESUME_REFRESH:-0}" != "1" && -f "scripts/codex-handoff-resume.sh" ]]; then
    bash scripts/codex-handoff-resume.sh --cwd "$(pwd -P)" --reason "$reason" >/dev/null
  fi
  exit 0
fi

if [[ "$mode" == "status" ]]; then
  echo "Active plan: (none)"
  echo "Active contract: (none)"
  echo "Review file: (none)"
  echo "Handoff: .ai/harness/handoff/current.md"
  echo "Resume packet: .ai/harness/handoff/resume.md"
  echo "Checks: .ai/harness/checks/latest.json"
  exit 0
fi

mkdir -p .ai/harness/handoff
cat > .ai/harness/handoff/current.md <<EOF_HANDOFF
# Harness Handoff

> **Generated**: $(date '+%Y-%m-%d %H:%M:%S')
> **Reason**: ${reason}
EOF_HANDOFF
echo "Updated .ai/harness/handoff/current.md"
if [[ "${REPO_HARNESS_SKIP_RESUME_REFRESH:-0}" != "1" && -f "scripts/codex-handoff-resume.sh" ]]; then
  bash scripts/codex-handoff-resume.sh --cwd "$(pwd -P)" --reason "$reason" >/dev/null
fi
