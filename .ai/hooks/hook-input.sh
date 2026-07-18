#!/bin/bash
# Shared input parsing helpers for hook scripts.
# Prefers stdin JSON, with env/argv fallbacks for compatibility.

# Resolve repo root — hooks may run from any cwd
if [[ -z "${HOOK_REPO_ROOT:-}" ]]; then
  HOOK_REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || true
  if [[ -z "$HOOK_REPO_ROOT" ]]; then
    HOOK_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)" || true
  fi
  if [[ -n "$HOOK_REPO_ROOT" ]]; then
    cd "$HOOK_REPO_ROOT" 2>/dev/null || true
  fi
  export HOOK_REPO_ROOT
fi

if [[ -f "${HOOK_REPO_ROOT:-$(pwd)}/.ai/hooks/lib/workflow-state.sh" ]]; then
  # shellcheck source=/dev/null
  . "${HOOK_REPO_ROOT:-$(pwd)}/.ai/hooks/lib/workflow-state.sh"
fi

hook_read_stdin_once() {
  if [[ -n "${HOOK_STDIN_JSON+x}" ]]; then
    return
  fi

  if [[ -t 0 ]]; then
    HOOK_STDIN_JSON=""
    return
  fi

  HOOK_STDIN_JSON="$(cat 2>/dev/null || true)"
}

hook_json_extract_with_bun() {
  local json_input="$1"
  local path="$2"

  command -v bun >/dev/null 2>&1 || return 1

  JSON_INPUT="$json_input" JSON_PATH="$path" bun -e '
    const raw = process.env.JSON_INPUT ?? "";
    const path = (process.env.JSON_PATH ?? "").split(".").filter(Boolean);
    if (!raw) process.exit(1);

    let value = JSON.parse(raw);
    for (const key of path) {
      if (value == null || !(key in value)) process.exit(1);
      value = value[key];
    }

    if (value == null) process.exit(1);
    if (typeof value === "object") {
      process.stdout.write(JSON.stringify(value));
    } else {
      process.stdout.write(String(value));
    }
  ' 2>/dev/null
}

hook_validate_stdin_json() {
  if [[ -n "${HOOK_STDIN_JSON_VALID+x}" ]]; then
    return
  fi

  if [[ -z "$HOOK_STDIN_JSON" ]]; then
    HOOK_STDIN_JSON_VALID=""
    export HOOK_STDIN_JSON_VALID
    return
  fi

  if command -v jq >/dev/null 2>&1; then
    if printf '%s' "$HOOK_STDIN_JSON" | jq -e . >/dev/null 2>&1; then
      HOOK_STDIN_JSON_VALID="1"
    else
      HOOK_STDIN_JSON_VALID=""
    fi
  elif command -v bun >/dev/null 2>&1; then
    if JSON_INPUT="$HOOK_STDIN_JSON" bun -e '
      try { JSON.parse(process.env.JSON_INPUT ?? ""); }
      catch { process.exit(1); }
    ' >/dev/null 2>&1; then
      HOOK_STDIN_JSON_VALID="1"
    else
      HOOK_STDIN_JSON_VALID=""
    fi
  else
    # No validator available — can't tell missing-key from malformed-JSON;
    # default to silent to avoid noisy false positives.
    HOOK_STDIN_JSON_VALID="unknown"
  fi

  export HOOK_STDIN_JSON_VALID
}

hook_json_get() {
  local path="$1"
  local default_value="${2:-}"
  local parsed=""

  hook_read_stdin_once

  if [[ -z "$HOOK_STDIN_JSON" ]]; then
    printf '%s' "$default_value"
    return
  fi

  hook_validate_stdin_json

  if command -v jq >/dev/null 2>&1; then
    parsed="$(printf '%s' "$HOOK_STDIN_JSON" | jq -r "$path // empty" 2>/dev/null || true)"
  fi

  if [[ -z "$parsed" ]]; then
    parsed="$(hook_json_extract_with_bun "$HOOK_STDIN_JSON" "$path" || true)"
  fi

  if [[ -z "$parsed" ]]; then
    case "${HOOK_STDIN_JSON_VALID:-}" in
      "")
        echo "[HookInput] WARN: stdin is not valid JSON while requesting path: $path (jq/bun could not parse it)" >&2
        ;;
      unknown)
        # No validator on this system: defaults are silently used. Warn once
        # per process so jq-less hosts are discoverable without spamming.
        if [[ -z "${HOOK_INPUT_WARNED_NO_VALIDATOR:-}" ]]; then
          echo "[HookInput] WARN: neither jq nor bun is available; hook input falls back to defaults (first missed path: $path)" >&2
          HOOK_INPUT_WARNED_NO_VALIDATOR=1
        fi
        ;;
    esac
  fi

  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
  else
    printf '%s' "$default_value"
  fi
}

