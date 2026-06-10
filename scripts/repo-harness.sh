#!/usr/bin/env bash
# scripts/repo-harness.sh — Bash prototype of the repo-harness CLI (Phase 0.5).
#
# Phase 1 will replace this with a Bun/Node binary. This bash version exists
# so we can migrate repo-harness itself off project-level hooks TODAY, before
# the proper CLI ships. Subcommand names + behavior align with the planned
# Phase 1 CLI so the port is mechanical.
#
# Subcommands:
#   install [--target codex|claude|both]
#     Copy hook-shim.sh to ~/.repo-harness/, register global hook entries
#     in ~/.codex/hooks.json and/or ~/.claude/settings.json.
#     Idempotent: re-running cleans prior repo-harness entries first.
#
#   migrate <repo> [--dry-run]
#     Move <repo>'s project-level .codex/hooks.json + .claude/settings.json
#     hook segments to global. Backs up project files; deletes .codex/hooks.json;
#     strips .hooks from .claude/settings.json (preserves other settings).
#
#   uninstall [--target codex|claude|both]
#     Remove repo-harness hook entries from global configs (keeps shim file
#     at ~/.repo-harness/hook-shim.sh for fast re-install).
#
#   status
#     Report install state per host + opt-in marker detection in CWD.
#
#   trust [repo-path]      (default: current repo)
#     Add the repo's PRIMARY root to ~/.repo-harness/trusted-repos. The shim
#     refuses to execute .ai/hooks/ from untrusted repos; linked worktrees
#     inherit trust from their primary repo.
#
#   untrust [repo-path]    Remove a repo from the trust file.
#   trust-list             Print trusted repo roots.
#
#   hook <event-script>.sh [args...]
#     Direct invoke shim (for testing, debugging).
#
# Hooks registered:
#   SessionStart     → session-start-context.sh
#   PreToolUse       → worktree-guard.sh + pre-edit-guard.sh (matcher: Edit|Write)
#   PostToolUse      → post-edit-guard.sh (matcher: Edit|Write)
#                    → post-bash.sh (matcher: Bash)
#                    → trace-event.sh (no matcher, all tools)
#                    → context-pressure-hook.sh (no matcher, all tools)
#   UserPromptSubmit → prompt-guard.sh
#   Stop             → stop-orchestrator.sh

set -euo pipefail

AGENTIC_DIR="${REPO_HARNESS_HOME:-${HOME}/.repo-harness}"
SHIM_PATH="${AGENTIC_DIR}/hook-shim.sh"
TRUST_FILE="${AGENTIC_DIR}/trusted-repos"
SHIM_SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIM_SRC="${SHIM_SRC_DIR}/hook-shim.sh"
CODEX_HOOKS="${HOME}/.codex/hooks.json"
CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

# Tag-matching substring used to find/remove our entries on re-install / uninstall.
# Catches both the canary tag ("repo-harness-canary") and shim path ("/.repo-harness/").
CLEANUP_PATTERN="repo-harness"

require_jq() {
  command -v jq >/dev/null 2>&1 || {
    echo "[repo-harness] ERROR: jq is required (install: brew install jq)" >&2
    exit 1
  }
}

