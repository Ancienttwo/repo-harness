#!/bin/bash
set -euo pipefail

SOURCE_ROOT="${AGENTIC_DEV_SOURCE_ROOT:-}"
if [[ -z "$SOURCE_ROOT" ]]; then
  SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

if [[ -z "${CODEX_SKILLS_ROOT:-}" ]]; then
  if [[ -z "${HOME:-}" ]]; then
    echo "[sync-installed] HOME is required when CODEX_SKILLS_ROOT is not set." >&2
    exit 1
  fi
  CODEX_SKILLS_ROOT="$HOME/.codex/skills"
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "[sync-installed] rsync is required." >&2
  exit 1
fi

SOURCE_ROOT="${SOURCE_ROOT%/}"
CODEX_SKILLS_ROOT="${CODEX_SKILLS_ROOT%/}"

if [[ ! -d "$SOURCE_ROOT" ]]; then
  echo "[sync-installed] Source root not found: $SOURCE_ROOT" >&2
  exit 1
fi

common_excludes=(
  --exclude='.git/'
  --exclude='_ops/'
  --exclude='node_modules/'
  --exclude='.DS_Store'
  --exclude='evals/benchmark.md'
  --exclude='.codex/'
  --exclude='.claude/settings.local.json'
  --exclude='.claude/.atomic_pending'
  --exclude='.claude/.session-id'
  --exclude='.claude/.trace.jsonl'
  --exclude='.claude/.tool-call-count'
  --exclude='.claude/.session-handoff.md'
  --exclude='.claude/.task-state.json'
  --exclude='.claude/.task-handoff.md'
  --exclude='.claude/.context-pressure/'
  --exclude='.claude/*.tmp'
  --exclude='.claude/*.bak'
  --exclude='.claude/*.bak.*'
  --exclude='.claude/*.backup-*'
  --exclude='.ai/harness/checks/latest.json'
  --exclude='.ai/harness/events.jsonl'
  --exclude='.ai/harness/failures/latest.jsonl'
  --exclude='.ai/harness/handoff/current.md'
  --exclude='.ai/harness/handoff/resume.md'
  --exclude='.ai/harness/context-budget/latest.json'
  --exclude='.ai/harness/architecture/events.jsonl'
  --exclude='.ai/harness/worktrees/'
  --exclude='.ai/harness/runs/'
)

sync_copy() {
  local dest="$1"
  mkdir -p "$dest"
  rsync -a --delete "${common_excludes[@]}" "$SOURCE_ROOT/" "$dest/"
}

canonical_dest="$CODEX_SKILLS_ROOT/agentic-dev"
sync_copy "$canonical_dest"
echo "[sync-installed] canonical skill copy: $canonical_dest"

for legacy_name in agentic-dev-skill project-initializer; do
  legacy_dest="$CODEX_SKILLS_ROOT/$legacy_name"
  sync_copy "$legacy_dest"

  # Legacy dirs are runtime fallback bundles, not discoverable Codex skills.
  # Keep scripts/assets for old resolver paths, but remove every skill facade.
  # -H handles existing legacy symlinks such as
  # ~/.codex/skills/project-initializer -> ~/.claude/skills/project-initializer.
  find -H "$legacy_dest" -name SKILL.md -type f -delete
  rm -rf "$legacy_dest/assets/skill-commands"

  echo "[sync-installed] legacy runtime fallback bundle: $legacy_dest"
done

echo "[sync-installed] OK"
