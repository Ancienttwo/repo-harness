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

_WF_LIB=".ai/hooks/lib/workflow-state.sh"
if [[ -f "$_WF_LIB" ]]; then
  # shellcheck source=/dev/null
  . "$_WF_LIB"
fi

usage() {
  cat <<'USAGE_EOF'
Usage:
  scripts/capture-plan.sh --slug <slug> [--title <title>] [--status Draft|Approved]
                          [--source <codex-plan|waza-think|repo-harness-plan|repo-harness-sprint>]
                          [--orchestration-kind <kind>] [--source-ref <ref>]
                          [--route <route>] [--body-file <file>] [--execute]

Reads a finished planning note from stdin or --body-file and stores it as a
repo-local plans/plan-*.md artifact with a complete Evidence Contract.
USAGE_EOF
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

artifact_stem_for_capture() {
  local plan_file="$1"
  local slug="$2"
  local title="$3"
  local stem stamp title_slug

  stem="$(basename "$plan_file" .md | sed -E 's/^plan-//')"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]] && is_transient_plan_slug "$slug"; then
    title_slug="$(normalize_slug "$title")"
    if [[ -n "$title_slug" && "$title_slug" != "$slug" ]]; then
      stamp="$(printf '%s' "$stem" | sed -E 's/^([0-9]{8}-[0-9]{4})-.+$/\1/')"
      printf '%s-%s' "$stamp" "$title_slug"
      return 0
    fi
  fi

  printf '%s' "$stem"
}

ACTIVE_PLAN_MARKER=".ai/harness/active-plan"
LEGACY_ACTIVE_PLAN_MARKER=".claude/.active-plan"
ACTIVE_WORKTREE_MARKER=".ai/harness/active-worktree"

write_active_plan_marker() {
  local plan_file="$1"
  mkdir -p "$(dirname "$ACTIVE_PLAN_MARKER")" "$(dirname "$LEGACY_ACTIVE_PLAN_MARKER")" "$(dirname "$ACTIVE_WORKTREE_MARKER")"
  printf '%s' "$plan_file" > "$ACTIVE_PLAN_MARKER"
  printf '%s' "$plan_file" > "$LEGACY_ACTIVE_PLAN_MARKER"
  pwd -P > "$ACTIVE_WORKTREE_MARKER"
}

extract_task_breakdown() {
  local body="$1"
  local section tasks

  section="$(
    printf '%s\n' "$body" | awk '
      BEGIN { in_section = 0 }
      /^## Task Breakdown[[:space:]]*$/ { in_section = 1; next }
      in_section && /^## / { exit }
      in_section { print }
    '
  )"
  tasks="$(printf '%s\n' "$section" | grep -E '^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+' || true)"
  if [[ -n "$tasks" ]]; then
    printf '%s\n' "$tasks"
    return 0
  fi

  tasks="$(printf '%s\n' "$body" | grep -E '^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+' || true)"
  if [[ -n "$tasks" ]]; then
    printf '%s\n' "$tasks"
    return 0
  fi

  return 1
}

slug=""
title=""
status="Draft"
source_name="codex-plan-or-waza-think"
route="planning"
orchestration_kind="host-plan"
source_ref=""
body_file=""
execute=0
set_active=1

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
    --status)
      [[ -n "${2:-}" ]] || { echo "Error: --status requires a value" >&2; usage; exit 1; }
      status="$2"
      shift 2
      ;;
    --source)
      [[ -n "${2:-}" ]] || { echo "Error: --source requires a value" >&2; usage; exit 1; }
      source_name="$2"
      shift 2
      ;;
    --orchestration-kind)
      [[ -n "${2:-}" ]] || { echo "Error: --orchestration-kind requires a value" >&2; usage; exit 1; }
      orchestration_kind="$2"
      shift 2
      ;;
    --source-ref)
      [[ -n "${2:-}" ]] || { echo "Error: --source-ref requires a value" >&2; usage; exit 1; }
      source_ref="$2"
      shift 2
      ;;
    --route)
      [[ -n "${2:-}" ]] || { echo "Error: --route requires a value" >&2; usage; exit 1; }
      route="$2"
      shift 2
      ;;
    --body-file)
      [[ -n "${2:-}" ]] || { echo "Error: --body-file requires a value" >&2; usage; exit 1; }
      body_file="$2"
      shift 2
      ;;
    --execute)
      execute=1
      shift
      ;;
    --no-active)
      set_active=0
      shift
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

[[ -n "$slug" ]] || { echo "--slug is required" >&2; usage; exit 1; }
slug="$(normalize_slug "$slug")"
[[ -n "$slug" ]] || { echo "Slug is empty after normalization" >&2; exit 1; }
[[ -n "$title" ]] || title="$slug"

case "$status" in
  Draft|Approved)
    ;;
  *)
    echo "Status must be Draft or Approved (got: $status)" >&2
    exit 1
    ;;
esac

