#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/refresh-current-status.sh [--write] [--clear] [--reason <reason>] [--target <branch>]

Refresh the tracked tasks/current.md read model from repo-local workflow
artifacts. By default this prints a preview. Use --write to update the file.
USAGE_EOF
}

write=0
clear=0
reason="manual"
target_override=""
current_status_file="tasks/current.md"
stale_after="24h"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --write)
      write=1
      shift
      ;;
    --clear)
      clear=1
      shift
      ;;
    --reason)
      [[ -n "${2:-}" ]] || { echo "refresh-current-status: --reason requires a value" >&2; exit 2; }
      reason="$2"
      shift 2
      ;;
    --target)
      [[ -n "${2:-}" ]] || { echo "refresh-current-status: --target requires a value" >&2; exit 2; }
      target_override="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "refresh-current-status: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

policy_file=".ai/harness/policy.json"

json_get() {
  local path="$1"
  local default_value="${2:-}"
  local value

  if [[ -f "$policy_file" ]] && command -v jq >/dev/null 2>&1; then
    value="$(jq -r "$path // empty" "$policy_file" 2>/dev/null || true)"
    if [[ -n "$value" && "$value" != "null" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

target_branch() {
  if [[ -n "$target_override" ]]; then
    printf '%s' "$target_override"
    return 0
  fi

  local target
  target="$(json_get '.worktree_strategy.merge_back.target' '')"
  if [[ -z "$target" ]]; then
    target="$(json_get '.worktree_strategy.base_branch' 'main')"
  fi
  printf '%s' "${target:-main}"
}

current_branch() {
  local branch
  branch="$(git branch --show-current 2>/dev/null || true)"
  printf '%s' "${branch:-detached}"
}

source_commit() {
  git rev-parse --short HEAD 2>/dev/null || printf '(none)'
}

timestamp_now() {
  date '+%Y-%m-%dT%H:%M:%S%z'
}

file_metadata_value() {
  local file="$1"
  local label="$2"
  [[ -f "$file" ]] || return 1
  awk -v label="$label" '
    $0 ~ "^> \\*\\*" label "\\*\\*:" {
      sub("^> \\*\\*" label "\\*\\*: *", "")
      gsub(/\r/, "")
      print
      exit
    }
  ' "$file" | xargs
}

read_plan_status() {
  local plan_file="$1"
  file_metadata_value "$plan_file" "Status" || true
}

normalize_plan_path() {
  local worktree="$1"
  local plan_path="$2"
  if [[ -z "$plan_path" ]]; then
    return 1
  fi
  if [[ "$plan_path" == /* ]]; then
    printf '%s' "$plan_path"
  else
    printf '%s/%s' "$worktree" "$plan_path"
  fi
}

append_unique_line() {
  local line="$1"
  [[ -n "$line" ]] || return 0
  if ! printf '%s\n' "$active_refs" | grep -Fxq -- "$line"; then
    active_refs="${active_refs}${line}"$'\n'
  fi
}

inspect_worktree_active_state() {
  local worktree="$1"
  local rel_worktree="$2"
  local marker plan_path plan_abs owner

  marker=".ai/harness/active-plan"
  if [[ -f "$worktree/$marker" ]]; then
    plan_path="$(cat "$worktree/$marker" 2>/dev/null | xargs || true)"
    if [[ -n "$plan_path" ]]; then
      plan_abs="$(normalize_plan_path "$worktree" "$plan_path")"
      if [[ -f "$plan_abs" ]]; then
        append_unique_line "- ${rel_worktree}: ${plan_path}"
      else
        append_unique_line "- ${rel_worktree}: stale active-plan marker -> ${plan_path}"
      fi
    fi
  fi

  if [[ -f "$worktree/.ai/harness/active-worktree" ]]; then
    owner="$(cat "$worktree/.ai/harness/active-worktree" 2>/dev/null | xargs || true)"
    if [[ -n "$owner" ]]; then
      append_unique_line "- ${rel_worktree}: active-worktree owner -> ${owner}"
    fi
  fi
}

collect_active_work_refs() {
  local root current_path worktree_path
  active_refs=""
  current_path="$(pwd -P 2>/dev/null || pwd)"
  inspect_worktree_active_state "$current_path" "."

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    while IFS= read -r worktree_path; do
      [[ -n "$worktree_path" ]] || continue
      [[ "$worktree_path" == "$current_path" ]] && continue
      inspect_worktree_active_state "$worktree_path" "$worktree_path"
    done < <(git worktree list --porcelain 2>/dev/null | awk '$1 == "worktree" { sub(/^worktree /, ""); print }')
  fi

  printf '%s' "$active_refs"
}

read_current_active_plan() {
  local marker plan_path plan_abs current_path
  current_path="$(pwd -P 2>/dev/null || pwd)"
  marker=".ai/harness/active-plan"
  [[ -f "$marker" ]] || return 1
  plan_path="$(cat "$marker" 2>/dev/null | xargs || true)"
  [[ -n "$plan_path" ]] || return 1
  plan_abs="$(normalize_plan_path "$current_path" "$plan_path")"
  if [[ -f "$plan_abs" ]]; then
    printf '%s' "$plan_path"
    return 0
  fi
  return 1
}

next_plan_task() {
  local plan_file="$1"
  [[ -f "$plan_file" ]] || { printf '(none)'; return 0; }
  awk '
    BEGIN { in_section = 0 }
    /^## Task Breakdown[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    in_section && /^[[:space:]]*-[[:space:]]\[[[:space:]]\][[:space:]]+/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]\[[[:space:]]\][[:space:]]+/, "", line)
      gsub(/\r/, "", line)
      print line
      found = 1
      exit
    }
    END { if (!found) print "(none)" }
  ' "$plan_file"
}

handoff_next_step() {
  local handoff_file
  handoff_file="$(json_get '.harness.handoff_file' '.ai/harness/handoff/current.md')"
  [[ -f "$handoff_file" ]] || { printf '(none)'; return 0; }
  awk '
    /^## Exact Next Step[[:space:]]*$/ { in_section = 1; next }
    /^## / && in_section { exit }
    in_section && /^[[:space:]]*-[[:space:]]+/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]+/, "", line)
      print line
      found = 1
      exit
    }
    END { if (!found) print "(none)" }
  ' "$handoff_file"
}

checks_summary() {
  local checks_file status source exit_code
  checks_file="$(json_get '.harness.checks_file' '.ai/harness/checks/latest.json')"
  [[ -s "$checks_file" ]] || { printf 'status=(none), source=(none), file=%s' "$checks_file"; return 0; }

  if command -v jq >/dev/null 2>&1; then
    status="$(jq -r '.status // "(none)"' "$checks_file" 2>/dev/null || printf '(unreadable)')"
    source="$(jq -r '.source // "(none)"' "$checks_file" 2>/dev/null || printf '(unreadable)')"
    exit_code="$(jq -r '.exit_code // "(none)"' "$checks_file" 2>/dev/null || printf '(unreadable)')"
    printf 'status=%s, source=%s, exit_code=%s, file=%s' "$status" "$source" "$exit_code" "$checks_file"
    return 0
  fi

  printf 'file=%s' "$checks_file"
}

workstream_summary() {
  local workstreams_dir file count status current_slice source_plan
  workstreams_dir="$(json_get '.tasks.workstreams_dir' 'tasks/workstreams')"
  [[ -d "$workstreams_dir" ]] || { printf -- '- (none)\n'; return 0; }

  count=0
  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    status="$(file_metadata_value "$file" "Status" || printf 'unknown')"
    current_slice="$(file_metadata_value "$file" "Current Slice" || printf 'unknown')"
    source_plan="$(file_metadata_value "$file" "Source Plan" || printf 'unknown')"
    printf -- '- `%s`: status=%s, current_slice=%s, source_plan=%s\n' "$file" "$status" "$current_slice" "$source_plan"
    count=$((count + 1))
    [[ "$count" -ge 8 ]] && break
  done < <(find "$workstreams_dir" -type f -name '*.md' 2>/dev/null | sort)

  [[ "$count" -gt 0 ]] || printf -- '- (none)\n'
}

sprint_backlog_progress() {
  local sprint_file="$1"
  awk -F '|' '
    /^## Backlog[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    !in_section { next }
    /^\|[[:space:]]*[0-9]+[[:space:]]*\|/ {
      total++
      cell = $3
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", cell)
      if (cell ~ /^\[[xX]\]$/) done++
    }
    END { printf "%d/%d", done + 0, total + 0 }
  ' "$sprint_file"
}

sprint_next_task() {
  local sprint_file="$1"
  awk -F '|' '
    /^## Backlog[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    !in_section { next }
    /^\|[[:space:]]*[0-9]+[[:space:]]*\|/ {
      status = $3; task = $4
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", task)
      if (status == "[ ]") { print task; found = 1; exit }
    }
    END { if (!found) print "(none)" }
  ' "$sprint_file"
}

sprint_summary() {
  local marker sprint_file status
  marker="$(json_get '.sprints.active_marker_file' '.ai/harness/sprint/active-sprint')"
  if [[ ! -f "$marker" ]]; then
    printf -- '- Sprint: (none)\n'
    return 0
  fi

  sprint_file="$(cat "$marker" 2>/dev/null | xargs || true)"
  if [[ -z "$sprint_file" || ! -f "$sprint_file" ]]; then
    printf -- '- Sprint: stale active-sprint marker -> %s\n' "${sprint_file:-(empty)}"
    return 0
  fi

  status="$(file_metadata_value "$sprint_file" "Status" || printf 'unknown')"
  printf -- '- Sprint: `%s`\n' "$sprint_file"
  printf -- '- Sprint Status: %s\n' "${status:-unknown}"
  printf -- '- Backlog: %s\n' "$(sprint_backlog_progress "$sprint_file")"
  printf -- '- Next Sprint Task: %s\n' "$(sprint_next_task "$sprint_file")"
}

git_status_summary() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf 'not a git repository'
    return 0
  fi

  local count
  count="$(git_status_short_filtered | sed '/^[[:space:]]*$/d' | wc -l | tr -d ' ')"
  if [[ "${count:-0}" -eq 0 ]]; then
    printf 'clean'
  else
    printf '%s changed/untracked path(s)' "$count"
  fi
}

git_status_short_filtered() {
  git status --short 2>/dev/null | grep -Ev '^[? MARCUD!]{2}[[:space:]]+tasks/\.current\.md\.tmp\.[^[:space:]]+$' || true
}

git_status_files() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf '(none)\n'
    return 0
  fi
  local files
  files="$(git_status_short_filtered | head -40)"
  if [[ -n "$files" ]]; then
    printf '%s\n' "$files"
  else
    printf '(none)\n'
  fi
}

render_status() {
  local now branch commit target active_work active_plan plan_status next_task status clear_note
  local checks git_summary handoff_next
  now="$(timestamp_now)"
  branch="$(current_branch)"
  commit="$(source_commit)"
  target="$(target_branch)"
  active_work="$(collect_active_work_refs)"
  active_plan="$(read_current_active_plan || true)"
  plan_status="(none)"
  next_task="(none)"
  if [[ -n "$active_plan" && -f "$active_plan" ]]; then
    plan_status="$(read_plan_status "$active_plan")"
    plan_status="${plan_status:-unknown}"
    next_task="$(next_plan_task "$active_plan")"
  elif [[ -n "$active_work" ]]; then
    next_task="inspect active worktree marker(s)"
  fi

  if [[ "$clear" -eq 1 && -n "$active_work" ]]; then
    status="ManualClearedWithActiveWork"
    clear_note="Manual clear requested, but active work markers still exist. Idle was not written."
  elif [[ -n "$active_work" ]]; then
    status="Active"
    clear_note="(none)"
  else
    status="Idle"
    clear_note="(none)"
  fi

  checks="$(checks_summary)"
  git_summary="$(git_status_summary)"
  handoff_next="$(handoff_next_step)"

  cat <<EOF_STATUS
# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: ${now} -->
<!-- stale_after: ${stale_after} -->

> **Status**: ${status}
> **Updated At**: ${now}
> **Source Branch**: ${branch}
> **Source Commit**: ${commit}
> **Target Branch**: ${target}
> **Stale After**: ${stale_after}
> **Reason**: ${reason}
> **Derived From**: active-plan, active-sprint, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.

## Current Focus

- Status: ${status}
- Active Plan: ${active_plan:-(none)}
- Plan Status: ${plan_status}
- Next Task: ${next_task}
- Clear Note: ${clear_note}

## Mainline Snapshot Reading

- Current worktree: \`tasks/current.md\`
- Target branch snapshot: \`git show ${target}:tasks/current.md\`
- Rule: non-target worktrees may read the target branch snapshot, but must verify against source artifacts before acting.

## Active Work

${active_work:-- (none)}
## Active Sprint

$(sprint_summary)
## Workstreams

$(workstream_summary)
## Handoff

- Exact Next Step: ${handoff_next}

## Checks

- ${checks}

## Git Status

- Summary: ${git_summary}

\`\`\`
$(git_status_files)
\`\`\`

## Source Artifacts

- Plans: \`plans/plan-*.md\`
- Active marker: \`.ai/harness/active-plan\`
- Active worktree marker: \`.ai/harness/active-worktree\`
- PRDs: \`plans/prds/*.prd.md\`
- Sprints: \`$(json_get '.sprints.dir' 'plans/sprints')/*.sprint.md\`
- Active sprint marker: \`.ai/harness/sprint/active-sprint\`
- Workstreams: \`tasks/workstreams/**/*.md\`
- Handoff: \`.ai/harness/handoff/current.md\`
- Checks: \`.ai/harness/checks/latest.json\`
EOF_STATUS
}

if [[ "$write" -eq 1 ]]; then
  mkdir -p "$(dirname "$current_status_file")"
  tmp_file="$(mktemp "$(dirname "$current_status_file")/.current.md.tmp.XXXXXX")"
  trap 'rm -f "$tmp_file"' EXIT
  render_status > "$tmp_file"
  mv "$tmp_file" "$current_status_file"
  trap - EXIT
  echo "[CurrentStatus] Wrote ${current_status_file}."
else
  render_status
fi
