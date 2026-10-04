#!/bin/bash
# Minimal-change objective signal observer — PostToolUse on Edit|Write.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/minimal-change.sh"

file_path="$(hook_get_file_path "${1:-}")"
[[ -z "$file_path" ]] && exit 0
minimal_change_post_edit_enabled || exit 0

minimal_change_hook_entry signals --phase post-edit --path "$file_path" >/dev/null 2>&1 || true

exit 0
