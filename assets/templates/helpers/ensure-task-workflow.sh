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
helper_dir="$(cd "$(dirname "${REPO_HARNESS_HELPER_SOURCE_PATH:-$0}")" && pwd)"

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/ensure-task-workflow.sh [--new-plan] [--slug <slug>] [--title <title>]
USAGE_EOF
}

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

ACTIVE_PLAN_MARKER=".ai/harness/active-plan"

read_active_plan_marker() {
  local marker_file="$1"
  local marker_plan

  if [[ -f "$marker_file" ]]; then
    marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" && -f "$marker_plan" ]]; then
      printf '%s' "$marker_plan"
      return 0
    fi
  fi

  return 1
}

get_active_plan() {
  read_active_plan_marker "$ACTIVE_PLAN_MARKER"
}

ensure_templates() {
  mkdir -p .claude/templates

  if [[ ! -f ".claude/templates/spec.template.md" ]]; then
    cat > .claude/templates/spec.template.md <<'SPEC_TEMPLATE_EOF'
# Product Spec: {{PROJECT_NAME}}

> **Status**: Draft
> **Last Updated**: {{TIMESTAMP}}
> **Owner**: Planner

## Product Outcome

Describe the stable user or operator outcome this repo should deliver.

## Success Criteria

- Primary workflow:
- Quality bar:
- Out of scope:

## Constraints

- Technical:
- Compliance:
- Delivery:

## Acceptance Scenarios

- Given
  When
  Then

## Open Questions

- ...
SPEC_TEMPLATE_EOF
  fi

  if [[ ! -f ".claude/templates/research.template.md" ]]; then
    cat > .claude/templates/research.template.md <<'RESEARCH_TEMPLATE_EOF'
# {{PROJECT_NAME}} — Research Notes

> **Last Updated**: {{DATE}}
> **Scope**: (what area of the codebase was researched)
> **Usage**: Store deep codebase findings and hidden contracts here, not in chat-only summaries.

## Codebase Map
| File | Purpose | Key Exports |
|------|---------|-------------|

## Architecture Observations
### Patterns & Conventions
### Implicit Contracts
### Edge Cases & Intricacies

## Technical Debt / Risks

## Research Conclusions
### What to Preserve
### What to Change
### Open Questions
RESEARCH_TEMPLATE_EOF
  fi

  if [[ ! -f ".claude/templates/prd.template.md" ]]; then
    cat > .claude/templates/prd.template.md <<'PRD_TEMPLATE_EOF'
# PRD: {{PRD_TITLE}}

> **Status**: Draft
> **Slug**: {{PRD_SLUG}}
> **Created**: {{TIMESTAMP}}
> **Updated**: {{TIMESTAMP}}
> **Source Spec**: `docs/spec.md`
> **Tier**: compact

<!--
PRD tier contract:
- compact: one focused product/tool or fewer than three P0 modules, target 150-300 lines.
- standard: multi-module product, target 300-600 lines and hard cap 800 lines.
- If the PRD would exceed 800 lines, split it into smaller PRDs.
- Output files live in plans/prds/<YYYYMMDD>-<HHMM>-<slug>.prd.md.
- Inline responses should include only the AI Quick-Read Card and file path.
-->

## AI Quick-Read Card

- Problem:
- Users:
- Platform:
- P0 surface:
- Core metric:
- Hard constraint:
- Key risk:
- Unknowns:
- Acceptance scenarios:
- Suggested next step:

## Problem

### Product Direction

- Hard Constraints:
- Recommended Defaults:
- Freedoms:

### Feasibility Boundary

- Confirmed:
- [UNKNOWN]:
- [UNVERIFIED]:

## Users

### Primary Users

- User:
  - Need:
  - Success signal:

### Secondary Users

- User:
  - Need:
  - Success signal:

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Example metric | 95% | Describe how to measure it | 90% |

## Acceptance Scenarios

### Scenario 1

- Given:
- When:
- Then:
- Machine-checkable evidence:

### Scenario 2

- Given:
- When:
- Then:
- Machine-checkable evidence:

### Scenario 3 (negative)

- Given:
- When:
- Then (must NOT):
- Machine-checkable evidence:

## Non-goals

-

## Module Behaviors (P0)

### Module 1

- Purpose:
- Hard Constraints:
- Recommended Defaults:
- Freedoms:
- Normal path:
- Failure path 1:
- Failure path 2:
- States:
  - Empty:
  - Loading:
  - Ready:
  - Error:
- Dependencies:
- Open decisions: None

## Data Model

```jsonc
{
  "version": "1",
  "entities": [
    {
      "id": "example_entity",
      "owner": "user", // who owns the data
      "fields": {
        "id": "string", // stable identifier
        "created_at": "datetime" // creation timestamp
      }
    }
  ],
  "relationships": []
}
```

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Initial usable response | 2 seconds | Local stopwatch or automated timing | 4 seconds |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| [UNKNOWN] Example unknown | Explain impact | Explain how to resolve | Maintainer |

## Developer Handoff

You are implementing this PRD.

- Build first:
- Do not reinterpret:
- You may improve:
- Verify with:

### Acceptance Scripts

1.
2.
3.

## Adjacent Patterns

Required when the `repo-harness-prd` prior-art trigger table hits (UI/taste, market-convention pattern, library/framework selection, architecture precedent, or an `[UNVERIFIED]` external assumption). Otherwise optional: use in standard tier or when explicitly requested. Prefer adjacent product patterns and common workflow debt. Do not name a competitor, API, platform limit, or package size unless the fact is sourced; otherwise mark it `[UNVERIFIED]`.

## Commercialization Notes

Use only when the request involves pricing, packaging, monetization, or buyer/user separation.

## Frontend Perspective

Use only when the frontend shape affects product behavior, state ownership, accessibility, or implementation risk.

## Backend Perspective

Use only when APIs, persistence, jobs, permissions, or data ownership affect product behavior or implementation risk.
PRD_TEMPLATE_EOF
  fi

  if [[ ! -f ".claude/templates/plan.template.md" ]]; then
    cat > .claude/templates/plan.template.md <<'PLAN_TEMPLATE_EOF'
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
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan {{PLAN_FILE}}` and may start `repo-harness run contract-worktree start --plan {{PLAN_FILE}}`.

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
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/{{ARTIFACT_STEM}}.contract.md --strict`
- Active plan rule: `.ai/harness/active-plan` is authoritative for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
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

  if [[ ! -f ".claude/templates/contract.template.md" ]]; then
    cat > .claude/templates/contract.template.md <<'CONTRACT_TEMPLATE_EOF'
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

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
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

  if [[ ! -f ".claude/templates/review.template.md" ]]; then
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
- Change type: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | frontend
- Intended files changed:
- Actual files changed:
- Commands passed:
- Residual risks:
- Reviewer action required: inspect diff and card
- Rollback:

## Verification Evidence

- Waza /check run:
- Commands run:
- Manual checks:
- Supporting artifacts:

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

  if [[ ! -f ".claude/templates/implementation-notes.template.md" ]]; then
    cat > .claude/templates/implementation-notes.template.md <<'NOTES_TEMPLATE_EOF'
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

  if [[ ! -f ".claude/templates/design-brief.template.md" ]]; then
    cat > .claude/templates/design-brief.template.md <<'DESIGN_BRIEF_TEMPLATE_EOF'
# Design Brief: {{TITLE}}

> **Status**: Draft
> **Slug**: {{SLUG}}
> **Owner**: {{OWNER}}
> **Date**: {{TIMESTAMP}}

<!--
Design brief usage: produce this file as docs/design/DESIGN-{{SLUG}}.md before any
frontend task_profile sprint or contract executes. Every item in the
Confirmation Checklist needs an explicit human check before execution proceeds;
this gate carries the same weight as plan approval. imagegen-type skills (for
example `imagegen-frontend-web`, `design-taste-frontend`) may produce the
Preview Attachment below, but they are optional enhancers, never a substitute
for the checklist.

Before filling this template, read `repo-harness docs show ux-feature-guard`.
The UX Feature Guard section below is the behavior/authority hand-off to BDD;
do not create a parallel guard artifact.
-->

## Purpose & Audience (頁面目的與受眾)

- Page/surface:
- Primary audience:
- Job to be done:

## UX Feature Guard (行為前圍欄)

- Requested outcome (使用者可見結果):
- Frozen behavior / rules that must not change (不可改變的玩法與語義):
- Requested action (指令):
- Exact payload acted on (資料內容; if none, write `N/A`):
- Forbidden extras / non-goals (禁止新增):

### Authority & Reuse Map (權威與復用)

Name exact repo paths. A new surface needs a concrete mismatch or cross-module
invariant; “cleaner” and “easier” are not justification.

| Responsibility / datum | Existing authority or reuse target | Decision (reuse / extend / new) | New-surface justification |
|------------------------|------------------------------------|---------------------------------|---------------------------|
|                        |                                    |                                 |                           |

### Observable & Copy Contract (可觀測狀態與文案)

- Happy/loading/empty states that can actually occur:
- Invalid/unavailable state: (what happened, where, next action)
- Machine-readable output contract, if any: (required presence and absence)
- Canonical copy source / sync sites:
- Fail-loud rule: (name the authoritative failure; no synthesized fallback)

### BDD Acceptance Scenarios

Write concrete Given/When/Then scenarios. These implement the frozen decisions;
they do not invent missing product rules.

- Positive scenario ID + Given/When/Then: (`UX-{{SLUG}}-P1`)
- Negative / non-goal scenario ID + Given/When/Then: (`UX-{{SLUG}}-N1`)
- Authority-failure scenario ID + Given/When/Then: (`UX-{{SLUG}}-F1`)

Carry these IDs unchanged into the task contract, test names/tags, and review
evidence. Those surfaces prove the scenarios; they do not redefine them.

## Reference Sources (參考來源:學什麼/避什麼)

Name concrete products, sites, or design systems — not vague adjectives. Mark unverifiable claims `[UNVERIFIED]`.

| Source | Learn (學什麼) | Avoid (避什麼) |
|--------|----------------|-----------------|
|        |                |                 |

## Color (色彩)

- Palette:
- Usage rules: (which color for which state/action; contrast/accessibility floor)

## Typography (字型排印)

- Typeface(s):
- Scale / weights:
- Language-specific notes: (for example CJK pairing, line-height)

## Layout (佈局)

- Grid / breakpoints:
- Spacing scale:
- Key components and hierarchy:

## Motion (動效)

- Trigger -> effect pairs:
- Duration / easing:
- What must stay static:

## Anti-patterns (明確禁止清單)

List concrete things this design must NOT do. Vague taste complaints ("不好看") are not acceptable entries; name the specific pattern.

-

## Confirmation Checklist (確認標準)

Every item must be checked before this brief unblocks sprint/contract execution.

- [ ] Value proposition is clear (價值主張清晰)
- [ ] Primary reference is decided (主參考已定)
- [ ] Color is accurate to the reference (色彩準確)
- [ ] Anti-pattern / don't list is explicit (明確的 don't 清單)
- [ ] Motion spec is explicit (動效規格明確)
- [ ] Product rules/non-goals are frozen; instruction and payload are separate (玩法不變，指令與內容分離)
- [ ] Existing component/domain authorities have exact reuse paths; every new surface is justified (優先復用現有權威)
- [ ] Positive, negative, and authority-failure Given/When/Then scenarios are explicit and fail loudly (BDD 場景完整且錯誤可見)