hook_json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

hook_sanitize_token() {
  local value="$1"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  value="$(printf '%s' "$value" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  printf '%s' "${value:-unknown}"
}

hook_parse_json_arg() {
  local raw_arg="${1:-}"
  local path="$2"

  if [[ -z "$raw_arg" ]]; then
    return
  fi

  if command -v jq >/dev/null 2>&1 && printf '%s' "$raw_arg" | jq -e . >/dev/null 2>&1; then
    printf '%s' "$raw_arg" | jq -r "$path // empty" 2>/dev/null || true
    return
  fi

  hook_json_extract_with_bun "$raw_arg" "$path" || true
}

hook_normalize_file_path() {
  # Map an absolute path that lives inside the repo to a repo-relative path so
  # downstream guards (ContractScopeGuard, _ref/_ops case matchers,
  # post-edit doc-drift matchers, etc.) can match against repo-relative
  # patterns like `.ai/hooks/` or `apps/*/src/`. Paths outside the repo are
  # returned unchanged so out-of-scope detection still works.
  local raw="$1"
  local repo_root="${HOOK_REPO_ROOT:-}"
  local repo_real raw_real

  [[ -z "$raw" ]] && { printf '%s' "$raw"; return; }
  [[ "$raw" != /* ]] && { printf '%s' "$raw"; return; }
  [[ -z "$repo_root" ]] && { printf '%s' "$raw"; return; }

  if [[ "$raw" == "$repo_root"/* ]]; then
    printf '%s' "${raw#"$repo_root"/}"
    return
  fi

  # Also handle the symlink case (e.g. macOS /var → /private/var temp dirs)
  # where the canonical repo path differs from HOOK_REPO_ROOT but they refer
  # to the same directory.
  repo_real="$(cd "$repo_root" 2>/dev/null && pwd -P)" || repo_real=""
  if [[ -n "$repo_real" && "$raw" == "$repo_real"/* ]]; then
    printf '%s' "${raw#"$repo_real"/}"
    return
  fi

  # As a last resort, resolve the raw path's real parent so we can strip the
  # canonical repo prefix even when the file itself does not exist yet.
  local raw_dir raw_base
  raw_dir="$(dirname "$raw")"
  raw_base="$(basename "$raw")"
  if raw_real="$(cd "$raw_dir" 2>/dev/null && pwd -P)"; then
    raw_real="$raw_real/$raw_base"
    if [[ -n "$repo_real" && "$raw_real" == "$repo_real"/* ]]; then
      printf '%s' "${raw_real#"$repo_real"/}"
      return
    fi
    if [[ "$raw_real" == "$repo_root"/* ]]; then
      printf '%s' "${raw_real#"$repo_root"/}"
      return
    fi
  fi

  printf '%s' "$raw"
}

hook_get_file_path() {
  local arg="${1:-}"
  local parsed=""

  for path in '.file_path' '.tool_input.file_path' '.trigger_file_path' '.parent_file_path'; do
    parsed="$(hook_json_get "$path" '')"
    if [[ -n "$parsed" ]]; then
      hook_normalize_file_path "$parsed"
      return
    fi

    parsed="$(hook_parse_json_arg "$arg" "$path")"
    if [[ -n "$parsed" ]]; then
      hook_normalize_file_path "$parsed"
      return
    fi
  done

  if [[ -n "${CLAUDE_FILE_PATH:-}" ]]; then
    hook_normalize_file_path "$CLAUDE_FILE_PATH"
    return
  fi

  hook_normalize_file_path "$arg"
}

# Codex apply_patch exposes the freeform patch at tool_input.command instead of
# a single file_path. Emit every touched path so the edit guard can enforce the
# same deterministic boundary for multi-file patches.
hook_get_apply_patch_paths() {
  local command=""
  command="$(hook_json_get '.tool_input.command' '')"
  [[ -n "$command" ]] || return 0

  while IFS= read -r path || [[ -n "$path" ]]; do
    [[ -n "$path" ]] || continue
    hook_normalize_file_path "$path"
    printf '\n'
  done < <(
    printf '%s\n' "$command" | sed -nE \
      -e 's/^\*\*\* (Add|Update|Delete) File: (.+)$/\2/p' \
      -e 's/^\*\*\* Move to: (.+)$/\1/p'
  )
}

hook_get_prompt() {
  local arg="${1:-}"
  local parsed=""

  if [[ -n "${PROMPT:-}" ]]; then
    printf '%s' "$PROMPT"
    return
  fi

  for path in '.prompt' '.user_message'; do
    parsed="$(hook_json_get "$path" '')"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi

    parsed="$(hook_parse_json_arg "$arg" "$path")"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi
  done

  printf '%s' "$arg"
}

hook_get_session_id() {
  local arg="${1:-}"
  local parsed=""

  if [[ -n "${HOOK_SESSION_ID:-}" ]]; then
    printf '%s' "$HOOK_SESSION_ID"
    return
  fi

  parsed="$(hook_json_get '.session_id' '')"
  if [[ -n "$parsed" ]]; then
    HOOK_SESSION_ID="$parsed"
    export HOOK_SESSION_ID
    printf '%s' "$parsed"
    return
  fi

  parsed="$(hook_parse_json_arg "$arg" '.session_id')"
  if [[ -n "$parsed" ]]; then
    HOOK_SESSION_ID="$parsed"
    export HOOK_SESSION_ID
    printf '%s' "$parsed"
    return
  fi

  if [[ -n "${CLAUDE_SESSION_ID:-${CODEX_SESSION_ID:-}}" ]]; then
    HOOK_SESSION_ID="${CLAUDE_SESSION_ID:-${CODEX_SESSION_ID:-}}"
    export HOOK_SESSION_ID
    printf '%s' "$HOOK_SESSION_ID"
    return
  fi

  printf '%s' ""
}

hook_get_transcript_path() {
  local arg="${1:-}"
  local parsed=""

  parsed="$(hook_json_get '.transcript_path' '')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  parsed="$(hook_parse_json_arg "$arg" '.transcript_path')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  printf '%s' "${CLAUDE_TRANSCRIPT_PATH:-${CODEX_TRANSCRIPT_PATH:-}}"
}

hook_get_cwd() {
  local arg="${1:-}"
  local parsed=""

  parsed="$(hook_json_get '.cwd' '')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  parsed="$(hook_parse_json_arg "$arg" '.cwd')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  printf '%s' "${HOOK_REPO_ROOT:-$(pwd)}"
}

hook_get_session_source() {
  local arg="${1:-}"
  local parsed=""

  parsed="$(hook_json_get '.source' '')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  parsed="$(hook_parse_json_arg "$arg" '.source')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  printf '%s' "${CLAUDE_SESSION_SOURCE:-}"
}

hook_get_memory_type() {
  local arg="${1:-}"
  local parsed=""

  parsed="$(hook_json_get '.memory_type' '')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  parsed="$(hook_parse_json_arg "$arg" '.memory_type')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  printf '%s' "${CLAUDE_MEMORY_TYPE:-}"
}

hook_get_load_reason() {
  local arg="${1:-}"
  local parsed=""

  parsed="$(hook_json_get '.load_reason' '')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  parsed="$(hook_parse_json_arg "$arg" '.load_reason')"
  if [[ -n "$parsed" ]]; then
    printf '%s' "$parsed"
    return
  fi

  printf '%s' "${CLAUDE_LOAD_REASON:-}"
}

hook_get_write_payload() {
  local arg="${1:-}"
  local parsed=""

  for path in '.tool_input.content' '.tool_input.new_string' '.tool_input.text' '.tool_input.command'; do
    parsed="$(hook_json_get "$path" '')"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi
    parsed="$(hook_parse_json_arg "$arg" "$path")"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi
  done
}

hook_get_tool_name() {
  local arg="${1:-}"
  local parsed=""

  for path in '.tool_name' '.hook_event_name'; do
    parsed="$(hook_json_get "$path" '')"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi
    parsed="$(hook_parse_json_arg "$arg" "$path")"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi
  done

  printf '%s' "${HOOK_TOOL_NAME:-}"
}

hook_get_duration_ms() {
  local arg="${1:-}"
  local parsed=""

  for path in '.duration_ms' '.tool_response.duration_ms'; do
    parsed="$(hook_json_get "$path" '')"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi
    parsed="$(hook_parse_json_arg "$arg" "$path")"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi
  done

  printf '%s' "${HOOK_DURATION_MS:-0}"
}

hook_get_exit_code() {
  local arg="${1:-}"
  local parsed=""

  for path in '.tool_response.exit_code' '.exit_code'; do
    parsed="$(hook_json_get "$path" '')"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi
    parsed="$(hook_parse_json_arg "$arg" "$path")"
    if [[ -n "$parsed" ]]; then
      printf '%s' "$parsed"
      return
    fi
  done

  printf '%s' "${EXIT_CODE:-0}"
}

hook_get_run_id() {
  local arg="${1:-}"
  local parsed=""
  local session_id=""
  local session_source=""
  local transcript_path=""

  if [[ -n "${HOOK_RUN_ID:-}" ]]; then
    printf '%s' "$HOOK_RUN_ID"
    return
  fi

  for path in '.run_id' '.tool_input.run_id'; do
    parsed="$(hook_json_get "$path" '')"
    if [[ -n "$parsed" ]]; then
      HOOK_RUN_ID="$parsed"
      export HOOK_RUN_ID
      printf '%s' "$parsed"
      return
    fi

    parsed="$(hook_parse_json_arg "$arg" "$path")"
    if [[ -n "$parsed" ]]; then
      HOOK_RUN_ID="$parsed"
      export HOOK_RUN_ID
      printf '%s' "$parsed"
      return
    fi
  done

  if [[ -n "${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-}}" ]]; then
    HOOK_RUN_ID="${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-}}"
    export HOOK_RUN_ID
    printf '%s' "$HOOK_RUN_ID"
    return
  fi

  session_id="$(hook_get_session_id "$arg")"
  if [[ -n "$session_id" ]]; then
    session_source="$(hook_get_session_source "$arg")"
    HOOK_RUN_ID="run-$(hook_sanitize_token "${session_source:-session}")-$(hook_sanitize_token "$session_id")"
    export HOOK_RUN_ID
    printf '%s' "$HOOK_RUN_ID"
    return
  fi

  transcript_path="$(hook_get_transcript_path "$arg")"
  if [[ -n "$transcript_path" ]]; then
    HOOK_RUN_ID="run-transcript-$(hook_sanitize_token "$transcript_path")"
    export HOOK_RUN_ID
    printf '%s' "$HOOK_RUN_ID"
    return
  fi

  HOOK_RUN_ID="run-$(date '+%Y%m%dT%H%M%S')-$$"
  export HOOK_RUN_ID
  printf '%s' "$HOOK_RUN_ID"
}

hook_failure_log_file() {
  if declare -F workflow_failure_log_file >/dev/null 2>&1; then
    workflow_failure_log_file
    return 0
  fi
  printf '.ai/harness/failures/latest.jsonl'
}

hook_append_failure_record() {
  local guard="$1"
  local action="$2"
  local reason="$3"
  local fix="$4"
  local failure_class="$5"
  local run_id="$6"
  local log_file

  log_file="$(hook_failure_log_file)"
  mkdir -p "$(dirname "$log_file")"

  printf '{"ts":"%s","guard":"%s","action":"%s","reason":"%s","fix":"%s","failure_class":"%s","run_id":"%s"}\n' \
    "$(hook_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")" \
    "$(hook_json_escape "$guard")" \
    "$(hook_json_escape "$action")" \
    "$(hook_json_escape "$reason")" \
    "$(hook_json_escape "$fix")" \
    "$(hook_json_escape "$failure_class")" \
    "$(hook_json_escape "$run_id")" \
    >> "$log_file"
}

hook_circuit_record() {
  local kind="$1" guard="$2" reason="$3" path_action="$4" fingerprint="$5"
  local profile="${6:-}" explicit_high_risk="${7:-false}" risk_consult="${8:-false}" user_consult="${9:-false}" strong="${10:-false}"
  local progress_token="unknown" payload output
  if [[ -f ".ai/harness/state/effective.json" ]] && command -v jq >/dev/null 2>&1; then
    progress_token="$(jq -r '.progress_token // "unknown"' .ai/harness/state/effective.json 2>/dev/null || printf unknown)"
    [[ -n "$profile" ]] || profile="$(jq -r '.workflow_profile // empty' .ai/harness/state/effective.json 2>/dev/null || true)"
  fi
  case "$profile" in
    lite|standard|strict) ;;
    *) [[ "$kind" == "guard" ]] && profile="strict" || profile="standard" ;;
  esac
  command -v jq >/dev/null 2>&1 || return 2
  payload="$(jq -nc \
    --arg kind "$kind" --arg guard "$guard" --arg reason "$reason" --arg path "$path_action" \
    --arg token "$progress_token" --arg fingerprint "$fingerprint" --arg profile "$profile" \
    --argjson high "$explicit_high_risk" --argjson risk "$risk_consult" --argjson user "$user_consult" --argjson strong "$strong" \
    '{kind:$kind,guard:$guard,reason:$reason,pathOrAction:$path,progressToken:$token,fingerprint:$fingerprint,profile:$profile,explicitHighRiskContract:$high,riskTriggeredConsult:$risk,userRequestedConsult:$user,strongBoundary:$strong}')"
  if [[ -n "${REPO_HARNESS_HOOK_CLI:-}" && -f "${REPO_HARNESS_HOOK_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    output="$(printf '%s' "$payload" | bun "$REPO_HARNESS_HOOK_CLI" circuit-breaker-record 2>/dev/null)" || return 2
  elif command -v repo-harness-hook >/dev/null 2>&1; then
    output="$(printf '%s' "$payload" | repo-harness-hook circuit-breaker-record 2>/dev/null)" || return 2
  else
    return 2
  fi
  printf '%s\n' "$output"
  [[ "$(printf '%s' "$output" | jq -r '.allowed // false')" == "true" ]]
}

hook_structured_error() {
  local guard="$1"
  local reason="$2"
  local fix="$3"
  local failure_class="${4:-state_violation}"
  local action="${5:-block}"
  local run_id=""

  # Older guards passed the action token as arg 4 before failure_class existed.
  # Keep translating those shimmed calls so generated hooks and self-hosted hooks
  # preserve behavior while defaulting the missing failure_class sanely.
  case "$failure_class" in
    block|warn|advisory)
      action="$failure_class"
      failure_class="state_violation"
      ;;
    missing_artifact|state_violation|contract_failure|quality_gate)
      ;;
    *)
      failure_class="state_violation"
      ;;
  esac

  run_id="$(hook_get_run_id)"
  local profile="${WORKFLOW_PROFILE:-}" strong_boundary="false"
  local circuit_output="" circuit_tripped="false"
  case "$guard" in
    *Security*|*Secret*|ContractScopeGuard|OpsPrivateGuard|ExternalReferenceGuard|StrictWorktreeGuard|*Destructive*)
      strong_boundary="true"
      ;;
  esac
  if command -v jq >/dev/null 2>&1; then
    circuit_output="$(hook_circuit_record guard "$guard" "$reason" "$fix" "$guard|$reason|$fix" "$profile" false false false "$strong_boundary" || true)"
    circuit_tripped="$(printf '%s' "$circuit_output" | jq -r '.tripped // false' 2>/dev/null || printf false)"
  fi
  hook_append_failure_record "$guard" "$action" "$reason" "$fix" "$failure_class" "$run_id"

  # After the limit, emit only the terminal structured action. The caller still
  # exits non-zero, so strong boundaries never fail open.
  if [[ "$circuit_tripped" == "true" ]]; then
    printf '%s\n' "$circuit_output"
    return 0
  fi

  # Claude Code shows stderr to the model when the hook exits 2.
  # Mirror reason/fix there so callers that pair this with `exit 2` produce a
  # useful block message instead of "Failed with non-blocking status code: No stderr output".
  if [[ "$action" == "block" ]]; then
    printf '[%s] %s\n' "$guard" "$reason" >&2
    if [[ -n "$fix" ]]; then
      printf '  Fix: %s\n' "$fix" >&2
    fi
  fi

  printf '{"guard":"%s","action":"%s","reason":"%s","fix":"%s","failure_class":"%s","run_id":"%s"}\n' \
    "$(hook_json_escape "$guard")" \
    "$(hook_json_escape "$action")" \
    "$(hook_json_escape "$reason")" \
    "$(hook_json_escape "$fix")" \
    "$(hook_json_escape "$failure_class")" \
    "$(hook_json_escape "$run_id")"
}

# Cache stdin eagerly in the parent shell so multiple getters can reuse it.
hook_read_stdin_once
