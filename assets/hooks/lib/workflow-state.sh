#!/bin/bash
# Shared workflow state helpers for plan/todo/contract-aware hooks.

WORKFLOW_CHANGED_PATHS=""
WORKFLOW_CHANGED_PATHS_READY=0

workflow_strip_quotes() {
  local value="$1"
  value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

workflow_json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

workflow_policy_file() {
  printf '.ai/harness/policy.json'
}

workflow_policy_get() {
  local jq_path="$1"
  local default_value="${2:-}"
  local policy_file value

  policy_file="$(workflow_policy_file)"
  if [[ -f "$policy_file" ]] && command -v jq >/dev/null 2>&1; then
    value="$(jq -r "$jq_path // empty" "$policy_file" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

workflow_repo_relative_path() {
  local value="$1"
  local default_value="$2"
  local allowed_prefix="${3:-}"

  if [[ -z "$value" || "$value" == /* || "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    printf '%s' "$default_value"
    return 0
  fi

  case "$value" in
    ..|../*|*/..|*/../*)
      printf '%s' "$default_value"
      ;;
    *)
      if [[ -n "$allowed_prefix" && "$value" != "$allowed_prefix"* ]]; then
        printf '%s' "$default_value"
        return 0
      fi
      printf '%s' "$value"
      ;;
  esac
}

workflow_context_map_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.context.map_file' '.ai/context/context-map.json')" '.ai/context/context-map.json' '.ai/context/'
}

workflow_failure_log_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.failure_log_file' '.ai/harness/failures/latest.jsonl')" '.ai/harness/failures/latest.jsonl' '.ai/harness/'
}

workflow_events_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.events_file' '.ai/harness/events.jsonl')" '.ai/harness/events.jsonl' '.ai/harness/'
}

workflow_runs_dir() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.runs_dir' '.ai/harness/runs')" '.ai/harness/runs' '.ai/harness/'
}

workflow_context_budget_status_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.context_budget.status_file' '.ai/harness/context-budget/latest.json')" '.ai/harness/context-budget/latest.json' '.ai/harness/'
}

workflow_resume_packet_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.handoff_resume.resume_packet_file' '.ai/harness/handoff/resume.md')" '.ai/harness/handoff/resume.md' '.ai/harness/'
}

workflow_pending_orchestration_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.planning.pending_orchestration_file' '.ai/harness/planning/pending.json')" '.ai/harness/planning/pending.json' '.ai/harness/'
}

workflow_ensure_harness_surface() {
  mkdir -p \
    "tasks/notes" \
    "$(dirname "$(workflow_context_map_file)")" \
    "$(dirname "$(workflow_policy_file)")" \
    "$(dirname "$(workflow_checks_file)")" \
    "$(dirname "$(workflow_handoff_file)")" \
    "$(dirname "$(workflow_context_budget_status_file)")" \
    "$(dirname "$(workflow_resume_packet_file)")" \
    "$(dirname "$(workflow_failure_log_file)")" \
    "$(dirname "$(workflow_pending_orchestration_file)")" \
    "$(workflow_runs_dir)"

  [[ -f "$(workflow_checks_file)" ]] || printf "{}\n" > "$(workflow_checks_file)"
  [[ -f "$(workflow_handoff_file)" ]] || printf "# Harness Handoff\n\n> **Reason**: bootstrap\n" > "$(workflow_handoff_file)"
  [[ -f "$(workflow_context_budget_status_file)" ]] || printf "{}\n" > "$(workflow_context_budget_status_file)"
  [[ -f "$(workflow_resume_packet_file)" ]] || printf "# Codex Resume Packet\n\n> **Reason**: bootstrap\n" > "$(workflow_resume_packet_file)"
  [[ -f "$(workflow_failure_log_file)" ]] || : > "$(workflow_failure_log_file)"
  [[ -f "$(workflow_events_file)" ]] || : > "$(workflow_events_file)"
}

is_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1
}

load_changed_paths() {
  if [[ "$WORKFLOW_CHANGED_PATHS_READY" -eq 1 ]]; then
    return
  fi

  WORKFLOW_CHANGED_PATHS_READY=1
  if ! is_git_repo; then
    return
  fi

  WORKFLOW_CHANGED_PATHS="$(
    git status --porcelain=v1 --untracked-files=no 2>/dev/null \
      | awk '{
          path = substr($0, 4)
          rename_idx = index(path, " -> ")
          if (rename_idx > 0) {
            path = substr(path, rename_idx + 4)
          }
          print path
        }'
  )"
}

has_changes() {
  local file="$1"

  load_changed_paths

  if [[ -n "$WORKFLOW_CHANGED_PATHS" ]] && printf '%s\n' "$WORKFLOW_CHANGED_PATHS" | grep -Fxq -- "$file"; then
    return 0
  fi
  return 1
}

has_changes_glob() {
  local pattern="$1"
  local changed

  load_changed_paths

  changed="$(printf '%s\n' "$WORKFLOW_CHANGED_PATHS" | grep -E "$pattern" | head -1)"

  if [[ -n "$changed" ]]; then
    printf '%s' "$changed"
    return 0
  fi
  return 1
}

get_latest_plan() {
  local latest
  latest="$(find plans -maxdepth 1 -type f -name 'plan-*.md' 2>/dev/null | sort | tail -1)"
  if [[ -n "$latest" ]]; then
    printf '%s' "$latest"
    return 0
  fi
  return 1
}

ACTIVE_PLAN_MARKER=".ai/harness/active-plan"
LEGACY_ACTIVE_PLAN_MARKER=".claude/.active-plan"
ACTIVE_WORKTREE_MARKER=".ai/harness/active-worktree"

# Records why get_active_plan returned empty. Empty string means the marker
# state was clean. Possible values:
#   "deleted" - marker exists but points at a plan file that no longer exists
#   "foreign" - active-worktree marker is owned by a different worktree
# Hooks can inspect this to differentiate "no marker at all" (hard error,
# user has not started a plan) from "marker is stale" (advisory + self-heal,
# the marker rotted underneath the user).
ACTIVE_PLAN_MARKER_STALE_REASON=""

read_active_plan_marker() {
  local marker_file="$1"
  local marker_plan

  if [[ -f "$marker_file" ]]; then
    marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" ]]; then
      if [[ -f "$marker_plan" ]]; then
        printf '%s' "$marker_plan"
        return 0
      fi
      ACTIVE_PLAN_MARKER_STALE_REASON="deleted"
    fi
  fi

  return 1
}

active_plan_marker_matches_cwd() {
  local owner current

  [[ -f "$ACTIVE_WORKTREE_MARKER" ]] || return 0
  owner="$(cat "$ACTIVE_WORKTREE_MARKER" 2>/dev/null | head -n 1 | xargs)"
  [[ -n "$owner" ]] || return 0

  current="$(pwd -P 2>/dev/null)"
  [[ -n "$current" ]] || return 0

  if [[ "$owner" != "$current" ]]; then
    ACTIVE_PLAN_MARKER_STALE_REASON="foreign"
    return 1
  fi
  return 0
}

get_active_plan() {
  ACTIVE_PLAN_MARKER_STALE_REASON=""

  if ! active_plan_marker_matches_cwd; then
    return 1
  fi

  read_active_plan_marker "$ACTIVE_PLAN_MARKER" \
    || read_active_plan_marker "$LEGACY_ACTIVE_PLAN_MARKER"
}

write_active_plan_marker() {
  local plan_file="$1"
  mkdir -p "$(dirname "$ACTIVE_PLAN_MARKER")" "$(dirname "$LEGACY_ACTIVE_PLAN_MARKER")" "$(dirname "$ACTIVE_WORKTREE_MARKER")"
  printf '%s' "$plan_file" > "$ACTIVE_PLAN_MARKER"
  printf '%s' "$plan_file" > "$LEGACY_ACTIVE_PLAN_MARKER"
  pwd -P > "$ACTIVE_WORKTREE_MARKER"
}

clear_active_plan_marker() {
  rm -f "$ACTIVE_PLAN_MARKER" "$LEGACY_ACTIVE_PLAN_MARKER" "$ACTIVE_WORKTREE_MARKER"
}

set_active_plan() {
  local plan_file="$1"
  write_active_plan_marker "$plan_file"
}

clear_active_plan() {
  clear_active_plan_marker
}

get_plan_status() {
  local plan_file="$1"
  awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$plan_file" | xargs
}

get_todo_source_plan() {
  if [[ ! -f "tasks/todo.md" ]]; then
    return 1
  fi

  awk -F': ' '/^\> \*\*Source Plan\*\*:/ {print $2; exit}' tasks/todo.md | xargs
}

derive_contract_path() {
  local plan_file="$1"
  local base slug

  base="$(basename "$plan_file")"
  slug="$(printf '%s' "$base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"

  if [[ -z "$slug" ]] || [[ "$slug" == "$base" ]]; then
    return 1
  fi

  printf 'tasks/contracts/%s.contract.md' "$slug"
}

workflow_plan_slug() {
  local active_plan slug
  active_plan="$(get_active_plan || true)"
  if [[ -z "$active_plan" ]]; then
    return 1
  fi

  slug="$(basename "$active_plan" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
  if [[ -n "$slug" ]]; then
    printf '%s' "$slug"
    return 0
  fi
  return 1
}

workflow_todo_total() {
  if [[ ! -f "tasks/todo.md" ]]; then
    printf '0'
    return
  fi

  grep -E '^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+' tasks/todo.md | wc -l | tr -d ' '
}

workflow_todo_done() {
  if [[ ! -f "tasks/todo.md" ]]; then
    printf '0'
    return
  fi

  grep -E '^[[:space:]]*-[[:space:]]\[[xX]\][[:space:]]+' tasks/todo.md | wc -l | tr -d ' '
}

workflow_is_linked_worktree() {
  local git_dir
  git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
  [[ "$git_dir" == *".git/worktrees/"* ]]
}

workflow_current_branch() {
  git branch --show-current 2>/dev/null || true
}

workflow_target_branch() {
  local target
  target="$(workflow_policy_get '.worktree_strategy.merge_back.target' '')"
  if [[ -z "$target" ]]; then
    target="$(workflow_policy_get '.worktree_strategy.base_branch' 'main')"
  fi
  printf '%s' "${target:-main}"
}

workflow_branch_prefix() {
  workflow_policy_get '.worktree_strategy.branch_prefix' 'codex/'
}

workflow_find_worktree_for_branch() {
  local branch="$1"
  git worktree list --porcelain 2>/dev/null | awk -v branch_ref="refs/heads/${branch}" '
    $1 == "worktree" { path = $2; next }
    $1 == "branch" && $2 == branch_ref { print path; exit }
  '
}

workflow_branch_exists() {
  local branch="$1"
  git show-ref --verify --quiet "refs/heads/$branch"
}

workflow_branch_merged_to_target() {
  local branch="$1"
  local target="$2"
  [[ -n "$branch" && -n "$target" ]] || return 1
  workflow_branch_exists "$branch" || return 1
  git rev-parse --verify --quiet "$target" >/dev/null 2>&1 || return 1
  git merge-base --is-ancestor "$branch" "$target" >/dev/null 2>&1
}

workflow_iterate_plan_tasks() {
  local plan_file="${1:-}"
  [[ -n "$plan_file" && -f "$plan_file" ]] || return 0

  awk '
    BEGIN { in_section = 0; task_index = 0 }
    /^## Task Breakdown[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    in_section && /^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+/ {
      task_index += 1
      status = ($0 ~ /\[[xX]\]/) ? "completed" : "pending"
      desc = $0
      sub(/^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+/, "", desc)
      gsub(/\r/, "", desc)
      print task_index "\t" status "\t" desc
    }
  ' "$plan_file"
}

workflow_plan_task_state_from_stream() {
  local total=0
  local done=0
  local next_pending=""
  local idx status desc

  while IFS=$'\t' read -r idx status desc; do
    [[ -n "$idx" ]] || continue
    total=$((total + 1))
    if [[ "$status" == "completed" ]]; then
      done=$((done + 1))
    elif [[ -z "$next_pending" ]]; then
      next_pending="$desc"
    fi
  done

  printf '%s\t%s\t%s\n' "$total" "$done" "$next_pending"
}

workflow_plan_task_state() {
  local plan_file="${1:-}"
  local state total done next_pending

  if [[ -z "$plan_file" ]]; then
    plan_file="$(get_active_plan || true)"
  fi

  if [[ -n "$plan_file" && -f "$plan_file" ]]; then
    state="$(workflow_iterate_plan_tasks "$plan_file" | workflow_plan_task_state_from_stream)"
    IFS=$'\t' read -r total done next_pending <<< "$state"
    if [[ "${total:-0}" -gt 0 ]]; then
      printf '%s\n' "$state"
      return 0
    fi
  fi

  # Legacy compatibility only: current repositories keep execution in the
  # active plan, but older generated repos may still carry a todo checklist.
  if [[ -f "tasks/todo.md" ]] && ! grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' tasks/todo.md; then
    workflow_iterate_todo_tasks "tasks/todo.md" | workflow_plan_task_state_from_stream
    return 0
  fi

  printf '0\t0\t\n'
}

workflow_cleanup_candidate() {
  local target branch_prefix branch worktree slug metadata
  target="$(workflow_target_branch)"
  branch_prefix="$(workflow_branch_prefix)"

  if is_git_repo; then
    while IFS=$'\t' read -r branch worktree; do
      [[ -n "$branch" ]] || continue
      slug="${branch#${branch_prefix}}"
      if workflow_branch_merged_to_target "$branch" "$target"; then
        printf '%s\t%s\t%s\n' "$slug" "$branch" "$worktree"
        return 0
      fi
    done < <(
      git worktree list --porcelain 2>/dev/null | awk -v prefix="refs/heads/${branch_prefix}" '
        $1 == "worktree" { path = $2; next }
        $1 == "branch" && index($2, prefix) == 1 {
          branch = substr($2, length("refs/heads/") + 1)
          print branch "\t" path
        }
      '
    )

    while IFS= read -r branch; do
      [[ -n "$branch" ]] || continue
      slug="${branch#${branch_prefix}}"
      if workflow_branch_merged_to_target "$branch" "$target"; then
        printf '%s\t%s\t\n' "$slug" "$branch"
        return 0
      fi
    done < <(git for-each-ref --format='%(refname:short)' "refs/heads/${branch_prefix}" 2>/dev/null || true)
  fi

  for metadata in .ai/harness/worktrees/*.json; do
    [[ -e "$metadata" ]] || continue
    slug="$(basename "$metadata" .json)"
    [[ -n "$slug" ]] || continue
    printf '%s\t%s\t\n' "$slug" "${branch_prefix}${slug}"
    return 0
  done

  return 1
}

workflow_next_action() {
  local active_plan task_state total done next_pending contract_file review_file checks_file checks_error
  local target current_branch slug candidate branch worktree command message

  active_plan="$(get_active_plan || true)"
  if [[ -n "$active_plan" && -f "$active_plan" ]]; then
    task_state="$(workflow_plan_task_state "$active_plan")"
    IFS=$'\t' read -r total done next_pending <<< "$task_state"
    total="${total:-0}"
    done="${done:-0}"

    if [[ "$total" -gt "$done" ]]; then
      message="${next_pending:-continue active plan Task Breakdown}"
      printf 'task\t-\t%s\n' "$message"
      return 0
    fi

    contract_file="$(workflow_active_contract || true)"
    review_file="$(workflow_active_review || true)"
    checks_file="$(workflow_checks_file)"

    if [[ -z "$review_file" || ! -f "$review_file" ]]; then
      printf 'check\t/check\tRun /check and record a sprint review before finishing this worktree.\n'
      return 0
    fi

    if ! workflow_review_recommends_pass "$review_file"; then
      printf 'check\t/check\tRun /check until %s records Recommendation: pass.\n' "$review_file"
      return 0
    fi

    if [[ -z "$contract_file" || ! -f "$contract_file" ]]; then
      printf 'check\t/check\tRegenerate the active sprint contract, then run /check.\n'
      return 0
    fi

    if [[ ! -f "$checks_file" ]]; then
      printf 'check\t/check\tRun /check and verify-sprint so %s exists.\n' "$checks_file"
      return 0
    fi

    if ! checks_error="$(workflow_checks_pass "$checks_file" "$contract_file" "$review_file")"; then
      printf 'check\t/check\t%s\n' "$checks_error"
      return 0
    fi

    target="$(workflow_target_branch)"
    current_branch="$(workflow_current_branch)"
    if workflow_is_linked_worktree && [[ -n "$current_branch" && "$current_branch" != "$target" ]]; then
      printf 'finish\tbash scripts/contract-worktree.sh finish\tReview/checks pass; finish and fast-forward merge this contract worktree.\n'
      return 0
    fi
  fi

  if candidate="$(workflow_cleanup_candidate)"; then
    IFS=$'\t' read -r slug branch worktree <<< "$candidate"
    target="$(workflow_target_branch)"
    command="bash scripts/contract-worktree.sh cleanup --slug ${slug} --target ${target}"
    printf 'cleanup\t%s\tClean up merged contract worktree %s.\n' "$command" "${branch:-$slug}"
    return 0
  fi

  printf 'none\t-\t(none)\n'
}

workflow_task_state_file() {
  printf '.claude/.task-state.json'
}

workflow_read_state_field() {
  local state_file="$1"
  local field="$2"
  local value=""

  if [[ ! -f "$state_file" ]]; then
    return 1
  fi

  if command -v jq >/dev/null 2>&1; then
    value="$(jq -r ".$field // empty" "$state_file" 2>/dev/null || true)"
  else
    value="$(
      awk -v field="$field" '
        $0 ~ "\"" field "\"" {
          line = $0
          sub(/^[^:]*:[[:space:]]*/, "", line)
          sub(/[[:space:]]*,?[[:space:]]*$/, "", line)
          gsub(/^"/, "", line)
          gsub(/"$/, "", line)
          print line
          exit
        }
      ' "$state_file"
    )"
  fi

  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

workflow_iterate_todo_tasks() {
  local todo_file="${1:-tasks/todo.md}"
  [[ -f "$todo_file" ]] || return 0

  awk '
    BEGIN { task_index = 0 }
    /^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+/ {
      task_index += 1
      status = ($0 ~ /\[[xX]\]/) ? "completed" : "pending"
      desc = $0
      sub(/^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+/, "", desc)
      gsub(/\r/, "", desc)
      print task_index "\t" status "\t" desc
    }
  ' "$todo_file"
}

workflow_sync_task_state_from_todo() {
  local todo_file="${1:-tasks/todo.md}"
  local state_file="${2:-.claude/.task-state.json}"
  local source_plan="${3:-}"
  local run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-}}}"
  local timestamp
  local tmp_state
  local total=0
  local done=0
  local promoted_in_progress=0
  local idx status desc next_status passes first=1

  if [[ -z "$source_plan" ]]; then
    source_plan="$(get_todo_source_plan || true)"
  fi

  mkdir -p "$(dirname "$state_file")"
  timestamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  if [[ -z "$run_id" ]]; then
    run_id="run-$(date '+%Y%m%dT%H%M%S')-$$"
  fi

  {
    echo "{"
    printf '  "done_tasks": 0,\n'
    printf '  "total_tasks": 0,\n'
    printf '  "source_plan": "%s",\n' "$(workflow_json_escape "${source_plan:-}")"
    printf '  "run_id": "%s",\n' "$(workflow_json_escape "$run_id")"
    printf '  "updated_at": "%s",\n' "$(workflow_json_escape "$timestamp")"
    echo '  "tasks": ['

    while IFS=$'\t' read -r idx status desc; do
      [[ -n "$idx" ]] || continue
      total=$((total + 1))
      next_status="$status"
      if [[ "$status" == "completed" ]]; then
        done=$((done + 1))
      elif [[ "$promoted_in_progress" -eq 0 ]]; then
        next_status="in_progress"
        promoted_in_progress=1
      fi

      if [[ "$next_status" == "completed" ]]; then
        passes="true"
      else
        passes="false"
      fi

      if [[ "$first" -eq 0 ]]; then
        echo ","
      fi
      first=0

      printf '    {"id":"task-%s","desc":"%s","status":"%s","passes":%s,"verification_evidence":[]}' \
        "$idx" \
        "$(workflow_json_escape "$desc")" \
        "$next_status" \
        "$passes"
    done < <(workflow_iterate_todo_tasks "$todo_file")

    echo
    echo "  ]"
    echo "}"
  } > "$state_file"

  tmp_state="$(mktemp)"
  awk -v done="$done" -v total="$total" '
    {
      if ($0 ~ /"done_tasks":/) {
        printf "  \"done_tasks\": %s,\n", done
      } else if ($0 ~ /"total_tasks":/) {
        printf "  \"total_tasks\": %s,\n", total
      } else {
        print
      }
    }
  ' "$state_file" > "$tmp_state"
  mv "$tmp_state" "$state_file"
}

workflow_read_file_mtime() {
  local file="$1"
  [[ -e "$file" ]] || return 1

  if stat -f '%m' "$file" >/dev/null 2>&1; then
    stat -f '%m' "$file"
    return 0
  fi

  stat -c '%Y' "$file"
}

workflow_pending_orchestration_field() {
  local field="$1"
  local pending_file value
  pending_file="$(workflow_pending_orchestration_file)"
  [[ -f "$pending_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    value="$(jq -r ".$field // empty" "$pending_file" 2>/dev/null || true)"
  else
    value="$(
      awk -v field="$field" '
        $0 ~ "\"" field "\"" {
          line = $0
          sub(/^[^:]*:[[:space:]]*/, "", line)
          sub(/[[:space:]]*,?[[:space:]]*$/, "", line)
          gsub(/^"/, "", line)
          gsub(/"$/, "", line)
          print line
          exit
        }
      ' "$pending_file"
    )"
  fi

  [[ -n "$value" && "$value" != "null" ]] || return 1
  printf '%s' "$value"
}

workflow_write_pending_orchestration() {
  local kind="${1:-host-plan}"
  local host="${2:-${HOOK_HOST:-unknown}}"
  local prompt_slug="${3:-planning}"
  local draft_plan_path="${4:-}"
  local source_ref="${5:-}"
  local expected_artifact="${6:-plan}"
  local pending_file timestamp cwd

  pending_file="$(workflow_pending_orchestration_file)"
  timestamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  cwd="$(pwd -P 2>/dev/null || pwd)"
  mkdir -p "$(dirname "$pending_file")"

  cat > "$pending_file" <<EOF_PENDING_ORCHESTRATION
{
  "version": 1,
  "kind": "$(workflow_json_escape "$kind")",
  "host": "$(workflow_json_escape "$host")",
  "prompt_slug": "$(workflow_json_escape "$prompt_slug")",
  "draft_plan_path": "$(workflow_json_escape "$draft_plan_path")",
  "source_ref": "$(workflow_json_escape "$source_ref")",
  "expected_artifact": "$(workflow_json_escape "$expected_artifact")",
  "cwd": "$(workflow_json_escape "$cwd")",
  "created_at": "$(workflow_json_escape "$timestamp")"
}
EOF_PENDING_ORCHESTRATION
}

workflow_clear_pending_orchestration() {
  rm -f "$(workflow_pending_orchestration_file)"
}

workflow_pending_orchestration_is_fresh() {
  local max_age="${1:-259200}"
  local pending_file mtime now age draft_path status
  pending_file="$(workflow_pending_orchestration_file)"
  [[ -s "$pending_file" ]] || return 1

  mtime="$(workflow_read_file_mtime "$pending_file" 2>/dev/null || true)"
  now="$(date +%s)"
  if [[ -n "$mtime" ]]; then
    age=$((now - mtime))
    [[ "$age" -le "$max_age" ]] && return 0
  fi

  draft_path="$(workflow_pending_orchestration_field draft_plan_path 2>/dev/null || true)"
  if [[ -n "$draft_path" && -f "$draft_path" ]]; then
    status="$(get_plan_status "$draft_path" | tr '[:upper:]' '[:lower:]')"
    case "$status" in
      draft|annotating|"")
        [[ -n "$mtime" ]] && [[ "$((now - mtime))" -le 604800 ]] && return 0
        ;;
    esac
  fi

  return 1
}

workflow_pending_orchestration_summary() {
  local kind host prompt_slug draft_path source_ref expected_artifact cwd

  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  host="$(workflow_pending_orchestration_field host 2>/dev/null || true)"
  prompt_slug="$(workflow_pending_orchestration_field prompt_slug 2>/dev/null || true)"
  draft_path="$(workflow_pending_orchestration_field draft_plan_path 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  expected_artifact="$(workflow_pending_orchestration_field expected_artifact 2>/dev/null || true)"
  cwd="$(workflow_pending_orchestration_field cwd 2>/dev/null || true)"

  printf 'kind=%s host=%s expected=%s slug=%s' "${kind:-unknown}" "${host:-unknown}" "${expected_artifact:-plan}" "${prompt_slug:-planning}"
  [[ -n "$draft_path" ]] && printf ' draft=%s' "$draft_path"
  [[ -n "$source_ref" ]] && printf ' source_ref=%s' "$source_ref"
  [[ -n "$cwd" ]] && printf ' cwd=%s' "$cwd"
  printf '\n'
}

has_research_for_new_plan() {
  local research_file="tasks/research.md"
  local latest_plan research_mtime plan_mtime

  [[ -f "$research_file" ]] || return 1

  latest_plan="$(get_latest_plan || true)"
  if [[ -z "$latest_plan" ]]; then
    return 0
  fi

  research_mtime="$(workflow_read_file_mtime "$research_file" || true)"
  plan_mtime="$(workflow_read_file_mtime "$latest_plan" || true)"

  [[ -n "$research_mtime" && -n "$plan_mtime" && "$research_mtime" -gt "$plan_mtime" ]]
}

workflow_extract_status_from_text() {
  local text="${1:-}"
  printf '%s' "$text" | awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' | xargs
}

workflow_plan_note_count_in_text() {
  local text="${1:-}"
  printf '%s\n' "$text" | grep -c '\[NOTE\]:' || true
}

workflow_plan_note_count() {
  local plan_file="$1"
  [[ -f "$plan_file" ]] || { printf '0'; return; }
  grep -c '\[NOTE\]:' "$plan_file" || true
}

validate_plan_transition() {
  local current_status="$1"
  local next_status="$2"
  local note_count="$3"

  case "${current_status}:${next_status}" in
    Draft:Annotating)
      if [[ "$note_count" -lt 1 ]]; then
        echo "Draft -> Annotating requires at least one [NOTE]: annotation."
        return 1
      fi
      ;;
    Annotating:Approved)
      if [[ "$note_count" -gt 0 ]]; then
        echo "Annotating -> Approved requires all [NOTE]: annotations to be resolved."
        return 1
      fi
      ;;
    Annotating:Draft)
      echo "[PlanState] Rollback: Annotating -> Draft (plan direction rethink)."
      return 0
      ;;
    Draft:Approved|Draft:Executing|Annotating:Executing)
      echo "Status jump ${current_status} -> ${next_status} skips required workflow gates."
      return 1
      ;;
    Approved:Draft|Approved:Annotating|Executing:Draft|Executing:Annotating|Executing:Approved)
      echo "Backward transition ${current_status} -> ${next_status} is not allowed."
      return 1
      ;;
  esac

  return 0
}