## Preview Attachment (可選)

Optional. Reference an imagegen-generated preview or screenshot here; imagegen-type skills are enhancers for this brief, never a substitute for the checklist above.

- Preview path/link:
DESIGN_BRIEF_TEMPLATE_EOF
  fi
}

ensure_idle_todo() {
  mkdir -p tasks
  if [[ ! -f "tasks/todos.md" ]]; then
    cat > tasks/todos.md <<'TODO_EOF'
# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: (ensure-task-workflow)
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| (none) | No deferred medium/long-term goal recorded yet. | Keep the current slice bounded. | Add a row when a real follow-up is postponed. |
TODO_EOF
  fi
}

ensure_current_status_snapshot() {
  mkdir -p tasks
  if [[ -f "$helper_dir/refresh-current-status.sh" ]]; then
    bash "$helper_dir/refresh-current-status.sh" --clear --write --reason "ensure-task-workflow" >/dev/null 2>&1 || true
    return 0
  fi

  if [[ ! -f "tasks/current.md" ]]; then
    cat > tasks/current.md <<'CURRENT_STATUS_EOF'
# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: bootstrap -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: bootstrap
> **Source Branch**: main
> **Source Commit**: bootstrap
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: bootstrap
> **Derived From**: active-plan, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.
CURRENT_STATUS_EOF
  fi
}

