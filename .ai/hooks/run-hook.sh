#!/bin/bash
# Shared hook dispatcher that resolves the repo root once before invoking a hook.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${HOOK_REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
HOOK_NAME="${1:-}"

if [[ -z "$HOOK_NAME" ]]; then
  echo "[HookRunner] Missing hook name." >&2
  exit 2
fi

shift || true

HOOK_PATH="$REPO_ROOT/.ai/hooks/$HOOK_NAME"
if [[ ! -f "$HOOK_PATH" ]]; then
  echo "[HookRunner] Hook not found: $REPO_ROOT/.ai/hooks/$HOOK_NAME" >&2
  exit 1
fi

export HOOK_REPO_ROOT="$REPO_ROOT"
cd "$REPO_ROOT"

# Codex swallows hook stdout differently from Claude: success stdout is
# dropped for every hook except session-start-context.sh, and only
# stop-orchestrator.sh may surface its Stop decision JSON on success.
if [[ "${HOOK_HOST:-}" == "codex" && "$HOOK_NAME" != "session-start-context.sh" ]]; then
  if ! tmp_stdout="$(mktemp)" || ! tmp_stderr="$(mktemp)"; then
    # No temp space: run unfiltered rather than silently dropping the hook.
    exec bash "$HOOK_PATH" "$@"
  fi
  if bash "$HOOK_PATH" "$@" >"$tmp_stdout" 2>"$tmp_stderr"; then
    if [[ "$HOOK_NAME" == "stop-orchestrator.sh" ]] && grep -q '"decision"[[:space:]]*:' "$tmp_stdout"; then
      cat "$tmp_stdout"
    fi
    rm -f "$tmp_stdout" "$tmp_stderr"
    exit 0
  else
    hook_status=$?
    if [[ -s "$tmp_stderr" ]]; then
      cat "$tmp_stderr" >&2
    fi
    if [[ -s "$tmp_stdout" ]]; then
      grep -v '^{"guard":' "$tmp_stdout" >&2 || true
    fi
    rm -f "$tmp_stdout" "$tmp_stderr"
    exit "$hook_status"
  fi
fi

exec bash "$HOOK_PATH" "$@"