read_contract_status() {
  local file="$1"
  awk '/^\> \*\*Status\*\*:/ {sub(/^.*\> \*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" | xargs
}

contract_references_path() {
  local contract_file="$1"
  local file_path="$2"
  local yaml_block section pending_path trimmed item

  [[ -f "$contract_file" ]] || return 1
  [[ "$file_path" == "$contract_file" ]] && return 0

  yaml_block="$(
    awk '
      BEGIN { in_block = 0; printed = 0 }
      /^```yaml[[:space:]]*$/ && printed == 0 { in_block = 1; next }
      /^```[[:space:]]*$/ && in_block == 1 { printed = 1; in_block = 0; exit }
      in_block == 1 { print }
    ' "$contract_file"
  )"

  section=""
  pending_path=""

  while IFS= read -r line; do
    trimmed="$(printf '%s' "$line" | sed -E 's/[[:space:]]+$//; s/^[[:space:]]+//')"
    [[ -z "$trimmed" ]] && continue

    case "$trimmed" in
      files_exist:|tests_pass:|files_contain:|files_not_exist:|files_not_contain:)
        section="${trimmed%:}"
        pending_path=""
        continue
        ;;
    esac

    case "$section" in
      files_exist|files_not_exist)
        if [[ "$trimmed" =~ ^-[[:space:]]*(.+)$ ]]; then
          item="$(workflow_strip_quotes "${BASH_REMATCH[1]}")"
          [[ "$item" == "$file_path" ]] && return 0
        fi
        ;;
      tests_pass|files_contain|files_not_contain)
        if [[ "$trimmed" =~ ^-[[:space:]]*path:[[:space:]]*(.+)$ ]]; then
          pending_path="$(workflow_strip_quotes "${BASH_REMATCH[1]}")"
          [[ "$pending_path" == "$file_path" ]] && return 0
        elif [[ "$trimmed" =~ ^path:[[:space:]]*(.+)$ ]]; then
          pending_path="$(workflow_strip_quotes "${BASH_REMATCH[1]}")"
          [[ "$pending_path" == "$file_path" ]] && return 0
        fi
        ;;
    esac
  done <<< "$yaml_block"

  return 1
}

