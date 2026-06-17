#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
elif [[ "$SCRIPT_DIR" == */.ai/harness/scripts ]]; then
  cd "$SCRIPT_DIR/../../.."
else
  cd "$SCRIPT_DIR/.."
fi

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

review_card_field() {
  local file="$1"
  local label="$2"
  [[ -n "$file" && -f "$file" ]] || return 1
  awk -v wanted="$label" '
    function trim(s) {
      gsub(/^[[:space:]]+/, "", s)
      gsub(/[[:space:]]+$/, "", s)
      return s
    }
    BEGIN { wanted = tolower(wanted) }
    /^##[[:space:]]+Human Review Card[[:space:]]*$/ { in_section = 1; next }
    in_section && /^##[[:space:]]+/ { exit }
    !in_section { next }
    /^[[:space:]]*-[[:space:]]*/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      key = line
      sub(/:.*/, "", key)
      key = tolower(trim(key))
      if (key == wanted) {
        sub(/^[^:]*:[[:space:]]*/, "", line)
        print trim(line)
        exit
      }
    }
  ' "$file"
}

normalize_status_token() {
  local value="$1"
  value="$(printf '%s' "$value" | sed -E 's/[;,].*$//; s/[[:space:]].*$//; s/^[[:space:]]+//; s/[[:space:]]+$//' | tr '[:upper:]' '[:lower:]')"
  printf '%s' "$value"
}

field_has_concrete_value() {
  local value="$1"
  local token
  token="$(normalize_status_token "$value")"
  [[ -n "$token" ]] || return 1
  case "$token" in
    tbd|todo|n/a|na|none|unknown|unavailable|pending|...)
      return 1
      ;;
  esac
  return 0
}

read_contract_task_profile() {
  local file="$1"
  awk '/^> \*\*Task Profile\*\*:/ {sub(/^.*> \*\*Task Profile\*\*:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}' "$file" | xargs
}

contract_allowed_paths() {
  local file="$1"
  awk '
    BEGIN { in_block = 0; block = ""; found = 0 }
    /^```yaml[[:space:]]*$/ {
      in_block = 1
      block = ""
      next
    }
    /^```[[:space:]]*$/ && in_block == 1 {
      if (!found && block ~ /(^|[[:space:]])allowed_paths:/) {
        printf "%s", block
        found = 1
      }
      in_block = 0
      block = ""
      next
    }
    in_block == 1 {
      block = block $0 ORS
    }
  ' "$file" | awk '
    function trim(s) {
      gsub(/^[[:space:]]+/, "", s)
      gsub(/[[:space:]]+$/, "", s)
      return s
    }
    /^[[:space:]]*allowed_paths:[[:space:]]*$/ { in_paths = 1; next }
    in_paths && /^[^[:space:]]/ { exit }
    in_paths && /^[[:space:]]*-[[:space:]]*/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      gsub(/^["'\''`]+|["'\''`]+$/, "", line)
      print trim(line)
    }
  '
}

read_active_plan() {
  local marker plan
  if declare -F workflow_active_plan >/dev/null 2>&1; then
    workflow_active_plan || true
    return 0
  fi
  for marker in ".ai/harness/active-plan" ".claude/.active-plan"; do
    if [[ -f "$marker" ]]; then
      plan="$(cat "$marker" 2>/dev/null | xargs)"
      if [[ -n "$plan" ]]; then
        printf '%s' "$plan"
        return 0
      fi
    fi
  done
}

active_plan_declared_path() {
  local label="$1"
  local active_plan
  active_plan="$(read_active_plan || true)"
  [[ -n "$active_plan" && -f "$active_plan" ]] || return 1
  awk -v label="$label" '
    BEGIN { pattern = "^> \\*\\*" label "\\*\\*:" }
    $0 ~ pattern {
      sub(pattern "[[:space:]]*", "")
      gsub(/`/, "")
      gsub(/\r/, "")
      print
      exit
    }
  ' "$active_plan" | xargs
}

git_changed_files_json() {
  local changed_file
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
    printf '[]'
    return 0
  fi
  while IFS= read -r changed_file; do
    if [[ -n "$changed_file" ]] && ! ignore_changed_file_for_scope "$changed_file"; then
      printf '%s\n' "$changed_file"
    fi
  done < <(git_changed_files_list | awk 'NF && !seen[$0]++') | jq -R -s 'split("\n") | map(select(length > 0))'
}

