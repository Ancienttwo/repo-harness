#!/bin/bash
# SessionStart context injector for compact-independent Codex resumes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

# Cold-path housekeeping: both event logs grow unbounded otherwise.
workflow_rotate_events_file "$(workflow_events_file)" 2>/dev/null || true
workflow_rotate_events_file ".ai/harness/architecture/events.jsonl" 2>/dev/null || true

resume_file="$(workflow_resume_packet_file)"

resume_available() {
  [[ -f "$resume_file" ]] || return 1
  grep -Fq "<!-- generated-by: repo-harness codex-handoff-resume v1 -->" "$resume_file" || return 1
  grep -Fq "## Resume Prompt" "$resume_file"
}

resume_reason() {
  resume_available || return 1
  awk '/^\> \*\*Reason\*\*:/ {sub(/^.*\> \*\*Reason\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$resume_file" | xargs
}

file_mtime() {
  local file="$1"
  [[ -f "$file" ]] || return 1

  if stat -f '%m' "$file" >/dev/null 2>&1; then
    stat -f '%m' "$file"
    return 0
  fi

  stat -c '%Y' "$file" 2>/dev/null
}

resume_current_for_handoff() {
  local handoff_file resume_mtime handoff_mtime
  resume_available || return 1

  handoff_file="$(workflow_handoff_file)"
  [[ -f "$handoff_file" ]] || return 0

  resume_mtime="$(file_mtime "$resume_file" || true)"
  handoff_mtime="$(file_mtime "$handoff_file" || true)"
  [[ -n "$resume_mtime" && -n "$handoff_mtime" ]] || return 0

  [[ "$resume_mtime" -ge "$handoff_mtime" ]]
}

context_budget_active() {
  local budget_file zone
  budget_file="$(workflow_context_budget_status_file)"
  [[ -s "$budget_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    zone="$(jq -r '.zone // empty' "$budget_file" 2>/dev/null || true)"
    [[ "$zone" == "orange" || "$zone" == "red" ]] && return 0
    return 1
  fi

  grep -Eq '"zone"[[:space:]]*:[[:space:]]*"(orange|red)"' "$budget_file"
}

active_plan_exists() {
  local plan_file status
  plan_file="$(get_active_plan || true)"
  [[ -n "$plan_file" && -f "$plan_file" ]] || return 1
  status="$(get_plan_status "$plan_file" | tr '[:upper:]' '[:lower:]')"
  case "$status" in
    approved|executing|review|reviewing|active|in-progress|in\ progress)
      return 0
      ;;
  esac
  return 1
}

active_todo_exists() {
  [[ -f "tasks/todo.md" ]] || return 1

  if grep -Eq '^\> \*\*Status\*\*:[[:space:]]*(Executing|Active|Review|Reviewing|In Progress)[[:space:]]*$' tasks/todo.md; then
    return 0
  fi

  if grep -Eq '^[[:space:]]*-[[:space:]]\[[[:space:]]\][[:space:]]+' tasks/todo.md \
    && ! grep -Fq "No active execution checklist" tasks/todo.md; then
    return 0
  fi

  return 1
}

handoff_section_has_signal() {
  local header="$1"
  local handoff_file
  handoff_file="$(workflow_handoff_file)"
  [[ -f "$handoff_file" ]] || return 1

  awk -v header="$header" '
    $0 == header { in_section = 1; next }
    /^## / && in_section { exit }
    in_section {
      line = $0
      gsub(/^[[:space:]-]+/, "", line)
      gsub(/[[:space:]]+$/, "", line)
      if (line == "" || line == "```" || line == "(none)" || line == "(none recorded)") {
        next
      }
      found = 1
    }
    END { exit found ? 0 : 1 }
  ' "$handoff_file"
}

resume_reason_active() {
  local reason
  reason="$(resume_reason)"
  case "$reason" in
    context-orange-zone|context-red-zone)
      return 0
      ;;
  esac
  return 1
}

