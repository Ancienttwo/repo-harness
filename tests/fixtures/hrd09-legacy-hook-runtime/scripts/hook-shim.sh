#!/usr/bin/env bash
# scripts/hook-shim.sh — repo-harness global hook dispatcher (Phase 0.5 bash prototype).
#
# Installed by `scripts/repo-harness.sh install` to ~/.repo-harness/hook-shim.sh.
# Phase 1 CLI replaces this file with `repo-harness hook <event>` subcommand.
#
# Invoked from user-level hook configs:
#   bash ~/.repo-harness/hook-shim.sh <hook-script-name>.sh [extra-args...]
#
# Behavior:
#   1. Resolve current repo via `git rev-parse --show-toplevel`
#   2. If not in a git repo OR not repo-harness opt-in → silent exit 0
#   3. If the repo's primary root is not listed in the trust file → exit 0
#      (session-start prints a one-line hint so the skip is discoverable)
#   4. Resolve the hook runtime (central-first, see below) and delegate to its
#      `run-hook.sh <hook> [args...]` with HOOK_REPO_ROOT pointing at the repo.
#
# Hook runtime resolution (central-first so one `install` updates every repo):
#   a. REPO_HARNESS_HOOK_SOURCE env: `repo` | `central` | absolute hooks dir
#   b. repo pin: `"hook_source": "repo"` in <repo>/.ai/harness/policy.json
#      (self-hosting checkouts pin this so hook development runs live code)
#   c. central bundle: ${REPO_HARNESS_HOME}/hooks (installed by `install`)
#   d. fallback: <repo>/.ai/hooks (vendored copy, pre-bundle installs)
#
# Opt-in marker: .ai/harness/workflow-contract.json (any non-opt-in repo is no-op)
# Trust file:    ${REPO_HARNESS_HOME:-~/.repo-harness}/trusted-repos — one primary
#                repo root per line. Linked worktrees inherit trust from their
#                primary repo so contract worktrees keep working. Manage with
#                `scripts/repo-harness.sh trust|untrust|trust-list`.

set -euo pipefail

HOOK_NAME="${1:-}"
if [ -z "$HOOK_NAME" ]; then
  echo "[repo-harness-shim] missing hook script name" >&2
  exit 2
fi

REPO_HARNESS_HOME="${REPO_HARNESS_HOME:-$HOME/.repo-harness}"
TRUST_FILE="$REPO_HARNESS_HOME/trusted-repos"
CENTRAL_HOOKS_DIR="$REPO_HARNESS_HOME/hooks"

repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -f "$repo/.ai/harness/workflow-contract.json" ] || exit 0

# Safety: defer to project-level if it still exists (prevents double-fire on
# non-migrated repos). After `repo-harness migrate <repo>` removes the project
# .codex/hooks.json, this guard releases and the global shim takes over.
[ -f "$repo/.codex/hooks.json" ] && exit 0

# Trust gate: never execute repo-local hook code from a repo the user has not
# explicitly trusted. Trust is keyed on the PRIMARY repo root (parent of the
# common git dir) so linked worktrees of a trusted repo stay trusted.
common_dir=$(git -C "$repo" rev-parse --git-common-dir 2>/dev/null) || exit 0
case "$common_dir" in
  /*) ;;
  *) common_dir="$repo/$common_dir" ;;
esac
primary_root=$(cd "$(dirname "$common_dir")" 2>/dev/null && pwd -P) || exit 0

if ! { [ -f "$TRUST_FILE" ] && grep -Fxq "$primary_root" "$TRUST_FILE"; }; then
  if [ "$HOOK_NAME" = "session-start-context.sh" ]; then
    echo "[repo-harness-shim] repo not trusted; hooks skipped. Trust it with: bash scripts/repo-harness.sh trust $primary_root" >&2
  fi
  exit 0
fi

resolve_hooks_dir() {
  case "${REPO_HARNESS_HOOK_SOURCE:-}" in
    repo) printf '%s' "$repo/.ai/hooks"; return ;;
    central) printf '%s' "$CENTRAL_HOOKS_DIR"; return ;;
    /*) printf '%s' "$REPO_HARNESS_HOOK_SOURCE"; return ;;
  esac

  if [ -f "$repo/.ai/harness/policy.json" ] \
    && grep -Eq '"hook_source"[[:space:]]*:[[:space:]]*"repo"' "$repo/.ai/harness/policy.json"; then
    printf '%s' "$repo/.ai/hooks"
    return
  fi

  if [ -f "$CENTRAL_HOOKS_DIR/run-hook.sh" ]; then
    printf '%s' "$CENTRAL_HOOKS_DIR"
    return
  fi

  printf '%s' "$repo/.ai/hooks"
}

hooks_dir="$(resolve_hooks_dir)"
[ -f "$hooks_dir/run-hook.sh" ] || exit 0

export HOOK_REPO_ROOT="$repo"
exec bash "$hooks_dir/run-hook.sh" "$@"
