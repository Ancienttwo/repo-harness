# Plan: Raise whole-round verification budget to fit grown test suite

> **Status**: Archived
> **Created**: 20260805-1950
> **Slug**: verify-budget-1200s
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260805-1950-verify-budget-1200s.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260805-1950-verify-budget-1200s.md`; after execution revert branch `codex/verify-budget-1200s` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260805-1950-verify-budget-1200s.contract.md`
> **Task Review**: `tasks/reviews/20260805-1950-verify-budget-1200s.review.md`
> **Implementation Notes**: `tasks/notes/20260805-1950-verify-budget-1200s.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260805-1950-verify-budget-1200s.md`
- Sprint contract: `tasks/contracts/20260805-1950-verify-budget-1200s.contract.md`
- Sprint review: `tasks/reviews/20260805-1950-verify-budget-1200s.review.md`
- Implementation notes: `tasks/notes/20260805-1950-verify-budget-1200s.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260805-1950-verify-budget-1200s.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260805-1950-verify-budget-1200s.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260805-1950-verify-budget-1200s.md`.

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
- Contract file: `tasks/contracts/20260805-1950-verify-budget-1200s.contract.md`
- Review file: `tasks/reviews/20260805-1950-verify-budget-1200s.review.md`
- Implementation notes file: `tasks/notes/20260805-1950-verify-budget-1200s.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260805-1950-verify-budget-1200s.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260805-1950-verify-budget-1200s.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260805-1950-verify-budget-1200s.md`; after execution revert branch `codex/verify-budget-1200s` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260805-1950-verify-budget-1200s.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260805-1950-verify-budget-1200s.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260805-1950-verify-budget-1200s.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260805-1950-verify-budget-1200s.contract.md`, `tasks/reviews/20260805-1950-verify-budget-1200s.review.md`, and `tasks/notes/20260805-1950-verify-budget-1200s.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260805-1950-verify-budget-1200s.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260805-1950-verify-budget-1200s.md`; after execution revert branch `codex/verify-budget-1200s` or the explicitly reviewed diff.

## Captured Planning Output

## Problem

`scripts/verify-contract.sh:5` fixes `VERIFICATION_BUDGET_MS=600000` and `:635` applies it as a whole-round deadline (`started_ms + budget`). The repo's own required check `bun test` now runs 2202 tests at 498-597s measured (three deadline kills at 595-597s under ambient multi-agent load on 2026-08-05, run snapshots in `.ai/harness/runs/run-20260805T19*.json`), leaving no room for the remaining round items (smoke ~17s, check:type ~2-4s). Any code-change contract that includes `bun test` in `commands_succeed` — including the currently blocked hook-entry-single-file-bundle shipment — cannot complete verification.

## Decision

Raise the constant to `VERIFICATION_BUDGET_MS=1200000` (2× the worst measured full round). One line; the deadline semantics, fail-closed kills, and all other gate behavior stay unchanged. No env-override is added — the budget stays a fixed policy line in the gate, not a per-invocation knob, so it cannot be relaxed ad hoc to pass a failing round.

Rejected: env-overridable budget (gate erosion — any caller could raise it to pass); narrowing contract exit criteria (weakens acceptance); waiting for idle load (unbounded, and the budget stays arithmetically undersized for the grown suite).

## Task Breakdown

- [x] `scripts/verify-contract.sh:5`: `VERIFICATION_BUDGET_MS=600000` → `VERIFICATION_BUDGET_MS=1200000`
- [x] Verification: `bun run check:type` passes; `grep -q 'VERIFICATION_BUDGET_MS=1200000' scripts/verify-contract.sh` succeeds; `bash scripts/check-task-sync.sh` passes

## Verification

`bun run check:type`; `grep -q 'VERIFICATION_BUDGET_MS=1200000' scripts/verify-contract.sh`; `bash scripts/check-task-sync.sh`. Full-suite `bun test` is intentionally NOT in this contract's exit criteria: this change touches one shell constant, and requiring the full suite would recreate the exact deadlock this change removes.

## Rollback

Revert the single commit; the constant returns to 600000.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `scripts/verify-contract.sh:5`: `VERIFICATION_BUDGET_MS=600000` → `VERIFICATION_BUDGET_MS=1200000`
- [x] Verification: `bun run check:type` passes; `grep -q 'VERIFICATION_BUDGET_MS=1200000' scripts/verify-contract.sh` succeeds; `bash scripts/check-task-sync.sh` passes
