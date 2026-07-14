#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  cd "$REPO_HARNESS_TARGET_REPO_ROOT"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
else
  cd "$SCRIPT_DIR/.."
fi
REPO_ROOT="$(pwd)"
helper_dir="$SCRIPT_DIR"

usage() {
  cat <<'USAGE_EOF'
Usage: repo-harness run plan-to-todo --plan <plan-file>
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

plan_field_value() {
  local file="$1"
  local label="$2"
  awk -v label="$label" '
    {
      pattern = "^> \\*\\*" label "\\*\\*:[[:space:]]*"
      if ($0 ~ pattern) {
        sub(pattern, "")
        gsub(/\r/, "")
        print
        exit
      }
    }
  ' "$file" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

value_is_missing_or_placeholder() {
  local value="$1"
  [[ -n "$value" ]] || return 0
  printf '%s' "$value" | grep -Eiq '^(\(required before projection\)|required before projection|tbd|todo|n/a|none|unknown|\.\.\.)$'
}

promotion_reason_is_forbidden() {
  local value="$1"
  printf '%s' "$value" | grep -Eiq '^(next_sprint_row_only|red_green_step_only|docs_or_handoff_only|same_allowed_paths_as_active_plan|same_verification_as_active_plan|same_rollback_surface_as_active_plan)$'
}

plan_artifact_level_error() {
  local file="$1"
  local artifact_level promotion_reason verification_boundary rollback_surface missing=0

  artifact_level="$(plan_field_value "$file" "Artifact Level")"
  if [[ "$artifact_level" != "work-package" ]]; then
    echo "Artifact Level must be work-package before contract projection (current: ${artifact_level:-missing})"
    return 1
  fi

  promotion_reason="$(plan_field_value "$file" "Promotion Reason")"
  verification_boundary="$(plan_field_value "$file" "Verification Boundary")"
  rollback_surface="$(plan_field_value "$file" "Rollback Surface")"

  if value_is_missing_or_placeholder "$promotion_reason"; then
    echo "field has no concrete value: Promotion Reason"
    missing=1
  elif promotion_reason_is_forbidden "$promotion_reason"; then
    echo "forbidden Promotion Reason for work-package projection: $promotion_reason"
    missing=1
  fi

  if value_is_missing_or_placeholder "$verification_boundary"; then
    echo "field has no concrete value: Verification Boundary"
    missing=1
  fi

  if value_is_missing_or_placeholder "$rollback_surface"; then
    echo "field has no concrete value: Rollback Surface"
    missing=1
  fi

  [[ "$missing" -eq 0 ]]
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

plan_promotion_gate_error() {
  local file="$1"
  local section=""
  local missing=0

  section="$(awk '
    BEGIN { in_section = 0 }
    /^## Promotion Gate[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    in_section { print }
  ' "$file")"

  if [[ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]]; then
    echo "missing ## Promotion Gate section"
    return 1
  fi

  local label line value
  for label in "Merge/PR unit" "Rollback surface" "Verification boundary" "Review/acceptance boundary" "High-risk surface" "Why not checklist row"; do
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

plan_inline_sprint_mode_error() {
  local file="$1"
  local orchestration_kind

  orchestration_kind="$(plan_field_value "$file" "Orchestration Kind")"
  if [[ "$orchestration_kind" == "sprint-inline" || "$orchestration_kind" == *"-inline" ]] \
    || { [[ "$orchestration_kind" == "sprint-task" || "$orchestration_kind" == "repo-harness-sprint" ]] \
      && grep -Eiq '^[[:space:]]*-[[:space:]]*Mode:[[:space:]]*inline[[:space:]]*$' "$file"; }; then
    echo "inline sprint rows and inline orchestration modes must stay in the active sprint backlog or plan Task Breakdown; do not project them into contract/review/notes"
    return 1
  fi

  return 0
}

plan_transient_projection_error() {
  local file="$1"
  local slug

  slug="$(plan_slug_from_path "$file")"
  if is_transient_plan_slug "$slug"; then
    echo "transient plan slug '$slug' cannot be projected into contract/review/notes; capture it under a durable work-package slug first"
    return 1
  fi

  return 0
}

extract_capability_id() {
  local file="$1"
  awk -F': ' '/^\> \*\*Capability ID\*\*:/ {print $2; exit}' "$file" | xargs
}

get_todo_source_plan() {
  awk -F': ' '/^\> \*\*Source Plan\*\*:/ {print $2; exit}' tasks/todos.md 2>/dev/null | xargs
}

plan_slug_from_path() {
  local plan_file="$1"
  local base slug
  base="$(basename "$plan_file")"
  slug="$(printf '%s' "$base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
  printf '%s' "$slug"
}

plan_original_artifact_stem_from_path() {
  local plan_file="$1"
  local base stem
  base="$(basename "$plan_file")"
  stem="$(printf '%s' "$base" | sed -E 's/^plan-//; s/\.md$//')"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    printf '%s' "$stem"
  else
    plan_slug_from_path "$plan_file"
  fi
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
  slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  [[ -n "$slug" ]] || return 1
  printf '%s' "$slug"
}

plan_task_profile_from_file() {
  local plan_file="$1"
  local profile
  profile="$(awk '
    /^> \*\*Task Profile\*\*:/ {
      sub(/^> \*\*Task Profile\*\*:[[:space:]]*/, "")
      gsub(/\r/, "")
      print
      exit
    }
  ' "$plan_file" | xargs)"
  printf '%s' "${profile:-code-change}"
}

plan_artifact_stem_from_path() {
  local plan_file="$1"
  local stem stamp slug title_slug
  stem="$(plan_original_artifact_stem_from_path "$plan_file")"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    stamp="$(printf '%s' "$stem" | sed -E 's/^([0-9]{8}-[0-9]{4})-.+$/\1/')"
    slug="$(printf '%s' "$stem" | sed -E 's/^[0-9]{8}-[0-9]{4}-//')"
    if is_transient_plan_slug "$slug"; then
      title_slug="$(plan_title_slug_from_file "$plan_file" || true)"
      if [[ -n "$title_slug" && "$title_slug" != "$slug" ]]; then
        printf '%s-%s' "$stamp" "$title_slug"
        return 0
      fi
    fi
    printf '%s' "$stem"
  else
    plan_slug_from_path "$plan_file"
  fi
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

  [[ "${REPO_HARNESS_CONTRACT_WORKTREE:-}" != "1" ]] || return 0
  [[ "${REPO_HARNESS_DISABLE_CONTRACT_WORKTREE:-}" != "1" ]] || return 0
  [[ -x "$helper_dir/contract-worktree.sh" ]] || return 0
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  ! is_linked_worktree || return 0
  plan_requests_contract_worktree "$file" || return 0

  REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT" bash "$helper_dir/contract-worktree.sh" start --plan "$file"
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

rewrite_plan_artifact_references() {
  local plan_file="$1"
  local from_stem="$2"
  local to_stem="$3"
  local tmp_file

  [[ -n "$from_stem" && -n "$to_stem" && "$from_stem" != "$to_stem" ]] || return 0

  tmp_file="$(mktemp)"
  sed \
    -e "s|tasks/contracts/${from_stem}\\.contract\\.md|tasks/contracts/${to_stem}.contract.md|g" \
    -e "s|tasks/reviews/${from_stem}\\.review\\.md|tasks/reviews/${to_stem}.review.md|g" \
    -e "s|tasks/notes/${from_stem}\\.notes\\.md|tasks/notes/${to_stem}.notes.md|g" \
    "$plan_file" > "$tmp_file"
  mv "$tmp_file" "$plan_file"
}

render_contract_file() {
  local plan_file="$1"
  local contract_file="$2"
  local review_file="$3"
  local notes_file="$4"
  local slug="$5"
  local timestamp="$6"
  local capability_id="$7"
  local owner="${USER:-AI Agent}"
  local task_profile
  local template_file=".claude/templates/contract.template.md"
  local tmp_file

  task_profile="$(plan_task_profile_from_file "$plan_file")"

  if [[ ! -f "$template_file" ]]; then
    mkdir -p .claude/templates
    cat > "$template_file" <<'CONTRACT_TEMPLATE_EOF'
# Task Contract: {{TASK_SLUG}}

> **Status**: Active
> **Plan**: {{PLAN_FILE}}
> **Task Profile**: {{TASK_PROFILE}}
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: {{OWNER}}
> **Capability ID**: {{CAPABILITY_ID}}
> **Last Updated**: {{TIMESTAMP}}
> **Review File**: `{{REVIEW_FILE}}`
> **Notes File**: `{{NOTES_FILE}}`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Why this task matters and what breaks downstream if it ships wrong or is skipped.

## Goal

Describe the exact outcome this task must deliver.

## Scope

- In scope:
- Out of scope:
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `{{PLAN_FILE}}`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `{{REVIEW_FILE}}`
- Notes file: `{{NOTES_FILE}}`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - {{CONTRACT_FILE}}
  - {{REVIEW_FILE}}
  - {{NOTES_FILE}}
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - {{NOTES_FILE}}
  tests_pass:
    - path: tests/unit/{{TASK_SLUG}}.test.ts
  commands_succeed:
    - bun run check:type
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
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
    -e "s|{{TASK_PROFILE}}|${task_profile}|g" \
    -e "s|{{CONTRACT_FILE}}|${contract_file}|g" \
    -e "s|{{REVIEW_FILE}}|${review_file}|g" \
    -e "s|{{NOTES_FILE}}|${notes_file}|g" \
    -e "s|{{CAPABILITY_ID}}|${capability_id}|g" \
    -e "s/{{OWNER}}/${owner}/g" \
    -e "s/{{TIMESTAMP}}/${timestamp}/g" \
    "$template_file" \
    | sed \
      -e "s|tasks/contracts/${slug}\\.contract\\.md|${contract_file}|g" \
      -e "s|tasks/reviews/${slug}\\.review\\.md|${review_file}|g" \
      -e "s|tasks/notes/${slug}\\.notes\\.md|${notes_file}|g" \
      > "$tmp_file"
  mv "$tmp_file" "$contract_file"
}

# Recognizes only a standalone `Non-scope:` or `Out of scope:` label line in the plan
# (colon immediately after the label word; an optional leading `-` bullet marker is
# stripped first, so both a bare paragraph label and a bulleted label match). Copies the
# label's own inline trailing text (if any) plus every following bulleted line verbatim
# as one carried-forward bullet each, re-nested two spaces under the contract's
# `Out of scope:` line; stops at the first non-bullet line. Emits nothing when the plan
# has no such label, so callers must not synthesize a replacement.
plan_negative_scope_bullets() {
  local plan_file="$1"
  awk '
    BEGIN { collecting = 0 }
    {
      line = $0
      sub(/\r$/, "", line)
      if (!collecting) {
        label = line
        sub(/^[[:space:]]*-[[:space:]]*/, "", label)
        if (label ~ /^(Non-scope|Out of scope):/) {
          collecting = 1
          rest = label
          sub(/^(Non-scope|Out of scope):[[:space:]]*/, "", rest)
          if (rest != "") print "  - " rest
        }
        next
      }
      if (line ~ /^[[:space:]]*-[[:space:]]+/) {
        item = line
        sub(/^[[:space:]]*-[[:space:]]*/, "", item)
        print "  - " item
        next
      }
      exit
    }
  ' "$plan_file"
}

# Carries the plan's Non-scope / Out-of-scope bullets forward into the just-rendered
# contract's `Out of scope:` line, so the negative boundary survives projection instead
# of evaporating into an empty placeholder. Only replaces the bare, unfilled
# `- Out of scope:` placeholder line and never overwrites already-authored content; never
# invents bullets when the plan has no recognized label (the existing [BriefPreflight]
# advisory already covers that case).
carry_forward_plan_scope_boundary() {
  local plan_file="$1"
  local contract_file="$2"
  local bullets
  bullets="$(plan_negative_scope_bullets "$plan_file")"
  [[ -n "$bullets" ]] || return 0

  local line_no
  line_no="$(grep -nE '^-[[:space:]]*Out of scope:[[:space:]]*$' "$contract_file" | head -1 | cut -d: -f1)"
  [[ -n "$line_no" ]] || return 0

  local tmp_file
  tmp_file="$(mktemp)"
  head -n "$line_no" "$contract_file" > "$tmp_file"
  printf '%s\n' "$bullets" >> "$tmp_file"
  tail -n "+$((line_no + 1))" "$contract_file" >> "$tmp_file"
  mv "$tmp_file" "$contract_file"
}

# Advisory-only brief preflight at projection time. The contract just rendered by
# render_contract_file is placeholder by design (see the embedded template's Goal
# text above), so this MUST NOT fail-closed here or it would block every normal
# projection. contract-run.ts already fails closed for the `run` mode; this only
# surfaces a heads-up so the brief gets filled in before file-coupled dispatch.
maybe_advise_contract_brief_preflight() {
  local contract_path="$1"

  command -v bun >/dev/null 2>&1 || return 0
  [[ -f "$helper_dir/contract-run.ts" ]] || return 0

  if ! bun "$helper_dir/contract-run.ts" preflight --contract "$contract_path" --repo "$REPO_ROOT" >/dev/null 2>&1; then
    echo "[BriefPreflight] contract brief is not yet self-sufficient: $contract_path"
    echo "[BriefPreflight] fill Goal, Scope, Allowed Paths, and Exit Criteria before file-coupled dispatch; contract-run run fails closed until then."
  fi
}

# Advisory-only geju (格局) freeze reminder at projection time. geju judgment stays
# live, pre-contract exploration; only its output (thesis/direction/falsifier)
# belongs in the contract. This MUST NOT affect exit code -- callers append
# `|| true` -- it only nudges the author to freeze geju output into the
# just-rendered contract before delegating.
maybe_advise_geju_freeze() {
  echo "[Geju] If this task came from a 格局/geju pass, freeze its output into the contract before delegating:" >&2
  echo "[Geju]   thesis + high-level direction -> ## Why ; falsifier + cheapest proof point -> ## Falsifier" >&2
  echo "[Geju] Live geju is pre-contract exploration only; once frozen, the contract is authoritative." >&2
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

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
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
    local todo_file="${1:-tasks/todos.md}"
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

if ! transient_error="$(plan_transient_projection_error "$plan_file")"; then
  echo "Plan cannot be projected into task artifacts: $plan_file:" >&2
  printf '%s\n' "$transient_error" >&2
  exit 1
fi

if ! evidence_error="$(plan_evidence_contract_error "$plan_file")"; then
  echo "Plan Evidence Contract is incomplete in $plan_file:" >&2
  printf '%s\n' "$evidence_error" >&2
  exit 1
fi

if ! promotion_error="$(plan_promotion_gate_error "$plan_file")"; then
  echo "Plan Promotion Gate is incomplete in $plan_file:" >&2
  printf '%s\n' "$promotion_error" >&2
  exit 1
fi

if ! artifact_error="$(plan_artifact_level_error "$plan_file")"; then
  echo "Plan Artifact Level gate is incomplete in $plan_file:" >&2
  printf '%s\n' "$artifact_error" >&2
  exit 1
fi

if ! inline_mode_error="$(plan_inline_sprint_mode_error "$plan_file")"; then
  echo "Plan cannot be projected into task artifacts: $plan_file:" >&2
  printf '%s\n' "$inline_mode_error" >&2
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
mkdir -p .ai/harness/planning
mkdir -p .ai/harness/runs

timestamp="$(date +%Y%m%d-%H%M)"
timestamp_human="$(date '+%Y-%m-%d %H:%M')"
plan_base="$(basename "$plan_file")"
slug="$(plan_slug_from_path "$plan_file")"
original_artifact_stem="$(plan_original_artifact_stem_from_path "$plan_file")"
artifact_stem="$(plan_artifact_stem_from_path "$plan_file")"
contract_file="tasks/contracts/${artifact_stem}.contract.md"
review_file="tasks/reviews/${artifact_stem}.review.md"
notes_file="tasks/notes/${artifact_stem}.notes.md"
previous_source_plan="$(get_todo_source_plan || true)"
parent_run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-${timestamp}}}}"
capability_id="$(extract_capability_id "$plan_file")"
capability_id="${capability_id:-root}"

rewrite_plan_artifact_references "$plan_file" "$original_artifact_stem" "$artifact_stem"

if [[ -f "tasks/todos.md" ]] \
  && grep -q '[^[:space:]]' tasks/todos.md \
  && ! grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' tasks/todos.md; then
  archive_file="$(unique_archive_path "tasks/archive/todo-${timestamp}-${slug}.md")"
  {
    echo "> **Archived**: $(date '+%Y-%m-%d %H:%M')"
    echo "> **Related Plan**: ${plan_file}"
    echo "> **Outcome**: Converted to deferred-goal ledger"
    echo "> **Source Plan**: ${previous_source_plan:-"(none)"}"
    echo "> **Parent Run ID**: ${parent_run_id}"
    echo
    cat tasks/todos.md
  } > "$archive_file"
fi

if [[ ! -f "tasks/todos.md" ]] || ! grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' tasks/todos.md; then
  {
    echo "# Deferred Goal Ledger"
    echo
    echo "> **Status**: Backlog"
    echo "> **Updated**: ${timestamp_human}"
    echo "> **Scope**: Medium/long-term goals deferred from active plan execution"
    echo
    echo "Current plan tasks live in \`${plan_file}\` under \`## Task Breakdown\`."
    echo "Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger."
    echo
    echo "## Deferred Goals"
    echo
    echo "| Goal | Why Deferred | Tradeoff | Revisit Trigger |"
    echo "|------|--------------|----------|-----------------|"
    echo "| (none) | No deferred medium/long-term goal recorded for this projection. | Keep this sprint bounded. | Add a row when a real follow-up is postponed. |"
  } > tasks/todos.md
else
  todo_tmp="$(mktemp)"
  awk -v timestamp_human="$timestamp_human" -v plan_file="$plan_file" '
    /^\> \*\*Updated\*\*:/ {
      print "> **Updated**: " timestamp_human
      next
    }
    /^Current plan tasks live in `/ {
      print "Current plan tasks live in `" plan_file "` under `## Task Breakdown`."
      next
    }
    { print }
  ' tasks/todos.md > "$todo_tmp"
  mv "$todo_tmp" tasks/todos.md
fi

rm -f .claude/.task-state.json

if [[ -f ".claude/templates/review.template.md" ]]; then
  :
else
  mkdir -p .claude/templates
  cat > .claude/templates/review.template.md <<'REVIEW_TEMPLATE_EOF'
# Task Review: {{TASK_SLUG}}

> **Status**: Pending
> **Plan**: {{PLAN_FILE}}
> **Contract**: {{CONTRACT_FILE}}
> **Notes File**: {{NOTES_FILE}}
> **Checks File**: {{CHECKS_FILE}}
> **Last Updated**: {{TIMESTAMP}}
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run
- Intended files changed:
- Actual files changed:
- Commands passed:
- Residual risks:
- Reviewer action required: inspect diff and card
- Rollback:

## Mode Evidence

- Selected route:
- P1/P2/P3 evidence:
- Root cause or plan evidence:

## Verification Evidence

- Waza /check run:
- Commands run:
- Manual checks:
- Supporting artifacts:
- Implementation notes reviewed:
- Run snapshot:

## Manual Check Evidence

Copy each non-built-in contract `manual_checks` requirement exactly. Check it only after
the observation is complete and replace the placeholder with concrete command output,
screenshot/artifact path, or reviewer observation.

- [ ] Exact manual_checks requirement
  - Evidence: concrete observation, command output, screenshot path, or reviewer note

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**:
> **External Source**:
> **External Started**:
> **External Completed**:
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Benchmark Evidence SHA256**: pending

- P1 blockers:
- P2 advisories:
- Acceptance checklist:

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

render_contract_file "$plan_file" "$contract_file" "$review_file" "$notes_file" "$slug" "$timestamp_human" "$capability_id"
maybe_advise_geju_freeze || true
carry_forward_plan_scope_boundary "$plan_file" "$contract_file"
maybe_advise_contract_brief_preflight "$contract_file"
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

set_plan_status "$plan_file" "Executing"
if declare -F set_active_plan >/dev/null 2>&1; then
  set_active_plan "$plan_file"
else
  mkdir -p .ai/harness
  printf '%s' "$plan_file" > .ai/harness/active-plan
  pwd -P > .ai/harness/active-worktree
fi

if declare -F workflow_clear_pending_orchestration >/dev/null 2>&1; then
  workflow_clear_pending_orchestration
else
  rm -f .ai/harness/planning/pending.json
fi

echo "Prepared sprint artifacts from $plan_file"
echo "Left tasks/todos.md as deferred-goal ledger; execute the plan's own ## Task Breakdown."
