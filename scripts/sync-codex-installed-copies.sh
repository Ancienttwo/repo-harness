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
INSTALL_PROFILE="${REPO_HARNESS_INSTALL_PROFILE:-full}"
case "$INSTALL_PROFILE" in
  minimal|full) ;;
  *)
    echo "[sync-installed] invalid REPO_HARNESS_INSTALL_PROFILE: $INSTALL_PROFILE" >&2
    exit 2
    ;;
esac
if [[ -z "$LINK_INSTALLED_COPIES" && "$CODEX_SKILLS_ROOT_WAS_SET" -eq 0 ]]; then
  LINK_INSTALLED_COPIES=1
fi

if [[ ! -d "$SOURCE_ROOT" ]]; then
  echo "[sync-installed] Source root not found: $SOURCE_ROOT" >&2
  exit 1
fi

# Resolved once, eagerly, here in the main shell process (never inside a function
# invoked as a pipeline's non-last stage -- bash forks a subshell for those, which
# would silently swallow a failure here as "selects nothing" instead of aborting).
# One adapter call returns both facade selection and separately-managed provider
# placements so adding the ownership boundary does not add another Bun startup to
# every sync.
if ! PROFILE_PROJECTION="$(bun "$SOURCE_ROOT/scripts/skill-surface-select.ts" profile-projection --profile "$INSTALL_PROFILE")"; then
  echo "[sync-installed] skill-surface-select profile-projection failed for profile: $INSTALL_PROFILE" >&2
  exit 1
fi
SELECTED_FACADES=""
HOST_PLACEMENTS=""
while IFS=$'\t' read -r projection_kind projection_value; do
  case "$projection_kind" in
    facade) SELECTED_FACADES+="${SELECTED_FACADES:+$'\n'}$projection_value" ;;
    host) HOST_PLACEMENTS+="${HOST_PLACEMENTS:+$'\n'}$projection_value" ;;
  esac
done <<< "$PROFILE_PROJECTION"

# Manifest-derived name -> source path for every facade-kind package,
# regardless of profile. A facade's source directory is no longer guaranteed
# to live under one fixed assets/skill-commands/<name> parent (e.g.
# repo-harness-plan now sources from assets/skills/repo-harness-plan), so
# every consumer below resolves the real source through this list instead of
# assuming a fixed parent directory.
if ! FACADE_SOURCES="$(bun "$SOURCE_ROOT/scripts/skill-surface-select.ts" facade-sources)"; then
  echo "[sync-installed] skill-surface-select facade-sources failed" >&2
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
  --exclude='.ai/harness/checks/*.latest.json'
  --exclude='.ai/harness/checks/*.latest.md'
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

hash_stream() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print "sha256:" $1}'
    return 0
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print "sha256:" $1}'
    return 0
  fi
  echo "[sync-installed] SHA-256 capability is required to verify managed copies." >&2
  return 1
}