workflow_contract_slug() {
  local active_plan slug
  active_plan="$(get_active_plan || true)"
  [[ -n "$active_plan" ]] || return 1
  slug="$(basename "$active_plan" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
  [[ -n "$slug" ]] || return 1
  printf '%s' "$slug"
}

workflow_active_contract() {
  local active_plan contract_file
  active_plan="$(get_active_plan || true)"
  [[ -n "$active_plan" ]] || return 1
  contract_file="$(derive_contract_path "$active_plan" || true)"
  [[ -n "$contract_file" ]] || return 1
  printf '%s' "$contract_file"
}

workflow_active_review() {
  local slug
  slug="$(workflow_contract_slug || true)"
  [[ -n "$slug" ]] || return 1
  printf 'tasks/reviews/%s.review.md' "$slug"
}

workflow_active_notes() {
  local slug notes_dir
  slug="$(workflow_contract_slug || true)"
  [[ -n "$slug" ]] || return 1
  notes_dir="$(workflow_repo_relative_path "$(workflow_policy_get '.tasks.notes_dir' 'tasks/notes')" 'tasks/notes' 'tasks/')"
  printf '%s/%s.notes.md' "$notes_dir" "$slug"
}

workflow_checks_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.checks_file' '.ai/harness/checks/latest.json')" '.ai/harness/checks/latest.json' '.ai/harness/'
}