git_diff_base_ref() {
  local branch
  if [[ -n "${REPO_HARNESS_DIFF_BASE:-}" ]]; then
    printf '%s' "$REPO_HARNESS_DIFF_BASE"
    return 0
  fi
  if [[ -n "${HARNESS_DIFF_BASE:-}" ]]; then
    printf '%s' "$HARNESS_DIFF_BASE"
    return 0
  fi
  if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
    if git rev-parse --verify "origin/${GITHUB_BASE_REF}^{commit}" >/dev/null 2>&1; then
      printf 'origin/%s' "$GITHUB_BASE_REF"
    else
      printf '%s' "$GITHUB_BASE_REF"
    fi
    return 0
  fi

  branch="$(git branch --show-current 2>/dev/null || true)"
  if [[ "$branch" != "main" ]] && git rev-parse --verify "origin/main^{commit}" >/dev/null 2>&1; then
    printf 'origin/main'
    return 0
  fi
  if [[ "$branch" != "main" ]] && git rev-parse --verify "main^{commit}" >/dev/null 2>&1; then
    printf 'main'
    return 0
  fi

  return 1
}

git_diff_merge_base() {
  local base_ref
  base_ref="$(git_diff_base_ref || true)"
  [[ -n "$base_ref" ]] || return 1
  git rev-parse --verify "$base_ref^{commit}" >/dev/null 2>&1 || return 1
  git merge-base HEAD "$base_ref" 2>/dev/null
}

git_changed_files_list() {
  local merge_base
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi

  merge_base="$(git_diff_merge_base || true)"
  if [[ -n "$merge_base" ]]; then
    git -c core.quotePath=false diff --name-only "$merge_base" HEAD 2>/dev/null || true
  fi
  git -c core.quotePath=false diff --name-only HEAD 2>/dev/null || true
  git -c core.quotePath=false ls-files --others --exclude-standard 2>/dev/null || true
}

allowed_paths_json() {
  local file="$1"
  if ! command -v jq >/dev/null 2>&1; then
    printf '[]'
    return 0
  fi
  contract_allowed_paths "$file" | jq -R -s 'split("\n") | map(select(length > 0))'
}

path_under_allowed_prefix() {
  local path="$1"
  local prefix="$2"
  prefix="${prefix%/}"
  [[ -n "$prefix" ]] || return 1
  [[ "$path" == "$prefix" || "$path" == "$prefix/"* ]]
}

ignore_changed_file_for_scope() {
  case "$1" in
    .ai/harness/active-plan|.ai/harness/active-worktree|.claude/.active-plan)
      return 0
      ;;
  esac
  return 1
}

