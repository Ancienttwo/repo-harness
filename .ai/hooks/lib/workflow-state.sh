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

# Projects lifecycle roles from the single policy-owned ordered status array.
# The anchors carry semantics; every projected value must be a member of the
# same array and the lifecycle order must remain coherent or the projection
# fails closed.
workflow_plan_status_projection() {
  local projection="$1"
  local policy_file

  policy_file="$(workflow_policy_file)"
  [[ -f "$policy_file" ]] || return 1
  command -v jq >/dev/null 2>&1 || return 1
  jq -er --arg projection "$projection" '
    .active_plan as $active
    | $active.statuses as $statuses
    | $active.lifecycle as $lifecycle
    | select(($statuses | type) == "array" and ($statuses | length) > 0)
    | select(all($statuses[]; type == "string" and length > 0))
    | select(($statuses | unique | length) == ($statuses | length))
    | select(($lifecycle | type) == "object")
    | $lifecycle.annotation_end as $annotation_end
    | $lifecycle.approved as $approved
    | $lifecycle.executing as $executing
    | $lifecycle.terminal_start as $terminal_start
    | select([$annotation_end, $approved, $executing, $terminal_start] | all(.[]; type == "string"))
    | ($statuses | index($annotation_end)) as $annotation_index
    | ($statuses | index($approved)) as $approved_index
    | ($statuses | index($executing)) as $executing_index
    | ($statuses | index($terminal_start)) as $terminal_index
    | select(
        $annotation_index != null and $annotation_index >= 1
        and $approved_index == ($annotation_index + 1)
        and $executing_index == ($approved_index + 1)
        and $terminal_index > $executing_index
      )
    | if $projection == "known" then $statuses[]
      elif $projection == "pre_approval" then $statuses[0:$approved_index][]
      elif $projection == "terminal" then $statuses[$terminal_index:][]
      elif $projection == "draft" then $statuses[0]
      elif $projection == "annotation_end" then $annotation_end
      elif $projection == "approved" then $approved
      elif $projection == "executing" then $executing
      else empty
      end
  ' "$policy_file" 2>/dev/null
}

workflow_plan_status_is_known() {
  local status="$1"
  workflow_plan_status_projection known | grep -Fqx -- "$status"
}

workflow_plan_status_is_terminal() {
  local status="$1"
  workflow_plan_status_projection terminal | grep -Fqx -- "$status"
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

workflow_trace_file() {
  printf '%s' ".claude/.trace.jsonl"
}

workflow_runs_dir() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.runs_dir' '.ai/harness/runs')" '.ai/harness/runs' '.ai/harness/'
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
    "$(dirname "$(workflow_handoff_file)")" \
    "$(dirname "$(workflow_resume_packet_file)")" \
    "$(dirname "$(workflow_failure_log_file)")" \
    "$(dirname "$(workflow_pending_orchestration_file)")" \
    "$(workflow_runs_dir)"

  # Recovery materialization owns handoff and resume files. Missing files stay absent.
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

  read_active_plan_marker "$ACTIVE_PLAN_MARKER"
}

write_active_plan_marker() {
  local plan_file="$1"
  mkdir -p "$(dirname "$ACTIVE_PLAN_MARKER")" "$(dirname "$ACTIVE_WORKTREE_MARKER")"
  printf '%s' "$plan_file" > "$ACTIVE_PLAN_MARKER"
  pwd -P > "$ACTIVE_WORKTREE_MARKER"
}

clear_active_plan_marker() {
  rm -f "$ACTIVE_PLAN_MARKER" "$ACTIVE_WORKTREE_MARKER"
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
  if [[ ! -f "tasks/todos.md" ]]; then
    return 1
  fi

  awk -F': ' '/^\> \*\*Source Plan\*\*:/ {print $2; exit}' tasks/todos.md | xargs
}

workflow_plan_slug_from_path() {
  local plan_file="$1"
  local base slug

  base="$(basename "$plan_file")"
  slug="$(printf '%s' "$base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"

  if [[ -z "$slug" ]] || [[ "$slug" == "$base" ]]; then
    return 1
  fi

  printf '%s' "$slug"
}