workflow_handoff_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.handoff_file' '.ai/harness/handoff/current.md')" '.ai/harness/handoff/current.md' '.ai/harness/'
}

workflow_append_event() {
  local event_type="$1"
  local reason="${2:-}"
  local extra_json="${3:-{}}"
  local events_file run_id

  workflow_ensure_harness_surface
  events_file="$(workflow_events_file)"
  run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-$(date '+%Y%m%dT%H%M%S')-$$}}}"

  if command -v jq >/dev/null 2>&1; then
    jq -nc \
      --arg ts "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
      --arg event_type "$event_type" \
      --arg reason "$reason" \
      --arg run_id "$run_id" \
      --arg extra_json "$extra_json" \
      '{
        ts: $ts,
        event_type: $event_type,
        reason: $reason,
        run_id: $run_id,
        extra: (try ($extra_json | fromjson) catch {})
      }' >> "$events_file"
    return 0
  fi

  printf '{"ts":"%s","event_type":"%s","reason":"%s","run_id":"%s"}\n' \
    "$(workflow_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")" \
    "$(workflow_json_escape "$event_type")" \
    "$(workflow_json_escape "$reason")" \
    "$(workflow_json_escape "$run_id")" \
    >> "$events_file"
}

workflow_write_run_summary() {
  local reason="${1:-state-update}"
  local run_id active_plan active_contract active_review active_notes output_file

  workflow_ensure_harness_surface
  run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-$(date '+%Y%m%dT%H%M%S')-$$}}}"
  active_plan="$(get_active_plan || true)"
  active_contract="$(workflow_active_contract || true)"
  active_review="$(workflow_active_review || true)"
  active_notes="$(workflow_active_notes || true)"
  output_file="$(workflow_runs_dir)/${run_id}.json"

  if command -v jq >/dev/null 2>&1; then
    jq -nc \
      --arg generated_at "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
      --arg run_id "$run_id" \
      --arg reason "$reason" \
      --arg active_plan "${active_plan:-}" \
      --arg active_contract "${active_contract:-}" \
      --arg active_review "${active_review:-}" \
      --arg active_notes "${active_notes:-}" \
      --arg checks_file "$(workflow_checks_file)" \
      --arg handoff_file "$(workflow_handoff_file)" \
      --arg policy_file "$(workflow_policy_file)" \
      --arg context_map_file "$(workflow_context_map_file)" \
      '{
        generated_at: $generated_at,
        run_id: $run_id,
        reason: $reason,
        active_plan: $active_plan,
        active_contract: $active_contract,
        active_review: $active_review,
        active_notes: $active_notes,
        checks_file: $checks_file,
        handoff_file: $handoff_file,
        policy_file: $policy_file,
        context_map_file: $context_map_file
      }' > "$output_file"
    return 0
  fi

  cat > "$output_file" <<EOF_RUN
{"generated_at":"$(workflow_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")","run_id":"$(workflow_json_escape "$run_id")","reason":"$(workflow_json_escape "$reason")","checks_file":"$(workflow_json_escape "$(workflow_checks_file)")","handoff_file":"$(workflow_json_escape "$(workflow_handoff_file)")"}
EOF_RUN
}

