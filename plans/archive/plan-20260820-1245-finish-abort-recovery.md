# Plan: Finish abort lease recovery

> **Status**: Archived
> **Created**: 20260820-1245
> **Slug**: finish-abort-recovery
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Pure transition, CLI mutation, normal failure, SIGKILL recover-abort, helper mirror, targeted tests, and root required checks
> **Rollback Surface**: Single codex/finish-abort-recovery worktree branch; one revert; no schema migration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-1245-finish-abort-recovery.contract.md`
> **Task Review**: `tasks/reviews/20260820-1245-finish-abort-recovery.review.md`
> **Implementation Notes**: `tasks/notes/20260820-1245-finish-abort-recovery.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260820-1245-finish-abort-recovery.md`
- Sprint contract: `tasks/contracts/20260820-1245-finish-abort-recovery.contract.md`
- Sprint review: `tasks/reviews/20260820-1245-finish-abort-recovery.review.md`
- Implementation notes: `tasks/notes/20260820-1245-finish-abort-recovery.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-1245-finish-abort-recovery.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-1245-finish-abort-recovery.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-1245-finish-abort-recovery.md`.

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
- Contract file: `tasks/contracts/20260820-1245-finish-abort-recovery.contract.md`
- Review file: `tasks/reviews/20260820-1245-finish-abort-recovery.review.md`
- Implementation notes file: `tasks/notes/20260820-1245-finish-abort-recovery.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-1245-finish-abort-recovery.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-1245-finish-abort-recovery.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single codex/finish-abort-recovery worktree branch; one revert; no schema migration
- **Verification boundary**: Pure transition, CLI mutation, normal failure, SIGKILL recover-abort, helper mirror, targeted tests, and root required checks
- **Review/acceptance boundary**: `tasks/reviews/20260820-1245-finish-abort-recovery.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-1245-finish-abort-recovery.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-1245-finish-abort-recovery.contract.md`, `tasks/reviews/20260820-1245-finish-abort-recovery.review.md`, and `tasks/notes/20260820-1245-finish-abort-recovery.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-1245-finish-abort-recovery.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single codex/finish-abort-recovery worktree branch; one revert; no schema migration

## Captured Planning Output

## Goal

Close the now-due WP1 residual `completing -> bound` finish-abort recovery gap without changing the approved no-lease completion behavior or the contract-row Mode policy.

## P1 · Architecture Map

- Canonical task/completion authority remains the target-ref Sprint row.
- Execution ownership remains the git-common-dir lease owner record.
- `src/core/state/coordination-identity.ts` owns pure lease transitions.
- `src/cli/commands/sprint.ts` owns locked mutation commands and canonical-row checks.
- `scripts/contract-worktree.sh` owns proof that a failed finish has not published, plus automatic and explicit abort recovery; its packaged helper mirror must remain byte-identical.
- Tests span pure transition, CLI mutation, and the existing whole-loop SIGKILL/recover-abort fixture.

## P2 · Concrete Trace

Current path: `contract-worktree finish` acquires its closeout claim, calls `sprint begin-completion`, and moves the lease to `completing` before verification. A normal pre-publication failure or explicit `recover abort` restores/abandons closeout state but never changes the lease, so another agent cannot steal it. The repaired path must prove publication did not land, then use the original claim and bound worktree to restore the lease to `bound`; publication-landed recovery must continue refusing abort.

## P3 · Decision

Add one narrow `sprint abort-completion` mutation. It is fenced by claim id, execution worktree, recorded target ref, per-task lock, and a canonical row that is still pending. The pure transition is idempotent for an already-restored `bound` lease and clears `finish_transaction_key`. Wire it into both automatic finish aborts and explicit pre-journal/journal `recover abort`. Do not add Mode gates, orphan cleanup, audit events, finish-journal reconcile, compatibility aliases, or unrelated refactors.

## Task Breakdown

- [x] Add a regression guard that fails on the current implementation and proves SIGKILL + `recover abort` restores the lease to `bound` for cross-agent takeover.
- [x] Add the pure `completing -> bound` transition and the fenced `sprint abort-completion` CLI command.
- [x] Integrate automatic pre-publication finish abort and explicit `recover abort`; keep publication-landed recovery fail-closed.
- [x] Mirror `contract-worktree.sh`, update the architecture/todo workflow projections required by the touched capability, and remove only this fulfilled clause from the WP1 residual ledger row.
- [x] Run targeted tests, CLI help/runtime checks, helper mirror checks, TypeScript check, full required checks, and final Waza `/check` review.

## Acceptance

- A failed or explicitly aborted pre-publication finish leaves its same lease `bound`, with the same claim/worktree and a null finish transaction key.
- A second agent can then use the existing explicit steal flow; stale tokens remain fenced.
- Abort refuses a mismatched claim, worktree, target ref, missing/renamed task, or canonical completed row.
- Publication-landed `recover reconcile` behavior is unchanged and no abort path reopens a completed task.
- Source/template helpers are byte-identical and all named verification passes.

## Verification

- `bun test tests/coordination-identity.test.ts tests/coordination-lease-store.test.ts tests/continuation-conformance.test.ts tests/contract-worktree-closeout-journal.test.ts`
- `bun run check:type`
- `cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh`
- `bun test`
- Root required checks from `AGENTS.md`

## Rollback

One isolated `codex/finish-abort-recovery` worktree/branch. Revert the single coherent change; no schema or data migration is introduced.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