allowed_paths_check_json() {
  local file="$1"
  shift
  local changed_file allowed_path outside=0 checked=0
  local outside_file=""
  local allowed_paths=()
  local changed_files=("$@")

  if ! command -v jq >/dev/null 2>&1; then
    printf '{"status":"unavailable","message":"jq unavailable"}'
    return 0
  fi

  while IFS= read -r allowed_path; do
    [[ -n "$allowed_path" ]] && allowed_paths+=("$allowed_path")
  done < <(contract_allowed_paths "$file")

  if ((${#allowed_paths[@]} == 0)); then
    if ((${#changed_files[@]} == 0)); then
      jq -n '{status:"unavailable", checked:false, message:"contract has no allowed_paths and no changed files were detected", allowed_paths: [], outside: []}'
    else
      jq -n \
        --argjson outside "$(printf '%s\n' "${changed_files[@]+"${changed_files[@]}"}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
        '{status:"fail", checked:true, message:"contract has no allowed_paths", allowed_paths: [], outside:$outside}'
    fi
    return 0
  fi

  for changed_file in "${changed_files[@]+"${changed_files[@]}"}"; do
    [[ -n "$changed_file" ]] || continue
    if ignore_changed_file_for_scope "$changed_file"; then
      continue
    fi
    checked=1
    local matched=0
    for allowed_path in "${allowed_paths[@]+"${allowed_paths[@]}"}"; do
      if path_under_allowed_prefix "$changed_file" "$allowed_path"; then
        matched=1
        break
      fi
    done
    if [[ "$matched" -eq 0 ]]; then
      outside=1
      outside_file="${outside_file}${changed_file}"$'\n'
    fi
  done

  if [[ "$outside" -eq 0 ]]; then
    contract_allowed_paths "$file" | jq -R -s --arg checked "$checked" '{
      status: "pass",
      checked: ($checked == "1"),
      allowed_paths: (split("\n") | map(select(length > 0))),
      outside: []
    }'
  else
    jq -n \
      --argjson allowed "$(allowed_paths_json "$file")" \
      --argjson outside "$(printf '%s' "$outside_file" | jq -R -s 'split("\n") | map(select(length > 0))')" \
      '{status:"fail", checked:true, allowed_paths:$allowed, outside:$outside}'
  fi
}

if [[ -f ".ai/hooks/lib/workflow-state.sh" ]]; then
  # shellcheck source=/dev/null
  . ".ai/hooks/lib/workflow-state.sh"
  contract_file="$(workflow_active_contract || true)"
  review_file="$(workflow_active_review || true)"
  checks_file="$(workflow_checks_file)"
else
  contract_file="$(find tasks/contracts -maxdepth 1 -name '*.contract.md' -type f 2>/dev/null | sort | head -n 1)"
  if [[ -n "$contract_file" ]]; then
    contract_slug="$(basename "$contract_file" | sed -E 's/\.contract\.md$//')"
    review_file="tasks/reviews/${contract_slug}.review.md"
  else
    review_file=""
  fi
  checks_file=".ai/harness/checks/latest.json"
fi
if [[ -z "$contract_file" || ! -f "$contract_file" ]]; then
  contract_file="$(active_plan_declared_path "Task Contract" || active_plan_declared_path "Sprint Contract" || true)"
fi
if [[ -z "$review_file" || ! -f "$review_file" ]]; then
  review_file="$(active_plan_declared_path "Task Review" || active_plan_declared_path "Sprint Review" || true)"
fi

[[ -n "$contract_file" && -f "$contract_file" ]] || { echo "No active sprint contract found" >&2; exit 1; }

generated_at="$(date '+%Y-%m-%dT%H:%M:%S%z')"
run_stamp="$(date '+%Y%m%dT%H%M%S')"
run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-${run_stamp}-$$}}}"
safe_run_id="$(printf '%s' "$run_id" | sed -E 's/[^A-Za-z0-9._-]+/-/g')"
contract_slug="$(basename "$contract_file" | sed -E 's/\.contract\.md$//')"
safe_contract_slug="$(printf '%s' "$contract_slug" | sed -E 's/[^A-Za-z0-9._-]+/-/g')"
runs_dir=".ai/harness/runs"
if declare -F workflow_runs_dir >/dev/null 2>&1; then
  runs_dir="$(workflow_runs_dir)"
fi
run_file="${runs_dir}/${safe_run_id}-${safe_contract_slug}.json"

mkdir -p "$(dirname "$checks_file")"
mkdir -p "$runs_dir"
contract_report="$(mktemp)"
checks_report="$(mktemp)"
trap 'rm -f "$contract_report" "$checks_report"' EXIT
task_profile="$(read_contract_task_profile "$contract_file" || true)"
active_plan="$(read_active_plan || true)"
worktree_path="$(pwd -P)"
branch_name="$(git branch --show-current 2>/dev/null || true)"
diff_base_ref="$(git_diff_base_ref || true)"
diff_base_commit="$(git_diff_merge_base || true)"
changed_files=()
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  while IFS= read -r changed_file; do
    if [[ -n "$changed_file" ]] && ! ignore_changed_file_for_scope "$changed_file"; then
      changed_files+=("$changed_file")
    fi
  done < <(git_changed_files_list | awk 'NF && !seen[$0]++')
fi
allowed_paths_check="$(allowed_paths_check_json "$contract_file" "${changed_files[@]+"${changed_files[@]}"}")"
allowed_paths_status="unavailable"
if command -v jq >/dev/null 2>&1; then
  allowed_paths_status="$(printf '%s' "$allowed_paths_check" | jq -r '.status // "unavailable"' 2>/dev/null || printf 'unavailable')"
fi

contract_command="bash scripts/verify-contract.sh --contract $contract_file --strict --report-file <temp>"
if [[ -f "scripts/sync-brain-docs.sh" && -f ".ai/harness/brain-manifest.json" ]]; then
  bash scripts/sync-brain-docs.sh --all >/dev/null || true
fi
if [[ -f "scripts/prepare-codex-handoff.sh" && ( -f ".ai/harness/handoff/current.md" || -f ".ai/harness/handoff/resume.md" ) ]]; then
  bash scripts/prepare-codex-handoff.sh --reason "repo-harness-verify-sprint" >/dev/null || true
fi
set +e
contract_output="$(bash scripts/verify-contract.sh --contract "$contract_file" --strict --report-file "$contract_report" 2>&1)"
contract_exit=$?
set -e

if [[ -n "$contract_output" ]]; then
  printf '%s\n' "$contract_output"
fi

review_status="fail"
review_message="Task review recommends pass and Human Review Card verdict is pass."
review_card_verdict=""
review_card_external=""
review_card_change_type=""
review_card_rollback=""
if [[ -z "$review_file" || ! -f "$review_file" ]]; then
  review_message="Missing task review file."
  echo "Missing task review file" >&2
else
  review_card_verdict="$(normalize_status_token "$(review_card_field "$review_file" "Verdict" || true)")"
  review_card_external="$(review_card_field "$review_file" "External acceptance" || true)"
  review_card_change_type="$(normalize_status_token "$(review_card_field "$review_file" "Change type" || true)")"
  review_card_rollback="$(review_card_field "$review_file" "Rollback" || true)"
fi

if [[ -n "$review_file" && -f "$review_file" ]]; then
  if ! grep -Eq '^> \*\*Recommendation\*\*:[[:space:]]*pass([[:space:]]*)$' "$review_file"; then
    review_message="Task review does not recommend pass."
    echo "Task review does not recommend pass" >&2
  elif [[ -z "$review_card_verdict" ]]; then
    review_message="Task review is missing Human Review Card verdict."
    echo "Task review is missing Human Review Card verdict" >&2
  elif [[ "$review_card_verdict" != "pass" ]]; then
    review_message="Human Review Card verdict is not pass: $review_card_verdict"
    echo "Human Review Card verdict is not pass: $review_card_verdict" >&2
  elif [[ -n "$task_profile" && "$review_card_change_type" != "$task_profile" ]]; then
    review_message="Human Review Card change type does not match task_profile: ${review_card_change_type:-missing} != $task_profile"
    echo "$review_message" >&2
  elif ! field_has_concrete_value "$review_card_rollback"; then
    review_message="Human Review Card rollback is missing or not concrete."
    echo "$review_message" >&2
  else
    review_status="pass"
  fi
fi

external_status="missing"
external_reviewer=""
external_source=""
external_message="External acceptance status is unavailable."
if declare -F workflow_external_acceptance_status >/dev/null 2>&1; then
  external_row="$(workflow_external_acceptance_status "$review_file")"
  IFS=$'\t' read -r external_status external_reviewer external_source external_message <<< "$external_row"
fi
card_external_status="$(normalize_status_token "$review_card_external")"
case "$external_status" in
  missing|unavailable|"")
    case "$card_external_status" in
      pass|manual_override|not_required)
        external_status="$card_external_status"
        external_message="Human Review Card external acceptance: $review_card_external"
        ;;
    esac
    ;;
