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

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

is_transient_plan_slug() {
  case "$1" in
    think-plan-[0-9]*|codex-plan-[0-9]*|approved-plan-[0-9]*)
      return 0
      ;;
  esac
  return 1
}

plan_title_slug_from_file() {
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
  slug="$(normalize_slug "$title")"
  [[ -n "$slug" ]] || return 1
  printf '%s' "$slug"
}

plan_artifact_stem_from_parts() {
  local plan_file="$1"
  local original_stem="$2"
  local slug="$3"
  local stamp title_slug

  if [[ "$original_stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    stamp="$(printf '%s' "$original_stem" | sed -E 's/^([0-9]{8}-[0-9]{4})-.+$/\1/')"
    if is_transient_plan_slug "$slug"; then
      title_slug="$(plan_title_slug_from_file "$plan_file" || true)"
      if [[ -n "$title_slug" && "$title_slug" != "$slug" ]]; then
        printf '%s-%s' "$stamp" "$title_slug"
        return 0
      fi
    fi
    printf '%s' "$original_stem"
  else
    printf '%s' "$slug"
  fi
}

todo_is_deferred_ledger() {
  local file="${1:-tasks/todos.md}"
  [[ -f "$file" ]] || return 1
  grep -Eq '^# Deferred Goal Ledger[[:space:]]*$' "$file" \
    && grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' "$file" \
    && grep -Eq '^## Deferred Goals[[:space:]]*$' "$file" \
    && grep -Eq '\|[[:space:]]*Goal[[:space:]]*\|[[:space:]]*Why Deferred[[:space:]]*\|[[:space:]]*Tradeoff[[:space:]]*\|[[:space:]]*Revisit Trigger[[:space:]]*\|' "$file"
}

touch_deferred_ledger_update_marker() {
  local file="${1:-tasks/todos.md}"
  local tmp_file
  tmp_file="$(mktemp)"
  awk '
    BEGIN { updated = 0 }
    !updated && /^> \*\*Updated\*\*:/ {
      print "> **Updated**: (archive-workflow)"
      updated = 1
      next
    }
    { print }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

write_empty_deferred_ledger() {
  cat > tasks/todos.md <<'TODO_EOF'
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
original_artifact_stem="$(printf '%s' "$plan_base" | sed -E 's/^plan-//; s/\.md$//')"
artifact_stem="$(plan_artifact_stem_from_parts "$plan_file" "$original_artifact_stem" "$slug")"
parent_run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-${timestamp}}}}"
todo_source_plan="$(awk -F': ' '/^> \*\*Source Plan\*\*:/ {print $2; exit}' tasks/todos.md 2>/dev/null | xargs)"

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

if [[ -f tasks/todos.md ]] && grep -q '[^[:space:]]' tasks/todos.md; then
  archive_todo="tasks/archive/todo-${timestamp}-${slug}.md"
  {
    echo "> **Archived**: ${timestamp_human}"
    echo "> **Related Plan**: ${archive_plan_path}"
    echo "> **Outcome**: ${outcome}"
    echo "> **Source Plan**: ${todo_source_plan:-"(none)"}"
    echo "> **Parent Run ID**: ${parent_run_id}"
    echo
    cat tasks/todos.md
  } > "$archive_todo"
fi

notes_file="tasks/notes/${artifact_stem}.notes.md"
if [[ ! -f "$notes_file" && -f "tasks/notes/${slug}.notes.md" ]]; then
  notes_file="tasks/notes/${slug}.notes.md"
fi
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

if todo_is_deferred_ledger tasks/todos.md; then
  touch_deferred_ledger_update_marker tasks/todos.md
else
  write_empty_deferred_ledger
fi

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

if [[ -x "scripts/refresh-current-status.sh" ]]; then
  bash "scripts/refresh-current-status.sh" --clear --write --reason "archive-workflow" || true
fi

echo "Archived plan to: $archive_plan_path"
if [[ -f "docs/reference-configs/handoff-protocol.md" ]]; then
  echo "Next: refresh or prune long-running workflow rules using docs/reference-configs/handoff-protocol.md"
fi
