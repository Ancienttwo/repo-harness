#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/archive-workflow.sh --plan <plan-file> --outcome <Completed|Abandoned|Superseded>
USAGE_EOF
}

set_plan_status() {
  local file="$1"
  local status="$2"
  local tmp_file
  tmp_file="$(mktemp)"
  awk -v next_status="$status" '
    BEGIN { updated = 0 }
    {
      if (!updated && $0 ~ /\*\*Status\*\*:/) {
        sub(/\*\*Status\*\*: .*/, "**Status**: " next_status)
        updated = 1
      }
      print
    }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

unique_archive_path() {
  local desired="$1"
  if [[ ! -e "$desired" ]]; then
    printf '%s' "$desired"
    return
  fi

  local stem ext counter candidate
  stem="${desired%.md}"
  ext=".md"
  counter=2
  candidate="${stem}-v${counter}${ext}"
  while [[ -e "$candidate" ]]; do
    counter=$((counter + 1))
    candidate="${stem}-v${counter}${ext}"
  done
  printf '%s' "$candidate"
}

plan_file=""
outcome=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)
      [[ -n "${2:-}" ]] || { echo "Error: --plan requires a value" >&2; usage; exit 1; }
      plan_file="$2"
      shift 2
      ;;
    --outcome)
      [[ -n "${2:-}" ]] || { echo "Error: --outcome requires a value" >&2; usage; exit 1; }
      outcome="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$plan_file" || -z "$outcome" ]]; then
  echo "--plan and --outcome are required" >&2
  usage
  exit 1
fi

case "$outcome" in
  Completed|Abandoned|Superseded)
    ;;
  *)
    echo "Invalid outcome: $outcome" >&2
    exit 1
    ;;
esac

if [[ ! -f "$plan_file" ]]; then
  echo "Plan file not found: $plan_file" >&2
  exit 1
fi

normalized_plan="${plan_file#./}"
if [[ "$normalized_plan" == plans/archive/* ]]; then
  echo "Error: plan is already archived" >&2
  exit 1
fi

mkdir -p plans/archive tasks/archive tasks/notes

timestamp="$(date +%Y%m%d-%H%M)"
timestamp_human="$(date '+%Y-%m-%d %H:%M')"
plan_base="$(basename "$plan_file")"
slug="$(echo "$plan_base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
parent_run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-${timestamp}}}}"
todo_source_plan="$(awk -F': ' '/^\> \*\*Source Plan\*\*:/ {print $2; exit}' tasks/todo.md 2>/dev/null | xargs)"

plan_status="Archived"
if [[ "$outcome" == "Abandoned" ]]; then
  plan_status="Abandoned"
fi
set_plan_status "$plan_file" "$plan_status"

archive_plan_path="plans/archive/${plan_base}"
archive_plan_path="$(unique_archive_path "$archive_plan_path")"

if [[ "$plan_file" != "$archive_plan_path" ]]; then
  mv "$plan_file" "$archive_plan_path"
fi

if [[ -f tasks/todo.md ]] && grep -q '[^[:space:]]' tasks/todo.md; then
  archive_todo="tasks/archive/todo-${timestamp}-${slug}.md"
  {
    echo "> **Archived**: ${timestamp_human}"
    echo "> **Related Plan**: ${archive_plan_path}"
    echo "> **Outcome**: ${outcome}"
    echo "> **Source Plan**: ${todo_source_plan:-"(none)"}"
    echo "> **Parent Run ID**: ${parent_run_id}"
    echo
    cat tasks/todo.md
  } > "$archive_todo"
fi

notes_file="tasks/notes/${slug}.notes.md"
if [[ -f "$notes_file" ]]; then
  archive_notes="$(unique_archive_path "tasks/archive/notes-${timestamp}-${slug}.md")"
  {
    echo "> **Archived**: ${timestamp_human}"
    echo "> **Related Plan**: ${archive_plan_path}"
    echo "> **Outcome**: ${outcome}"
    echo "> **Lifecycle**: notes"
    echo "> **Parent Run ID**: ${parent_run_id}"
    echo
    cat "$notes_file"
  } > "$archive_notes"
  rm -f "$notes_file"
fi

cat > tasks/todo.md <<'TODO_EOF'
# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: (archive-workflow)
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| (none) | Archived workflow did not leave a deferred medium/long-term goal. | Keep the next slice clean. | Add a row when a real follow-up is postponed. |
TODO_EOF

# Clear active-plan markers if they pointed to the archived plan
cleared_active=0
for marker_file in ".ai/harness/active-plan" ".claude/.active-plan"; do
  if [[ ! -f "$marker_file" ]]; then
    continue
  fi
  marker_value="$(cat "$marker_file" 2>/dev/null | xargs)"
  if [[ "$marker_value" == "$plan_file" || "$marker_value" == "./$plan_file" ]]; then
    rm -f "$marker_file"
    cleared_active=1
    echo "Cleared $marker_file (archived plan was active)"
  fi
done
if [[ "$cleared_active" -eq 1 ]]; then
  rm -f ".ai/harness/active-worktree"
fi

# Clean up saved plan state backups
plan_key="$(basename "$plan_file" .md)"
rm -f ".claude/.plan-state/${plan_key}.todo.md.bak"
rm -f ".claude/.plan-state/${plan_key}.task-state.json.bak"
rm -f ".claude/.plan-state/${plan_key}.task-handoff.md.bak"

echo "Archived plan to: $archive_plan_path"
if [[ -f "docs/reference-configs/handoff-protocol.md" ]]; then
  echo "Next: refresh or prune long-running workflow rules using docs/reference-configs/handoff-protocol.md"
fi
