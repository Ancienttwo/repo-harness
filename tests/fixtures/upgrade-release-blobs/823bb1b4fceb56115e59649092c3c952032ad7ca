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
cd "$REPO_ROOT"

hook_stdout_is_json_kind() {
  local stdout_file="$1"
  local kind="$2"

  [[ -s "$stdout_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    case "$kind" in
      decision)
        jq -e '(.decision == "block") or (.decision == "allow")' "$stdout_file" >/dev/null 2>&1
        return
        ;;
      user_prompt_context)
        jq -e '.hookSpecificOutput.hookEventName == "UserPromptSubmit" and (.hookSpecificOutput.additionalContext | type == "string" and length > 0)' "$stdout_file" >/dev/null 2>&1
        return
        ;;
      subagent_start_context)
        jq -e '.hookSpecificOutput.hookEventName == "SubagentStart" and (.hookSpecificOutput.additionalContext | type == "string" and length > 0)' "$stdout_file" >/dev/null 2>&1
        return
        ;;
    esac
  fi

  command -v bun >/dev/null 2>&1 || return 1
  STDOUT_FILE="$stdout_file" JSON_KIND="$kind" bun -e '
    const fs = require("fs");
    const file = process.env.STDOUT_FILE;
    const kind = process.env.JSON_KIND;
    const raw = fs.readFileSync(file, "utf8").trim();
    if (!raw.startsWith("{")) process.exit(1);
    const parsed = JSON.parse(raw);
    if (kind === "decision") {
      process.exit(parsed.decision === "block" || parsed.decision === "allow" ? 0 : 1);
    }
    const specific = parsed.hookSpecificOutput || {};
    if (
      kind === "user_prompt_context" &&
      specific.hookEventName === "UserPromptSubmit" &&
      typeof specific.additionalContext === "string" &&
      specific.additionalContext.trim()
    ) process.exit(0);
    if (
      kind === "subagent_start_context" &&
      specific.hookEventName === "SubagentStart" &&
      typeof specific.additionalContext === "string" &&
      specific.additionalContext.trim()
    ) process.exit(0);
    process.exit(1);
  ' >/dev/null 2>&1
}

# Codex swallows hook stdout differently from Claude: success stdout is
# dropped for ordinary hooks. Only context JSON and SubagentStop decision JSON
# for approved routes is surfaced on success. Stop decision JSON is deliberately
# suppressed because current Codex Desktop rejects it as an unsupported content
# type at turn finalization.
if [[ "${HOOK_HOST:-}" == "codex" && "$HOOK_NAME" != "session-start-context.sh" ]]; then
  if ! tmp_stdout="$(mktemp)" || ! tmp_stderr="$(mktemp)"; then
    # No temp space: run unfiltered rather than silently dropping the hook.
    exec bash "$HOOK_PATH" "$@"
  fi
  if bash "$HOOK_PATH" "$@" >"$tmp_stdout" 2>"$tmp_stderr"; then
    if [[ "$HOOK_NAME" == "subagent-stop-quality.sh" ]] && hook_stdout_is_json_kind "$tmp_stdout" decision; then
      cat "$tmp_stdout"
    elif [[ "$HOOK_NAME" == "codex-delegation-advisor.sh" ]] && hook_stdout_is_json_kind "$tmp_stdout" user_prompt_context; then
      cat "$tmp_stdout"
    elif [[ "$HOOK_NAME" == "subagent-start-context.sh" ]] && hook_stdout_is_json_kind "$tmp_stdout" subagent_start_context; then
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