managed_tree_hash() {
  local root="$1"
  {
    while IFS= read -r entry; do
      local rel
      rel="${entry#"$root"/}"
      if [[ -L "$entry" ]]; then
        printf 'L\0%s\0%s\0' "$rel" "$(readlink "$entry")"
      elif [[ -f "$entry" ]]; then
        printf 'F\0%s\0' "$rel"
        cat "$entry"
        printf '\0'
      fi
    done < <(find "$root" \( -type f -o -type l \) ! -name '.repo-harness-owner.json' -print | LC_ALL=C sort)
  } | hash_stream
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

write_owner_marker() {
  local dest="$1"
  local surface="$2"
  local content_hash
  content_hash="$(managed_tree_hash "$dest")"
  printf '{"owner":"repo-harness","surface":"%s","content_hash":"%s"}\n' \
    "$(json_escape "$surface")" "$(json_escape "$content_hash")" \
    > "$dest/.repo-harness-owner.json"
}

refuse_unowned_dest() {
  local dest="$1"
  local reason="$2"
  echo "[sync-installed] Refusing to replace or remove $dest: $reason." >&2
  echo "[sync-installed] Preserve or move the unowned surface, then rerun." >&2
  return 1
}

assert_managed_dest() {
  local dest="$1"
  local expected_source="$2"
  local expected_surface="$3"

  if [[ ! -e "$dest" && ! -L "$dest" ]]; then
    return 0
  fi

  if [[ -L "$dest" ]]; then
    local target
    target="$(readlink "$dest" 2>/dev/null || true)"
    [[ "$target" == "$expected_source" ]] \
      || refuse_unowned_dest "$dest" "symlink target is not the expected package source"
    return $?
  fi

  [[ -d "$dest" ]] || {
    refuse_unowned_dest "$dest" "path is neither a managed directory nor an expected symlink"
    return 1
  }
  [[ ! -d "$dest/_ops" ]] || {
    refuse_unowned_dest "$dest" "directory contains _ops/ local state"
    return 1
  }

  local marker="$dest/.repo-harness-owner.json"
  if [[ -f "$marker" ]]; then
    grep -Fq '"owner":"repo-harness"' "$marker" \
      || { refuse_unowned_dest "$dest" "ownership marker has an unknown owner"; return 1; }
    grep -Fq "\"surface\":\"$expected_surface\"" "$marker" \
      || { refuse_unowned_dest "$dest" "ownership marker has an unexpected surface type"; return 1; }
    local expected_hash actual_hash
    expected_hash="$(sed -n 's/.*"content_hash":"\([^"]*\)".*/\1/p' "$marker")"
    [[ -n "$expected_hash" ]] \
      || { refuse_unowned_dest "$dest" "ownership marker has no content hash"; return 1; }
    actual_hash="$(managed_tree_hash "$dest")"
    [[ "$actual_hash" == "$expected_hash" ]] \
      || { refuse_unowned_dest "$dest" "managed copy content has drifted"; return 1; }
    return 0
  fi

  if [[ -d "$expected_source" ]] && diff -qr "$dest" "$expected_source" >/dev/null 2>&1; then
    # One-shot migration for an exact package copy created before owner markers.
    return 0
  fi

  refuse_unowned_dest "$dest" "directory has no valid owner marker and is not an exact package copy"
}

remove_managed_dest() {
  local dest="$1"
  local expected_source="$2"
  local expected_surface="$3"
  assert_managed_dest "$dest" "$expected_source" "$expected_surface" || exit 1
  if [[ -L "$dest" ]]; then
    rm "$dest"
  elif [[ -e "$dest" ]]; then
    rm -rf "$dest"
  fi
}

sync_copy() {
  local dest="$1"
  local source="${2:-$SOURCE_ROOT}"
  local surface="${3:-canonical-skill}"
  require_rsync_for_copy_mode
  remove_managed_dest "$dest" "$source" "$surface"
  mkdir -p "$dest"
  rsync -a --delete "${common_excludes[@]}" "$source/" "$dest/"
  write_owner_marker "$dest" "$surface"
}

sync_claude_alias_links() {
  if [[ -z "$CLAUDE_SKILLS_ROOT" ]]; then
    return 0
  fi

  mkdir -p "$CLAUDE_SKILLS_ROOT"
  local alias_dest="$CLAUDE_SKILLS_ROOT/repo-harness"
  remove_managed_dest "$alias_dest" "$SOURCE_ROOT" canonical-skill
  create_symlink_or_explain "$SOURCE_ROOT" "$alias_dest"
  echo "[sync-installed] Claude skill alias: $alias_dest -> $SOURCE_ROOT"
}

sync_claude_alias_copies() {
  if [[ -z "$CLAUDE_SKILLS_ROOT" ]]; then
    return 0
  fi

  mkdir -p "$CLAUDE_SKILLS_ROOT"
  local alias_dest="$CLAUDE_SKILLS_ROOT/repo-harness"
  sync_copy "$alias_dest" "$SOURCE_ROOT" canonical-skill
  echo "[sync-installed] Claude skill copy: $alias_dest"
}

facade_source_for() {
  local wanted="$1"
  local name source
  while IFS=$'\t' read -r name source; do
    if [[ "$name" == "$wanted" ]]; then
      printf '%s' "$source"
      return 0
    fi
  done <<< "$FACADE_SOURCES"
  printf ''
}

profile_facades() {
  [[ -n "$SELECTED_FACADES" ]] && printf '%s\n' "$SELECTED_FACADES"
}

facade_selected() {
  local wanted="$1"
  profile_facades | grep -Fxq "$wanted"
}

provider_skill_selected_for_root() {
  local root="$1"
  local wanted="$2"
  local host=""
  if [[ "$root" == "$CODEX_SKILLS_ROOT" ]]; then
    host="codex"
  elif [[ -n "$CLAUDE_SKILLS_ROOT" && "$root" == "$CLAUDE_SKILLS_ROOT" ]]; then
    host="claude"
  fi
  [[ -n "$host" ]] && grep -Fxq "$host $wanted" <<< "$HOST_PLACEMENTS"
}

preflight_skill_root() {
  local root="$1"
  [[ -n "$root" ]] || return 0
  assert_managed_dest "$root/repo-harness" "$SOURCE_ROOT" canonical-skill || exit 1
  [[ -d "$root" ]] || return 0

  local dest name source_rel source
  for dest in "$root"/repo-harness-*; do
    [[ -e "$dest" || -L "$dest" ]] || continue
    name="$(basename "$dest")"
    # Provider Skills (for example repo-harness-cross-review) are installed by
    # their own profile component after this facade sync. They are not command
    # facades, so this loop must neither require a command-facade owner marker
    # nor retire them while their host placement is selected.
    provider_skill_selected_for_root "$root" "$name" && continue
    source_rel="$(facade_source_for "$name")"
    source=""
    [[ -n "$source_rel" ]] && source="$SOURCE_ROOT/$source_rel"
    # A facade whose canonical source no longer exists in the package (or is
    # no longer a package at all -- a fully retired name) is a legitimate
    # retirement candidate, not a preflight failure, as long as the host copy
    # is still a clean, owner-marked, unmodified copy. assert_managed_dest
    # proves that from the marker + content hash alone and does not require
    # $source to exist for that branch; unmarked or drifted content still
    # fails closed here exactly as before.
    assert_managed_dest "$dest" "$source" command-facade || exit 1
  done
}

remove_retired_owned_facades() {
  local root="$1"
  [[ -n "$root" && -d "$root" ]] || return 0
  local dest name source_rel source
  for dest in "$root"/repo-harness-*; do
    [[ -e "$dest" || -L "$dest" ]] || continue
    name="$(basename "$dest")"
    provider_skill_selected_for_root "$root" "$name" && continue
    facade_selected "$name" && continue
    source_rel="$(facade_source_for "$name")"
    source=""
    [[ -n "$source_rel" ]] && source="$SOURCE_ROOT/$source_rel"
    if [[ -z "$source" || ! -d "$source" ]]; then
      echo "[sync-installed] retiring $dest: canonical facade source no longer exists in the package"
    fi
    # remove_managed_dest asserts ownership first (fail-closed on an unowned
    # or modified copy) and only removes a proven, unmodified managed copy;
    # this now covers "not selected by this profile", "retired from the
    # package", and "fully retired name absent from the catalog" the same
    # safe way.
    remove_managed_dest "$dest" "$source" command-facade
  done
}

# Keep default discovery bounded: the umbrella router plus each profile's
# manifest-selected facades. Specialized capabilities remain CLI
# subcommands/references. Driven by $FACADE_SOURCES (manifest-derived name ->
# source pairs for every facade-kind package) rather than a physical glob
# over one fixed parent directory, since a facade's source directory is no
# longer guaranteed to live under assets/skill-commands/<name>.
sync_command_facades() {
  local root="$1"
  local mode="$2"
  if [[ -z "$root" ]]; then
    return 0
  fi

  mkdir -p "$root"
  remove_retired_owned_facades "$root"
  local synced=0
  local name source facade_src dest
  while IFS=$'\t' read -r name source; do
    [[ -n "$name" ]] || continue
    facade_selected "$name" || continue
    facade_src="$SOURCE_ROOT/$source"
    [[ -d "$facade_src" && -f "$facade_src/SKILL.md" ]] || continue
    dest="$root/$name"
    remove_managed_dest "$dest" "$facade_src" command-facade
    if [[ "$mode" == "link" ]]; then
      create_symlink_or_explain "$facade_src" "$dest"
    else
      require_rsync_for_copy_mode
      mkdir -p "$dest"
      rsync -a --delete "${common_excludes[@]}" "$facade_src/" "$dest/"
      write_owner_marker "$dest" command-facade
    fi
    synced=$((synced + 1))
  done <<< "$FACADE_SOURCES"
  echo "[sync-installed] command facades ($mode): $synced into $root"
}

preflight_skill_root "$CODEX_SKILLS_ROOT"
preflight_skill_root "$CLAUDE_SKILLS_ROOT"

canonical_dest="$CODEX_SKILLS_ROOT/repo-harness"
if [[ "$LINK_INSTALLED_COPIES" == "1" ]]; then
  mkdir -p "$CODEX_SKILLS_ROOT"
  remove_managed_dest "$canonical_dest" "$SOURCE_ROOT" canonical-skill
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
