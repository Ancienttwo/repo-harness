# Plan: verify-sprint fails closed on a rebased contract worktree base_commit

> **Status**: Archived
> **Created**: 20260818-0347
> **Slug**: verify-sprint-rebase-base-guard
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md`; after execution revert branch `codex/verify-sprint-rebase-base-guard` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md`
> **Task Review**: `tasks/reviews/20260818-0347-verify-sprint-rebase-base-guard.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md`
- Sprint contract: `tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md`
- Sprint review: `tasks/reviews/20260818-0347-verify-sprint-rebase-base-guard.review.md`
- Implementation notes: `tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md`.

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
- Contract file: `tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md`
- Review file: `tasks/reviews/20260818-0347-verify-sprint-rebase-base-guard.review.md`
- Implementation notes file: `tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md`; after execution revert branch `codex/verify-sprint-rebase-base-guard` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260818-0347-verify-sprint-rebase-base-guard.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md`, `tasks/reviews/20260818-0347-verify-sprint-rebase-base-guard.review.md`, and `tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0347-verify-sprint-rebase-base-guard.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md`; after execution revert branch `codex/verify-sprint-rebase-base-guard` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

`verify-sprint` must fail closed when a contract worktree's recorded `base_commit` is no longer an ancestor of `HEAD`, instead of silently diffing against a base that left the branch during a rebase.

## Problem

`.ai/harness/worktrees/<slug>.json`'s `base_commit` is stored state, not derived. `git rebase` moves the branch but nothing refreshes that file. `contract_worktree_base_commit` (`scripts/verify-sprint.sh:221`) outranks `origin/main` inside `git_diff_base_ref` (`:261`) and only checks that the commit still exists (`:237`), never that it is on this branch. Every scope gate afterwards diffs from a commit that is no longer reachable, so the target branch's own commits are charged to this contract's `allowed_paths`.

Observed twice: `tasks/lessons.md` 2026-08-18 (20 unrelated files reported `outside`, `files_changed` 35 instead of 10) and again during the `finish-stale-base-guard` slice. Recorded as a deferred goal in `tasks/todos.md` row 22, whose stated minimum viable fix is "an ancestry check on `base_commit` before it is used as the diff base".

## Task Breakdown

- [ ] Add `assert_contract_worktree_base_is_ancestor` to `scripts/verify-sprint.sh`: read the recorded base, return early when absent, pass when `git merge-base --is-ancestor "$base_commit" HEAD` holds, otherwise print the stale base plus the refresh instruction and `exit 1`.
- [ ] Call it at top level immediately before `diff_base_ref` is computed. It cannot live inside `git_diff_base_ref` because every consumer reads through a `$(... || true)` substitution, where an in-function `exit` only unwinds the subshell.
- [ ] Mirror the identical change into `assets/templates/helpers/verify-sprint.sh`; the two files are byte-identical today and a projection check enforces that.
- [ ] Add `tests/verify-sprint-rebase-base-guard.test.ts`: build a throwaway repo, write worktree metadata pointing at a commit that is not an ancestor of `HEAD`, run the helper, assert non-zero exit and that stderr names the stale base.

## Non-goals

No `base_epoch`, no `previous_base_commit`, no `verification_invalidated` field, no self-refreshing metadata, and no automatic fallback to `origin/main`. Falling through to another base would be a silent semantic fallback; the ledger entry asks for fail-closed. Metadata refresh stays the operator's explicit action.

## Verification

- `bun test tests/verify-sprint-rebase-base-guard.test.ts`
- `bun test`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Add `assert_contract_worktree_base_is_ancestor` to `scripts/verify-sprint.sh`: read the recorded base, return early when absent, pass when `git merge-base --is-ancestor "$base_commit" HEAD` holds, otherwise print the stale base plus the refresh instruction and `exit 1`.
- [ ] Call it at top level immediately before `diff_base_ref` is computed. It cannot live inside `git_diff_base_ref` because every consumer reads through a `$(... || true)` substitution, where an in-function `exit` only unwinds the subshell.
- [ ] Mirror the identical change into `assets/templates/helpers/verify-sprint.sh`; the two files are byte-identical today and a projection check enforces that.
- [ ] Add `tests/verify-sprint-rebase-base-guard.test.ts`: build a throwaway repo, write worktree metadata pointing at a commit that is not an ancestor of `HEAD`, run the helper, assert non-zero exit and that stderr names the stale base.
