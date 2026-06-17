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
Usage: scripts/new-plan.sh --slug <slug> [--title <title>]
USAGE_EOF
}

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

slug=""
title=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)
      [[ -n "${2:-}" ]] || { echo "Error: --slug requires a value" >&2; usage; exit 1; }
      slug="$2"
      shift 2
      ;;
    --title)
      [[ -n "${2:-}" ]] || { echo "Error: --title requires a value" >&2; usage; exit 1; }
      title="$2"
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

if [[ -z "$slug" ]]; then
  echo "--slug is required" >&2
  usage
  exit 1
fi

slug="$(normalize_slug "$slug")"
if [[ -z "$slug" ]]; then
  echo "Slug is empty after normalization" >&2
  exit 1
fi

if [[ -z "$title" ]]; then
  title="$slug"
fi

timestamp="$(date +%Y%m%d-%H%M)"
mkdir -p plans plans/archive .claude/templates

template_file=".claude/templates/plan.template.md"
if [[ ! -f "$template_file" ]]; then
  cat > "$template_file" <<'PLAN_TEMPLATE_EOF'
# Plan: {{TITLE}}

> **Status**: Draft
> **Created**: {{TIMESTAMP}}
> **Slug**: {{SLUG}}
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`
> **Task Review**: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`
> **Implementation Notes**: `tasks/notes/{{ARTIFACT_STEM}}.notes.md`

## Agentic Routing
- Selected route:
- Routing reason:
- Due diligence:
  - P1 map:
  - P2 trace:
  - P3 decision rationale:

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `{{PLAN_FILE}}`
- Sprint contract: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`
- Sprint review: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`
- Implementation notes: `tasks/notes/{{ARTIFACT_STEM}}.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan {{PLAN_FILE}}` and may start `scripts/contract-worktree.sh start --plan {{PLAN_FILE}}`.

## Approach
### Strategy
### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|

### Code Snippets
### Data Flow

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|

## Task Contracts
- Contract file: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`
- Review file: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`
- Implementation notes file: `tasks/notes/{{ARTIFACT_STEM}}.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/{{ARTIFACT_STEM}}.contract.md --strict`
- Active plan rule: `.ai/harness/active-plan` is authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**:
- **Verification evidence**:
- **Evaluator rubric**:
- **Stop condition**:
- **Rollback surface**:

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] ...
PLAN_TEMPLATE_EOF
fi

base_name="plan-${timestamp}-${slug}.md"
plan_file="plans/${base_name}"
counter=2
while [[ -f "$plan_file" ]]; do
  plan_file="plans/plan-${timestamp}-${slug}-v${counter}.md"
  counter=$((counter + 1))
done
artifact_stem="$(basename "$plan_file" .md | sed -E 's/^plan-//')"

slug_esc="$(escape_sed_replacement "$slug")"
artifact_stem_esc="$(escape_sed_replacement "$artifact_stem")"
title_esc="$(escape_sed_replacement "$title")"
timestamp_esc="$(escape_sed_replacement "$timestamp")"

sed \
  -e "s/{{SLUG}}/${slug_esc}/g" \
  -e "s/{{ARTIFACT_STEM}}/${artifact_stem_esc}/g" \
  -e "s/{{TITLE}}/${title_esc}/g" \
  -e "s/{{TIMESTAMP}}/${timestamp_esc}/g" \
  -e "s|{{PLAN_FILE}}|${plan_file}|g" \
  "$template_file" \
  | sed \
    -e "s|tasks/contracts/${slug_esc}\\.contract\\.md|tasks/contracts/${artifact_stem_esc}.contract.md|g" \
    -e "s|tasks/reviews/${slug_esc}\\.review\\.md|tasks/reviews/${artifact_stem_esc}.review.md|g" \
    -e "s|tasks/notes/${slug_esc}\\.notes\\.md|tasks/notes/${artifact_stem_esc}.notes.md|g" \
    > "$plan_file"

echo "Created plan: $plan_file"