# Resolve the PRIMARY repo root for a path (parent of the common git dir), so
# trust entries cover the main checkout and every linked worktree uniformly.
resolve_primary_root() {
  local path="${1:-.}" toplevel common_dir
  toplevel=$(git -C "$path" rev-parse --show-toplevel 2>/dev/null) || return 1
  common_dir=$(git -C "$toplevel" rev-parse --git-common-dir 2>/dev/null) || return 1
  case "$common_dir" in
    /*) ;;
    *) common_dir="$toplevel/$common_dir" ;;
  esac
  (cd "$(dirname "$common_dir")" 2>/dev/null && pwd -P)
}

trust_repo() {
  local root
  root=$(resolve_primary_root "${1:-.}") || {
    echo "[repo-harness] not a git repo: ${1:-.}" >&2; return 1
  }
  mkdir -p "$AGENTIC_DIR"
  touch "$TRUST_FILE"
  if grep -Fxq "$root" "$TRUST_FILE"; then
    echo "[repo-harness] already trusted: $root"
  else
    printf '%s\n' "$root" >> "$TRUST_FILE"
    echo "[repo-harness] trusted: $root"
  fi
}

cmd_trust() {
  trust_repo "${1:-.}"
}

cmd_untrust() {
  local root
  root=$(resolve_primary_root "${1:-.}") || {
    echo "[repo-harness] not a git repo: ${1:-.}" >&2; return 1
  }
  [ -f "$TRUST_FILE" ] || { echo "[repo-harness] trust file empty; nothing to remove"; return 0; }
  local tmp
  tmp=$(mktemp) || { echo "[repo-harness] mktemp failed" >&2; return 1; }
  grep -Fxv "$root" "$TRUST_FILE" > "$tmp" || true
  mv "$tmp" "$TRUST_FILE"
  echo "[repo-harness] untrusted: $root"
}

cmd_trust_list() {
  if [ -s "$TRUST_FILE" ]; then
    cat "$TRUST_FILE"
  else
    echo "[repo-harness] no trusted repos yet (trust file: $TRUST_FILE)"
  fi
}

# Print the hooks JSON structure (host-agnostic; same shape for Codex + Claude).
build_hooks_json() {
  cat <<EOF
{
  "SessionStart": [
    { "hooks": [{ "type": "command", "command": "bash ${SHIM_PATH} session-start-context.sh" }] }
  ],
  "PreToolUse": [
    { "matcher": "Edit|Write", "hooks": [
        { "type": "command", "command": "bash ${SHIM_PATH} worktree-guard.sh" },
        { "type": "command", "command": "bash ${SHIM_PATH} pre-edit-guard.sh" }
    ]}
  ],
  "PostToolUse": [
    { "matcher": "Edit|Write", "hooks": [
        { "type": "command", "command": "bash ${SHIM_PATH} post-edit-guard.sh" }
    ]},
    { "matcher": "Bash", "hooks": [
        { "type": "command", "command": "bash ${SHIM_PATH} post-bash.sh" }
    ]},
    { "hooks": [
        { "type": "command", "command": "bash ${SHIM_PATH} trace-event.sh" }
    ]},
    { "hooks": [
        { "type": "command", "command": "bash ${SHIM_PATH} context-pressure-hook.sh" }
    ]}
  ],
  "UserPromptSubmit": [
    { "hooks": [
        { "type": "command", "command": "bash ${SHIM_PATH} prompt-guard.sh" }
    ]}
  ],
  "Stop": [
    { "hooks": [
        { "type": "command", "command": "bash ${SHIM_PATH} stop-orchestrator.sh" }
    ]}
  ]
}
EOF
}

# Clean any tagged entries from target file, then merge in fresh entries.
merge_hooks_into() {
  local file=$1
  local backup="${file}.repo-harness-pre-install-backup"

  mkdir -p "$(dirname "$file")"
  [ -f "$file" ] || echo '{}' > "$file"
  [ -f "$backup" ] || cp "$file" "$backup"

  local new_hooks tmp
  new_hooks=$(build_hooks_json)
  tmp=$(mktemp)

  jq --argjson new "$new_hooks" --arg pat "$CLEANUP_PATTERN" '
    .hooks //= {}
    # Step 1: strip our prior entries (canary + shim) from each event array
    | .hooks |= with_entries(
        .value |= map(
          .hooks |= map(select((.command // "") | contains($pat) | not))
        )
        | .value |= map(select((.hooks // []) | length > 0))
      )
    # Step 2: append fresh entries per event
    | reduce ($new | to_entries[]) as $e (
        .;
        .hooks[$e.key] = ((.hooks[$e.key] // []) + $e.value)
      )
    # Step 3: drop now-empty event arrays
    | .hooks |= with_entries(select(.value | length > 0))
  ' "$file" > "$tmp" && mv "$tmp" "$file"

  echo "[repo-harness] Merged hook entries → $file"
  echo "[repo-harness]   Backup: $backup"
}

# Strip our tagged entries (no replacement).
strip_hooks_from() {
  local file=$1
  [ -f "$file" ] || { echo "[repo-harness] $file does not exist, skipping"; return; }

  local tmp
  tmp=$(mktemp)
  jq --arg pat "$CLEANUP_PATTERN" '
    .hooks //= {}
    | .hooks |= with_entries(
        .value |= map(
          .hooks |= map(select((.command // "") | contains($pat) | not))
        )
        | .value |= map(select((.hooks // []) | length > 0))
      )
    | .hooks |= with_entries(select(.value | length > 0))
  ' "$file" > "$tmp" && mv "$tmp" "$file"
  rm -f "$tmp"

  echo "[repo-harness] Stripped repo-harness entries from $file"
}

install_shim() {
  mkdir -p "$AGENTIC_DIR"
  if [ ! -f "$SHIM_SRC" ]; then
    echo "[repo-harness] ERROR: shim source not found at $SHIM_SRC" >&2
    exit 1
  fi
  install -m 0755 "$SHIM_SRC" "$SHIM_PATH"
  echo "[repo-harness] Shim installed: $SHIM_PATH"
}

cmd_install() {
  local target="both"
  while [ $# -gt 0 ]; do
    case "$1" in
      --target) target="$2"; shift 2 ;;
      *) echo "[repo-harness] unknown arg: $1" >&2; exit 1 ;;
    esac
  done

  require_jq
  install_shim

  # Auto-trust the checkout we are installing from: running install is an
  # explicit act of trust in this copy of repo-harness.
  trust_repo "$SHIM_SRC_DIR" || true

  case "$target" in
    codex|both) merge_hooks_into "$CODEX_HOOKS" ;;
  esac
  case "$target" in
    claude|both) merge_hooks_into "$CLAUDE_SETTINGS" ;;
  esac

  cat <<EOF

[repo-harness] Install complete. Next steps:
  1. Restart Codex (NEW trust prompt — command strings changed from canary; accept it)
  2. Claude Code auto-reloads via ConfigChange (no action needed for already-running sessions)
  3. Test in an opt-in repo: triggering an event should run the real .ai/hooks/<name>.sh,
     not the canary (e.g. .ai/harness/runs/ should accumulate, not ~/.repo-harness-canary.log)
  4. Run '$0 status' to inspect
  5. Run '$0 uninstall' to remove (keeps shim file at $SHIM_PATH)

EOF
}

cmd_uninstall() {
  local target="both"
  while [ $# -gt 0 ]; do
    case "$1" in
      --target) target="$2"; shift 2 ;;
      *) echo "[repo-harness] unknown arg: $1" >&2; exit 1 ;;
    esac
  done

  require_jq
  case "$target" in
    codex|both) strip_hooks_from "$CODEX_HOOKS" ;;
  esac
  case "$target" in
    claude|both) strip_hooks_from "$CLAUDE_SETTINGS" ;;
  esac

  echo "[repo-harness] Uninstall complete. Shim preserved at $SHIM_PATH (re-install fast)"
}

cmd_migrate() {
  local repo=""
  local dry_run=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) dry_run=1; shift ;;
      --*) echo "[repo-harness] unknown arg: $1" >&2; exit 1 ;;
      *) repo="$1"; shift ;;
    esac
  done

  if [ -z "$repo" ]; then
    echo "[repo-harness] usage: $0 migrate <repo-path> [--dry-run]" >&2
    exit 1
  fi
  repo=$(cd "$repo" && pwd)
  [ -d "$repo/.git" ] || [ -f "$repo/.git" ] || {
    echo "[repo-harness] $repo is not a git repo" >&2; exit 1
  }
  [ -f "$repo/.ai/harness/workflow-contract.json" ] || {
    echo "[repo-harness] $repo is not repo-harness opt-in (no .ai/harness/workflow-contract.json)" >&2
    exit 1
  }

  echo "[repo-harness] Migrating: $repo (dry-run=$dry_run)"

  local proj_codex="$repo/.codex/hooks.json"
  local proj_claude="$repo/.claude/settings.json"

  if [ -f "$proj_codex" ]; then
    if [ "$dry_run" = "1" ]; then
      echo "  WOULD: backup + remove $proj_codex"
    else
      cp "$proj_codex" "${proj_codex}.repo-harness-migrated-backup"
      rm "$proj_codex"
      echo "  REMOVED: $proj_codex (backup: ${proj_codex}.repo-harness-migrated-backup)"
    fi
  else
    echo "  SKIP: $proj_codex (does not exist)"
  fi

  if [ -f "$proj_claude" ]; then
    require_jq
    if [ "$dry_run" = "1" ]; then
      echo "  WOULD: strip .hooks from $proj_claude"
    else
      cp "$proj_claude" "${proj_claude}.repo-harness-migrated-backup"
      local tmp
      tmp=$(mktemp)
      jq 'del(.hooks)' "$proj_claude" > "$tmp" && mv "$tmp" "$proj_claude"
      echo "  STRIPPED .hooks from: $proj_claude (backup: ${proj_claude}.repo-harness-migrated-backup)"
    fi
  else
    echo "  SKIP: $proj_claude (does not exist; no Claude project-level hooks to migrate)"
  fi

  if [ "$dry_run" = "1" ]; then
    echo "  WOULD: trust $repo in $TRUST_FILE"
  else
    trust_repo "$repo" || true
  fi

  cat <<EOF

[repo-harness] Migration of $repo complete (dry-run=$dry_run).
Next: ensure '$0 install' has been run (global shim must be active for hooks to fire).
EOF
}

cmd_status() {
  require_jq

  echo "=== repo-harness CLI status ==="
  echo "Shim source: $SHIM_SRC"
  echo "Shim installed: $SHIM_PATH"
  if [ -f "$SHIM_PATH" ]; then
    echo "  size: $(stat -f %z "$SHIM_PATH" 2>/dev/null || stat -c %s "$SHIM_PATH")B"
  else
    echo "  (not installed — run '$0 install')"
  fi
  echo ""

  for pair in "codex:${CODEX_HOOKS}" "claude:${CLAUDE_SETTINGS}"; do
    local host=${pair%%:*}
    local file=${pair#*:}
    echo "Host: ${host}"
    echo "  File: ${file}"
    if [ -f "$file" ]; then
      local count
      count=$(jq --arg shim "$SHIM_PATH" '
        [.hooks // {}
         | to_entries[]
         | .value[]
         | .hooks // []
         | .[]
         | select((.command // "") | contains($shim))
        ] | length
      ' "$file" 2>/dev/null || echo 0)
      echo "  repo-harness shim hooks registered: ${count}"
    else
      echo "  (file does not exist)"
    fi
  done
  echo ""

  echo "=== Current repo opt-in check ==="
  local repo
  if repo=$(git rev-parse --show-toplevel 2>/dev/null); then
    echo "  Repo: $repo"
    if [ -f "$repo/.ai/harness/workflow-contract.json" ]; then
      echo "  Opt-in marker: PRESENT"
    else
      echo "  Opt-in marker: ABSENT (hooks will exit 0 silently)"
    fi
    local primary_root
    if primary_root=$(resolve_primary_root "$repo"); then
      if [ -f "$TRUST_FILE" ] && grep -Fxq "$primary_root" "$TRUST_FILE"; then
        echo "  Trust: TRUSTED ($primary_root)"
      else
        echo "  Trust: NOT TRUSTED — hooks will exit 0; run '$0 trust $primary_root'"
      fi
    fi
    if [ -f "$repo/.codex/hooks.json" ]; then
      echo "  WARNING: $repo/.codex/hooks.json still exists (run migrate to clean up)"
    fi
  else
    echo "  (not in a git repo)"
  fi
  echo ""

  echo "=== Codex trust state (~/.codex/config.toml) ==="
  if [ -f "${HOME}/.codex/config.toml" ]; then
    local pattern="^\\[hooks\\.state\\.\"${HOME}/\\.codex/hooks\\.json"
    local user_level
    user_level=$(grep -c "$pattern" "${HOME}/.codex/config.toml" 2>/dev/null || true)
    user_level=${user_level:-0}
    echo "  User-level trust hash entries: ${user_level}"
  fi
}

cmd_hook() {
  local hook_name="${1:-}"
  [ -n "$hook_name" ] || { echo "[repo-harness] usage: $0 hook <event-script>.sh" >&2; exit 1; }
  [ -x "$SHIM_PATH" ] || { echo "[repo-harness] shim not installed; run '$0 install' first" >&2; exit 1; }
  exec bash "$SHIM_PATH" "$@"
}

usage() {
  # Print the header comment block (skip shebang) up to the first non-comment line.
  awk 'NR < 2 { next } !/^#/ { exit } { sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    install)   cmd_install "$@" ;;
    uninstall) cmd_uninstall "$@" ;;
    migrate)   cmd_migrate "$@" ;;
    status)    cmd_status "$@" ;;
    trust)     cmd_trust "$@" ;;
    untrust)   cmd_untrust "$@" ;;
    trust-list) cmd_trust_list "$@" ;;
    hook)      cmd_hook "$@" ;;
    -h|--help|help|"") usage ;;
    *)
      echo "[repo-harness] unknown subcommand: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
