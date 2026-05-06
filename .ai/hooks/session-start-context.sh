#!/bin/bash
# SessionStart context injector for compact-independent Codex resumes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

resume_file="$(workflow_resume_packet_file)"
[[ -f "$resume_file" ]] || exit 0
grep -Fq "<!-- generated-by: project-initializer codex-handoff-resume v1 -->" "$resume_file" || exit 0
grep -Fq "## Resume Prompt" "$resume_file" || exit 0

resume_reason() {
  awk '/^\> \*\*Reason\*\*:/ {sub(/^.*\> \*\*Reason\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$resume_file" | xargs
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

if ! context_budget_active \
  && ! active_plan_exists \
  && ! active_todo_exists \
  && ! handoff_section_has_signal "## Blockers" \
  && ! handoff_section_has_signal "## Changed Files" \
  && ! resume_reason_active; then
  exit 0
fi

context="$(awk 'length(total) < 12000 { total = total $0 "\n" } END { printf "%s", total }' "$resume_file")"
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