ensure_auxiliary_files() {
  mkdir -p plans plans/archive plans/prds plans/sprints tasks/archive tasks/contracts tasks/reviews tasks/notes tasks/workstreams docs/architecture/domains docs/architecture/modules docs/architecture/requests docs/architecture/snapshots docs/architecture/diagrams .ai/context .ai/harness/checks .ai/harness/handoff .ai/harness/failures .ai/harness/security .ai/harness/planning .ai/harness/delegation .ai/harness/architecture .ai/harness/worktrees .ai/harness/runs

  if [[ ! -f "docs/spec.md" ]]; then
    cat > docs/spec.md <<'SPEC_EOF'
# Product Spec

> **Status**: Draft
> **Owner**: Planner
SPEC_EOF
  fi

  if [[ ! -f "tasks/lessons.md" ]]; then
    cat > tasks/lessons.md <<'LESSONS_EOF'
# Lessons Learned (Self-Improvement Loop)

> Capture correction-derived prevention rules here.
> Promote repeated patterns into durable project rules during spa day.

## Template
- Date:
- Triggered by correction:
- Mistake pattern:
- Prevention rule:
- Where to apply next time:
LESSONS_EOF
  fi

  mkdir -p docs/researches
  if [[ ! -f "docs/researches/README.md" ]]; then
    cat > docs/researches/README.md <<'RESEARCH_README_EOF'
# Research Reports

Durable research reports live in this directory as dated Markdown files.

Use `YYYYMMDD-topic.md` names for new reports. Keep task-local implementation
decisions in `tasks/notes/`, and keep repeated correction-derived rules in
`tasks/lessons.md`.
RESEARCH_README_EOF
  fi

  if [[ ! -f ".ai/harness/checks/latest.json" ]]; then
    echo "{}" > ".ai/harness/checks/latest.json"
  fi

  if [[ ! -f ".ai/harness/handoff/current.md" ]]; then
    cat > ".ai/harness/handoff/current.md" <<'HANDOFF_EOF'
# Harness Handoff

> **Reason**: bootstrap
HANDOFF_EOF
  fi

  if [[ ! -f ".ai/harness/handoff/resume.md" ]]; then
    cat > ".ai/harness/handoff/resume.md" <<'RESUME_EOF'
# Codex Resume Packet

> **Reason**: bootstrap
RESUME_EOF
  fi

  if [[ ! -f ".ai/harness/events.jsonl" ]]; then
    : > ".ai/harness/events.jsonl"
  fi

  if [[ ! -f ".ai/harness/architecture/events.jsonl" ]]; then
    : > ".ai/harness/architecture/events.jsonl"
  fi

  if [[ ! -f ".ai/harness/architecture/.gitkeep" ]]; then
    : > ".ai/harness/architecture/.gitkeep"
  fi

  if [[ ! -f ".ai/harness/failures/latest.jsonl" ]]; then
    : > ".ai/harness/failures/latest.jsonl"
  fi

  if [[ ! -f ".ai/harness/security/.gitkeep" ]]; then
    : > ".ai/harness/security/.gitkeep"
  fi

  if [[ ! -f ".ai/harness/runs/.gitkeep" ]]; then
    : > ".ai/harness/runs/.gitkeep"
  fi
  if [[ ! -f ".ai/harness/worktrees/.gitkeep" ]]; then
    : > ".ai/harness/worktrees/.gitkeep"
  fi

  if [[ ! -f "docs/architecture/requests/.gitkeep" ]]; then
    : > "docs/architecture/requests/.gitkeep"
  fi

  if [[ ! -f "docs/architecture/snapshots/.gitkeep" ]]; then
    : > "docs/architecture/snapshots/.gitkeep"
  fi

  if [[ ! -f "docs/architecture/diagrams/.gitkeep" ]]; then
    : > "docs/architecture/diagrams/.gitkeep"
  fi

  if [[ ! -f "docs/architecture/domains/.gitkeep" ]]; then
    : > "docs/architecture/domains/.gitkeep"
  fi

  if [[ ! -f "docs/architecture/modules/.gitkeep" ]]; then
    : > "docs/architecture/modules/.gitkeep"
  fi

  if [[ ! -f "tasks/workstreams/.gitkeep" ]]; then
    : > "tasks/workstreams/.gitkeep"
  fi

  if [[ ! -f ".ai/context/capabilities.json" ]]; then
    cat > ".ai/context/capabilities.json" <<'CAPABILITIES_EOF'
{
  "version": 1,
  "capabilities": []
}
CAPABILITIES_EOF
  fi

  if [[ ! -f "docs/architecture/index.md" ]]; then
    cat > "docs/architecture/index.md" <<'ARCHITECTURE_INDEX_EOF'
# Architecture Index

> Umbrella architecture ledger for current boundaries, drift requests, snapshots, and diagrams.

## Current Snapshot

- Latest snapshot: (none yet)
- Semantic diagram source: (none yet)
- Latest human diagram: (none yet)

## Architecture Drift Flow

- `repo-harness run architecture-queue` records architecture-sensitive edits as requests.
- `repo-harness run archive-architecture-request` archives handled requests after an agent records the resolution status and linked artifacts.
- `repo-harness run context-contract-sync` keeps only the controlled architecture block in functional-block `AGENTS.md` and `CLAUDE.md` files aligned.
- `repo-harness run workstream-sync` keeps durable multi-session progress under `tasks/workstreams/<domain>/<capability>/` and projects only pointers into local contracts.
- Semantic architecture diagrams live as Mermaid fenced blocks in the relevant module or snapshot Markdown.
- Human-readable architecture diagrams are optional `mermaid` HTML files in `docs/architecture/diagrams/` and should link back to the Markdown semantic source.

## Pending Requests

<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->
- (none)
<!-- END ARCHITECTURE PENDING REQUESTS -->

ARCHITECTURE_INDEX_EOF
  fi

  if [[ ! -f ".ai/harness/policy.json" ]]; then
    cat > ".ai/harness/policy.json" <<'POLICY_EOF'
{
  "version": 1,
  "active_plan": {
    "marker_file": ".ai/harness/active-plan",
    "directory": "plans",
    "archive_directory": "plans/archive",
    "glob": "plan-*.md",
    "active_worktree_marker_file": ".ai/harness/active-worktree",
    "source_of_truth": "per-worktree explicit marker with active-worktree owner"
  },
  "tasks": {
    "todo_file": "tasks/todos.md",
    "current_status_file": "tasks/current.md",
    "lessons_file": "tasks/lessons.md",
    "research_dir": "docs/researches",
    "workstreams_dir": "tasks/workstreams",
    "contracts_dir": "tasks/contracts",
    "reviews_dir": "tasks/reviews",
    "notes_dir": "tasks/notes"
  },
  "reference_material": {
    "dir": "_ref",
    "mode": "external-ignored",
    "commit_policy": "never commit _ref contents",
    "rule": "use _ref as an occasional ignored external reference checkout cache for upstream/source comparison only; refresh from external sources instead of editing as product code; when it influences a decision, cite the source repo plus commit/tag and path in tasks/notes/ or docs/researches/"
  },
  "operations": {
    "dir": "deploy",
    "private_dir": "_ops",
    "tracked": ["deploy/README.md", "deploy/scripts/", "deploy/submissions/", "deploy/runbooks/", "deploy/release-checklists/", "deploy/sql/", "deploy/*.md", "deploy/env/.env.example"],
    "ignored": ["_ops/"],
    "rule": "commit deployment runbooks, submission materials, release checklists, helper scripts, ordered SQL files, and env examples under deploy/; when operations.deploy_sql is absent, keep deploy SQL directly under deploy/sql/ with ordered4 names (4-digit ascending prefixes); when operations.deploy_sql is present, its roots, naming modes, and invariant_file are the sole alternate SQL-layout authority; keep keys, tokens, real env values, provider state, artifacts, logs, and scratch files in ignored _ops/ only"
  },
  "context": {
    "profile": "stable-root-progressive-subdir",
    "map_file": ".ai/context/context-map.json",
    "capability_registry_file": ".ai/context/capabilities.json",
    "capability_resolver": "repo-harness run capability-resolver",
    "capability_match_rule": "longest-prefix; same-length ambiguity fails",
    "functional_block_selector": {
      "script": "repo-harness run select-agent-context-blocks",
      "config_file": ".ai/context/agent-context-blocks.txt",
      "env": "REPO_HARNESS_CONTEXT_BLOCKS",
      "rule": "compatibility selector; capability registry is the source of truth"
    }
  },
  "harness": {
    "policy_file": ".ai/harness/policy.json",
    "checks_file": ".ai/harness/checks/latest.json",
    "handoff_file": ".ai/harness/handoff/current.md",
    "failure_log_file": ".ai/harness/failures/latest.jsonl",
    "events_file": ".ai/harness/events.jsonl",
    "architecture_events_file": ".ai/harness/architecture/events.jsonl",
    "runs_dir": ".ai/harness/runs",
    "helper_runtime_dir": "package:assets/templates/helpers",
    "helper_source": "package"
  },
  "architecture": {
    "index_file": "docs/architecture/index.md",
    "requests_dir": "docs/architecture/requests",
    "snapshots_dir": "docs/architecture/snapshots",
    "diagrams_dir": "docs/architecture/diagrams",
    "domains_dir": "docs/architecture/domains",
    "modules_dir": "docs/architecture/modules",
    "diagram_skill": "mermaid",
    "diagram_skill_source": "~/.codex/skills/mermaid",
    "vendoring_policy": "do-not-vendor-diagram-skill-assets",
    "freshness_gate": "advisory",
    "gate_min_severity": "medium",
    "pending_card_scope": "capability",
    "pending_block_begin": "<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->",
    "pending_block_end": "<!-- END ARCHITECTURE PENDING REQUESTS -->",
    "queue_script": "repo-harness run architecture-queue",
    "contract_block_begin": "<!-- BEGIN ARCHITECTURE CONTRACT -->",
    "contract_block_end": "<!-- END ARCHITECTURE CONTRACT -->",
    "rule": "hooks record architecture queue cards and sync controlled local context blocks; agents author semantic snapshots and diagrams"
  },
  "workstreams": {
    "dir": "tasks/workstreams",
    "scope": "capability",
    "projection": "local-contract-active-pointer-and-current-slice",
    "todo_projection": "tasks/todos.md",
    "rule": "durable multi-session progress lives under tasks/workstreams/<domain>/<capability>; current plan execution lives in the plan Task Breakdown; tasks/todos.md records deferred goals only"
  },
  "information_lifecycle": {
    "notes": {
      "dir": "tasks/notes",
      "purpose": "task-local implementation decisions, deviations, tradeoffs, and open questions",
      "promotion": "archive on workflow close; promote only repeated or durable findings"
    },
    "evidence": {
      "latest": ".ai/harness/checks/latest.json",
      "snapshots_dir": ".ai/harness/runs",
      "cache_globs": [".ai/harness/checks/*.latest.json", ".ai/harness/checks/*.latest.md"],
      "purpose": "raw verification records used to audit notes, reviews, and future promotion; checks latest reports and run snapshots are ignored runtime cache unless distilled into reviews, contracts, notes, or research"
    },
    "assets": {
      "sources": [".ai/harness/policy.json", ".ai/harness/workflow-contract.json", ".ai/hooks/", "package:assets/templates/helpers", "docs/reference-configs/"],
      "promotion_rule": "only promote patterns after verified reuse across tasks or fixtures"
    },
    "memory": {
      "sources": ["docs/researches/", "tasks/lessons.md"],
      "rule": "memory is advisory; current repo state and evidence override summaries"
    },
    "external_knowledge": {
      "mode": "manual-opt-in",
      "default_brain_path": "brain/<project>/*",
      "project_path": "brain/<project>/*",
      "manifest_file": ".ai/harness/brain-manifest.json",
      "sync_script": "repo-harness run sync-brain-docs",
      "rule": "external knowledge stores long-lived explanations, runbooks, and patterns only; repo-local contracts, hooks, scripts, checks, and evidence remain authoritative",
      "sync_rule": "external sync and drift checks are operator-invoked only; hooks and workflow verification never read, write, or gate on external vault state"
    }
  },
  "handoff_resume": {
    "resume_packet_file": ".ai/harness/handoff/resume.md",
    "global_handoff_dir": "~/.codex/handoffs",
    "auto_start_new_session": false
  },
  "plan_capture": {
    "script": "repo-harness run capture-plan",
    "sources": ["codex-plan-mode", "waza-think", "repo-harness-plan"],
    "rule": "Codex Plan mode and Waza think planning should capture decision-complete work-package plans into plans/plan-*.md only when Artifact Level is work-package and the Promotion Gate is concrete; implementation approval then projects the active approved work-package plan through repo-harness run plan-to-todo; checklist-row and inline sprint work stay in the sprint backlog or active plan Task Breakdown"
  },
  "planning": {
    "pending_orchestration_file": ".ai/harness/planning/pending.json",
    "source_of_truth": "transient host planning bridge only; plans/ and .ai/harness/active-plan remain authoritative"
  },
  "guards": {
    "edit_plan_gate": "enforce",
    "edit_plan_gate_modes": ["enforce", "advice", "off"],
    "rule": "pre-edit-guard blocks implementation edits (non-workflow paths) unless an active plan is Approved/Executing; prompt-layer plan gates are advisory routing only"
  },
  "circuit_breakers": {
    "guard_repeat": 2,
    "review": { "lite": 1, "standard": 1, "strict": 2 },
    "subagents": { "default": 2, "strict_explicit_contract": 3 },
    "repair_loops": 2,
    "cross_model_consults_default": 0
  },
  "delegation": {
    "mode": "explicit",
    "max_agents": 2,
    "strict_max_agents": 3,
    "max_depth": 1,
    "allow_parallel_writers": false,
    "stop_fallback": true,
    "state_file": ".ai/harness/delegation/latest.json",
    "preferred_runners": ["subagent", "codex-subagent", "codex-exec", "main-thread"],
    "fallback_runner": "main-thread",
    "brief_source": "tasks/contracts/<stem>.contract.md",
    "runner_rule": "the active task contract is the authoritative execution brief consumed by contract-run; native subagent (Claude) or codex-subagent (Codex's own native subagent) is an optional parallelism accelerator, preferred first per host. Degrade to codex-exec, then sequential main-thread, on the SAME contract when spawn is unavailable, sandboxed, or unreliable. Runner-availability fallback MUST be recorded in the contract-run manifest and MUST NOT silently succeed; it is a runner-availability fallback, not a product-semantics compatibility fallback.",
    "rule": "UserPromptSubmit.delegation only injects bounded subagent context after explicit user authorization such as /delegate, /parallel, spawn subagents, or parallel investigation, regardless of delegation.mode. When delegation.mode resolves to \"auto\", session-start-context.sh instead injects one standing bounded-delegation authorization block at SessionStart (Codex host only) for the whole session; UserPromptSubmit.delegation does not re-assert it on later prompts. The global ~/.repo-harness/config.json delegation.mode value, when exactly \"auto\" or \"explicit\", takes precedence over this repo policy value when resolving that SessionStart mode."
  },
  "sidecar_research": {
    "default": true,
    "output_dir": "docs/researches",
    "preferred_runners": ["subagent", "codex exec --json", "main-thread trace"],
    "spawn_decision": "main agent decides from task breadth, context impact, raw-log volume, and callable runner availability; do not ask the user for spawn confirmation",
    "fallback_runner": "main-thread trace",
    "main_thread_policy": "if spawning is not worthwhile or no sidecar runner is callable, perform bounded research in the main thread; consume conclusions and evidence paths, not raw logs"
  },
  "documentation": {
    "profile": "minimal-agentic",
    "required": ["docs/spec.md", "docs/architecture/index.md"],
    "on_demand": ["docs/brief.md", "docs/tech-stack.md", "docs/decisions.md", "docs/architecture.md", "docs/packages.md"],
    "reference_configs": ["harness-overview.md", "agentic-development-flow.md", "external-tooling.md", "sprint-contracts.md", "handoff-protocol.md", "document-generation.md", "global-working-rules.md"],
    "reference_source": "user-level-runtime-docs",
    "reference_stub_marker": "<!-- repo-harness: reference-config-stub v1 -->",
    "reference_resolver": "repo-harness docs path <doc-id>",
    "rule": "create optional docs only when the agent has concrete repo evidence or the user asks; docs/reference-configs contains repo-local pointer stubs while full generic runtime docs live in the user-level/package repo-harness install"
  },
  "lsp_profiles": {
    "default": "typescript-lsp",
    "selection": "functional-block-first",
    "rule": "use block-level LSP/tooling hints before broad repo assumptions"
  },
  "worktree_strategy": {
    "auto_on_conflict": true,
    "auto_for_contract_tasks": true,
    "branch_prefix": "codex/",
    "base_branch": "main",
    "worktree_dir_template": "../{{repo}}-wt-{{slug}}",
    "start_script": "repo-harness run contract-worktree start --plan <plan-file>",
    "finish_script": "repo-harness run contract-worktree finish",
    "cleanup_script": "repo-harness run contract-worktree cleanup --slug <slug>",
    "conflict_signals": [
      "dirty_worktree_overlaps_task_files",
      "current_branch_not_suitable_for_task",
      "existing_changes_unrelated_but_would_block_review",
      "task_requires_clean_validation_surface"
    ],
    "validation_route": "waza:check",
    "merge_back": {
      "target": "main",
      "requires_clean_check": true,
      "preserve_unrelated_changes": true
    }
  },
  "upgrade": {
    "strategy_version": 1,
    "supported_legacy_versions": ["pre-tasks-first", "tasks-first-without-contract-manifest", "current-v1"],
    "action_classes": {
      "preserve": "keep user-authored hooks, ignored reference material, private operations state, secrets, and local env files unchanged",
      "archive": "move user-authored legacy workflow documents or checklists into archive/research surfaces before refresh",
      "reconfigure": "merge managed config defaults without overwriting explicit repo overrides",
      "remove": "delete only workflow-contract actions marked ownership=known_generated"
    },
    "cleanup": {
      "source": ".ai/harness/workflow-contract.json#migrations.upgrade.actions",
      "remove_only_ownership": "known_generated",
      "unknown_files": "preserve-or-archive",
      "custom_hooks": "preserve",
      "ignored_reference_material": "preserve",
      "local_operations_state": "preserve",
      "local_secrets": "preserve"
    },
    "reporting": {
      "inspector_field": "upgrade_plan",
      "dry_run_required": true
    }
  },
  "profiles": {
    "orchestration": "shared-long-running-harness",
    "evaluation": "browser-qa",
    "handoff": "artifact-aware",
    "recovery": "hybrid",
    "state": "file-backed"
  },
  "external_tooling": {
    "routing": {
      "simple": "waza"
    },
    "hosts": [
      "claude-code",
      "codex"
    ],
    "mode": "agent-readiness-required",
    "detection": "init-migrate",
    "readiness_gate": "repo-harness run check-agent-tooling --host codex --strict-readiness",
    "waza": {
      "source_repo": "tw93/Waza",
      "source_url": "https://github.com/tw93/Waza.git",
      "managed_skills": ["think", "hunt", "check", "health"],
      "primary_host": "codex",
      "codex_primary_path": "~/.codex/skills",
      "staging_cache_path": "~/.agents/skills",
      "sync_mode": "stage-upstream-then-copy-to-codex",
      "host_drift_policy": "report-per-host-version-staging-and-upstream-drift"
    },
    "hai_stack": {
      "source_repo": "hylarucoder/hai-stack",
      "source_url": "https://github.com/hylarucoder/hai-stack.git",
      "managed_skills": ["geju"],
      "primary_host": "codex",
      "codex_primary_path": "~/.codex/skills",
      "staging_cache_path": "~/.agents/skills",
      "sync_mode": "stage-upstream-then-copy-to-codex",
      "host_drift_policy": "report-per-host-version-staging-and-upstream-drift"
    },
    "agent_fleet": {
      "source": "package:agents/fleet",
      "managed_agents": ["explorer", "deep-reasoner", "fast-worker", "gatekeeper", "root-cause-prover", "harness-evaluator"],
      "claude_target": "~/.claude/agents",
      "codex_target": "~/.codex/agents",
      "codex_generation": "derive-toml-from-md",
      "install_mode": "advisory",
      "conflict_policy": "never-clobber-without-force",
      "install_command": "repo-harness run install-agent-fleet",
      "source_policy": "repo-owned-single-authority"
    },
    "codex_automation_profile": {
      "required_skills": ["health", "check", "mermaid"],
      "optional_skills": [],
      "mode": "codex-runtime-reference",
      "source": "~/.codex/skills",
      "routes": {
        "workflow_health": "waza:health",
        "review_gate": "waza:check",
        "architecture_diagram": "mermaid"
      },
      "vendoring_policy": "do-not-vendor-skill-body"
    },
    "diagram_design": {
      "skill_name": "mermaid",
      "primary_host": "codex",
      "codex_primary_path": "~/.codex/skills/mermaid",
      "sync_mode": "external-installed-skill",
      "vendoring_policy": "do-not-vendor"
    },
    "codegraph": {
      "package": "@colbymchenry/codegraph",
      "primary_host": "both",
      "install_mode": "target-aware-mcp",
      "codex_config_path": "~/.codex/config.toml",
      "claude_config_path": "~/.claude.json",
      "index_dir": ".codegraph",
      "readiness": "required-for-agent-code-navigation",
      "hook_policy": "do-not-block-hooks",
      "install_command": "bun add -g @colbymchenry/codegraph && repo-harness tools configure codegraph --target codex --location global",
      "project_init_command": "codegraph init -i .",
      "sync_command": "codegraph sync .",
      "vendoring_policy": "do-not-add-package-dependency"
    }
  },
  "agentic_development": {
    "routing": {
      "product_discovery": "parent-agent:geju",
      "complex_engineering_plan": "parent-agent:geju",
      "design_plan": "parent-agent:geju",
      "design_options_choice": "convention:design-options",
      "small_or_medium_plan": "waza:think",
      "bug_or_regression": "waza:hunt",
      "post_implementation_review": "waza:check"
    },
    "due_diligence": {
      "levels": ["P1_GLOBAL_ARCHITECTURE", "P2_DATA_FLOW_TRACE", "P3_DESIGN_DECISION"],
      "explicit_report_required_for": ["complex_engineering_plan", "hunt", "risky_refactor", "deployment", "auth_payment_data", "shared_contract"]
    }
  },
  "enforcement": {
    "worktree_guard": "warn-by-default",
    "verification_gate": "contract-and-review",
    "completion_requires_checks": true
  }
}
POLICY_EOF
  fi

  if [[ ! -f ".ai/harness/brain-manifest.json" ]]; then
    cat > ".ai/harness/brain-manifest.json" <<'BRAIN_MANIFEST_EOF'
{
  "version": 1,
  "project": "<project>",
  "mode": "repo-contract-external-knowledge",
  "default_brain_path": "brain/<project>/*",
  "rules": [
    "repo-local contracts, hooks, scripts, checks, and evidence remain authoritative",
    "default brain stores long-lived explanations, runbooks, decisions, references, and patterns",
    "external brain sync is manual opt-in; hooks and workflow checks do not read, write, or validate external vault state"
  ],
  "entries": []
}
BRAIN_MANIFEST_EOF
  fi

  if [[ ! -f ".ai/context/context-map.json" ]]; then
    cat > ".ai/context/context-map.json" <<'CONTEXT_EOF'
{
  "version": 1,
  "profile": "stable-root-progressive-subdir",
  "functional_block_selector": {
    "script": "repo-harness run select-agent-context-blocks",
    "config_file": ".ai/context/agent-context-blocks.txt",
    "env": "REPO_HARNESS_CONTEXT_BLOCKS",
    "rule": "compatibility selector; capability registry is the source of truth"
  },
  "lsp_profiles": {
    "default": "typescript-lsp",
    "selection": "functional-block-first"
  },
  "root_context_files": [
    "CLAUDE.md",
    "AGENTS.md",
    "docs/spec.md",
    "tasks/current.md",
    "tasks/todos.md",
    "tasks/lessons.md",
    ".ai/context/capabilities.json",
    ".ai/harness/policy.json"
  ],
  "discoverable_contexts": [
    {
      "path": "docs/reference-configs/*.md",
      "priority": "low",
      "char_budget": 900,
      "purpose": "deep-doc"
    },
    {
      "path": "tasks/workstreams/**/*.md",
      "priority": "high",
      "char_budget": 1200,
      "purpose": "capability-workstream"
    }
  ],
  "budgets": {
    "root_total_chars": 12000,
    "per_discoverable_file_chars": 1200
  }
}
CONTEXT_EOF
  fi
}