workflow_review_recommends_pass() {
  local review_file="${1:-}"
  [[ -n "$review_file" && -f "$review_file" ]] || return 1
  grep -Eq '^> \*\*Recommendation\*\*:[[:space:]]*pass[[:space:]]*$' "$review_file"
}

workflow_checks_pass() {
  local checks_file="${1:-}"
  local contract_file="${2:-}"
  local review_file="${3:-}"
  local status source exit_code check_contract check_review

  if [[ -z "$checks_file" || ! -s "$checks_file" ]]; then
    echo "Structured checks file is missing or empty: ${checks_file:-"(none)"}"
    return 1
  fi

  if command -v jq >/dev/null 2>&1; then
    status="$(jq -r '.status // empty' "$checks_file" 2>/dev/null || true)"
    source="$(jq -r '.source // empty' "$checks_file" 2>/dev/null || true)"
    exit_code="$(jq -r '.exit_code // empty' "$checks_file" 2>/dev/null || true)"
    check_contract="$(jq -r '.contract.file // .contract // empty' "$checks_file" 2>/dev/null || true)"
    check_review="$(jq -r '.review.file // .review // empty' "$checks_file" 2>/dev/null || true)"

    if [[ "$status" != "pass" ]]; then
      echo "Structured checks are not passing in $checks_file (status=${status:-missing})."
      return 1
    fi
    if [[ "$source" != "verify-sprint" ]]; then
      echo "Structured checks must come from verify-sprint, got ${source:-missing}."
      return 1
    fi
    if [[ "$exit_code" != "0" ]]; then
      echo "Structured checks did not record a zero verify-sprint exit code (exit_code=${exit_code:-missing})."
      return 1
    fi
    if [[ -n "$contract_file" && "$check_contract" != "$contract_file" ]]; then
      echo "Structured checks are stale for contract ${check_contract:-missing}; expected $contract_file."
      return 1
    fi
    if [[ -n "$review_file" && "$check_review" != "$review_file" ]]; then
      echo "Structured checks are stale for review ${check_review:-missing}; expected $review_file."
      return 1
    fi
    return 0
  fi

  if ! grep -Eq '"status"[[:space:]]*:[[:space:]]*"pass"' "$checks_file"; then
    echo "Structured checks are not passing in $checks_file."
    return 1
  fi
  if ! grep -Eq '"source"[[:space:]]*:[[:space:]]*"verify-sprint"' "$checks_file"; then
    echo "Structured checks must come from verify-sprint."
    return 1
  fi
  if ! grep -Eq '"exit_code"[[:space:]]*:[[:space:]]*0' "$checks_file"; then
    echo "Structured checks did not record a zero verify-sprint exit code."
    return 1
  fi
  if [[ -n "$contract_file" ]] && ! grep -Fq "\"file\":\"$contract_file\"" "$checks_file" && ! grep -Fq "\"file\": \"$contract_file\"" "$checks_file"; then
    echo "Structured checks do not reference current contract $contract_file."
    return 1
  fi
  if [[ -n "$review_file" ]] && ! grep -Fq "\"file\":\"$review_file\"" "$checks_file" && ! grep -Fq "\"file\": \"$review_file\"" "$checks_file"; then
    echo "Structured checks do not reference current review $review_file."
    return 1
  fi
}