esac

status="fail"
exit_code=1
case "$external_status" in
  pass|manual_override|not_required)
    external_gate="pass"
    ;;
  *)
    external_gate="fail"
    ;;
esac
if [[ "$contract_exit" -eq 0 && "$review_status" == "pass" && "$external_gate" == "pass" && "$allowed_paths_status" == "pass" ]]; then
  status="pass"
  exit_code=0
fi
failure_class=""
if command -v jq >/dev/null 2>&1 && jq -e . "$contract_report" >/dev/null 2>&1; then
  failure_class="$(jq -r '.failure_class // empty' "$contract_report" 2>/dev/null || true)"
fi
if [[ -z "$failure_class" && "$status" != "pass" ]]; then
  if [[ "$contract_exit" -ne 0 ]]; then
    failure_class="contract"
  elif [[ "$review_status" != "pass" ]]; then
    failure_class="review"
  elif [[ "$external_gate" != "pass" ]]; then
    failure_class="external_acceptance"
  elif [[ "$allowed_paths_status" != "pass" ]]; then
    failure_class="allowed_paths"
  else
    failure_class="unknown"
  fi
fi
if [[ "$status" == "pass" ]]; then
  next_step="finish contract worktree or archive completed task"
else
  next_step="resolve failing contract, review, external acceptance, or allowed_paths gate"
