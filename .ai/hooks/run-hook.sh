#!/bin/bash
# Shared hook dispatcher that resolves the repo root once before invoking a hook.
# Hooks are resolved relative to this script's own directory so the same
# dispatcher works vendored at <repo>/.ai/hooks AND installed centrally at
# ~/.repo-harness/hooks (the shim exports HOOK_REPO_ROOT either way).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_NAME="${1:-}"

if [[ -z "$HOOK_NAME" ]]; then
  echo "[HookRunner] Missing hook name." >&2
  exit 2
fi

shift || true

if [[ -n "${HOOK_REPO_ROOT:-}" ]]; then
  REPO_ROOT="$HOOK_REPO_ROOT"
elif REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" && [[ -n "$REPO_ROOT" ]]; then
  :
elif [[ "$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/.ai/hooks" == "$SCRIPT_DIR" ]]; then
  # Vendored layout (<repo>/.ai/hooks) invoked directly from outside the repo.
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
else
  echo "[HookRunner] Cannot resolve repo root: set HOOK_REPO_ROOT or run inside a git repo." >&2
  exit 2
fi

HOOK_PATH="$SCRIPT_DIR/$HOOK_NAME"
if [[ ! -f "$HOOK_PATH" ]]; then
  echo "[HookRunner] Hook not found: $HOOK_PATH" >&2
  exit 1
fi

export HOOK_REPO_ROOT="$REPO_ROOT"
if [[ "$HOOK_NAME" == "session-start-context.sh" ]]; then
  export REPO_HARNESS_SESSION_START_SECURITY="${REPO_HARNESS_SESSION_START_SECURITY:-1}"
fi
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
