#!/bin/bash
set -euo pipefail

SOURCE_ROOT="${AGENTIC_DEV_SOURCE_ROOT:-}"
if [[ -z "$SOURCE_ROOT" ]]; then
  SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

CODEX_SKILLS_ROOT_WAS_SET=0
if [[ -z "${CODEX_SKILLS_ROOT:-}" ]]; then
  if [[ -z "${HOME:-}" ]]; then
    echo "[sync-installed] HOME is required when CODEX_SKILLS_ROOT is not set." >&2
    exit 1
  fi
  CODEX_SKILLS_ROOT="$HOME/.codex/skills"
else
  CODEX_SKILLS_ROOT_WAS_SET=1
fi

if [[ -z "${CLAUDE_SKILLS_ROOT:-}" ]]; then
  if [[ "$CODEX_SKILLS_ROOT_WAS_SET" -eq 0 ]]; then
    CLAUDE_SKILLS_ROOT="$HOME/.claude/skills"
  else
    CLAUDE_SKILLS_ROOT=""
  fi
fi

SOURCE_ROOT="${SOURCE_ROOT%/}"
CODEX_SKILLS_ROOT="${CODEX_SKILLS_ROOT%/}"
if [[ -n "$CLAUDE_SKILLS_ROOT" ]]; then
  CLAUDE_SKILLS_ROOT="${CLAUDE_SKILLS_ROOT%/}"
fi
LINK_INSTALLED_COPIES="${AGENTIC_DEV_LINK_INSTALLED_COPIES:-}"
if [[ -z "$LINK_INSTALLED_COPIES" && "$CODEX_SKILLS_ROOT_WAS_SET" -eq 0 ]]; then
  LINK_INSTALLED_COPIES=1
fi

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
  --exclude='.claude/.session-handoff.md'
  --exclude='.claude/.task-state.json'
  --exclude='.claude/.task-handoff.md'
  --exclude='.claude/*.tmp'
  --exclude='.claude/*.bak'
  --exclude='.claude/*.bak.*'
  --exclude='.claude/*.backup-*'
  --exclude='.ai/harness/checks/latest.json'
  --exclude='.ai/harness/events.jsonl'
  --exclude='.ai/harness/archive/'
  --exclude='.ai/harness/failures/latest.jsonl'
  --exclude='.ai/harness/handoff/current.md'
  --exclude='.ai/harness/handoff/resume.md'
  --exclude='.ai/harness/architecture/events.jsonl'
  --exclude='.ai/harness/worktrees/'
  --exclude='.ai/harness/runs/'
)

require_rsync_for_copy_mode() {
  if command -v rsync >/dev/null 2>&1; then
    return 0
  fi
  echo "[sync-installed] unsupported copy-mode: rsync capability is missing." >&2
  echo "[sync-installed] Install rsync, or rerun with AGENTIC_DEV_LINK_INSTALLED_COPIES=1 on a filesystem that supports symlinks." >&2
  exit 1
}

create_symlink_or_explain() {
  local source="$1"
  local dest="$2"
  if ln -s "$source" "$dest"; then
    return 0
  fi
  echo "[sync-installed] unsupported link-mode: symlink capability is unavailable for $dest." >&2
  echo "[sync-installed] Rerun with AGENTIC_DEV_LINK_INSTALLED_COPIES=0 to use copy-mode; copy-mode requires rsync." >&2
  exit 1
}

sync_copy() {
  local dest="$1"
  require_rsync_for_copy_mode
  remove_managed_dest "$dest"
  mkdir -p "$dest"
  rsync -a --delete "${common_excludes[@]}" "$SOURCE_ROOT/" "$dest/"
}

remove_managed_dest() {
  local dest="$1"
  if [[ -L "$dest" ]]; then
    rm "$dest"
    return 0
  fi

  if [[ -e "$dest" ]]; then
    if [[ -d "$dest/_ops" ]]; then
      echo "[sync-installed] Refusing to replace $dest because it contains _ops/ local state." >&2
      echo "[sync-installed] Move or archive that directory first, then rerun." >&2
      exit 1
    fi
    rm -rf "$dest"
  fi
}

sync_claude_alias_links() {
  if [[ -z "$CLAUDE_SKILLS_ROOT" ]]; then
    return 0
  fi

  mkdir -p "$CLAUDE_SKILLS_ROOT"
  local alias_dest="$CLAUDE_SKILLS_ROOT/repo-harness"
  remove_managed_dest "$alias_dest"
  create_symlink_or_explain "$SOURCE_ROOT" "$alias_dest"
  echo "[sync-installed] Claude skill alias: $alias_dest -> $SOURCE_ROOT"
}

sync_claude_alias_copies() {
  if [[ -z "$CLAUDE_SKILLS_ROOT" ]]; then
    return 0
  fi

  mkdir -p "$CLAUDE_SKILLS_ROOT"
  local alias_dest="$CLAUDE_SKILLS_ROOT/repo-harness"
  sync_copy "$alias_dest"
  echo "[sync-installed] Claude skill copy: $alias_dest"
}

# Register every assets/skill-commands/repo-harness-* facade as its own host
# skill so they are discoverable alongside the umbrella repo-harness router.
# Each facade dir is self-contained (SKILL.md only), so we link/copy the dir
# directly. Names are managed: remove_managed_dest re-links cleanly on each
# sync. A facade removed upstream leaves an orphan dest (parity with the
# umbrella alias, which also does not garbage-collect renamed targets).
sync_command_facades() {
  local root="$1"
  local mode="$2"
  if [[ -z "$root" ]]; then
    return 0
  fi

  mkdir -p "$root"
  local facade_src
  local synced=0
  for facade_src in "$SOURCE_ROOT"/assets/skill-commands/repo-harness-*/; do
    [[ -d "$facade_src" && -f "${facade_src}SKILL.md" ]] || continue
    facade_src="${facade_src%/}"
    local name
    name="$(basename "$facade_src")"
    local dest="$root/$name"
    remove_managed_dest "$dest"
    if [[ "$mode" == "link" ]]; then
      create_symlink_or_explain "$facade_src" "$dest"
    else
      require_rsync_for_copy_mode
      mkdir -p "$dest"
      rsync -a --delete "${common_excludes[@]}" "$facade_src/" "$dest/"
    fi
    synced=$((synced + 1))
  done
  echo "[sync-installed] command facades ($mode): $synced into $root"
}

canonical_dest="$CODEX_SKILLS_ROOT/repo-harness"
if [[ "$LINK_INSTALLED_COPIES" == "1" ]]; then
  mkdir -p "$CODEX_SKILLS_ROOT"
  remove_managed_dest "$canonical_dest"
  create_symlink_or_explain "$SOURCE_ROOT" "$canonical_dest"
  echo "[sync-installed] canonical skill link: $canonical_dest -> $SOURCE_ROOT"

  sync_command_facades "$CODEX_SKILLS_ROOT" link
  sync_claude_alias_links
  sync_command_facades "$CLAUDE_SKILLS_ROOT" link
  echo "[sync-installed] OK"
  exit 0
fi

sync_copy "$canonical_dest"
echo "[sync-installed] canonical skill copy: $canonical_dest"

sync_command_facades "$CODEX_SKILLS_ROOT" copy
sync_claude_alias_copies
sync_command_facades "$CLAUDE_SKILLS_ROOT" copy
echo "[sync-installed] OK"
