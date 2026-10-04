#!/bin/bash
# Compatibility wrapper for the renamed First-Principles Guard.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/first-principles-guard.sh" ]]; then
  exec bash "$SCRIPT_DIR/first-principles-guard.sh" "$@"
fi

exit 0
