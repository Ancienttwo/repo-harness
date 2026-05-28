#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/plan-to-todo.sh --plan <plan-file>
USAGE_EOF
}

# Source shared workflow-state library if available (installed via migration).
# This avoids duplicating task-state JSON generation logic.
_WF_LIB=".ai/hooks/lib/workflow-state.sh"
if [[ -f "$_WF_LIB" ]]; then
  # shellcheck source=/dev/null
  . "$_WF_LIB"
  _HAS_WF_LIB=1
else
  _HAS_WF_LIB=0
fi

# Fallback json_escape only when workflow-state.sh is not available
if [[ "$_HAS_WF_LIB" -eq 0 ]]; then
  workflow_json_escape() {
    local value="$1"
    value="${value//\\/\\\\}"
    value="${value//\"/\\\"}"
    value="${value//$'\n'/\\n}"
    value="${value//$'\r'/\\r}"
    value="${value//$'\t'/\\t}"
    printf '%s' "$value"
  }
fi

extract_status() {
  local file="$1"
  awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" | xargs
}

plan_evidence_contract_error() {
  local file="$1"
  local section=""
  local missing=0

  section="$(awk '
    BEGIN { in_section = 0 }
    /^## Evidence Contract[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    in_section { print }
  ' "$file")"

  if [[ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]]; then
    echo "missing ## Evidence Contract section"
    return 1
  fi

  local label line value
  for label in "State/progress path" "Verification evidence" "Evaluator rubric" "Stop condition" "Rollback surface"; do
    line="$(printf '%s\n' "$section" | grep -Ei "^[[:space:]]*-[[:space:]]*(\\*\\*)?${label}(\\*\\*)?[[:space:]]*:" | head -1 || true)"
    if [[ -z "$line" ]]; then
      echo "missing field: ${label}"
      missing=1
      continue
    fi

    value="${line#*:}"
    value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    if [[ -z "$value" ]] || printf '%s' "$value" | grep -Eiq '^(tbd|todo|n/a|none|unknown|\.\.\.)$'; then
      echo "field has no concrete value: ${label}"
      missing=1
    fi
  done

  [[ "$missing" -eq 0 ]]
}

extract_capability_id() {
  local file="$1"
  awk -F': ' '/^\> \*\*Capability ID\*\*:/ {print $2; exit}' "$file" | xargs
}

get_todo_source_plan() {
  awk -F': ' '/^\> \*\*Source Plan\*\*:/ {print $2; exit}' tasks/todo.md 2>/dev/null | xargs
}

