#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  if [[ "$REPO_HARNESS_TARGET_REPO_ROOT" != /* ]]; then
    echo "sprint-backlog: REPO_HARNESS_TARGET_REPO_ROOT must be an absolute path" >&2
    exit 2
  fi
  if ! REPO_ROOT="$(cd "$REPO_HARNESS_TARGET_REPO_ROOT" 2>/dev/null && pwd -P)"; then
    echo "sprint-backlog: REPO_HARNESS_TARGET_REPO_ROOT does not resolve to a directory" >&2
    exit 2
  fi
  CURRENT_ROOT="$(pwd -P)"
  if [[ "$REPO_ROOT" != "$CURRENT_ROOT" ]]; then
    echo "sprint-backlog: REPO_HARNESS_TARGET_REPO_ROOT must match the current helper cwd" >&2
    exit 2
  fi
  cd "$REPO_ROOT"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
else
  cd "$SCRIPT_DIR/.."
fi
helper_source="$0"
if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
      && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
  helper_source="$REPO_HARNESS_HELPER_SOURCE_PATH"
fi
helper_dir="$(cd "$(dirname "$helper_source")" && pwd)"

usage() {
  cat <<'USAGE_EOF'
Usage:
  repo-harness run sprint-backlog status
  repo-harness run sprint-backlog next
  repo-harness run sprint-backlog complete-task --task <index|task> [--plan <plan-file>] [--sprint <file>] [--defer-lease-release]

Read a retained sprint or complete its row for contract-worktree closeout.
--sprint selects a file under plans/sprints when this worktree has no marker.
--defer-lease-release keeps the lease until publication lands.
Exit codes: 0 success; 1 error; 2 usage error.
USAGE_EOF
}

policy_file=".ai/harness/policy.json"
policy_get() {
  local jq_path="$1"
  local default_value="$2"

  if [[ -f "$policy_file" ]] && command -v jq >/dev/null 2>&1; then
    local value
    value="$(jq -r "$jq_path // empty" "$policy_file" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

sprints_dir="$(policy_get '.sprints.dir' 'plans/sprints')"
marker_file="$(policy_get '.sprints.active_marker_file' '.ai/harness/sprint/active-sprint')"
sprint_override=""
SPRINT_CLI_RESOLVED=0
SPRINT_CLI_CMD=()

trim() {
  sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

extract_status() {
  local file="$1"
  awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" | trim
}

sprint_file_under_sprints_dir() {
  local sprint_file="$1"
  local sprints_real sprint_dir_real

  case "$sprint_file" in
    "$sprints_dir"/*) ;;
    *) return 1 ;;
  esac
  case "$sprint_file" in
    *..*) return 1 ;;
  esac
  [[ -f "$sprint_file" ]] || return 1
  [[ ! -L "$sprint_file" ]] || return 1

  sprints_real="$(cd -P "$sprints_dir" 2>/dev/null && pwd)" || return 1
  sprint_dir_real="$(cd -P "$(dirname "$sprint_file")" 2>/dev/null && pwd)" || return 1
  case "$sprint_dir_real" in
    "$sprints_real"|"$sprints_real"/*) ;;
    *) return 1 ;;
  esac
}

active_sprint_file() {
  local sprint_file
  if [[ -n "$sprint_override" ]]; then
    sprint_file="$sprint_override"
  else
    [[ -f "$marker_file" ]] || return 1
    sprint_file="$(trim < "$marker_file" 2>/dev/null)"
  fi
  [[ -n "$sprint_file" ]] || return 1
  # Containment: the marker is repo-controlled, but complete-task rewrites the
  # file it points at, so never follow it outside the sprints dir.
  sprint_file_under_sprints_dir "$sprint_file" || return 1
  printf '%s' "$sprint_file"
}

require_active_sprint() {
  local sprint_file
  if ! sprint_file="$(active_sprint_file)"; then
    if [[ -n "$sprint_override" ]]; then
      echo "sprint-backlog: --sprint does not resolve to a sprint file under ${sprints_dir}: $sprint_override" >&2
    else
      echo "sprint-backlog: no active sprint (marker: $marker_file)" >&2
    fi
    exit 1
  fi
  printf '%s' "$sprint_file"
}

backlog_rows() {
  local file="$1"
  awk -F '|' '
    !in_section && /^>[[:space:]]*\*\*Backlog Schema\*\*:/ {
      declared = $0
      sub(/^>[[:space:]]*\*\*Backlog Schema\*\*:[[:space:]]*/, "", declared)
      gsub(/[[:space:]]+$/, "", declared)
      declarations++
      if (declarations > 1) {
        printf "sprint-backlog: backlog schema is declared %d times; exactly one declaration is allowed\n", declarations > "/dev/stderr"
        exit 1
      }
      if (declared == "2") {
        schema = 2
      } else {
        printf "sprint-backlog: unsupported backlog schema: %s\n", declared > "/dev/stderr"
        exit 1
      }
      next
    }
    /^## Backlog[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    !in_section { next }
    /^\|[[:space:]]*[0-9]+[[:space:]]*\|/ {
      last = (schema == 2) ? 8 : 7
      for (i = 2; i <= last; i++) {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $i)
      }
      if (schema == 2) {
        printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n", $2, $4, $5, $6, $7, $8, $3
      } else {
        printf "%s\t%s\t%s\t%s\t%s\t%s\t\n", $2, $3, $4, $5, $6, $7
      }
    }
  ' "$file"
}

