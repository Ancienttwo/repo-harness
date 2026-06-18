#!/bin/bash
# Post-Bash Hook — PostToolUse on Bash
# Reminds to rewrite (not patch) when tests fail.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

post_bash_set_tool_output_from_stdin() {
  local parsed tmp

  hook_read_stdin_once
  [[ -n "${HOOK_STDIN_JSON:-}" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    if printf '%s' "$HOOK_STDIN_JSON" | jq -e 'has("tool_output") and .tool_output != null' >/dev/null 2>&1; then
      IFS= read -r -d '' parsed < <(printf '%s' "$HOOK_STDIN_JSON" | jq -j '.tool_output' 2>/dev/null; printf '\0')
      TOOL_OUTPUT="$parsed"
      return 0
    fi
  fi

  command -v bun >/dev/null 2>&1 || return 1
  tmp="$(mktemp "${TMPDIR:-/tmp}/post-bash-tool-output.XXXXXX")" || return 1
  if JSON_INPUT="$HOOK_STDIN_JSON" bun -e '
    const raw = process.env.JSON_INPUT ?? "";
    const value = JSON.parse(raw).tool_output;
    if (value == null) process.exit(1);
    if (typeof value === "object") process.stdout.write(JSON.stringify(value));
    else process.stdout.write(String(value));
  ' > "$tmp" 2>/dev/null; then
    IFS= read -r -d '' parsed < <(cat "$tmp"; printf '\0')
    TOOL_OUTPUT="$parsed"
    rm -f "$tmp"
    return 0
  fi
  rm -f "$tmp"
  return 1
}

TOOL_OUTPUT="${1:-${TOOL_OUTPUT:-}}"
EXIT_CODE="${2:-${EXIT_CODE:-}}"
COMMAND_TEXT="$(hook_json_get '.tool_input.command' '')"

if [[ -z "$TOOL_OUTPUT" ]]; then
  post_bash_set_tool_output_from_stdin || TOOL_OUTPUT="$(hook_json_get '.tool_output' '')"
fi
if [[ -z "$EXIT_CODE" ]]; then
  EXIT_CODE="$(hook_json_get '.exit_code' '')"
fi

post_bash_output_line_count() {
  local output="$1"
  if [[ -z "$output" ]]; then
    printf '0'
    return
  fi
  printf '%s' "$output" | awk 'END { print NR }'
}

post_bash_output_byte_count() {
  local output="$1"
  printf '%s' "$output" | wc -c | tr -d '[:space:]'
}

post_bash_sha256() {
  local output="$1"
  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$output" | shasum -a 256 | awk '{ print $1 }'
    return
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$output" | sha256sum | awk '{ print $1 }'
    return
  fi
  printf ''
}

post_bash_failure_signal() {
  local output="$1"
  [[ -n "$output" ]] || return 1
  printf '%s\n' "$output" | grep -qEi "(^|[[:space:]])(FAIL|FAILED|failed)([[:space:]:,]|$)|Traceback|panic:|fatal:|error.*test"
}

post_bash_exit_failed() {
  local exit_code="$1"
  [[ -n "$exit_code" && "$exit_code" != "0" ]]
}

post_bash_broad_command() {
  local command_text="$1"
  local trimmed
  trimmed="$(printf '%s' "$command_text" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"

  [[ -n "$trimmed" ]] || return 1

  if printf '%s\n' "$trimmed" | grep -qE '(^|[;&|][[:space:]]*)find[[:space:]]+\./?([[:space:]]|$)'; then
    return 0
  fi
  if printf '%s\n' "$trimmed" | grep -qE '(^|[;&|][[:space:]]*)ls[[:space:]]+-[^;&|]*R'; then
    return 0
  fi
  if printf '%s\n' "$trimmed" | grep -qE '^[[:space:]]*rg([[:space:]]+-[-A-Za-z0-9_=]+)*[[:space:]]+[^[:space:]]+[[:space:]]*$'; then
    return 0
  fi
  if printf '%s\n' "$trimmed" | grep -qE '^[[:space:]]*grep[[:space:]]+-[A-Za-z]*[Rr][A-Za-z]*([[:space:]]+-[-A-Za-z0-9_=]+)*[[:space:]]+[^[:space:]]+[[:space:]]*$'; then
    return 0
  fi
  if printf '%s\n' "$trimmed" | grep -qE '(^|[;&|][[:space:]]*)cat[[:space:]]+([^;&|]*[*?][^;&|]*|\.(/)?([[:space:]]|$)|[^;&|]*[[:space:]][^;&|]*[[:space:]][^;&|]*)'; then
    return 0
  fi

  return 1
}

broad_command=false
recommended_next_tool=""
if post_bash_broad_command "$COMMAND_TEXT"; then
  broad_command=true
  recommended_next_tool="codegraph_context"
fi
output_line_count="$(post_bash_output_line_count "$TOOL_OUTPUT")"
raw_output_bytes="$(post_bash_output_byte_count "$TOOL_OUTPUT")"
failure_signal=false
if post_bash_failure_signal "$TOOL_OUTPUT"; then
  failure_signal=true
fi
rtk_available=false
if command -v rtk >/dev/null 2>&1; then
  rtk_available=true
fi

LONG_OUTPUT_LINES=200
LONG_OUTPUT_BYTES=32768
verbosity_class="inline"
suggested_runner="inline"
raw_output_path=""
raw_output_sha256=""

if post_bash_exit_failed "$EXIT_CODE"; then
  verbosity_class="failure"
  suggested_runner="raw"
elif (( output_line_count >= LONG_OUTPUT_LINES || raw_output_bytes >= LONG_OUTPUT_BYTES )); then
  verbosity_class="long"
  if [[ "$broad_command" == "true" && "$rtk_available" == "true" ]]; then
    suggested_runner="rtk"
  else
    suggested_runner="raw"
  fi
fi

if [[ "$verbosity_class" != "inline" ]]; then
  output_dir="$(workflow_runs_dir)/bash-output"
  mkdir -p "$output_dir"
  raw_output_sha256="$(post_bash_sha256 "$TOOL_OUTPUT")"
  raw_output_path="${output_dir}/post-bash-$(date '+%Y%m%dT%H%M%S')-$$-${raw_output_sha256:0:12}.log"
  printf '%s' "$TOOL_OUTPUT" > "$raw_output_path"
fi

if [[ "$EXIT_CODE" != "0" ]]; then
  if [[ "$failure_signal" == "true" ]]; then
    echo "[PostBash] Tests failed. Reminder: failure = rewrite module, not patching."
  fi
fi

checks_file="$(workflow_checks_file)"
post_bash_checks_file="$(dirname "$checks_file")/post-bash-latest.json"
target_checks_file="$post_bash_checks_file"

mkdir -p "$(dirname "$target_checks_file")"
if [[ -n "$raw_output_path" ]]; then
  raw_output_path_json="\"$(hook_json_escape "$raw_output_path")\""
else
  raw_output_path_json="null"
fi
if [[ -n "$raw_output_sha256" ]]; then
  raw_output_sha256_json="\"$(hook_json_escape "$raw_output_sha256")\""
else
  raw_output_sha256_json="null"
fi
cat > "$target_checks_file" <<EOF_CHECKS
{
  "source": "post-bash",
  "command": "$(hook_json_escape "$COMMAND_TEXT")",
  "exit_code": ${EXIT_CODE:-0},
  "status": "$([[ "${EXIT_CODE:-0}" = "0" ]] && echo pass || echo fail)",
  "broad_command": ${broad_command},
  "output_line_count": ${output_line_count:-0},
  "verbosity_class": "$(hook_json_escape "$verbosity_class")",
  "suggested_runner": "$(hook_json_escape "$suggested_runner")",
  "raw_output_path": ${raw_output_path_json},
  "raw_output_bytes": ${raw_output_bytes:-0},
  "raw_output_sha256": ${raw_output_sha256_json},
  "failure_signal": ${failure_signal},
  "rtk_available": ${rtk_available},
  "recommended_next_tool": "$(hook_json_escape "$recommended_next_tool")",
  "generated_at": "$(date '+%Y-%m-%dT%H:%M:%S%z')"
}
EOF_CHECKS

if [[ -f "$checks_file" ]]; then
  echo "[ChecksFile] Preserved ${checks_file}; updated ${target_checks_file}."
else
  echo "[ChecksFile] Updated ${target_checks_file}; ${checks_file} remains reserved for repo-harness-run-trace.v1."
fi

# Aggregated advisory (route-registry keeps one PostToolUse bash entry; the
# dispatcher-level aggregation lives here). Only speaks on release commands.
if [[ -x "$SCRIPT_DIR/changelog-guard.sh" ]]; then
  TOOL_COMMAND="$COMMAND_TEXT" bash "$SCRIPT_DIR/changelog-guard.sh" </dev/null || true
fi
