#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/heartbeat-triage.sh [run] [--repo PATH] [--inbox PATH] [--run-id ID] [--source manual|scheduled] [--json]

Writes a heartbeat triage run to .ai/harness/triage/inbox.md. The command is
safe for cron/loop schedulers: findings are recorded as inbox entries and do
not make the process fail unless the runner itself is misconfigured.
USAGE_EOF
}

command="run"
repo="."
inbox_path=".ai/harness/triage/inbox.md"
run_id=""
run_source="manual"
json_output=0
helper_source="$0"
if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
      && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
  helper_source="$REPO_HARNESS_HELPER_SOURCE_PATH"
fi
SCRIPT_DIR="$(cd "$(dirname "$helper_source")" && pwd)"

if [[ "${1:-}" == "run" ]]; then
  shift
elif [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
elif [[ "${1:-}" != "" && "${1:-}" != --* ]]; then
  echo "heartbeat-triage: unknown command: $1" >&2
  usage >&2
  exit 2
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      [[ -n "${2:-}" ]] || { echo "heartbeat-triage: --repo requires a value" >&2; exit 2; }
      repo="$2"
      shift 2
      ;;
    --inbox)
      [[ -n "${2:-}" ]] || { echo "heartbeat-triage: --inbox requires a value" >&2; exit 2; }
      inbox_path="$2"
      shift 2
      ;;
    --run-id)
      [[ -n "${2:-}" ]] || { echo "heartbeat-triage: --run-id requires a value" >&2; exit 2; }
      run_id="$2"
      shift 2
      ;;
    --source)
      [[ -n "${2:-}" ]] || { echo "heartbeat-triage: --source requires a value" >&2; exit 2; }
      run_source="$2"
      shift 2
      ;;
    --json)
      json_output=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "heartbeat-triage: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ "$command" == "run" ]] || { echo "heartbeat-triage: unsupported command: $command" >&2; exit 2; }

repo="$(cd "$repo" 2>/dev/null && pwd -P)" || { echo "heartbeat-triage: repo not found: $repo" >&2; exit 2; }
cd "$repo"

timestamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
if [[ -z "$run_id" ]]; then
  run_id="heartbeat-$(date '+%Y%m%dT%H%M%S')-$$"
fi
safe_run_id="$(printf '%s' "$run_id" | sed -E 's/[^A-Za-z0-9._-]+/-/g')"

