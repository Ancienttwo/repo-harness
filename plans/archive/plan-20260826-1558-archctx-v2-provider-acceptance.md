# Plan: ArchContext v2 Provider Acceptance

> **Status**: Archived
> **Created**: 20260826-1558
> **Slug**: archctx-v2-provider-acceptance
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Published 0.4.5 exact-pin pre-write/reconcile/exactly-once acceptance
> **Rollback Surface**: Projection v2 contract, provider, orchestrator, tests
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260826-1558-archctx-v2-provider-acceptance.contract.md`
> **Task Review**: `tasks/reviews/20260826-1558-archctx-v2-provider-acceptance.review.md`
> **Implementation Notes**: `tasks/notes/20260826-1558-archctx-v2-provider-acceptance.notes.md`

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

- Active plan: `plans/plan-20260826-1558-archctx-v2-provider-acceptance.md`
- Sprint contract: `tasks/contracts/20260826-1558-archctx-v2-provider-acceptance.contract.md`
- Sprint review: `tasks/reviews/20260826-1558-archctx-v2-provider-acceptance.review.md`
- Implementation notes: `tasks/notes/20260826-1558-archctx-v2-provider-acceptance.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260826-1558-archctx-v2-provider-acceptance.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260826-1558-archctx-v2-provider-acceptance.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260826-1558-archctx-v2-provider-acceptance.md`.

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
- Contract file: `tasks/contracts/20260826-1558-archctx-v2-provider-acceptance.contract.md`
- Review file: `tasks/reviews/20260826-1558-archctx-v2-provider-acceptance.review.md`
- Implementation notes file: `tasks/notes/20260826-1558-archctx-v2-provider-acceptance.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260826-1558-archctx-v2-provider-acceptance.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260826-1558-archctx-v2-provider-acceptance.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Projection v2 contract, provider, orchestrator, tests
- **Verification boundary**: Local pack pre-write/reconcile/exactly-once acceptance
- **Review/acceptance boundary**: `tasks/reviews/20260826-1558-archctx-v2-provider-acceptance.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260826-1558-archctx-v2-provider-acceptance.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260826-1558-archctx-v2-provider-acceptance.contract.md`, `tasks/reviews/20260826-1558-archctx-v2-provider-acceptance.review.md`, and `tasks/notes/20260826-1558-archctx-v2-provider-acceptance.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260826-1558-archctx-v2-provider-acceptance.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Projection v2 contract, provider, orchestrator, tests

## Captured Planning Output

## Objective

Integrate the ArchContext `archcontext.projection-result/v2` consumer contract in repo-harness and independently accept the unpublished local package. Preserve fail-closed pre-write snapshot validation, expose a typed post-write reconciliation observation, retry one durable apply receipt without replaying writes or Human acceptance, and deliver the original refresh signal exactly once.

## P1 Architecture Map

- `src/core/architecture/projection.ts` owns the strict v2 wire decoder, apply identity validation, and protocol feature handshake.
- `src/effects/architecture/archctx-provider.ts` owns package resolution, provider execution, signed result validation, disk snapshot observation, and the distinction between pre-write failure and committed-but-unreconciled apply.
- `src/effects/architecture/projection-orchestrator.ts` owns retry/receipt state and refresh delivery; it must not consume signals from `applied-reconcile-required`.
- `src/effects/architecture/refresh-consumer.ts` remains the exactly-once refresh action authority.
- Existing v1 projection results are rejected; no compatibility fallback is introduced.

## P2 Concrete Trace

1. Build a v1 request with an exact current snapshot and optional accepted change.
2. Execute package-local ArchContext and strictly decode only projection-result/v2.
3. For ordinary results, require the signed output snapshot to match the provider's post-run disk snapshot.
4. For `applied-reconcile-required`, require a valid durable apply identity, require zero refresh signals, observe the exact post-run mismatch fields, and return the result plus a typed reconciliation diagnostic rather than throwing.
5. Retry with the same accepted change and a fresh expected snapshot. ArchContext reads the durable receipt instead of applying again; repo-harness consumes returned refresh signals through its existing idempotent refresh store.
6. A later retry returns `noop` with zero signals. A stale pre-write request remains an error and never enters reconciliation state.

## P3 Decision

Keep the signed ArchContext result immutable. Surface provider-local mismatch evidence through a typed diagnostic callback and durable drain status/error fields instead of adding unsigned fields to the wire result. The apply identity is sufficient for correlation; no upstream contract amendment is needed unless local-pack execution disproves this.

## Task Breakdown

- [x] Upgrade the strict projection result and capabilities contract to v2 with apply identity validation.
- [x] Teach the provider to admit only the bounded `applied-reconcile-required` post-check mismatch and emit typed diagnostics.
- [x] Teach orchestration and CLI status handling to preserve reconcile-pending state without consuming refresh signals.
- [x] Add focused provider/orchestrator tests for pre-write failure, reconcile-required, retry delivery, final noop, no second writes, and exactly-once refresh consumption.
- [x] Build/install the unpublished ArchContext tarball in a disposable consumer root and run the real provider acceptance path.
- [x] Run typecheck, focused tests, architecture/task sync checks, and record the acceptance verdict.
- [x] Pin the published `archctx` and `archctx-contracts` 0.4.5 packages, remove the local-overlay prerequisite, and rerun the package-local integration gate.

## Verification Boundary

The local package must prove: v1 rejection; v2 handshake; pre-write stale failure; `applied-reconcile-required` with durable identity and visible mismatch; retry with no second owned write or Human acceptance; original refresh signal exactly once; subsequent noop. Provider focused tests, orchestration tests, typecheck, and repository checks must pass.

## Rollback Surface

Revert the v2 core contract, provider diagnostic/reconciliation handling, orchestration status changes, focused tests, and workflow artifacts as one unit. No persistent migration is introduced in repo-harness.

## Out of Scope

Publishing repo-harness, altering selector semantics upstream, accepting projection-result/v1, suppressing concurrent mutation evidence, or changing refresh action semantics.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Upgrade the strict projection result and capabilities contract to v2 with apply identity validation.
- [x] Teach the provider to admit only the bounded `applied-reconcile-required` post-check mismatch and emit typed diagnostics.
- [x] Teach orchestration and CLI status handling to preserve reconcile-pending state without consuming refresh signals.
- [x] Add focused provider/orchestrator tests for pre-write failure, reconcile-required, retry delivery, final noop, no second writes, and exactly-once refresh consumption.
- [x] Build/install the unpublished ArchContext tarball in a disposable consumer root and run the real provider acceptance path.
- [x] Pin the published `archctx` and `archctx-contracts` 0.4.5 packages and run the package-local gate without an overlay.
- [x] Run typecheck, focused tests, architecture/task sync checks, and record the acceptance verdict.
