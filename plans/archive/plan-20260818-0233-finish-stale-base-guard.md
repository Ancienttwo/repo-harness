# Plan: Fail-closed stale-base guard for contract-worktree finish

> **Status**: Archived
> **Created**: 20260818-0233
> **Slug**: finish-stale-base-guard
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: regression test proving finish refuses when target advanced past fork point; both contract-worktree test files + check:helpers + full bun test green
> **Rollback Surface**: single revertable commit: one shell script + projection mirror + one test file
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0233-finish-stale-base-guard.contract.md`
> **Task Review**: `tasks/reviews/20260818-0233-finish-stale-base-guard.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0233-finish-stale-base-guard.notes.md`

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

- Active plan: `plans/plan-20260818-0233-finish-stale-base-guard.md`
- Sprint contract: `tasks/contracts/20260818-0233-finish-stale-base-guard.contract.md`
- Sprint review: `tasks/reviews/20260818-0233-finish-stale-base-guard.review.md`
- Implementation notes: `tasks/notes/20260818-0233-finish-stale-base-guard.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0233-finish-stale-base-guard.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0233-finish-stale-base-guard.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0233-finish-stale-base-guard.md`.

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
- Contract file: `tasks/contracts/20260818-0233-finish-stale-base-guard.contract.md`
- Review file: `tasks/reviews/20260818-0233-finish-stale-base-guard.review.md`
- Implementation notes file: `tasks/notes/20260818-0233-finish-stale-base-guard.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0233-finish-stale-base-guard.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0233-finish-stale-base-guard.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single revertable commit: one shell script + projection mirror + one test file
- **Verification boundary**: regression test proving finish refuses when target advanced past fork point; both contract-worktree test files + check:helpers + full bun test green
- **Review/acceptance boundary**: `tasks/reviews/20260818-0233-finish-stale-base-guard.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0233-finish-stale-base-guard.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0233-finish-stale-base-guard.contract.md`, `tasks/reviews/20260818-0233-finish-stale-base-guard.review.md`, and `tasks/notes/20260818-0233-finish-stale-base-guard.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0233-finish-stale-base-guard.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single revertable commit: one shell script + projection mirror + one test file

## Captured Planning Output

# Fail-closed stale-base guard for contract-worktree finish --merge

## Goal

Make `contract-worktree finish --merge` refuse publication when the target branch has advanced past the worktree's fork point, instead of silently overwriting the advanced content with a stale tree. Incident: publication `d2950ae7` (2026-08-18) reverted two parallel-session commits (`35346e39`, `e18937bd`) because the worktree forked at `1d1b702a`, main advanced before finish, and the synthesized commit's tree was byte-identical to the un-rebased lifecycle HEAD. Recovery required a manual restoration commit (`61b60e98`); lesson recorded in `tasks/lessons.md` (2026-08-18, "finish tree-replacement overwrite").

## Verified problem statement (explorer pass, 2026-08-18)

- `finish_worktree()` (`scripts/contract-worktree.sh:1335-1679`) never reads `.ai/harness/worktrees/<slug>.json` `base_commit`; `frozen_base_sha` comes from `refresh_and_freeze_base` (`:1313-1333`) which returns the target tip **at finish invocation time**.
- Existing guards only cover: dirty target (`:1455-1458` pre-journal, `:1616-1619` pre-publication) and target movement **during** finish (`:1447-1450`, `:1624-1627`, tested by `tests/contract-worktree-single-publication.test.ts:208-233`).
- No check exists that `frozen_base_sha` (current target tip) is reachable from the worktree branch — i.e. that the branch was forked from or rebased onto the current tip. `git commit-tree "$publication_tree" -p "$frozen_base_sha"` (`:1650/1654`) then parents a stale tree onto the new tip: a legal fast-forward that reverts content.
- Docs already claim the invariant: "The target base must remain frozen ... through publication" (`docs/reference-configs/sprint-contracts.md:221`); the code simply never enforced the fork-point half of it.

## Design decision

Guard by git ancestry, not by worktree metadata: `git merge-base --is-ancestor "$frozen_base_sha" "$current_branch"`. Semantics: target tip unchanged since fork → ancestor → pass; worktree properly rebased onto advanced tip → ancestor → pass; target advanced and worktree not rebased → not ancestor → refuse with an actionable message (rebase or restart, then re-run gates). Metadata `base_commit` stays what it is today — the scope-diff base for `verify-sprint` — and is not consulted here (it may be absent for legacy/fixture worktrees; ancestry is self-contained).

Two insertion points, both on already-tested cleanup paths:

1. Primary refusal inside the `merge_back` pre-flight block (`scripts/contract-worktree.sh:1452-1459`), immediately after the existing dirty-target check — claim lock is held, journal not yet begun, so `exit 1` cleans up via the existing `closeout_claim_on_exit` trap with zero residue.
2. Same-shape recheck next to the existing pre-publication freeze recheck (`:1616-1627`) to close the race window after gates run — refusal there rolls back via the existing `finish_transaction_abort` path.

Mirror the change into `assets/templates/helpers/contract-worktree.sh` via `bun run sync:helpers` (projection copy, kept in sync per CLAUDE.md).

## Explicitly out of scope (EXECUTION_BOUNDARY)

- NO changes to `worktree-merge-lib.sh` / `worktree_merge_mode` (cleanup-time authority, separate fulfilled lane).
- NO auto-rebase, NO metadata `base_commit` self-refresh, NO changes to `verify-sprint.sh` scope-diff logic, NO journal/transaction phase restructuring.
- Absent requirements are forbidden design space; unrequested extras fail closed.

## Task Breakdown

- [x] Add the stale-base ancestry guard at the pre-journal insertion point in `scripts/contract-worktree.sh` (after `:1455-1458` dirty-target check), with a clear refusal message naming the frozen base and the remedy.
- [x] Add the same-shape recheck at the pre-publication point (adjacent to `:1616-1627`).
- [x] Regression test in `tests/contract-worktree-single-publication.test.ts` following the `:208-233` case pattern: advance target (primary) with extra commits before calling finish on an un-rebased linked worktree; assert non-zero exit, guard message in stderr, target tip unchanged (not overwritten), linked worktree intact (zero side effects).
- [x] Positive-path check: the existing normal-publication case (`:173-206`) still passes (target unmoved → guard passes); a rebased-worktree scenario passes if cheap to add, otherwise assert via the unchanged existing cases.
- [x] Run `bun run sync:helpers` and commit the mirrored `assets/templates/helpers/contract-worktree.sh`.
- [x] Verify: `bun test tests/contract-worktree-single-publication.test.ts tests/contract-worktree-closeout-journal.test.ts`, `bun run check:helpers`, `bun run check:type`, full `bun test`.

## Verification boundary

New regression test fails on unfixed code (captured pre-fix artifact) and passes after; both contract-worktree test files green; `check:helpers` proves the projection copy is in sync; full `bun test` green.

## Rollback surface

Single revertable commit touching one shell script, its projection mirror, and one test file; no state files, schemas, or wire formats.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add the stale-base ancestry guard at the pre-journal insertion point in `scripts/contract-worktree.sh` (after `:1455-1458` dirty-target check), with a clear refusal message naming the frozen base and the remedy.
- [x] Add the same-shape recheck at the pre-publication point (adjacent to `:1616-1627`).
- [x] Regression test in `tests/contract-worktree-single-publication.test.ts` following the `:208-233` case pattern: advance target (primary) with extra commits before calling finish on an un-rebased linked worktree; assert non-zero exit, guard message in stderr, target tip unchanged (not overwritten), linked worktree intact (zero side effects).
- [x] Positive-path check: the existing normal-publication case (`:173-206`) still passes (target unmoved → guard passes); a rebased-worktree scenario passes if cheap to add, otherwise assert via the unchanged existing cases.
- [x] Run `bun run sync:helpers` and commit the mirrored `assets/templates/helpers/contract-worktree.sh`.
- [x] Verify: `bun test tests/contract-worktree-single-publication.test.ts tests/contract-worktree-closeout-journal.test.ts`, `bun run check:helpers`, `bun run check:type`, full `bun test`.
