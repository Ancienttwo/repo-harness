#!/bin/bash
# Atomic Pending Marker — PostToolUse on Edit|Write
# Marks repo state as pending for atomic checkpoint commit.
# Deprecated: not enabled by the shared settings template; kept for legacy manual use.

set -u

# Resolve repo root — hooks may run from any cwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || true
if [ -z "$REPO_ROOT" ]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)" || true
fi
if [ -n "$REPO_ROOT" ]; then
  cd "$REPO_ROOT" 2>/dev/null || true
fi

MARKER=".claude/.atomic_pending"
mkdir -p ".claude" >/dev/null 2>&1 || true
date "+%Y-%m-%d %H:%M:%S" > "$MARKER" 2>/dev/null || true

exit 0
