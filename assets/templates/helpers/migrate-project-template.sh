#!/bin/bash
# Delegate workflow migrations to the canonical repo-harness implementation.
#
# The package-local source tree is authoritative unless the caller explicitly
# selects a source checkout with REPO_HARNESS_SOURCE_ROOT.

set -euo pipefail

HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PACKAGE_ROOT="$(cd "$HELPER_DIR/../../.." && pwd -P)"
SOURCE_ROOT="${REPO_HARNESS_SOURCE_ROOT:-$PACKAGE_ROOT}"

if [[ "$SOURCE_ROOT" != /* ]]; then
  echo "[migrate] REPO_HARNESS_SOURCE_ROOT must be an absolute path: $SOURCE_ROOT" >&2
  exit 1
fi

UPSTREAM_SCRIPT="$SOURCE_ROOT/scripts/migrate-project-template.sh"

if [[ ! -f "$UPSTREAM_SCRIPT" ]]; then
  echo "[migrate] Upstream repo-harness migration script not found: $UPSTREAM_SCRIPT" >&2
  echo "[migrate] Set REPO_HARNESS_SOURCE_ROOT to an explicit repo-harness source checkout." >&2
  exit 1
fi

exec bash "$UPSTREAM_SCRIPT" "$@"
