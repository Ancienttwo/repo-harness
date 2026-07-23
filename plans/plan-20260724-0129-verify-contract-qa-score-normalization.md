# Plan: Verify-contract QA score dimension normalization

> **Status**: Executing
> **Created**: 20260724-0129
> **Slug**: verify-contract-qa-score-normalization
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: A regression fixture must prove snake_case qa_scores dimensions match human Scorecard labels in both source and packaged helper copies.
> **Rollback Surface**: Before execution remove `plans/plan-20260724-0129-verify-contract-qa-score-normalization.md`; after execution revert branch `codex/verify-contract-qa-score-normalization` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260724-0129-verify-contract-qa-score-normalization.contract.md`
> **Task Review**: `tasks/reviews/20260724-0129-verify-contract-qa-score-normalization.review.md`
> **Implementation Notes**: `tasks/notes/20260724-0129-verify-contract-qa-score-normalization.notes.md`

## Agentic Routing
- Selected route: bugfix
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260724-0129-verify-contract-qa-score-normalization.md`
- Sprint contract: `tasks/contracts/20260724-0129-verify-contract-qa-score-normalization.contract.md`
- Sprint review: `tasks/reviews/20260724-0129-verify-contract-qa-score-normalization.review.md`
- Implementation notes: `tasks/notes/20260724-0129-verify-contract-qa-score-normalization.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260724-0129-verify-contract-qa-score-normalization.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260724-0129-verify-contract-qa-score-normalization.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260724-0129-verify-contract-qa-score-normalization.md`.

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
- Contract file: `tasks/contracts/20260724-0129-verify-contract-qa-score-normalization.contract.md`
- Review file: `tasks/reviews/20260724-0129-verify-contract-qa-score-normalization.review.md`
- Implementation notes file: `tasks/notes/20260724-0129-verify-contract-qa-score-normalization.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260724-0129-verify-contract-qa-score-normalization.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260724-0129-verify-contract-qa-score-normalization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260724-0129-verify-contract-qa-score-normalization.md`; after execution revert branch `codex/verify-contract-qa-score-normalization` or the explicitly reviewed diff.
- **Verification boundary**: A regression fixture must prove snake_case qa_scores dimensions match human Scorecard labels in both source and packaged helper copies.
- **Review/acceptance boundary**: `tasks/reviews/20260724-0129-verify-contract-qa-score-normalization.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260724-0129-verify-contract-qa-score-normalization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260724-0129-verify-contract-qa-score-normalization.contract.md`, `tasks/reviews/20260724-0129-verify-contract-qa-score-normalization.review.md`, and `tasks/notes/20260724-0129-verify-contract-qa-score-normalization.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260724-0129-verify-contract-qa-score-normalization.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260724-0129-verify-contract-qa-score-normalization.md`; after execution revert branch `codex/verify-contract-qa-score-normalization` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

Make `verify-contract` resolve `qa_scores.dimension: code_quality` against a review Scorecard row named `Code quality` instead of reporting a valid score as missing.

## Confirmed Root Cause

`review_score()` lowercases both values but does not canonicalize underscores and whitespace to the same representation, so `code_quality` and `Code quality` cannot compare equal.

## In Scope

- Reproduce the current silent mismatch with a focused verifier fixture.
- Normalize only the QA score dimension label comparison in the authoritative helper and its packaged mirror.
- Add a regression test that fails on the current implementation and passes after the fix.
- Remove the fulfilled deferred-goal row from `tasks/todos.md`, while preserving the already verified ledger cleanup currently in the worktree.

## Out of Scope

- New QA dimensions or score semantics.
- Compatibility aliases, fuzzy matching, or heuristic label inference.
- Changes to unrelated verifier gates, plan-status handling, or other deferred goals.

## Allowed Paths

- `scripts/verify-contract.sh`
- `assets/templates/helpers/verify-contract.sh`
- `tests/helper-scripts.test.ts`
- `tasks/todos.md`
- Generated active-plan/current-status workflow projections required by the harness.

## Verification

- A pre-fix focused test or fixture demonstrates that `code_quality` is currently unenforced.
- Focused helper tests pass after the fix.
- Source and packaged helper copies remain byte-identical.
- `repo-harness run check-task-workflow --strict` passes.
- `bash scripts/check-task-sync.sh` passes.
- `git diff --check` passes.

## Task Breakdown

- [x] Capture deterministic pre-fix failure evidence.
- [x] Implement one canonical label normalization in both helper copies.
- [x] Add and pass the regression guard.
- [x] Remove the fulfilled deferred row and verify workflow consistency.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture deterministic pre-fix failure evidence.
- [x] Implement one canonical label normalization in both helper copies.
- [x] Add and pass the regression guard.
- [x] Remove the fulfilled deferred row and verify workflow consistency.