policy_get() {
  local jq_path="$1"
  local default_value="${2:-}"
  local value=""

  if [[ -f ".ai/harness/policy.json" ]] && command -v jq >/dev/null 2>&1; then
    value="$(jq -r "$jq_path // empty" ".ai/harness/policy.json" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

is_linked_worktree() {
  local git_dir
  git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
  [[ "$git_dir" == *".git/worktrees/"* ]]
}

plan_requests_contract_worktree() {
  local file="$1"
  local auto_for_contract_tasks

  if grep -Eiq '^\> \*\*(Contract Level|Execution Mode|Execution Surface)\*\*:[[:space:]]*(false|primary|inline)[[:space:]]*$' "$file"; then
    return 1
  fi

  if grep -Eiq '^\> \*\*(Contract Level|Execution Mode|Execution Surface)\*\*:[[:space:]]*(true|worktree|contract-worktree)[[:space:]]*$' "$file"; then
    return 0
  fi

  auto_for_contract_tasks="$(policy_get '.worktree_strategy.auto_for_contract_tasks' 'false')"
  [[ "$auto_for_contract_tasks" == "true" ]]
}

maybe_start_contract_worktree() {
  local file="$1"

  [[ "${PROJECT_INITIALIZER_CONTRACT_WORKTREE:-}" != "1" ]] || return 0
  [[ "${PROJECT_INITIALIZER_DISABLE_CONTRACT_WORKTREE:-}" != "1" ]] || return 0
  [[ -x "scripts/contract-worktree.sh" ]] || return 0
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  ! is_linked_worktree || return 0
  plan_requests_contract_worktree "$file" || return 0

  bash "scripts/contract-worktree.sh" start --plan "$file"
  exit $?
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

  local stem counter candidate
  stem="${desired%.md}"
  counter=2
  candidate="${stem}-v${counter}.md"
  while [[ -e "$candidate" ]]; do
    counter=$((counter + 1))
    candidate="${stem}-v${counter}.md"
  done
  printf '%s' "$candidate"
}

render_contract_file() {
  local plan_file="$1"
  local contract_file="$2"
  local slug="$3"
  local timestamp="$4"
  local capability_id="$5"
  local owner="${USER:-AI Agent}"
  local template_file=".claude/templates/contract.template.md"
  local tmp_file

  if [[ ! -f "$template_file" ]]; then
    mkdir -p .claude/templates
    cat > "$template_file" <<'CONTRACT_TEMPLATE_EOF'
# Task Contract: {{TASK_SLUG}}

> **Status**: Pending
> **Plan**: {{PLAN_FILE}}
> **Owner**: {{OWNER}}
> **Capability ID**: {{CAPABILITY_ID}}
> **Last Updated**: {{TIMESTAMP}}
> **Review File**: `tasks/reviews/{{TASK_SLUG}}.review.md`
> **Notes File**: `tasks/notes/{{TASK_SLUG}}.notes.md`

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
- Out of scope:

## Workflow Inventory

- Source plan: `{{PLAN_FILE}}`
- Todo projection: `tasks/todo.md`
- Review file: `tasks/reviews/{{TASK_SLUG}}.review.md`
- Notes file: `tasks/notes/{{TASK_SLUG}}.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass and the review recommend pass.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todo.md
  - tasks/contracts/{{TASK_SLUG}}.contract.md
  - tasks/reviews/{{TASK_SLUG}}.review.md
  - tasks/notes/{{TASK_SLUG}}.notes.md
  - .ai/context/capabilities.json
  - src/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/modules/{{TASK_SLUG}}/index.ts
    - tasks/notes/{{TASK_SLUG}}.notes.md
  tests_pass:
    - path: tests/unit/{{TASK_SLUG}}.test.ts
  commands_succeed:
    - bun run typecheck
  files_contain:
    - path: src/modules/{{TASK_SLUG}}/index.ts
      pattern: "export"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
CONTRACT_TEMPLATE_EOF
  fi

  tmp_file="$(mktemp)"
  sed \
    -e "s/{{TASK_SLUG}}/${slug}/g" \
    -e "s|{{PLAN_FILE}}|${plan_file}|g" \
    -e "s|{{CAPABILITY_ID}}|${capability_id}|g" \
    -e "s/{{OWNER}}/${owner}/g" \
    -e "s/{{TIMESTAMP}}/${timestamp}/g" \
    "$template_file" > "$tmp_file"
  mv "$tmp_file" "$contract_file"
}

render_implementation_notes_file() {
  local plan_file="$1"
  local contract_file="$2"
  local review_file="$3"
  local notes_file="$4"
  local slug="$5"
  local timestamp="$6"
  local template_file=".claude/templates/implementation-notes.template.md"
  local tmp_file

  if [[ ! -f "$template_file" ]]; then
    mkdir -p .claude/templates
    cat > "$template_file" <<'NOTES_TEMPLATE_EOF'
# Implementation Notes: {{TASK_SLUG}}

> **Status**: Active
> **Plan**: {{PLAN_FILE}}
> **Contract**: {{CONTRACT_FILE}}
> **Review**: {{REVIEW_FILE}}
> **Last Updated**: {{TIMESTAMP}}
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `tasks/research.md` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
NOTES_TEMPLATE_EOF
  fi

  tmp_file="$(mktemp)"
  sed \
    -e "s/{{TASK_SLUG}}/${slug}/g" \
    -e "s|{{PLAN_FILE}}|${plan_file}|g" \
    -e "s|{{CONTRACT_FILE}}|${contract_file}|g" \
    -e "s|{{REVIEW_FILE}}|${review_file}|g" \
    -e "s/{{TIMESTAMP}}/${timestamp}/g" \
    "$template_file" > "$tmp_file"
  mv "$tmp_file" "$notes_file"
}

# Delegate to workflow-state.sh if available; inline fallback otherwise.
# This ensures a single source of truth for task-state JSON generation.
if [[ "$_HAS_WF_LIB" -eq 0 ]]; then
  workflow_sync_task_state_from_todo() {
    local todo_file="${1:-tasks/todo.md}"
    local state_file="${2:-.claude/.task-state.json}"
    local source_plan="${3:-}"
    local timestamp
    local tmp_state
    local total=0
    local done=0
    local promoted_in_progress=0
    local first=1

    mkdir -p "$(dirname "$state_file")"
    timestamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"

    {
      echo "{"
      printf '  "done_tasks": 0,\n'
      printf '  "total_tasks": 0,\n'
      printf '  "source_plan": "%s",\n' "$(workflow_json_escape "${source_plan:-}")"
      printf '  "updated_at": "%s",\n' "$(workflow_json_escape "$timestamp")"
      echo '  "tasks": ['

      while IFS= read -r line; do
        printf '%s\n' "$line" | grep -Eq '^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+' || continue
        total=$((total + 1))
        local desc
        desc="$(printf '%s' "$line" | sed -E 's/^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+//')"
        local status="pending"
        local passes="false"

        if [[ "$line" =~ \[[xX]\] ]]; then
          status="completed"
          passes="true"
          done=$((done + 1))
        elif [[ "$promoted_in_progress" -eq 0 ]]; then
          status="in_progress"
          promoted_in_progress=1
        fi

        if [[ "$first" -eq 0 ]]; then
          echo ","
        fi
        first=0

        printf '    {"id":"task-%s","desc":"%s","status":"%s","passes":%s,"verification_evidence":[]}' \
          "$total" \
          "$(workflow_json_escape "$desc")" \
          "$status" \
          "$passes"
      done < "$todo_file"

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
fi

plan_file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)
      [[ -n "${2:-}" ]] || { echo "Error: --plan requires a value" >&2; usage; exit 1; }
      plan_file="$2"
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

if [[ -z "$plan_file" ]]; then
  echo "--plan is required" >&2
  usage
  exit 1
fi

if [[ ! -f "$plan_file" ]]; then
  echo "Plan file not found: $plan_file" >&2
  exit 1
fi

status="$(extract_status "$plan_file")"
if [[ "$status" != "Approved" ]]; then
  echo "Plan status must be Approved before extraction (current: ${status:-unknown})." >&2
  exit 1
fi

if ! evidence_error="$(plan_evidence_contract_error "$plan_file")"; then
  echo "Plan Evidence Contract is incomplete in $plan_file:" >&2
  printf '%s\n' "$evidence_error" >&2
  exit 1
fi

maybe_start_contract_worktree "$plan_file"

mkdir -p tasks/archive
mkdir -p tasks/contracts
mkdir -p tasks/reviews
mkdir -p tasks/notes
mkdir -p .claude
mkdir -p .ai/context
mkdir -p .ai/harness/checks
mkdir -p .ai/harness/handoff
mkdir -p .ai/harness/failures
mkdir -p .ai/harness/runs

timestamp="$(date +%Y%m%d-%H%M)"
timestamp_human="$(date '+%Y-%m-%d %H:%M')"
plan_base="$(basename "$plan_file")"
slug="$(echo "$plan_base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
contract_file="tasks/contracts/${slug}.contract.md"
review_file="tasks/reviews/${slug}.review.md"
notes_file="tasks/notes/${slug}.notes.md"
previous_source_plan="$(get_todo_source_plan || true)"
parent_run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-${timestamp}}}}"
capability_id="$(extract_capability_id "$plan_file")"
capability_id="${capability_id:-root}"

if [[ -f "tasks/todo.md" ]] && grep -q '[^[:space:]]' tasks/todo.md; then
  archive_file="$(unique_archive_path "tasks/archive/todo-${timestamp}-${slug}.md")"
  {
    echo "> **Archived**: $(date '+%Y-%m-%d %H:%M')"
    echo "> **Related Plan**: ${plan_file}"
    echo "> **Outcome**: Superseded"
    echo "> **Source Plan**: ${previous_source_plan:-"(none)"}"
    echo "> **Parent Run ID**: ${parent_run_id}"
    echo
    cat tasks/todo.md
  } > "$archive_file"
fi

tasks_tmp="$(mktemp)"
awk '
  BEGIN { in_section = 0 }
  /^## Task Breakdown/ { in_section = 1; next }
  in_section && /^## / { exit }
  in_section { print }
' "$plan_file" > "$tasks_tmp"

if ! grep -Eq '^- \[[ xX]\]' "$tasks_tmp"; then
  cat > "$tasks_tmp" <<'DEFAULT_TASKS_EOF'
- [ ] Confirm task breakdown details
- [ ] Implement approved plan incrementally
DEFAULT_TASKS_EOF
fi

{
  echo "# Task Execution Checklist (Primary)"
  echo
  echo "> **Source Plan**: ${plan_file}"
  echo "> **Status**: Executing"
  echo "> **Generated**: ${timestamp_human}"
  echo "> **Source Plan Slug**: ${slug}"
  echo "> **Review File**: ${review_file}"
  echo "> **Notes File**: ${notes_file}"
  echo "> **Capability ID**: ${capability_id}"
  echo "> **Parent Run ID**: ${parent_run_id}"
  echo "> **Supersedes**: ${previous_source_plan:-"(none)"}"
  echo
  echo "## Execution"
  cat "$tasks_tmp"
} > tasks/todo.md

workflow_sync_task_state_from_todo "tasks/todo.md" ".claude/.task-state.json" "$plan_file"

if [[ -f ".claude/templates/review.template.md" ]]; then
  :
else
  mkdir -p .claude/templates
  cat > .claude/templates/review.template.md <<'REVIEW_TEMPLATE_EOF'
# Sprint Review: {{TASK_SLUG}}

> **Status**: Pending
> **Plan**: {{PLAN_FILE}}
> **Contract**: {{CONTRACT_FILE}}
> **Notes File**: {{NOTES_FILE}}
> **Checks File**: {{CHECKS_FILE}}
> **Last Updated**: {{TIMESTAMP}}
> **Recommendation**: fail

## Mode Evidence

- Selected route:
- P1/P2/P3 evidence:
- Root cause or plan evidence:

## Verification Evidence

- Commands run:
- Manual checks:
- Supporting artifacts:
- Implementation notes reviewed:
- Run snapshot:

## Behavior Diff Notes

- ...

## Residual Risks / Follow-ups

- ...

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- ...

## Retest Steps

- Re-run:
- Re-check:

## Summary

- ...
REVIEW_TEMPLATE_EOF
fi

render_contract_file "$plan_file" "$contract_file" "$slug" "$timestamp_human" "$capability_id"
render_implementation_notes_file "$plan_file" "$contract_file" "$review_file" "$notes_file" "$slug" "$timestamp_human"
sed \
  -e "s/{{TASK_SLUG}}/${slug}/g" \
  -e "s|{{PLAN_FILE}}|${plan_file}|g" \
  -e "s|{{CONTRACT_FILE}}|${contract_file}|g" \
  -e "s|{{NOTES_FILE}}|${notes_file}|g" \
  -e "s|{{CHECKS_FILE}}|.ai/harness/checks/latest.json|g" \
  -e "s/{{TIMESTAMP}}/${timestamp_human}/g" \
  .claude/templates/review.template.md > "$review_file"

if [[ ! -f ".ai/harness/checks/latest.json" ]]; then
  echo "{}" > .ai/harness/checks/latest.json
fi

rm -f "$tasks_tmp"
set_plan_status "$plan_file" "Executing"

echo "Updated tasks/todo.md from $plan_file"
