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
> **Artifact Level**: work-package
> **Promotion Reason**:
> **Verification Boundary**:
> **Rollback Surface**:
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`

## Agentic Routing
- Selected route:
- Routing reason:

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Optional plan: `{{PLAN_FILE}}`
- Verification: declare and execute a non-empty Verification Plan. Select its native report explicitly.
- Run snapshots: `.ai/harness/runs/`
- Scope authority: the active approved admission and its `allowed_paths`; this plan only proposes scope.
- Concurrency rule: use the current admitted task/session and immutable claim. Preserve the owning Git worktree and do not infer execution ownership from planning files.
- Planning export: `repo-harness run plan-to-todo --plan {{PLAN_FILE}}` prints this plan for a delegation brief or PR description; it does not activate work or create approval artifacts.
- Execution isolation: `repo-harness run contract-worktree start --plan {{PLAN_FILE}}` can create an isolated Git worktree. Worktree creation does not replace task/session admission.

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

## Verification
- Verification command: `repo-harness run verification-plan execute --repo . --repository-id <repository-id> --issue-id <issue-id> --campaign-id <campaign-id> --grant-sha256 <approved-grant-sha256> --policy-sha256 <policy-sha256> --actor <actor-id> --report-file .ai/harness/runs/{{ARTIFACT_STEM}}.report.json`
- Planning selection is metadata only. Do not infer active execution from an active-plan marker or the latest non-archived plan.

## Handoff

- Verification: declare and execute a non-empty Verification Plan. Select its native report explicitly.
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**:
- **Rollback surface**:
- **Verification boundary**:
- **Review/acceptance boundary**:
- **High-risk surface**:
- **Why not checklist row**:

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
  "$template_file" > "$plan_file"

echo "Created plan: $plan_file"
