#!/bin/bash
# Prompt Guard Hook — UserPromptSubmit
# Thin entrypoint. Runtime logic lives in lib/prompt-guard-runtime.sh
# so this route stays inspectable while hook mirrors keep the same shape.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/prompt-guard-runtime.sh"