workflow_plan_original_artifact_stem_from_path() {
  local plan_file="$1"
  local base stem

  base="$(basename "$plan_file")"
  stem="$(printf '%s' "$base" | sed -E 's/^plan-//; s/\.md$//')"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    printf '%s' "$stem"
    return 0
  fi

  workflow_plan_slug_from_path "$plan_file"
}

workflow_is_transient_plan_slug() {
  case "$1" in
    think-plan-[0-9]*|codex-plan-[0-9]*|approved-plan-[0-9]*)
      return 0
      ;;
  esac
  return 1
}

workflow_plan_title_slug_from_file() {
  local plan_file="$1"
  local title slug

  [[ -f "$plan_file" ]] || return 1
  title="$(awk '
    /^# Plan:[[:space:]]*/ {
      sub(/^# Plan:[[:space:]]*/, "")
      print
      exit
    }
  ' "$plan_file" | xargs)"
  [[ -n "$title" ]] || return 1

  slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  [[ -n "$slug" ]] || return 1
  printf '%s' "$slug"
}

workflow_plan_artifact_stem_from_path() {
  local plan_file="$1"
  local stem stamp slug title_slug

  stem="$(workflow_plan_original_artifact_stem_from_path "$plan_file" || true)"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    stamp="$(printf '%s' "$stem" | sed -E 's/^([0-9]{8}-[0-9]{4})-.+$/\1/')"
    slug="$(printf '%s' "$stem" | sed -E 's/^[0-9]{8}-[0-9]{4}-//')"
    if workflow_is_transient_plan_slug "$slug"; then
      title_slug="$(workflow_plan_title_slug_from_file "$plan_file" || true)"
      if [[ -n "$title_slug" && "$title_slug" != "$slug" ]]; then
        printf '%s-%s' "$stamp" "$title_slug"
        return 0
      fi
    fi
    printf '%s' "$stem"
    return 0
  fi

  workflow_plan_slug_from_path "$plan_file"
}

workflow_preferred_or_legacy_path() {
  local preferred="$1"
  local legacy="$2"

  if [[ -f "$preferred" ]] || [[ ! -f "$legacy" ]]; then
    printf '%s' "$preferred"
  else
    printf '%s' "$legacy"
  fi
}

