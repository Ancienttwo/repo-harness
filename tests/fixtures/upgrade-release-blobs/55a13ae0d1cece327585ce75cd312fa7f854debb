#!/bin/bash
# Minimal-change advisory context — SessionStart.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/minimal-change.sh"

if output="$(minimal_change_hook_entry context --phase session 2>/dev/null)"; then
  [[ -n "$output" ]] && printf '%s\n' "$output"
fi

exit 0