slug=""
title=""
new_plan=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --new-plan)
      new_plan=1
      shift
      ;;
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

ensure_templates
ensure_auxiliary_files
ensure_idle_todo
ensure_current_status_snapshot

active_plan="$(get_active_plan || true)"
if [[ -n "$active_plan" && "$new_plan" -eq 0 ]]; then
  echo "Workflow ready. Active plan: $active_plan"
  exit 0
fi

if [[ ! -f "docs/spec.md" ]]; then
  if [[ -f "$helper_dir/new-spec.sh" ]]; then
    bash "$helper_dir/new-spec.sh"
  fi
fi

if [[ -z "$slug" ]]; then
  if [[ "$new_plan" -eq 1 ]]; then
    echo "--new-plan requires --slug" >&2
    exit 1
  fi
  echo "Workflow ready. No active plan present."
  echo "Create one with: repo-harness run ensure-task-workflow --slug <slug> --title <title>"
  exit 0
fi

slug="$(normalize_slug "$slug")"
if [[ -z "$slug" ]]; then
  echo "Slug is empty after normalization" >&2
  exit 1
fi

if [[ -z "$title" ]]; then
  title="$slug"
fi

if [[ -f "$helper_dir/new-plan.sh" ]]; then
  bash "$helper_dir/new-plan.sh" --slug "$slug" --title "$title"
else
  echo "Missing packaged new-plan helper" >&2
  exit 1
fi