workflow_plan_declared_path() {
  local plan_file="$1"
  local label="$2"
  [[ -f "$plan_file" ]] || return 1
  awk -v label="$label" '
    BEGIN { pattern = "^> \\*\\*" label "\\*\\*:" }
    $0 ~ pattern {
      sub(pattern "[[:space:]]*", "")
      gsub(/`/, "")
      gsub(/\r/, "")
      print
      exit
    }
  ' "$plan_file" | xargs
}

derive_contract_path() {
  local plan_file="$1"
  local stem slug explicit

  explicit="$(workflow_plan_declared_path "$plan_file" "Task Contract" || workflow_plan_declared_path "$plan_file" "Sprint Contract" || true)"
  if [[ -n "$explicit" ]]; then
    printf '%s' "$explicit"
    return 0
  fi

  stem="$(workflow_plan_artifact_stem_from_path "$plan_file" || true)"
  slug="$(workflow_plan_slug_from_path "$plan_file" || true)"
  [[ -n "$stem" && -n "$slug" ]] || return 1

  workflow_preferred_or_legacy_path "tasks/contracts/${stem}.contract.md" "tasks/contracts/${slug}.contract.md"
}

workflow_plan_slug() {
  local active_plan slug
  active_plan="$(get_active_plan || true)"
  if [[ -z "$active_plan" ]]; then
    return 1
  fi

  slug="$(workflow_plan_slug_from_path "$active_plan" || true)"
  if [[ -n "$slug" ]]; then
    printf '%s' "$slug"
    return 0
  fi
  return 1
}

workflow_todo_total() {
  if [[ ! -f "tasks/todos.md" ]]; then
    printf '0'
    return
  fi

  grep -E '^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+' tasks/todos.md | wc -l | tr -d ' '
}

workflow_todo_done() {
  if [[ ! -f "tasks/todos.md" ]]; then
    printf '0'
    return
  fi

  grep -E '^[[:space:]]*-[[:space:]]\[[xX]\][[:space:]]+' tasks/todos.md | wc -l | tr -d ' '
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
  if [[ -f "tasks/todos.md" ]] && ! grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' tasks/todos.md; then
    workflow_iterate_todo_tasks "tasks/todos.md" | workflow_plan_task_state_from_stream
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
  local active_plan task_state total done next_pending contract_file review_file checks_error
  local target current_branch slug candidate branch worktree command message

  active_plan="$(get_active_plan || true)"
  if [[ -n "$active_plan" && -f "$active_plan" ]]; then
    task_state="$(workflow_plan_task_state "$active_plan")"
    IFS=$'\t' read -r total done next_pending <<< "$task_state"
    total="${total:-0}"
    done="${done:-0}"

    if [[ "$total" -gt "$done" ]]; then
      message="${next_pending:-continue active plan Task Breakdown}"
      message="If a major module was just completed, stage its coherent diff first; then continue the next Task Breakdown item: ${message}"
      printf 'task\t-\t%s\n' "$message"
      return 0
    fi

    contract_file="$(workflow_active_contract || true)"
    review_file="$(workflow_active_review || true)"

    if [[ -z "$contract_file" || ! -f "$contract_file" ]]; then
      printf 'check\t/check\tStage the completed module diff first; then regenerate the active sprint contract and run /check.\n'
      return 0
    fi

    if ! checks_error="$(repo-harness run verification-plan evaluate --repo "$PWD" --contract "$contract_file" 2>&1)"; then
      printf 'check\t/check\tVerification evidence is missing or failed. Declare and execute the Verification Plan. %s\n' "$checks_error"
      return 0
    fi
    if ! checks_error="$(repo-harness run acceptance-receipt inspect-current --contract "$contract_file" 2>&1)"; then
      printf 'check\t/check\tSemantic acceptance is missing or stale. %s\n' "$checks_error"
      return 0
    fi

    target="$(workflow_target_branch)"
    current_branch="$(workflow_current_branch)"
    if workflow_is_linked_worktree && [[ -n "$current_branch" && "$current_branch" != "$target" ]]; then
      printf 'finish\trepo-harness run contract-worktree finish\tReview/checks pass; finish and fast-forward merge this contract worktree.\n'
      return 0
    fi
  fi

  if candidate="$(workflow_cleanup_candidate)"; then
    IFS=$'\t' read -r slug branch worktree <<< "$candidate"
    target="$(workflow_target_branch)"
    command="repo-harness run contract-worktree cleanup --slug ${slug} --target ${target}"
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
  local todo_file="${1:-tasks/todos.md}"
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
  local todo_file="${1:-tasks/todos.md}"
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

latest_research_report() {
  local research_dir="${1:-docs/researches}"
  local file mtime latest_file="" latest_mtime=0

  [[ -d "$research_dir" ]] || return 1

  while IFS= read -r -d '' file; do
    case "$(basename "$file")" in
      README.md)
        continue
        ;;
    esac

    mtime="$(workflow_read_file_mtime "$file" || true)"
    if [[ -n "$mtime" && "$mtime" -gt "$latest_mtime" ]]; then
      latest_mtime="$mtime"
      latest_file="$file"
    fi
  done < <(find "$research_dir" -type f -name '*.md' -print0 2>/dev/null)

  [[ -n "$latest_file" ]] || return 1
  printf '%s' "$latest_file"
}

has_research_for_new_plan() {
  local latest_plan latest_report research_mtime plan_mtime

  latest_report="$(latest_research_report || true)"
  [[ -n "$latest_report" ]] || return 1

  latest_plan="$(get_latest_plan || true)"
  if [[ -z "$latest_plan" ]]; then
    return 0
  fi

  research_mtime="$(workflow_read_file_mtime "$latest_report" || true)"
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
  local draft annotation_end approved executing

  draft="$(workflow_plan_status_projection draft)" \
    && annotation_end="$(workflow_plan_status_projection annotation_end)" \
    && approved="$(workflow_plan_status_projection approved)" \
    && executing="$(workflow_plan_status_projection executing)" || {
      echo "Plan-status authority is unavailable or malformed."
      return 1
    }
  if ! workflow_plan_status_is_known "$current_status" || ! workflow_plan_status_is_known "$next_status"; then
    echo "Unknown plan status transition ${current_status} -> ${next_status}."
    return 1
  fi

  case "${current_status}:${next_status}" in
    "${draft}:${annotation_end}")
      if [[ "$note_count" -lt 1 ]]; then
        echo "${draft} -> ${annotation_end} requires at least one [NOTE]: annotation."
        return 1
      fi
      ;;
    "${annotation_end}:${approved}")
      if [[ "$note_count" -gt 0 ]]; then
        echo "${annotation_end} -> ${approved} requires all [NOTE]: annotations to be resolved."
        return 1
      fi
      ;;
    "${annotation_end}:${draft}")
      echo "[PlanState] Rollback: ${annotation_end} -> ${draft} (plan direction rethink)."
      return 0
      ;;
    "${draft}:${approved}"|"${draft}:${executing}"|"${annotation_end}:${executing}")
      echo "Status jump ${current_status} -> ${next_status} skips required workflow gates."
      return 1
      ;;
    "${approved}:${draft}"|"${approved}:${annotation_end}"|"${executing}:${draft}"|"${executing}:${annotation_end}"|"${executing}:${approved}")
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
  slug="$(workflow_plan_slug_from_path "$active_plan" || true)"
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
  local active_plan stem slug reviews_dir explicit
  active_plan="$(get_active_plan || true)"
  [[ -n "$active_plan" ]] || return 1
  explicit="$(workflow_plan_declared_path "$active_plan" "Task Review" || workflow_plan_declared_path "$active_plan" "Sprint Review" || true)"
  if [[ -n "$explicit" ]]; then
    printf '%s' "$explicit"
    return 0
  fi
  stem="$(workflow_plan_artifact_stem_from_path "$active_plan" || true)"
  slug="$(workflow_plan_slug_from_path "$active_plan" || true)"
  [[ -n "$stem" && -n "$slug" ]] || return 1
  reviews_dir="$(workflow_repo_relative_path "$(workflow_policy_get '.tasks.reviews_dir' 'tasks/reviews')" 'tasks/reviews' 'tasks/')"
  workflow_preferred_or_legacy_path "${reviews_dir}/${stem}.review.md" "${reviews_dir}/${slug}.review.md"
}

workflow_active_notes() {
  local active_plan stem slug notes_dir explicit
  active_plan="$(get_active_plan || true)"
  [[ -n "$active_plan" ]] || return 1
  explicit="$(workflow_plan_declared_path "$active_plan" "Implementation Notes" || workflow_plan_declared_path "$active_plan" "Notes File" || true)"
  if [[ -n "$explicit" ]]; then
    printf '%s' "$explicit"
    return 0
  fi
  stem="$(workflow_plan_artifact_stem_from_path "$active_plan" || true)"
  slug="$(workflow_plan_slug_from_path "$active_plan" || true)"
  [[ -n "$stem" && -n "$slug" ]] || return 1
  notes_dir="$(workflow_repo_relative_path "$(workflow_policy_get '.tasks.notes_dir' 'tasks/notes')" 'tasks/notes' 'tasks/')"
  workflow_preferred_or_legacy_path "${notes_dir}/${stem}.notes.md" "${notes_dir}/${slug}.notes.md"
}


workflow_handoff_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.handoff_file' '.ai/harness/handoff/current.md')" '.ai/harness/handoff/current.md' '.ai/harness/'
}

# mkdir-based mutual exclusion (macOS ships no flock). Spins ~2s, breaks locks
# older than 60s (crashed holder), and as a last resort runs the command
# unlocked rather than wedging an advisory hook.
workflow_with_lock() {
  local name="$1"
  shift
  local lock_root lock_dir waited=0 now mtime status=0
  lock_root="$(dirname "$(workflow_events_file)")/.locks"
  lock_dir="$lock_root/${name}.lock"
  if ! mkdir -p "$lock_root" 2>/dev/null; then
    "$@" || status=$?
    return "$status"
  fi

  while ! mkdir "$lock_dir" 2>/dev/null; do
    if [[ "$waited" -ge 40 ]]; then
      now="$(date +%s)"
      mtime="$(stat -c '%Y' "$lock_dir" 2>/dev/null || stat -f '%m' "$lock_dir" 2>/dev/null || echo 0)"
      if [[ "${mtime:-0}" =~ ^[0-9]+$ && "${mtime:-0}" -gt 0 && $((now - mtime)) -ge 60 ]]; then
        rmdir "$lock_dir" 2>/dev/null || true
        waited=0
        continue
      fi
      "$@" || status=$?
      return "$status"
    fi
    sleep 0.05
    waited=$((waited + 1))
  done

  "$@" || status=$?
  rmdir "$lock_dir" 2>/dev/null || true
  return "$status"
}

workflow_locked_append_line() {
  printf '%s\n' "$2" >> "$1"
}

workflow_locked_increment_file() {
  local file="$1" value
  value="$(cat "$file" 2>/dev/null | tr -cd '0-9')"
  value=$(( ${value:-0} + 1 ))
  printf '%s\n' "$value" > "$file"
  printf '%s' "$value"
}

# Atomic read-increment-write for small counter files (concurrent PostToolUse
# hooks used to lose increments via unlocked read-modify-write).
workflow_increment_counter() {
  local file="$1"
  workflow_with_lock "counter-$(basename "$file")" workflow_locked_increment_file "$file"
}

# Rotate an events JSONL file once it exceeds limits. Cold-path only (session
# start); holds the same lock as appends so no event line is lost mid-rotate.
workflow_rotate_events_file() {
  local file="$1" max_lines="${2:-2000}" max_bytes="${3:-524288}" keep="${4:-500}"
  [[ -f "$file" ]] || return 0
  local lines bytes
  lines="$(wc -l < "$file" 2>/dev/null | tr -cd '0-9')"
  bytes="$(wc -c < "$file" 2>/dev/null | tr -cd '0-9')"
  if [[ "${lines:-0}" -le "$max_lines" && "${bytes:-0}" -le "$max_bytes" ]]; then
    return 0
  fi
  [[ "${lines:-0}" -gt "$keep" ]] || return 0
  workflow_with_lock "evt-$(basename "$file")" workflow_rotate_events_file_locked "$file" "$lines" "$keep"
}

workflow_rotate_events_file_locked() {
  local file="$1" lines="$2" keep="$3"
  local archive_dir archive_file tmp cut
  archive_dir="$(dirname "$file")/archive"
  archive_file="$archive_dir/$(basename "$file" .jsonl)-$(date '+%Y%m').jsonl"
  cut=$((lines - keep))
  mkdir -p "$archive_dir" 2>/dev/null || return 0
  tmp="$(mktemp 2>/dev/null)" || return 0
  if head -n "$cut" "$file" >> "$archive_file" 2>/dev/null && tail -n "$keep" "$file" > "$tmp" 2>/dev/null; then
    mv "$tmp" "$file"
    echo "[WorkflowState] Rotated $(basename "$file"): archived $cut lines to $archive_file" >&2
  else
    rm -f "$tmp"
  fi
}

workflow_append_event() {
  local event_type="$1"
  local reason="${2:-}"
  local extra_json="${3:-{}}"
  local events_file run_id line=""

  workflow_ensure_harness_surface
  events_file="$(workflow_events_file)"
  run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-$(date '+%Y%m%dT%H%M%S')-$$}}}"

  if command -v jq >/dev/null 2>&1; then
    line="$(jq -nc \
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
      }')"
  else
    line="$(printf '{"ts":"%s","event_type":"%s","reason":"%s","run_id":"%s"}' \
      "$(workflow_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")" \
      "$(workflow_json_escape "$event_type")" \
      "$(workflow_json_escape "$reason")" \
      "$(workflow_json_escape "$run_id")")"
  fi

  [[ -n "$line" ]] || return 0
  workflow_with_lock "evt-$(basename "$events_file")" workflow_locked_append_line "$events_file" "$line"
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
        handoff_file: $handoff_file,
        policy_file: $policy_file,
        context_map_file: $context_map_file
      }' > "$output_file"
    return 0
  fi

  # Same field set as the jq branch above: run-summary retention identifies this
  # record by its shape, so a short fallback would make every jq-less host's
  # summaries permanently unreclaimable.
  cat > "$output_file" <<EOF_RUN
{"generated_at":"$(workflow_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")","run_id":"$(workflow_json_escape "$run_id")","reason":"$(workflow_json_escape "$reason")","active_plan":"$(workflow_json_escape "${active_plan:-}")","active_contract":"$(workflow_json_escape "${active_contract:-}")","active_review":"$(workflow_json_escape "${active_review:-}")","active_notes":"$(workflow_json_escape "${active_notes:-}")","handoff_file":"$(workflow_json_escape "$(workflow_handoff_file)")","policy_file":"$(workflow_json_escape "$(workflow_policy_file)")","context_map_file":"$(workflow_json_escape "$(workflow_context_map_file)")"}
EOF_RUN
}


workflow_hook_cli_json() {
  if [[ -n "${REPO_HARNESS_HOOK_CLI:-}" && -f "${REPO_HARNESS_HOOK_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_HOOK_CLI" "$@"
    return $?
  fi
  if [[ -n "${HOOK_REPO_ROOT:-}" && -f "$HOOK_REPO_ROOT/src/cli/hook-entry.ts" ]] && command -v bun >/dev/null 2>&1; then
    bun "$HOOK_REPO_ROOT/src/cli/hook-entry.ts" "$@"
    return $?
  fi
  if command -v repo-harness-hook >/dev/null 2>&1; then
    repo-harness-hook "$@"
    return $?
  fi
  return 127
}

workflow_json_field() {
  local json="${1:-}"
  local field="${2:-}"
  [[ -n "$json" && -n "$field" ]] || return 1
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$json" | jq -r ".$field // empty" 2>/dev/null || true
    return
  fi
  if command -v bun >/dev/null 2>&1; then
    JSON_INPUT="$json" JSON_FIELD="$field" bun -e '
      try {
        const parsed = JSON.parse(process.env.JSON_INPUT ?? "");
        const value = parsed?.[process.env.JSON_FIELD ?? ""];
        if (value != null) process.stdout.write(String(value));
      } catch {}
    ' 2>/dev/null || true
  fi
}

workflow_current_review_subject_json() {
  # The target ref selects the implementation path set and supplies overlap
  # metadata. The subject hash itself is normalized final content and therefore
  # does not churn when the target advances on unrelated paths.
  #
  # Must resolve worktree_strategy.review_base -- the same key
  # scripts/acceptance-receipt.ts's reviewBase() diffs against -- never
  # worktree_strategy.merge_back.target (where finished work lands after
  # merge). Those are different refs; recording the subject against the
  # merge-back target instead of the review base is exactly why every
  # AcceptanceReceipt failed "verification evidence is stale for the current
  # subject" whenever local main lagged origin/main (the standard
  # control-clone worktree pattern). Fail closed with no output when
  # review_base is unset or empty: never fall back to base_branch/main, so a
  # misconfigured policy can never silently record a subject against a ref
  # the validator was never going to check.
  local target
  target="$(workflow_policy_get '.worktree_strategy.review_base' '')"
  [[ -n "$target" ]] || return 0
  workflow_hook_cli_json review-subject --target "$target" --format json 2>/dev/null || true
}

workflow_current_review_subject_value() {
  local json status subject
  json="$(workflow_current_review_subject_json)"
  status="$(workflow_json_field "$json" "status")"
  [[ "$status" == "ok" ]] || return 1
  subject="$(workflow_json_field "$json" "review_subject_sha256")"
  [[ -n "$subject" ]] || return 1
  printf '%s' "$subject"
}

workflow_current_review_target_revision() {
  local json status target_rev
  json="$(workflow_current_review_subject_json)"
  status="$(workflow_json_field "$json" "status")"
  [[ "$status" == "ok" ]] || return 1
  target_rev="$(workflow_json_field "$json" "target_rev")"
  [[ -n "$target_rev" ]] || return 1
  printf '%s' "$target_rev"
}

workflow_acceptance_policy_json() {
  local contract_file="${1:-}" policy_json
  contract_file="${contract_file:-$(workflow_active_contract 2>/dev/null || true)}"
  [[ -n "$contract_file" && -f "$contract_file" ]] || return 1
  policy_json="$(awk '
    /^##[[:space:]]+Acceptance Policy[[:space:]]*$/ { section=1; next }
    section && /^```json[[:space:]]*$/ { block=1; next }
    block && /^```[[:space:]]*$/ { exit }
    block { print }
  ' "$contract_file")"
  [[ -n "$policy_json" ]] || return 1
  printf '%s' "$policy_json"
}

workflow_acceptance_expected_reviewer() {
  local policy_json
  policy_json="$(workflow_acceptance_policy_json "${1:-}")" || return 1
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$policy_json" | jq -er '
      select(
        (.protocol == 1 and (keys | sort) == ["protocol", "reviewer", "user_waiver"] and (.reviewer == "Claude" or .reviewer == "Codex"))
        or
        (.protocol == 2 and (keys | sort) == ["protocol", "reviewer", "source", "user_waiver"] and .reviewer == "Codex" and (.source == "generic-review"))
      )
      | select(.user_waiver == "allowed" or .user_waiver == "forbidden")
      | .reviewer
    ' 2>/dev/null
    return $?
  fi
  return 1
}

workflow_acceptance_source_for_reviewer() {
  local reviewer="${1:-}"
  case "$(printf '%s' "$reviewer" | tr '[:upper:]' '[:lower:]')" in
    claude|codex) printf 'generic-review' ;;
    *) return 1 ;;
  esac
}

workflow_acceptance_expected_source() {
  local policy_json
  policy_json="$(workflow_acceptance_policy_json)" || return 1
  command -v jq >/dev/null 2>&1 || return 1
  printf '%s' "$policy_json" | jq -er '
    select(.user_waiver == "allowed" or .user_waiver == "forbidden")
    | if .protocol == 1 and (keys | sort) == ["protocol", "reviewer", "user_waiver"] then
        if .reviewer == "Claude" or .reviewer == "Codex" then "generic-review" else empty end
      elif .protocol == 2 and (keys | sort) == ["protocol", "reviewer", "source", "user_waiver"] and .reviewer == "Codex" and (.source == "generic-review") then
        .source
      else empty end
  ' 2>/dev/null
}

# Parses the contract's fenced yaml block that declares `evidence_requirements:`
# (awk-block style like workflow_contract_allows_path, but scans every fenced
# yaml block instead of only the first, since evidence_requirements is not
# necessarily the first ```yaml block in the file). Prints exactly `required`
# or `not_applicable` and returns 0. Any of the following prints nothing and
# returns nonzero so callers fail closed instead of inferring applicability
# from report presence: missing file, no block declaring
# `evidence_requirements:`, more than one `evidence_requirements:` line
# anywhere in the file's yaml blocks, a `benchmark:` key that is not a direct
# child of the declaring line (deeper indent, with no intervening non-comment
# line at or above the declaring line's own indent between them), more than
# one `benchmark:` occurrence within that direct-child scope, or an unknown
# value. Comments (`#...`) inside the yaml block are ignored, both as full
# lines and as trailing content after a value, and never end the direct-child
# scope.
workflow_contract_evidence_requirement() {
  repo-harness run acceptance-receipt evidence-requirement --contract "$1"
}

workflow_benchmark_evidence_json() {
  local json_path="evals/harness/reports/profile-comparison.json"
  local validator=""
  if [[ ! -e "$json_path" && ! -e "evals/harness/reports/profile-comparison.md" && ! -e "evals/harness/reports/profile-comparison.sha256.json" ]]; then
    return 0
  fi
  for candidate in \
    "${HOOK_REPO_ROOT:-}/scripts/validate-harness-profile-benchmark.ts" \
    "scripts/validate-harness-profile-benchmark.ts" \
    ".ai/harness/scripts/validate-harness-profile-benchmark.ts"; do
    if [[ -n "$candidate" && -f "$candidate" ]]; then validator="$candidate"; break; fi
  done
  [[ -n "$validator" ]] || return 1
  command -v bun >/dev/null 2>&1 || return 1
  bun "$validator" --report "$json_path" --require-authoritative --format json 2>/dev/null
}

workflow_benchmark_evidence_fingerprint() {
  local json
  json="$(workflow_benchmark_evidence_json || true)"
  workflow_json_field "$json" "report_evidence_sha256"
}

workflow_benchmark_subject_sha256() {
  local json
  json="$(workflow_benchmark_evidence_json || true)"
  workflow_json_field "$json" "benchmark_subject_sha256"
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
      item="${BASH_REMATCH[1]}"
      # Drop a YAML inline comment: `#` at the start or after whitespace, outside a leading quoted scalar.
      case "$item" in
        \"*\"*) item="\"$(printf '%s' "${item:1}" | cut -d'"' -f1)\"" ;;
        \'*\'*) item="'$(printf '%s' "${item:1}" | cut -d"'" -f1)'" ;;
        *) item="$(printf '%s' "$item" | sed -E 's/^#.*$//; s/[[:space:]]+#.*$//')" ;;
      esac
      item="$(workflow_strip_quotes "$item")"
      [[ -n "$item" ]] || continue
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
  local source_plan parent_run_id bun_bin helper_source recovery_view_cli

  # EPC-07: independent handoff/resume content assembly retired same-package
  # (Phase A/B: tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md).
  # Rendering now lives in the single standalone materializer,
  # scripts/recovery-view-cli.ts (mirrored byte-identically to
  # assets/templates/helpers/recovery-view-cli.ts), kept consistent by
  # inspection with src/effects/evidence/recovery-materializer.ts -- the
  # authoritative in-process implementation the TS Stop handler imports
  # directly at real Stop time. This function still owns the
  # event-journal/run-summary bookkeeping below: those are not among
  # EPC-07's four named recovery views.
  workflow_ensure_harness_surface
  bun_bin="${REPO_HARNESS_BUN_BIN:-bun}"
  helper_source="${REPO_HARNESS_HELPER_SOURCE_PATH:-}"
  if [[ -n "$helper_source" ]]; then
    if [[ ! -f "$helper_source" || "$(basename "$helper_source")" != "prepare-handoff.sh" ]]; then
      echo "workflow_write_handoff: invalid REPO_HARNESS_HELPER_SOURCE_PATH for prepare-handoff" >&2
      return 1
    fi
    recovery_view_cli="$(cd "$(dirname "$helper_source")" && pwd)/recovery-view-cli.ts"
  else
    recovery_view_cli="scripts/recovery-view-cli.ts"
  fi
  if [[ ! -f "$recovery_view_cli" ]]; then
    echo "workflow_write_handoff: recovery materializer is missing: $recovery_view_cli" >&2
    return 1
  fi
  "$bun_bin" "$recovery_view_cli" --reason "$reason" --quiet

  source_plan="$(get_todo_source_plan || true)"
  if [[ "$source_plan" == "(none)" ]]; then
    source_plan=""
  fi
  parent_run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-$(date '+%Y%m%dT%H%M%S')-$$}}}"

  workflow_append_event "handoff_refresh" "$reason" "{\"source_plan\":\"$(workflow_json_escape "${source_plan:-}")\",\"parent_run_id\":\"$(workflow_json_escape "$parent_run_id")\"}"
  workflow_write_run_summary "$reason"
}