backlog_counts() {
  local file="$1"
  backlog_rows "$file" | awk -F '\t' '
    { total++ }
    $2 ~ /^\[[xX]\]$/ { done++ }
    END { printf "%d %d\n", done + 0, total + 0 }
  '
}

next_pending_row() {
  local file="$1"
  backlog_rows "$file" | awk -F '\t' '!found && $2 == "[ ]" { print; found = 1 }'
}

cmd_next() {
  local sprint_file row
  sprint_file="$(require_active_sprint)"
  row="$(next_pending_row "$sprint_file")"
  if [[ -z "$row" ]]; then
    echo "next_task: (none)"
    exit 3
  fi

  printf '%s\n' "$row" | awk -F '\t' '{
    printf "index: %s\ntask: %s\nmode: %s\nacceptance: %s\nplan: %s\n", $1, $3, $4, $5, $6
  }'
}

cmd_status() {
  local sprint_file status done total next_task
  if ! sprint_file="$(active_sprint_file)"; then
    echo "sprint: (none)"
    return 0
  fi

  status="$(extract_status "$sprint_file")"
  read -r done total <<<"$(backlog_counts "$sprint_file")"
  next_task="$(next_pending_row "$sprint_file" | awk -F '\t' '{ print $3 }')"

  echo "sprint: $sprint_file"
  echo "status: ${status:-unknown}"
  echo "tasks_done: $done"
  echo "tasks_total: $total"
  echo "next_task: ${next_task:-(none)}"
}

