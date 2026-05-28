#!/bin/bash
# Delegate workflow migrations to the canonical upstream agentic-dev.
#
# Generated projects keep installed workflow runtime state under .ai/. The
# template source lives in AGENTIC_DEV_ROOT, AGENTIC_DEV_SKILL_ROOT, or
# ~/Projects/repo-harness. The retired project-initializer install paths are not
# searched.

set -euo pipefail

resolve_agentic_dev_root() {
  if [[ -n "${AGENTIC_DEV_ROOT:-}" ]]; then
    printf '%s\n' "$AGENTIC_DEV_ROOT"
    return 0
  fi

  if [[ -n "${AGENTIC_DEV_SKILL_ROOT:-}" ]]; then
    printf '%s\n' "$AGENTIC_DEV_SKILL_ROOT"
    return 0
  fi

  if [[ -n "${HOME:-}" ]]; then
    local roots=(
      "$HOME/Projects/agentic-dev"
      "$HOME/.codex/skills/agentic-dev"
      "$HOME/.codex/skills/agentic-dev-skill"
      "$HOME/.claude/skills/agentic-dev"
      "$HOME/.claude/skills/agentic-dev-skill"
      "$HOME/.agents/skills/agentic-dev"
      "$HOME/.agents/skills/agentic-dev-skill"
    )

    local root
    for root in "${roots[@]}"; do
      if [[ -d "$root" ]]; then
        printf '%s\n' "$root"
        return 0
      fi
    done

    printf '%s\n' "${roots[0]}"
    return 0
  fi

  printf '%s\n' "/Users/ancienttwo/.agents/skills/agentic-dev"
}

UPSTREAM_ROOT="$(resolve_agentic_dev_root)"
UPSTREAM_SCRIPT="$UPSTREAM_ROOT/scripts/migrate-project-template.sh"

if [[ ! -f "$UPSTREAM_SCRIPT" ]]; then
  echo "[migrate] Upstream agentic-dev migration script not found: $UPSTREAM_SCRIPT" >&2
  echo "[migrate] Set AGENTIC_DEV_ROOT or AGENTIC_DEV_SKILL_ROOT to the skill root." >&2
  exit 1
fi

exec bash "$UPSTREAM_SCRIPT" "$@"
