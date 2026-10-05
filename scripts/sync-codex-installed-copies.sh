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

# A process running the previously installed CLI loads its old TypeScript
# modules before `bun add -g` replaces the package. When that old updater reaches
# this newly installed script, perform the candidate's exact closure readback
# before projecting any host files. This makes the first update invocation fail
# closed instead of reporting success from stale in-memory update logic.
BUN_GLOBAL_ROOT="${BUN_INSTALL:-$HOME/.bun}/install/global/node_modules/repo-harness"
if [[ -d "$BUN_GLOBAL_ROOT" ]] \
  && [[ "$(cd "$SOURCE_ROOT" && pwd -P)" == "$(cd "$BUN_GLOBAL_ROOT" && pwd -P)" ]]; then
  bun "$SOURCE_ROOT/scripts/check-managed-runtime.ts"
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
PROVIDER_PLACEMENTS=""
while IFS=$'\t' read -r projection_kind projection_value; do
  case "$projection_kind" in
    facade) SELECTED_FACADES+="${SELECTED_FACADES:+$'\n'}$projection_value" ;;
    provider) PROVIDER_PLACEMENTS+="${PROVIDER_PLACEMENTS:+$'\n'}$projection_value" ;;
  esac
done <<< "$PROFILE_PROJECTION"

# Manifest-derived name -> source path for every facade-kind package,
# regardless of profile. A facade's source directory is no longer guaranteed
# to live under one fixed assets/skill-commands/<name> parent (e.g.
# repo-harness-product sources from assets/skills/repo-harness-product), so
# every consumer below resolves the real source through this list instead of
# assuming a fixed parent directory.
if ! FACADE_SOURCES="$(bun "$SOURCE_ROOT/scripts/skill-surface-select.ts" facade-sources)"; then
  echo "[sync-installed] skill-surface-select facade-sources failed" >&2
  exit 1
fi
# Resolve copy authority beside the writer, not from an injected source tree.
RUNTIME_ROOT="$(cd "${BASH_SOURCE[0]%/*}/.." && pwd)"
if ! bun -e 'const { installedCopyTreeOptions } = await import(process.argv[1]); installedCopyTreeOptions("canonical-skill", await Bun.file(process.argv[2]).json());' \
  "$RUNTIME_ROOT/src/cli/installer/install-profile.ts" "$RUNTIME_ROOT/assets/workflow-contract.v1.json"; then
  echo "[sync-installed] installed copy projection is invalid." >&2
  exit 1
fi

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

managed_tree_hash() {
  local root="$1"
  local digest
  if ! digest="$(bun "$SOURCE_ROOT/scripts/skill-surface-select.ts" managed-tree-hash "$root")" || [[ -z "$digest" ]]; then
    echo "[sync-installed] managed-tree-hash failed for $root" >&2
    return 1
  fi
  printf '%s\n' "$digest"
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
      || { refuse_unowned_dest "$dest" "managed copy content has drifted"; return 2; }
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

sync_copy() (
  local dest="$1"
  local source="${2:-$SOURCE_ROOT}"
  local surface="${3:-canonical-skill}"
  local copy_list
  require_rsync_for_copy_mode
  copy_list="$(mktemp /tmp/repo-harness-copy-files.XXXXXX)"
  trap 'rm -f "$copy_list"' EXIT
  # Resolve and validate the file list before replacing an owned destination.
  bun "$RUNTIME_ROOT/scripts/skill-surface-select.ts" installed-copy-files "$source" "$surface" \
    "$RUNTIME_ROOT/assets/workflow-contract.v1.json" > "$copy_list"
  remove_managed_dest "$dest" "$source" "$surface"
  mkdir -p "$dest"
  rsync -a --from0 --files-from="$copy_list" "$source/" "$dest/"
  write_owner_marker "$dest" "$surface"
)

# Internal upgrade staging uses the same projection and marker writer. It
# accepts only a new destination. The upgrade transaction owns replacement.
if [[ "${1:-}" == "--stage-owned-copy" ]]; then
  [[ "$#" -eq 4 && -d "$2" && ! -e "$3" && ! -L "$3" ]] || exit 2
  case "$4" in canonical-skill|command-facade) ;; *) exit 2 ;; esac
  sync_copy "$3" "$2" "$4"
  exit 0
fi

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

provider_skill_for_root() {
  local root="$1"
  local wanted="$2"
  local host=""
  if [[ "$root" == "$CODEX_SKILLS_ROOT" ]]; then
    host="codex"
  elif [[ -n "$CLAUDE_SKILLS_ROOT" && "$root" == "$CLAUDE_SKILLS_ROOT" ]]; then
    host="claude"
  fi
  [[ -n "$host" ]] && grep -Fxq "$host $wanted" <<< "$PROVIDER_PLACEMENTS"
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
    # nor retire them. Profile cleanup owns provider retirement.
    provider_skill_for_root "$root" "$name" && continue
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
    if assert_managed_dest "$dest" "$source" command-facade; then
      continue
    else
      local ownership_status=$?
      # Active surfaces still fail closed. Only a verified retired marker
      # with changed content may proceed to the report-only retirement pass.
      if [[ "$ownership_status" -eq 2 ]] && ! facade_selected "$name"; then
        continue
      fi
      exit 1
    fi
  done
}

remove_retired_owned_facades() {
  local root="$1"
  [[ -n "$root" && -d "$root" ]] || return 0
  local dest name source_rel source
  for dest in "$root"/repo-harness-*; do
    [[ -e "$dest" || -L "$dest" ]] || continue
    name="$(basename "$dest")"
    provider_skill_for_root "$root" "$name" && continue
    facade_selected "$name" && continue
    source_rel="$(facade_source_for "$name")"
    source=""
    [[ -n "$source_rel" ]] && source="$SOURCE_ROOT/$source_rel"
    if [[ -z "$source" || ! -d "$source" ]]; then
      echo "[sync-installed] retiring $dest: canonical facade source no longer exists in the package"
    fi
    # Retired copies must not block refresh of the selected runtime. Keep
    # unknown or modified content and report it for explicit upgrade cleanup.
    if assert_managed_dest "$dest" "$source" command-facade; then
      remove_managed_dest "$dest" "$source" command-facade
    else
      local ownership_status=$?
      [[ "$ownership_status" -eq 2 ]] || exit 1
      echo "[sync-installed] preserving retired facade $dest. Run: repo-harness upgrade" >&2
    fi
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
    if [[ "$mode" == "link" ]]; then
      remove_managed_dest "$dest" "$facade_src" command-facade
      create_symlink_or_explain "$facade_src" "$dest"
    else
      sync_copy "$dest" "$facade_src" command-facade
    fi
    synced=$((synced + 1))
  done <<< "$FACADE_SOURCES"
  echo "[sync-installed] command facades ($mode): $synced into $root"
}

bun "$SOURCE_ROOT/scripts/skill-surface-select.ts" remove-dangling-links "$CODEX_SKILLS_ROOT" "$CLAUDE_SKILLS_ROOT"

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