fi
handoff_current_exists=false
handoff_resume_exists=false
[[ -f ".ai/harness/handoff/current.md" ]] && handoff_current_exists=true
[[ -f ".ai/harness/handoff/resume.md" ]] && handoff_resume_exists=true

if command -v jq >/dev/null 2>&1 && jq -e . "$contract_report" >/dev/null 2>&1; then
  jq -n \
    --slurpfile contract_report "$contract_report" \
    --arg schema "repo-harness-run-trace.v1" \
    --arg status "$status" \
    --arg source "verify-sprint" \
    --arg command "bash scripts/verify-sprint.sh" \
    --arg generated_at "$generated_at" \
    --arg run_id "$run_id" \
    --arg run_file "$run_file" \
    --arg task_profile "$task_profile" \
    --arg active_plan "$active_plan" \
    --arg contract_file "$contract_file" \
    --arg contract_status "$([[ "$contract_exit" -eq 0 ]] && printf pass || printf fail)" \
    --arg contract_command "$contract_command" \
    --argjson contract_exit "$contract_exit" \
    --arg review_file "${review_file:-}" \
    --arg review_status "$review_status" \
    --arg review_message "$review_message" \
    --arg review_card_verdict "$review_card_verdict" \
    --arg review_card_change_type "$review_card_change_type" \
    --arg review_card_external "$review_card_external" \
    --arg review_card_rollback "$review_card_rollback" \
    --arg external_status "$external_status" \
    --arg external_reviewer "$external_reviewer" \
    --arg external_source "$external_source" \
    --arg external_message "$external_message" \
    --arg worktree "$worktree_path" \
    --arg branch "$branch_name" \
    --arg diff_base_ref "$diff_base_ref" \
    --arg diff_base_commit "$diff_base_commit" \
    --argjson files_changed "$(git_changed_files_json)" \
    --argjson allowed_paths_check "$allowed_paths_check" \
    --argjson allowed_paths "$(allowed_paths_json "$contract_file")" \
    --argjson handoff_current_exists "$handoff_current_exists" \
    --argjson handoff_resume_exists "$handoff_resume_exists" \
    --arg failure_class "$failure_class" \
    --arg next_step "$next_step" \
    --argjson exit_code "$exit_code" \
    '{
      schema: $schema,
      status: $status,
      source: $source,
      command: $command,
      exit_code: $exit_code,
      generated_at: $generated_at,
      run_id: $run_id,
      run_file: $run_file,
      task_profile: $task_profile,
      active_plan: $active_plan,
      worktree: $worktree,
      branch: $branch,
      diff_base: {
        ref: $diff_base_ref,
        merge_base: $diff_base_commit
      },
      commands: [
        {name: "verify-sprint", command: $command, status: $status, exit_code: $exit_code},
        {name: "verify-contract", command: $contract_command, status: $contract_status, exit_code: $contract_exit}
      ],
      guards: [
        {name: "contract", status: $contract_status},
        {name: "review", status: $review_status},
        {name: "external_acceptance", status: $external_status},
        {name: "allowed_paths", status: ($allowed_paths_check.status // "unavailable")}
      ],
      handoffs: [
        {file: ".ai/harness/handoff/current.md", exists: $handoff_current_exists},
        {file: ".ai/harness/handoff/resume.md", exists: $handoff_resume_exists}
      ],
      files_changed: $files_changed,
      allowed_paths_check: $allowed_paths_check,
      failure_class: $failure_class,
      next_step: $next_step,
      lifecycle: {
        latest: ".ai/harness/checks/latest.json",
        snapshot: $run_file,
        evidence_tier: "harness-trace-v1"
      },
      contract: {
        file: $contract_file,
        status: $contract_status,
        command: $contract_command,
        exit_code: $contract_exit,
        report: ($contract_report[0] // {}),
        task_profile: $task_profile,
        allowed_paths: $allowed_paths
      },
      review: {
        file: $review_file,
        status: $review_status,
        message: $review_message,
        card: {
          verdict: $review_card_verdict,
          change_type: $review_card_change_type,
          external_acceptance: $review_card_external,
          rollback: $review_card_rollback
        }
      },
      external_acceptance: {
        status: $external_status,
        reviewer: $external_reviewer,
        source: $external_source,
        message: $external_message
      }
    }' > "$checks_report"
else
  cat > "$checks_report" <<EOF_CHECKS
{
  "schema": "repo-harness-run-trace.v1",
  "status": "$(json_escape "$status")",
  "source": "verify-sprint",
  "command": "bash scripts/verify-sprint.sh",
  "exit_code": $exit_code,
  "generated_at": "$(json_escape "$generated_at")",
  "run_id": "$(json_escape "$run_id")",
  "run_file": "$(json_escape "$run_file")",
  "task_profile": "$(json_escape "$task_profile")",
  "active_plan": "$(json_escape "$active_plan")",
  "worktree": "$(json_escape "$worktree_path")",
  "branch": "$(json_escape "$branch_name")",
  "diff_base": {
    "ref": "$(json_escape "$diff_base_ref")",
    "merge_base": "$(json_escape "$diff_base_commit")"
  },
  "commands": [
    {
      "name": "verify-sprint",
      "command": "bash scripts/verify-sprint.sh",
      "status": "$(json_escape "$status")",
      "exit_code": $exit_code
    },
    {
      "name": "verify-contract",
      "command": "$(json_escape "$contract_command")",
      "status": "$([[ "$contract_exit" -eq 0 ]] && printf pass || printf fail)",
      "exit_code": $contract_exit
    }
  ],
  "guards": [
    {"name": "contract", "status": "$([[ "$contract_exit" -eq 0 ]] && printf pass || printf fail)"},
    {"name": "review", "status": "$(json_escape "$review_status")"},
    {"name": "external_acceptance", "status": "$(json_escape "$external_status")"},
    {"name": "allowed_paths", "status": "$(json_escape "$allowed_paths_status")"}
  ],
  "handoffs": [
    {"file": ".ai/harness/handoff/current.md", "exists": $handoff_current_exists},
    {"file": ".ai/harness/handoff/resume.md", "exists": $handoff_resume_exists}
  ],
  "files_changed": [],
  "allowed_paths_check": {
    "status": "unavailable",
    "message": "jq unavailable"
  },
  "failure_class": "$(json_escape "$failure_class")",
  "next_step": "$(json_escape "$next_step")",
  "lifecycle": {
    "latest": ".ai/harness/checks/latest.json",
    "snapshot": "$(json_escape "$run_file")",
    "evidence_tier": "harness-trace-v1"
  },
  "contract": {
    "file": "$(json_escape "$contract_file")",
    "status": "$([[ "$contract_exit" -eq 0 ]] && printf pass || printf fail)",
    "command": "$(json_escape "$contract_command")",
    "exit_code": $contract_exit,
    "task_profile": "$(json_escape "$task_profile")",
    "allowed_paths": []
  },
  "review": {
    "file": "$(json_escape "${review_file:-}")",
    "status": "$(json_escape "$review_status")",
    "message": "$(json_escape "$review_message")",
    "card": {
      "verdict": "$(json_escape "$review_card_verdict")",
      "change_type": "$(json_escape "$review_card_change_type")",
      "external_acceptance": "$(json_escape "$review_card_external")",
      "rollback": "$(json_escape "$review_card_rollback")"
    }
  },
  "external_acceptance": {
    "status": "$(json_escape "$external_status")",
    "reviewer": "$(json_escape "$external_reviewer")",
    "source": "$(json_escape "$external_source")",
    "message": "$(json_escape "$external_message")"
  }
}
EOF_CHECKS
fi

cp "$checks_report" "$checks_file"
cp "$checks_report" "$run_file"

if [[ "$exit_code" -eq 0 ]]; then
  echo "Sprint verification passed"
  echo "Run snapshot: $run_file"
else
  echo "Sprint verification failed" >&2
  echo "Run snapshot: $run_file" >&2
fi

exit "$exit_code"