if [[ "$execute" -eq 1 && "$status" != "Approved" ]]; then
  echo "--execute requires --status Approved" >&2
  exit 1
fi

body=""
if [[ -n "$body_file" ]]; then
  [[ -f "$body_file" ]] || { echo "Body file not found: $body_file" >&2; exit 1; }
  body="$(cat "$body_file")"
elif [[ ! -t 0 ]]; then
  body="$(cat)"
fi

if [[ -z "$(printf '%s' "$body" | tr -d '[:space:]')" ]]; then
  echo "No captured planning content provided. Pipe content on stdin or use --body-file." >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M)"
mkdir -p plans plans/archive .claude

plan_file="plans/plan-${timestamp}-${slug}.md"
counter=2
while [[ -f "$plan_file" ]]; do
  plan_file="plans/plan-${timestamp}-${slug}-v${counter}.md"
  counter=$((counter + 1))
done
artifact_stem="$(artifact_stem_for_capture "$plan_file" "$slug" "$title")"

tasks="$(extract_task_breakdown "$body" || true)"
if [[ -z "$tasks" ]]; then
  tasks="- [ ] Execute captured plan: ${title}"
fi

cat > "$plan_file" <<PLAN_EOF
# Plan: ${title}

> **Status**: ${status}
> **Created**: ${timestamp}
> **Slug**: ${slug}
> **Planning Source**: ${source_name}
> **Orchestration Kind**: ${orchestration_kind}
> **Source Ref**: ${source_ref:-"(none)"}
> **Spec**: \`docs/spec.md\`
> **Research**: See \`docs/researches/\`
> **Task Contract**: \`tasks/contracts/${artifact_stem}.contract.md\`
> **Task Review**: \`tasks/reviews/${artifact_stem}.review.md\`
> **Implementation Notes**: \`tasks/notes/${artifact_stem}.notes.md\`

## Agentic Routing
- Selected route: ${route}
- Routing reason: Captured from ${source_name} planning output.
- Source ref: ${source_ref:-"(none)"}
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: \`${plan_file}\`
- Sprint contract: \`tasks/contracts/${artifact_stem}.contract.md\`
- Sprint review: \`tasks/reviews/${artifact_stem}.review.md\`
- Implementation notes: \`tasks/notes/${artifact_stem}.notes.md\`
- Deferred-goal ledger: \`tasks/todos.md\`
- Current checks: \`.ai/harness/checks/latest.json\`
- Run snapshots: \`.ai/harness/runs/\`
- Scope authority: \`tasks/contracts/${artifact_stem}.contract.md\` \`allowed_paths\`
- Concurrency rule: \`.ai/harness/active-plan\` selects the active plan for this worktree when present; \`.ai/harness/active-worktree\` records the owning worktree; \`.claude/.active-plan\` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through \`scripts/plan-to-todo.sh --plan ${plan_file}\` and may start \`scripts/contract-worktree.sh start --plan ${plan_file}\`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: \`tasks/contracts/${artifact_stem}.contract.md\`
- Review file: \`tasks/reviews/${artifact_stem}.review.md\`
- Implementation notes file: \`tasks/notes/${artifact_stem}.notes.md\`
- Template: \`.claude/templates/contract.template.md\`
- Verification command: \`bash scripts/verify-contract.sh --contract tasks/contracts/${artifact_stem}.contract.md --strict\`
- Active plan rule: this captured plan is written to \`.ai/harness/active-plan\`, the owning worktree is written to \`.ai/harness/active-worktree\`, and the plan is mirrored to \`.claude/.active-plan\` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: \`.ai/harness/checks/latest.json\`
- Session handoff: \`.ai/harness/handoff/current.md\`

## Evidence Contract

- **State/progress path**: \`${plan_file}\` task breakdown, \`tasks/todos.md\` deferred-goal ledger, \`tasks/contracts/${artifact_stem}.contract.md\`, \`tasks/reviews/${artifact_stem}.review.md\`, and \`tasks/notes/${artifact_stem}.notes.md\`
- **Verification evidence**: \`.ai/harness/checks/latest.json\`, \`.ai/harness/runs/\`, and the commands named in the captured planning output
- **Evaluator rubric**: \`tasks/reviews/${artifact_stem}.review.md\` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove \`${plan_file}\`; after execution revert branch \`codex/${slug}\` or the generated task artifacts

## Captured Planning Output

${body}

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
${tasks}
PLAN_EOF

if [[ "$set_active" -eq 1 ]]; then
  write_active_plan_marker "$plan_file"
fi

if declare -F workflow_clear_pending_orchestration >/dev/null 2>&1; then
  workflow_clear_pending_orchestration
else
  rm -f .ai/harness/planning/pending.json
fi

echo "Captured plan: $plan_file"

if [[ "$execute" -eq 1 ]]; then
  [[ -f "scripts/plan-to-todo.sh" ]] || { echo "Missing scripts/plan-to-todo.sh" >&2; exit 1; }
  bash "scripts/plan-to-todo.sh" --plan "$plan_file"
fi