capability_context_pending() {
  local queue_file=".ai/harness/capability-context/requests.jsonl"
  local pending_lines=""
  local pending_count="0"

  [[ -s "$queue_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    pending_count="$(jq -r 'select(.status == "pending") | .request_id' "$queue_file" 2>/dev/null | wc -l | xargs)"
    pending_lines="$(jq -r 'select(.status == "pending") | "- " + .capability_id + " <- `" + .path + "`"' "$queue_file" 2>/dev/null | sort -u | head -10 || true)"
  else
    pending_count="$(grep -c '"status":"pending"' "$queue_file" 2>/dev/null || true)"
    pending_lines="$(grep '"status":"pending"' "$queue_file" 2>/dev/null | head -10 | sed -E 's/^/- /' || true)"
  fi

  [[ "${pending_count:-0}" != "0" && -n "$pending_lines" ]] || return 1

  cat <<EOF_CONTEXT
# Capability Context Queue

Pending capability context requests detected (${pending_count}). Run:

\`\`\`bash
repo-harness capability-context sync --pending --apply
\`\`\`

Queued capabilities:
${pending_lines}
EOF_CONTEXT
}

pending_plan_capture_context() {
  local active_plan summary draft_path prompt_slug kind source_ref capture_source source_arg

  workflow_pending_orchestration_is_fresh || return 1
  active_plan="$(get_active_plan || true)"
  [[ -z "$active_plan" || ! -f "$active_plan" ]] || return 1

  summary="$(workflow_pending_orchestration_summary)"
  draft_path="$(workflow_pending_orchestration_field draft_plan_path 2>/dev/null || true)"
  prompt_slug="$(workflow_pending_orchestration_field prompt_slug 2>/dev/null || true)"
  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  capture_source="${kind:-host-plan}"
  source_arg=""
  if [[ -n "$source_ref" ]]; then
    source_arg=" --source-ref <source-ref>"
  fi

  cat <<EOF_CONTEXT
# Pending Plan Capture

A host/thread planning discussion is pending capture and no active repo plan is selected.

- State: ${summary}
- Draft plan: ${draft_path:-"(none captured yet)"}
- Rule: continue discussion freely, but do not edit implementation files until the final plan body is captured into \`plans/\`.

Capture the decision-complete plan body:

\`\`\`bash
printf '%s\n' '<decision-complete plan body>' | bash scripts/capture-plan.sh --slug ${prompt_slug:-<slug>} --title <title> --status Draft --source ${capture_source} --orchestration-kind ${capture_source} --route planning${source_arg}
\`\`\`

If the user has already approved implementation:

\`\`\`bash
printf '%s\n' '<approved plan body>' | bash scripts/capture-plan.sh --slug ${prompt_slug:-<slug>} --title <title> --status Approved --source ${capture_source} --orchestration-kind ${capture_source} --route planning --execute${source_arg}
\`\`\`
EOF_CONTEXT
}

current_status_field() {
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

current_status_snapshot_context() {
  local current_file="tasks/current.md"
  local target branch status updated source_commit target_status target_updated

  target="$(workflow_target_branch)"
  branch="$(workflow_current_branch)"
  status="$(current_status_field "$current_file" "Status" 2>/dev/null || true)"
  updated="$(current_status_field "$current_file" "Updated At" 2>/dev/null || true)"
  source_commit="$(current_status_field "$current_file" "Source Commit" 2>/dev/null || true)"

  if [[ -z "$status" ]]; then
    if [[ "$branch" != "$target" ]] && git rev-parse --verify --quiet "$target" >/dev/null 2>&1 \
      && git show "${target}:tasks/current.md" >/dev/null 2>&1; then
      :
    else
      return 1
    fi
  fi

  if [[ -z "$status" && "$branch" == "$target" ]]; then
    return 1
  fi
  if [[ "$status" == "Idle" && "$branch" == "$target" ]]; then
    return 1
  fi

  cat <<EOF_CONTEXT
# Current Status Snapshot

- Local snapshot: \`${current_file}\` status=${status:-"(missing)"} updated=${updated:-"(unknown)"} source_commit=${source_commit:-"(unknown)"}
- Target branch snapshot: \`git show ${target}:tasks/current.md\`
- Rule: this is a tracked read model only; verify stale or surprising state against plans, workstreams, handoff, and checks before acting.
EOF_CONTEXT

  if [[ "$branch" != "$target" ]] && git rev-parse --verify --quiet "$target" >/dev/null 2>&1; then
    target_status="$(git show "${target}:tasks/current.md" 2>/dev/null | awk '/^> \*\*Status\*\*:/ {sub(/^> \*\*Status\*\*: */, ""); print; exit}' | xargs || true)"
    target_updated="$(git show "${target}:tasks/current.md" 2>/dev/null | awk '/^> \*\*Updated At\*\*:/ {sub(/^> \*\*Updated At\*\*: */, ""); print; exit}' | xargs || true)"
    if [[ -n "$target_status" ]]; then
      cat <<EOF_CONTEXT
- Target snapshot metadata: status=${target_status} updated=${target_updated:-"(unknown)"}
EOF_CONTEXT
    fi
  fi
}

active_sprint_context() {
  local marker=".ai/harness/sprint/active-sprint"
  local sprint_file status progress next_task

  if [[ -f ".ai/harness/policy.json" ]] && command -v jq >/dev/null 2>&1; then
    marker="$(jq -r '.sprints.active_marker_file // empty' .ai/harness/policy.json 2>/dev/null || true)"
    [[ -n "$marker" ]] || marker=".ai/harness/sprint/active-sprint"
  fi

  [[ -f "$marker" ]] || return 1
  sprint_file="$(cat "$marker" 2>/dev/null | xargs || true)"
  [[ -n "$sprint_file" && -f "$sprint_file" ]] || return 1

  status="$(awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$sprint_file" | xargs)"
  progress="$(awk -F '|' '
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
  ' "$sprint_file")"
  next_task="$(awk -F '|' '
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
  ' "$sprint_file")"

  cat <<EOF_CONTEXT
# Active Sprint

- Sprint: \`${sprint_file}\` status=${status:-unknown} backlog=${progress}
- Next sprint task: ${next_task}
- Rule: run backlog tasks through the existing plan -> contract -> worktree flow (\`scripts/sprint-backlog.sh next\`); \`tasks/todo.md\` stays the deferred-goal ledger.
EOF_CONTEXT
}

input_priority_context() {
  cat <<'EOF_CONTEXT'
# Input Priority

If the current user message mentions `# Files mentioned by the user`, `pasted-text.txt`, or an explicit attachment/file path, read those current-input files first. Treat handoff, resume, and `tasks/current.md` as recovery context only.
EOF_CONTEXT
}

session_start_extract_additional_context() {
  local output="$1"
  local js

  [[ -n "$output" ]] || return 1

  if [[ "$output" != \{* ]]; then
    printf '%s' "$output"
    return 0
  fi

  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$output" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null
    return 0
  fi

  js='
const input = process.env.SESSION_START_CHILD_OUTPUT ?? "";
try {
  const parsed = JSON.parse(input);
  const context = parsed?.hookSpecificOutput?.additionalContext;
  if (typeof context === "string") process.stdout.write(context);
} catch {}
'
  if command -v node >/dev/null 2>&1; then
    SESSION_START_CHILD_OUTPUT="$output" node -e "$js"
  elif command -v bun >/dev/null 2>&1; then
    SESSION_START_CHILD_OUTPUT="$output" bun -e "$js"
  fi
}

security_sentinel_context() {
  local output

  [[ -x "$SCRIPT_DIR/security-sentinel.sh" ]] || return 1
  output="$(bash "$SCRIPT_DIR/security-sentinel.sh" 2>/dev/null || true)"
  session_start_extract_additional_context "$output"
}

context=""
if resume_current_for_handoff; then
  if context_budget_active \
    || active_plan_exists \
    || active_todo_exists \
    || handoff_section_has_signal "## Blockers" \
    || handoff_section_has_signal "## Changed Files" \
    || resume_reason_active; then
    context="$(awk 'length(total) < 12000 { total = total $0 "\n" } END { printf "%s", total }' "$resume_file")"
  fi
fi

pending_context="$(capability_context_pending || true)"
if [[ -n "$pending_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${pending_context}"
  else
    context="$pending_context"
  fi
fi

pending_capture_context="$(pending_plan_capture_context || true)"
if [[ -n "$pending_capture_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${pending_capture_context}"
  else
    context="$pending_capture_context"
  fi
fi

current_status_context="$(current_status_snapshot_context || true)"
if [[ -n "$current_status_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${current_status_context}"
  else
    context="$current_status_context"
  fi
fi

sprint_context="$(active_sprint_context || true)"
if [[ -n "$sprint_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${sprint_context}"
  else
    context="$sprint_context"
  fi
fi

security_context=""
if [[ "${REPO_HARNESS_SESSION_START_SECURITY:-}" == "1" ]]; then
  security_context="$(security_sentinel_context || true)"
  if [[ -n "$security_context" ]]; then
    if [[ -n "$context" ]]; then
      context="${context}"$'\n'"${security_context}"
    else
      context="$security_context"
    fi
  fi
fi

if [[ -n "$context" ]]; then
  context="$(input_priority_context)"$'\n'"${context}"
fi

# Cross-review availability for Codex. The dispatcher swallows prompt-guard's
# success stdout on Codex, so attach a short reminder only when SessionStart is
# already injecting actionable context.
if [[ "${HOOK_HOST:-}" == "codex" && -n "$context" ]]; then
  cross_review_note="[CrossReview] High-risk diff/spec/test/debug only: run /claude-review when a second model view is worth the tokens."
  context="${context}"$'\n'"${cross_review_note}"
fi

[[ -n "$context" ]] || exit 0

if command -v jq >/dev/null 2>&1; then
  jq -nc --arg context "$context" '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: $context
    }
  }'
  exit 0
fi

printf '%s\n' "$context"
