# Plan: Closeout Runner Guardrails

> **Status**: Executing
> **Created**: 20260716-0338
> **Slug**: closeout-runner-guardrails
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: user-approved 2026-07-16 CRG-01 diagnosis
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Timeout classification, descendant process-group cleanup, single verification ownership, linked-worktree serialization, focused runner regressions, type/boundary checks, and strict contract verification.
> **Rollback Surface**: Revert the single CRG-01 commit before merge; no data migration or public semantic compatibility surface.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md`
> **Task Review**: `tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md`
> **Implementation Notes**: `tasks/notes/20260716-0338-closeout-runner-guardrails.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: user-approved 2026-07-16 CRG-01 diagnosis
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260716-0338-closeout-runner-guardrails.md`
- Sprint contract: `tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md`
- Sprint review: `tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md`
- Implementation notes: `tasks/notes/20260716-0338-closeout-runner-guardrails.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260716-0338-closeout-runner-guardrails.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260716-0338-closeout-runner-guardrails.md`.

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
- Contract file: `tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md`
- Review file: `tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md`
- Implementation notes file: `tasks/notes/20260716-0338-closeout-runner-guardrails.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260716-0338-closeout-runner-guardrails.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single CRG-01 commit before merge; no data migration or public semantic compatibility surface.
- **Verification boundary**: Timeout classification, descendant process-group cleanup, single verification ownership, linked-worktree serialization, focused runner regressions, type/boundary checks, and strict contract verification.
- **Review/acceptance boundary**: `tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260716-0338-closeout-runner-guardrails.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260716-0338-closeout-runner-guardrails.contract.md`, `tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md`, and `tasks/notes/20260716-0338-closeout-runner-guardrails.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single CRG-01 commit before merge; no data migration or public semantic compatibility surface.

## Captured Planning Output

## Goal

Prevent closeout from producing false 120-second timeouts, escaped descendants,
duplicate release verification, or concurrent expensive runners across linked
worktrees.

## P1 Architecture Map

- `src/cli/commands/run.ts` dispatches bundled helpers through `runHelper`.
- `src/cli/runtime/helper-runner.ts` resolves helper identity and owns helper-class timeout selection.
- `src/effects/process-runner.ts` owns process creation, wall-clock timeout, output bounds, and descendant lifecycle.
- `scripts/verify-contract.sh` owns the inner fixed 600-second contract-verification budget.
- `scripts/verify-sprint.sh` consumes that verifier and publishes sprint evidence.
- `scripts/contract-worktree.sh finish` owns final verification before archive/merge.
- `scripts/ship-worktrees.sh` must delegate finish and must not verify independently.
- The Git common directory is the only shared authority across linked worktrees for an expensive-run lock.

## P2 Concrete Trace

Current failing path:

`repo-harness run verify-sprint` -> generic 120-second `runHelper` wrapper ->
`verify-sprint.sh` -> legal 600-second verifier -> outer timeout first -> false
failure and descendant escape risk. `ship-worktrees` then calls `verify-sprint`
before calling `contract-worktree finish`, which calls it again.

Target path:

helper identity selects a fixed outer budget -> one detached process group ->
timeout sends TERM then KILL to the group -> `contract-worktree finish` is the
only verification owner -> ship consumes its result -> a Git-common-dir
exclusive lock prevents a second release/benchmark lane from starting.

## P3 Design Decision

Preserve the ordinary 120-second helper default. Define explicit immutable
helper timeout classes: 720 seconds for `verify-contract` and `verify-sprint`,
900 seconds for `contract-worktree` and `ship-worktrees`. Make the process
runner own group termination. Remove only the duplicate ship verifier. Add one
fail-closed shared expensive-run lock at the Git common directory and use it at
the release/benchmark entrypoints without changing product semantics.

The single invariant is: one closeout has one verification owner, one bounded
process group, one helper-class budget, and one cross-worktree expensive lane.

## Allowed Scope

- `src/cli/commands/run.ts`
- `src/cli/runtime/helper-runner.ts`
- `src/effects/process-runner.ts`
- `scripts/contract-worktree.sh`
- `scripts/ship-worktrees.sh`
- `scripts/verify-sprint.sh`
- `scripts/run-harness-profile-benchmark.ts`
- a minimal shared runner-lock module/helper only if required by both real consumers
- mirrored packaged helper/contract assets required by repository parity
- focused tests for CLI runner, helper scripts, process lifecycle, and linked-worktree locking
- this plan's contract/review/notes/current/handoff workflow artifacts
- architecture/research documentation only when required by verified architecture drift

## Non-goals

- No Loop Semantics, Hook Runtime Diet, Evidence Ledger, Skill Surface, or old-test retirement changes.
- No CRG-02 review/freeze/evidence state machine.
- No benchmark matrix execution.
- No timeout configured by project policy or environment.
- No compatibility fallback or alternate legacy runner.
- No broad test cleanup or unrelated abstraction.

## Acceptance

- Ordinary helpers retain a fixed 120-second default.
- `verify-contract` and `verify-sprint` resolve to 720 seconds.
- `contract-worktree` and `ship-worktrees` resolve to 900 seconds.
- A short-timeout descendant sentinel proves the outer runner kills the whole process group using TERM then KILL.
- One ship path can emit `Sprint verification passed` only once because only `contract-worktree finish` invokes the verifier.
- Concurrent linked-worktree contenders cannot both acquire the expensive-run lock; the lock lives under the Git common directory and fails closed on unsafe state.
- Release verification and benchmark execution release the lock after their
  owned process groups are absent; async benchmark signal cleanup keeps the
  token through TERM/grace/KILL and releases it only after active provider
  PGIDs drain.
- A signal delivered during a synchronous benchmark subprocess phase is
  observed only after that subprocess returns; abnormal owner death preserves
  the non-reclaimable token for manual recovery instead of reopening the lane.
- Source and packaged helper mirrors remain synchronized.
- Focused tests, type/boundary checks, strict contract verification, review, PR checks, merge, and exact remote-main readback pass.

## Verification Strategy

Use short fake helpers and sentinel descendants; do not wait for real 10-minute
timeouts. Run focused unit/integration tests first, then type and repository
boundary/parity checks. Do not run 3x9 benchmark. Cap each fail-fix-reverify
issue at three rounds.

## Task Breakdown

- [x] Freeze helper timeout classes and outer process-group lifecycle with focused regressions.
- [x] Make `contract-worktree finish` the only ship verification owner and prove one invocation.
- [x] Serialize expensive release/benchmark entrypoints through a Git-common-dir exclusive lock with linked-worktree regression.
- [x] Synchronize packaged mirrors and required architecture/workflow artifacts.
- [ ] Run focused checks, bounded review, strict closeout, commit/push/PR/checks/merge, and report exact `origin/main` SHA. (Checks/review/commit/push/PR done as of 2026-07-18, Round 4 independent Claude gatekeeper substitution for an unavailable Codex CLI, user-authorized manual push bypassing `scripts/ship-worktrees.sh`'s canonical gate -- see `tasks/reviews/20260716-0338-closeout-runner-guardrails.review.md`. Merge and final `origin/main` SHA pending CI + human confirmation on the PR.)

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