workflow_contract_allows_path() {
  local contract_file="$1"
  local file_path="$2"
  local yaml_block section trimmed item pattern

  [[ -f "$contract_file" ]] || return 1
  [[ "$file_path" == "$contract_file" ]] && return 0

  yaml_block="$(
    awk '
      BEGIN { in_block = 0; printed = 0 }
      /^```yaml[[:space:]]*$/ && printed == 0 { in_block = 1; next }
      /^```[[:space:]]*$/ && in_block == 1 { printed = 1; in_block = 0; exit }
      in_block == 1 { print }
    ' "$contract_file"
  )"

  section=""
  while IFS= read -r line; do
    trimmed="$(printf '%s' "$line" | sed -E 's/[[:space:]]+$//; s/^[[:space:]]+//')"
    [[ -z "$trimmed" ]] && continue

    case "$trimmed" in
      allowed_paths:)
        section="allowed_paths"
        continue
        ;;
      exit_criteria:|files_exist:|tests_pass:|commands_succeed:|files_contain:|artifacts_exist:|qa_scores:|manual_checks:)
        section=""
        continue
        ;;
    esac

    if [[ "$section" == "allowed_paths" && "$trimmed" =~ ^-[[:space:]]*(.+)$ ]]; then
      item="$(workflow_strip_quotes "${BASH_REMATCH[1]}")"
      pattern="$item"
      if [[ "$pattern" == */ ]]; then
        [[ "$file_path" == "$pattern"* ]] && return 0
      elif [[ "$file_path" == $pattern ]]; then
        return 0
      fi
    fi
  done <<< "$yaml_block"

  return 1
}
workflow_write_handoff() {
  local reason="${1:-session-stop}"
  local handoff_file active_plan active_contract active_review active_notes checks_file next_task changed_files diff_stat spec_file source_plan parent_run_id supersedes
  local next_action next_stage next_command next_message
  local budget_file resume_file events_file recent_commands blockers decisions goal
  local changed_count untracked_count

  workflow_ensure_harness_surface
  handoff_file="$(workflow_handoff_file)"
  checks_file="$(workflow_checks_file)"
  budget_file="$(workflow_context_budget_status_file)"
  resume_file="$(workflow_resume_packet_file)"
  events_file="$(workflow_events_file)"
  spec_file="docs/spec.md"
  active_plan="$(get_active_plan || true)"
  active_contract="$(workflow_active_contract || true)"
  active_review="$(workflow_active_review || true)"
  active_notes="$(workflow_active_notes || true)"
  source_plan="$(get_todo_source_plan || true)"
  if [[ "$source_plan" == "(none)" ]]; then
    source_plan=""
  fi
  parent_run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-$(date '+%Y%m%dT%H%M%S')-$$}}}"
  supersedes="$(workflow_read_state_field "$(workflow_task_state_file)" 'source_plan' || true)"

  next_action="$(workflow_next_action)"
  next_stage="$(printf '%s\n' "$next_action" | cut -f1)"
  next_command="$(printf '%s\n' "$next_action" | cut -f2)"
  next_message="$(printf '%s\n' "$next_action" | cut -f3-)"
  [[ "${next_command:-}" == "-" ]] && next_command=""
  next_stage="${next_stage:-none}"
  next_message="${next_message:-(none)}"
  if [[ -n "${next_command:-}" ]]; then
    next_task="${next_message} Command: ${next_command}"
  else
    next_task="$next_message"
  fi

  if is_git_repo; then
    changed_files="$(
      {
        git diff --name-only HEAD 2>/dev/null || true
        git ls-files --others --exclude-standard 2>/dev/null || true
      } | sed '/^[[:space:]]*$/d' | sort -u
    )"
    changed_files="${changed_files:-(none)}"
    changed_count="$(printf '%s\n' "$changed_files" | sed '/^(none)$/d; /^[[:space:]]*$/d' | wc -l | tr -d ' ')"
    if [[ "$changed_count" -gt 80 ]]; then
      changed_files="$(
        {
          printf '%s\n' "$changed_files" | head -80
          printf '... (%s total changed/untracked paths; inspect git status --short)\n' "$changed_count"
        }
      )"
    fi

    diff_stat="$( (git diff --shortstat HEAD 2>/dev/null || true) | tr -d '\n' )"
    untracked_count="$(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "$untracked_count" -gt 0 ]]; then
      diff_stat="${diff_stat:-no tracked diff}; ${untracked_count} untracked files"
    fi
    diff_stat="${diff_stat:-no uncommitted diff against HEAD}"
  else
    changed_files="(none)"
    diff_stat="git repository not detected"
  fi

  if [[ -f "$events_file" ]]; then
    recent_commands="$(
      { grep '"event_type":"tool_trace"' "$events_file" 2>/dev/null || true; } \
        | tail -5 \
        | sed -E 's/^/- /'
    )"
  fi
  recent_commands="${recent_commands:-- (none captured)}"

  if [[ -n "$source_plan" ]]; then
    goal="Continue task checklist sourced from ${source_plan}."
  elif [[ -n "$active_plan" ]]; then
    goal="Continue active plan ${active_plan}."
  elif [[ "$next_stage" == "cleanup" ]]; then
    goal="Clean up completed contract worktree."
  elif [[ "$next_task" != "(none)" && "$next_task" != "No active execution checklist" ]]; then
    goal="$next_task"
  else
    goal="No active plan. Continue from the latest user request and filesystem state."
  fi
  decisions="Use filesystem artifacts as source of truth; treat SQLite/thread state as a rebuildable read model only."
  blockers="(none recorded)"

  cat > "$handoff_file" <<EOF_HANDOFF
