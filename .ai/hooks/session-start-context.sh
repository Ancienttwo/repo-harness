#!/bin/bash
# SessionStart context injector for compact-independent Codex resumes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

resume_file="$(workflow_resume_packet_file)"

resume_available() {
  [[ -f "$resume_file" ]] || return 1
  grep -Fq "<!-- generated-by: project-initializer codex-handoff-resume v1 -->" "$resume_file" || return 1
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
