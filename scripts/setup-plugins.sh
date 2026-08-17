#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-optional|--with-obsidian)
      echo "[setup-plugins] retired option ignored: $1" >&2
      shift
      ;;
    --hooks)
      profile="${2:-}"
      if [[ "$profile" == "none" ]]; then
        args+=(--no-hooks)
      else
        echo "[setup-plugins] retired hook profile ignored: ${profile:-<missing>}" >&2
      fi
      shift $(( $# >= 2 ? 2 : 1 ))
      ;;
    --lsp|--project-type)
      echo "[setup-plugins] retired option ignored: $1 ${2:-}" >&2
      shift $(( $# >= 2 ? 2 : 1 ))
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

if command -v repo-harness >/dev/null 2>&1; then
  exec repo-harness install ${args[@]+"${args[@]}"}
fi

if command -v bun >/dev/null 2>&1; then
  exec bun "$ROOT_DIR/src/cli/index.ts" install ${args[@]+"${args[@]}"}
fi

echo "[setup-plugins] repo-harness or bun is required to run the modern install path." >&2
exit 1
