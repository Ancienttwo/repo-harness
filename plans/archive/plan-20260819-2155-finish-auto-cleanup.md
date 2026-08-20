# Plan: finish 尾部自动清理已合并 contract worktree

> **Status**: Archived
> **Created**: 20260819-2155
> **Slug**: finish-auto-cleanup
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260819-2155-finish-auto-cleanup.md`; after execution revert branch `codex/finish-auto-cleanup` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md`
> **Task Review**: `tasks/reviews/20260819-2155-finish-auto-cleanup.review.md`
> **Implementation Notes**: `tasks/notes/20260819-2155-finish-auto-cleanup.notes.md`

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

- Active plan: `plans/plan-20260819-2155-finish-auto-cleanup.md`
- Sprint contract: `tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md`
- Sprint review: `tasks/reviews/20260819-2155-finish-auto-cleanup.review.md`
- Implementation notes: `tasks/notes/20260819-2155-finish-auto-cleanup.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260819-2155-finish-auto-cleanup.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260819-2155-finish-auto-cleanup.md`.

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
- Contract file: `tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md`
- Review file: `tasks/reviews/20260819-2155-finish-auto-cleanup.review.md`
- Implementation notes file: `tasks/notes/20260819-2155-finish-auto-cleanup.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260819-2155-finish-auto-cleanup.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260819-2155-finish-auto-cleanup.md`; after execution revert branch `codex/finish-auto-cleanup` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260819-2155-finish-auto-cleanup.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260819-2155-finish-auto-cleanup.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260819-2155-finish-auto-cleanup.contract.md`, `tasks/reviews/20260819-2155-finish-auto-cleanup.review.md`, and `tasks/notes/20260819-2155-finish-auto-cleanup.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260819-2155-finish-auto-cleanup.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260819-2155-finish-auto-cleanup.md`; after execution revert branch `codex/finish-auto-cleanup` or the explicitly reviewed diff.

## Captured Planning Output

## Problem

Contract worktrees accumulate on disk (12 stale worktrees, ~3.7GB observed) because the fail-closed `cleanup --slug` path exists but nothing triggers it after a successful `finish --merge`.

## Decision

Wire an automatic cleanup attempt into the tail of `finish_worktree` (after `finish_transaction_commit` + `sprint_lease_reconcile_after_publication`), invoked as a subprocess with cwd and `REPO_HARNESS_TARGET_REPO_ROOT` set to the target primary worktree. Cleanup failure degrades to a manual-command hint and never changes finish's exit code. `--no-merge` paths untouched. No policy knob.

## Task Breakdown

- [x] `scripts/contract-worktree.sh` finish tail: attempt cleanup, degrade to hint on refusal
- [x] Mirror byte-identical into `assets/templates/helpers/contract-worktree.sh`
- [x] Adapt `tests/contract-worktree-single-publication.test.ts` (read sourceHead from `Source-Worktree-Head:` trailer; run git calls from primary)
- [x] Adapt `tests/continuation-conformance.test.ts:846` (capture ledger evidence before finish or assert against published tree)
- [x] Add regression test: after `finish --merge`, worktree dir + `codex/<slug>` branch + `.ai/harness/worktrees/<slug>.json` are gone; refused cleanup keeps exit 0

## Verification

- `bun test tests/contract-worktree-*.test.ts tests/continuation-conformance.test.ts tests/helper-scripts.test.ts`
- `cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh`
- `bash -n scripts/contract-worktree.sh`

## Rollback

Single revert of the two-script edit plus test adaptations; no data migration, no config change.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `scripts/contract-worktree.sh` finish tail: attempt cleanup, degrade to hint on refusal
- [x] Mirror byte-identical into `assets/templates/helpers/contract-worktree.sh`
- [x] Adapt `tests/contract-worktree-single-publication.test.ts` (read sourceHead from `Source-Worktree-Head:` trailer; run git calls from primary)
- [x] Adapt `tests/continuation-conformance.test.ts:846` (capture ledger evidence before finish or assert against published tree)
- [x] Add regression test: after `finish --merge`, worktree dir + `codex/<slug>` branch + `.ai/harness/worktrees/<slug>.json` are gone; refused cleanup keeps exit 0