cmd_complete_task() {
  local task_ref=""
  local plan_file=""
  local defer_lease_release=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --defer-lease-release)
        defer_lease_release=1
        shift
        ;;
      --task)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --task requires a value" >&2; exit 2; }
        task_ref="$2"
        shift 2
        ;;
      --plan)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --plan requires a value" >&2; exit 2; }
        plan_file="$2"
        shift 2
        ;;
      --sprint)
        [[ -n "${2:-}" ]] || { echo "sprint-backlog: --sprint requires a value" >&2; exit 2; }
        sprint_override="$2"
        shift 2
        ;;
      *)
        echo "sprint-backlog: unknown complete-task argument: $1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done

  [[ -n "$task_ref" ]] || { echo "sprint-backlog: complete-task requires --task" >&2; usage >&2; exit 2; }

  local sprint_file plan_cell output
  sprint_file="$(require_active_sprint)"

  plan_cell=""
  if [[ -n "$plan_file" ]]; then
    plan_cell="\`${plan_file}\`"
  fi

  # One call, one transaction. The verb takes the backlog lock itself, so this
  # helper must not hold it: the lock is a directory mutex, not a reentrant one.
  local -a complete_args
  complete_args=(complete-row
    --sprint "$sprint_file"
    --task "$task_ref"
    --target-ref "$(coordination_target_ref)")
  [[ -z "$plan_cell" ]] || complete_args+=(--plan-cell "$plan_cell")
  [[ "$defer_lease_release" -eq 0 ]] || complete_args+=(--defer-lease-release)

  # stdout carries the verb's JSON, stderr its diagnostics -- a stale-lock
  # reclamation among them. Merging the two with `2>&1` would both corrupt the
  # JSON and swallow the diagnostic on success, so they are kept apart and the
  # verb's stderr is forwarded either way.
  local verb_stderr
  verb_stderr="$(mktemp)"
  if ! output="$(sprint_lease "${complete_args[@]}" 2>"$verb_stderr")"; then
    cat "$verb_stderr" >&2
    rm -f "$verb_stderr"
    exit 1
  fi
  cat "$verb_stderr" >&2
  rm -f "$verb_stderr"

  # Rendering only: every value below was produced by the verb inside its locks.
  local completed_task completed_row released_claim done total
  completed_task="$(json_string_field "$output" task)"
  completed_row="$(json_string_field "$output" row_index)"
  released_claim="$(json_string_field "$output" released_claim_id)"
  done="$(json_number_field "$output" done)"
  total="$(json_number_field "$output" total)"

  if [[ -n "$released_claim" ]]; then
    echo "Released lease for '$completed_task' (claim $released_claim)"
  fi
  echo "Completed backlog task '$completed_task' (row $completed_row) in $sprint_file"
  echo "Backlog progress: ${done}/${total}"
  if [[ "$done" -eq "$total" ]]; then
    echo "All backlog tasks complete. Set the sprint Status to Done after review."
  fi
}

repo_harness_source_checkout() {
  [[ -f "src/cli/index.ts" && -f "package.json" ]] || return 1
  command -v bun >/dev/null 2>&1 || return 1
  [[ "$(bun -e 'const pkg = JSON.parse(require("fs").readFileSync("package.json", "utf8")); process.stdout.write(typeof pkg?.name === "string" ? pkg.name : "")' 2>/dev/null)" == repo-harness ]]
}

resolve_sprint_cli() {
  [[ "$SPRINT_CLI_RESOLVED" -eq 0 ]] || return 0
  if [[ -n "${REPO_HARNESS_CLI_BIN:-}" ]]; then
    if [[ "$REPO_HARNESS_CLI_BIN" != /* || ! -x "$REPO_HARNESS_CLI_BIN" ]]; then
      echo "sprint-backlog: REPO_HARNESS_CLI_BIN is not an executable absolute path: $REPO_HARNESS_CLI_BIN" >&2
      exit 1
    fi
    SPRINT_CLI_CMD=("$REPO_HARNESS_CLI_BIN")
  elif repo_harness_source_checkout; then
    SPRINT_CLI_CMD=(bun "src/cli/index.ts")
  elif command -v repo-harness >/dev/null 2>&1; then
    SPRINT_CLI_CMD=(repo-harness)
  else
    echo "sprint-backlog: the repo-harness CLI is unavailable; sprint leases cannot be reached" >&2
    exit 1
  fi
  SPRINT_CLI_RESOLVED=1
}

sprint_lease() {
  resolve_sprint_cli
  "${SPRINT_CLI_CMD[@]}" sprint "$@"
}

json_string_field() {
  printf '%s\n' "$1" | sed -nE "s/^[[:space:]]*\"$2\": \"([^\"]*)\",?[[:space:]]*\$/\1/p" | head -1
}

json_number_field() {
  printf '%s\n' "$1" | sed -nE "s/^[[:space:]]*\"$2\": ([0-9]+),?[[:space:]]*\$/\1/p" | head -1
}

coordination_target_ref() {
  policy_get '.worktree_strategy.merge_back.target' 'main'
}

[[ $# -gt 0 ]] || { usage >&2; exit 2; }
command="$1"
shift
case "$command" in
  status) cmd_status "$@" ;;
  next) cmd_next "$@" ;;
  complete-task) cmd_complete_task "$@" ;;
  --help|-h|help) usage ;;
  *)
    echo "sprint-backlog: unknown command: $command" >&2
    usage >&2
    exit 2
    ;;
esac
