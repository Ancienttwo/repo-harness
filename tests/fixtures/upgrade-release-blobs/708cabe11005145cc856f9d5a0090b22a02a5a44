#!/bin/bash
# Worktree Guard — PreToolUse on Edit|Write
# Default behavior: warn in primary tree.
# Enforced behavior: block when .claude/.require-worktree exists.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

REQUIRE_MARKER=".claude/.require-worktree"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[WorktreeGuard] Not a git repository. Skip worktree policy check."
  exit 0
fi

GIT_DIR="$(git rev-parse --git-dir 2>/dev/null || true)"
if [[ "$GIT_DIR" == *".git/worktrees/"* ]]; then
  exit 0
fi

if [[ -f "$REQUIRE_MARKER" ]]; then
  echo "[WorktreeGuard] Mutation blocked: primary working tree detected ($GIT_DIR)."
  echo "  Enforcement marker found: $REQUIRE_MARKER"
  echo "  Use a linked worktree for write operations."
  echo "  Example: git worktree add ../<repo>-wt-<branch> -b <branch>"
  hook_structured_error \
    "WorktreeGuard" \
    "Primary working tree detected at $GIT_DIR while $REQUIRE_MARKER is present." \
    "Create and switch to a linked worktree before retrying the write operation." \
    "state_violation"
  exit 2
fi

echo "[WorktreeGuard] Warning: primary working tree detected ($GIT_DIR)."
echo "  To enforce linked worktrees, create $REQUIRE_MARKER"
exit 0