if [[ "$inbox_path" = /* ]]; then
  inbox_file="$inbox_path"
else
  inbox_file="$repo/$inbox_path"
fi

runs_dir="$repo/.ai/harness/runs"
triage_dir="$(dirname "$inbox_file")"
run_file="$runs_dir/${safe_run_id}-heartbeat-triage.json"
mkdir -p "$triage_dir" "$runs_dir"

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

policy_get() {
  local jq_path="$1"
  local default_value="$2"

  if [[ -f ".ai/harness/policy.json" ]] && command -v jq >/dev/null 2>&1; then
    local value
    value="$(jq -r "$jq_path // empty" ".ai/harness/policy.json" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

helper_path() {
  local helper_name="$1"
  printf '%s/%s' "$SCRIPT_DIR" "$helper_name"
}

repo_relative() {
  local path="$1"
  case "$path" in
    "$repo"/*) printf '%s' "${path#"$repo"/}" ;;
    "$repo") printf '.' ;;
    *) printf '%s' "$path" ;;
  esac
}

first_line() {
  awk 'NF { print; exit }'
}

date_plus_14_days() {
  if date -v+14d '+%Y-%m-%d' >/dev/null 2>&1; then
    date -v+14d '+%Y-%m-%d'
  elif date -d '+14 days' '+%Y-%m-%d' >/dev/null 2>&1; then
    date -d '+14 days' '+%Y-%m-%d'
  else
    date '+%Y-%m-%d'
  fi
}

entry_kinds=()
entry_statuses=()
entry_summaries=()
entry_details=()

add_entry() {
  entry_kinds+=("$1")
  entry_statuses+=("$2")
  entry_summaries+=("$3")
  entry_details+=("$4")
}

run_workflow_check() {
  local output status summary
  local check_script
  check_script="$(helper_path "check-task-workflow.sh")"

  if [[ ! -f "$check_script" ]]; then
    add_entry "workflow-check" "warning" "$check_script is missing" ""
    return 0
  fi

  set +e
  output="$(bash "$check_script" --strict 2>&1)"
  status=$?
  set -e

  if [[ "$status" -eq 0 ]]; then
    add_entry "workflow-check" "pass" "check-task-workflow.sh --strict passed" "$output"
  else
    summary="$(printf '%s\n' "$output" | first_line)"
    add_entry "workflow-check" "fail" "${summary:-check-task-workflow.sh --strict failed}" "$output"
  fi
}

extract_next_pending_from_sprint() {
  local sprint_file="$1"
  awk -F '|' '
    function trim(s) {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
      return s
    }
    /^## Backlog[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    !in_section { next }
    /^\|[[:space:]]*[0-9]+[[:space:]]*\|/ {
      idx = trim($2)
      status = trim($3)
      task = trim($4)
      mode = trim($5)
      acceptance = trim($6)
      plan = trim($7)
      if (status == "[ ]") {
        printf "index: %s\ntask: %s\nmode: %s\nacceptance: %s\nplan: %s\n", idx, task, mode, acceptance, plan
        exit
      }
    }
  ' "$sprint_file"
}

find_executing_sprint() {
  local file status
  local sprints_dir
  sprints_dir="$(policy_get '.sprints.dir' 'plans/sprints')"
  [[ -d "$sprints_dir" ]] || return 1
  while IFS= read -r file; do
    status="$(awk '/\*\*Status\*\*:/ { sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit }' "$file" | xargs)"
    case "$status" in
      Executing|Approved)
        printf '%s\n' "$file"
        return 0
        ;;
    esac
  done < <(find "$sprints_dir" -maxdepth 1 -name '*.sprint.md' -type f | sort -r)
  return 1
}

run_sprint_next() {
  local output status summary sprint_file task
  local sprint_helper
  sprint_helper="$(helper_path "sprint-backlog.sh")"

  if [[ -f ".ai/harness/sprint/active-sprint" && -f "$sprint_helper" ]]; then
    set +e
    output="$(bash "$sprint_helper" next 2>&1)"
    status=$?
    set -e
    if [[ "$status" -eq 0 ]]; then
      task="$(printf '%s\n' "$output" | awk -F ': ' '/^task:/ { print $2; exit }')"
      add_entry "sprint-next" "action" "next sprint task: ${task:-unknown}" "$output"
      return 0
    fi
    if [[ "$status" -eq 3 ]]; then
      add_entry "sprint-next" "pass" "no pending sprint task" "$output"
      return 0
    fi
  fi

  if sprint_file="$(find_executing_sprint)"; then
    output="$(extract_next_pending_from_sprint "$sprint_file")"
    if [[ -n "$output" ]]; then
      task="$(printf '%s\n' "$output" | awk -F ': ' '/^task:/ { print $2; exit }')"
      add_entry "sprint-next" "action" "next sprint task: ${task:-unknown}" "$output"
    else
      add_entry "sprint-next" "pass" "no pending sprint task in $sprint_file" ""
    fi
  else
    add_entry "sprint-next" "info" "no active or executing sprint found" ""
  fi
}

run_drift_requests() {
  local details count
  if [[ ! -d "docs/architecture/requests" ]]; then
    add_entry "drift-requests" "pass" "no architecture request directory" ""
    return 0
  fi

  details="$(find docs/architecture/requests -maxdepth 1 -type f ! -name '.gitkeep' | sort)"
  if [[ -z "$details" ]]; then
    add_entry "drift-requests" "pass" "no pending architecture drift requests" ""
    return 0
  fi

  count="$(printf '%s\n' "$details" | sed '/^$/d' | wc -l | xargs)"
  add_entry "drift-requests" "action" "${count} pending architecture drift request(s)" "$details"
}

write_json_snapshot() {
  local target="$1"
  local idx
  {
    echo "{"
    printf '  "version": 1,\n'
    printf '  "kind": "repo-harness-heartbeat-triage",\n'
    printf '  "run_id": "%s",\n' "$(json_escape "$run_id")"
    printf '  "source": "%s",\n' "$(json_escape "$run_source")"
    printf '  "generated_at": "%s",\n' "$(json_escape "$timestamp")"
    printf '  "repo": "%s",\n' "$(json_escape "$repo")"
    printf '  "inbox": "%s",\n' "$(json_escape "$(repo_relative "$inbox_file")")"
    printf '  "run_file": "%s",\n' "$(json_escape "$(repo_relative "$run_file")")"
    printf '  "adoption_review_due": "%s",\n' "$(json_escape "$adoption_review_due")"
    echo '  "entries": ['
    for idx in "${!entry_kinds[@]}"; do
      [[ "$idx" -eq 0 ]] || echo ","
      printf '    {"kind":"%s","status":"%s","summary":"%s","details":"%s"}' \
        "$(json_escape "${entry_kinds[$idx]}")" \
        "$(json_escape "${entry_statuses[$idx]}")" \
        "$(json_escape "${entry_summaries[$idx]}")" \
        "$(json_escape "${entry_details[$idx]}")"
    done
    echo
    echo '  ]'
    echo "}"
  } > "$target"
}

write_inbox() {
  local idx detail_line
  if [[ ! -f "$inbox_file" ]]; then
    {
      echo "# Heartbeat Triage Inbox"
      echo
      echo "<!-- managed by scripts/heartbeat-triage.sh; append-only run log -->"
      echo
    } > "$inbox_file"
  fi

  {
    echo "## Run ${run_id} - ${timestamp}"
    echo
    echo "- Source: ${run_source}"
    echo "- Run snapshot: $(repo_relative "$run_file")"
    echo "- Adoption review due: ${adoption_review_due}"
    echo
    echo "### Entries"
    echo
    for idx in "${!entry_kinds[@]}"; do
      printf -- "- [%s] %s: %s\n" "${entry_statuses[$idx]}" "${entry_kinds[$idx]}" "${entry_summaries[$idx]}"
      if [[ -n "${entry_details[$idx]}" ]]; then
        while IFS= read -r detail_line; do
          [[ -n "$detail_line" ]] || continue
          printf '  - %s\n' "$detail_line"
        done <<< "${entry_details[$idx]}"
      fi
    done
    echo
  } >> "$inbox_file"
}

adoption_review_due="$(date_plus_14_days)"
run_workflow_check
run_sprint_next
run_drift_requests
write_json_snapshot "$run_file"
write_inbox

if [[ "$json_output" -eq 1 ]]; then
  cat "$run_file"
else
  echo "[Heartbeat] wrote $(repo_relative "$inbox_file")"
  echo "[Heartbeat] run snapshot: $(repo_relative "$run_file")"
fi