# Harness Handoff

> **Generated**: $(date '+%Y-%m-%d %H:%M:%S')
> **Reason**: ${reason}

## Goal

${goal}

## Decisions

- ${decisions}

## Files Touched

\`\`\`
${changed_files}
\`\`\`

## Commands Run

${recent_commands}

## Checks

- Checks file: ${checks_file}
- Context budget: ${budget_file}

## Blockers

- ${blockers}

## Exact Next Step

- ${next_task}

## Resume Prompt

- Resume packet: ${resume_file}
- Start a fresh Codex session and read this handoff before continuing; do not rely on auto-compact.

## Source Artifacts

- Spec: ${spec_file}
- Plan: ${active_plan:-(none)}
- Todo Source Plan: ${source_plan:-(none)}
- Contract: ${active_contract:-(none)}
- Review: ${active_review:-(none)}
- Notes: ${active_notes:-(none)}
- Checks: ${checks_file}
- Context Budget: ${budget_file}
- Resume Packet: ${resume_file}
- Policy: $(workflow_policy_file)
- Context Map: $(workflow_context_map_file)

## Current Status

- Next action stage: ${next_stage}
- Next recommended action: ${next_task}
- Working tree: ${diff_stat}
- Parent Run ID: ${parent_run_id}
- Supersedes: ${supersedes:-(none)}

## Changed Files

\`\`\`
${changed_files}
\`\`\`
EOF_HANDOFF

  workflow_append_event "handoff_refresh" "$reason" "{\"source_plan\":\"$(workflow_json_escape "${source_plan:-}")\",\"parent_run_id\":\"$(workflow_json_escape "$parent_run_id")\"}"
  workflow_write_run_summary "$reason"
}
