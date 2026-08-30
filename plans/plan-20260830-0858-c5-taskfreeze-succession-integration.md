# Plan: C5 TaskFreeze and explicit takeover succession integration

> **Status**: Executing
> **Created**: 20260830-0858
> **Slug**: c5-taskfreeze-succession-integration
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#6
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Full bun suite, tsc --noEmit, check-task-sync, check-task-workflow --strict and architecture-projection check all green; a dirty bound executor is refused succession until it freezes; the published handoff's bound_task context is derived from the persisted TaskFreezeReceiptV1 and moves zero delivery-plane bytes and no lease generation; a successor is granted write only after the existing release/takeover/acquire lifecycle; unresolvable or mismatching freeze refs fail closed; read-only Worker succession completes with adoption and no takeover
> **Rollback Surface**: Single revertable commit adding src/effects/collaboration/succession.ts plus its fixture and test; collaboration.mode=off leaves the publish path inert and no existing caller reaches the module
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260830-0858-c5-taskfreeze-succession-integration.contract.md`
> **Task Review**: `tasks/reviews/20260830-0858-c5-taskfreeze-succession-integration.review.md`
> **Implementation Notes**: `tasks/notes/20260830-0858-c5-taskfreeze-succession-integration.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#6
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260830-0858-c5-taskfreeze-succession-integration.md`
- Sprint contract: `tasks/contracts/20260830-0858-c5-taskfreeze-succession-integration.contract.md`
- Sprint review: `tasks/reviews/20260830-0858-c5-taskfreeze-succession-integration.review.md`
- Implementation notes: `tasks/notes/20260830-0858-c5-taskfreeze-succession-integration.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260830-0858-c5-taskfreeze-succession-integration.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260830-0858-c5-taskfreeze-succession-integration.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260830-0858-c5-taskfreeze-succession-integration.md`.

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
- Contract file: `tasks/contracts/20260830-0858-c5-taskfreeze-succession-integration.contract.md`
- Review file: `tasks/reviews/20260830-0858-c5-taskfreeze-succession-integration.review.md`
- Implementation notes file: `tasks/notes/20260830-0858-c5-taskfreeze-succession-integration.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260830-0858-c5-taskfreeze-succession-integration.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260830-0858-c5-taskfreeze-succession-integration.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revertable commit adding src/effects/collaboration/succession.ts plus its fixture and test; collaboration.mode=off leaves the publish path inert and no existing caller reaches the module
- **Verification boundary**: Full bun suite, tsc --noEmit, check-task-sync, check-task-workflow --strict and architecture-projection check all green; a dirty bound executor is refused succession until it freezes; the published handoff's bound_task context is derived from the persisted TaskFreezeReceiptV1 and moves zero delivery-plane bytes and no lease generation; a successor is granted write only after the existing release/takeover/acquire lifecycle; unresolvable or mismatching freeze refs fail closed; read-only Worker succession completes with adoption and no takeover
- **Review/acceptance boundary**: `tasks/reviews/20260830-0858-c5-taskfreeze-succession-integration.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260830-0858-c5-taskfreeze-succession-integration.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260830-0858-c5-taskfreeze-succession-integration.contract.md`, `tasks/reviews/20260830-0858-c5-taskfreeze-succession-integration.review.md`, and `tasks/notes/20260830-0858-c5-taskfreeze-succession-integration.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260830-0858-c5-taskfreeze-succession-integration.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revertable commit adding src/effects/collaboration/succession.ts plus its fixture and test; collaboration.mode=off leaves the publish path inert and no existing caller reaches the module

## Captured Planning Output

## P1 Map

C5 is an integration row. Every record family it needs already exists; what does
not exist is the join between them, and the join crosses the two planes C0's D1
froze.

- Collaboration plane (this row writes one new file): `src/effects/collaboration/`.
  `handoff-store.ts` (C3) publishes `WorkStateHandoffV1`; `adoption-store.ts`
  (C3) records non-exclusive `HandoffAdoptionReceiptV1`; `record-store.ts` (C3)
  owns the single destination authorizer `authorizeCollaborationDestination()`.
  `src/core/collaboration/handoff.ts` owns the `HandoffExecutionContextV1`
  discriminated union whose `bound_task` branch names
  `task_id / task_revision / claim_id / lease_generation / work_envelope_sha256 /
  task_freeze_receipt_sha256`.
- Delivery plane (this row reads, never writes): `src/core/engineers/task-freeze.ts`
  (`TaskFreezeReceiptV1`, `taskFreezeReceiptChangedFields()`),
  `src/effects/engineers/task-freeze-store.ts` (`inspectBoundTask`,
  `createTaskFreeze`, `readTaskFreezeReceipt`, `verifyTaskFreeze`),
  `src/effects/engineers/claim-actor-store.ts`
  (`listLiveClaimActorReceiptsForEngineer`),
  `src/effects/engineers/bound-task-rotation.ts`
  (`assertNoLiveClaimForBindingRotation`, error code `bound_task_active`),
  `src/core/state/coordination-identity.ts` (`releaseLeaseRecord`,
  `stealLeaseRecord`) and `src/effects/state/coordination-lease-store.ts`.
- The gap, precisely: nothing today cross-checks a handoff's `bound_task`
  execution context against the freeze receipt it names. `buildWorkStateHandoff()`
  validates the branch's *shape* — six well-formed refs — and stops there. A
  caller may state any syntactically valid `claim_id`, `lease_generation` and
  `task_freeze_receipt_sha256`, and the record validates, persists and reads back
  clean while pointing at a receipt that does not exist or describes different
  bytes. The successor then reconstructs a state that was never frozen.
- Out of scope: `CollaborationRunContextBindingV1` and the context-packet store
  reader (C6); CLI and MCP surfaces (C7); the Operator view (C8); any change to
  `common.ts` (C1 owns it); any second destination resolver (C4 forbids it); any
  new authority over Task, Lease, Publication or Acceptance.

## P2 Traced path

The bound-executor succession, end to end, as it will run:

```text
executor near exhaustion, worktree dirty, checks unverified
  -> inspectBoundTask(repo, engineer)            [read-only, double-read]
     disposition = freeze_required, reasons = [tracked_dirty, checks_unverified, ...]
  -> succession requested with no freeze receipt -> REFUSED
  -> createTaskFreeze(repo, engineer)            [writes one immutable receipt]
     receipt binds head/tree/diff/untracked/checks/hypotheses/worktree topology
  -> publishBoundTaskSuccessionHandoff(...)
       verifyTaskFreeze(repo, task_id, receipt_sha256)   -- receipt must still bind current state
       boundTaskExecutionContext(receipt)                -- context DERIVED from receipt, never declared
       publishWorkStateHandoff(... destination forwarded unchanged ...)
  -> lease bytes unchanged, claim bytes unchanged, generation unchanged
  -> releaseLeaseRecord(record, claim) -> state released      [existing lifecycle]
  -> stealLeaseRecord(record, {newClaimId, reason}) -> generation + 1   [existing takeover]
  -> successor publishes its own ClaimActorReceipt            [existing acquire evidence]
  -> assertSuccessorExecutionAuthority(repo, handoff, successor)
       live claim on the handoff's task_id, or REFUSED naming release/takeover/acquire
  -> resolveBoundTaskSuccession(repo, handoff)
       reads the named receipt, re-derives the context, compares field by field
       -> { handoff, freeze_receipt }  = knowledge + exact state, reconstructed
```

The read-only path is the same graph with one branch removed:

```text
Worker A hits budget -> WorkerResult + handoff (execution_context.kind = delegated_worker)
  -> handoff store -> adoption receipt -> Worker B continues
  -> handoffSuccessionRequirement(handoff) = knowledge_only
  -> no freeze receipt, no claim, no lease, no takeover
```

Type transformations crossed: `TaskFreezeReceiptV1` -> `HandoffExecutionContextV1`
(`bound_task` branch, one derivation site); `WorkStateHandoffV1` ->
`HandoffSuccessionRequirement` (pure classification);
`ClaimActorReceiptV1` -> `SuccessorExecutionAuthorityV1`.

Error paths, all fail-closed: an unresolvable receipt raises `TaskFreezeError`
`task_freeze_state_unavailable` from `readTaskFreezeReceipt()`; a receipt that no
longer binds current state raises `task_freeze_stale` from `verifyTaskFreeze()`;
a context whose fields disagree with the receipt raises `CollaborationError`
`collaboration_invalid`; a successor without a live Claim raises
`collaboration_invalid` naming the three lifecycle verbs.

## P3 Design decision

**Why the current shape exists.** `HandoffExecutionContextV1` is a discriminated
union rather than four nullable columns precisely so a branch either carries every
reference its kind needs or the record is invalid. That buys shape, not truth: C3
had no reader for the delivery plane, so it could not have checked resolvability
without importing the freeze store into the schema layer and inverting the
dependency the two-plane freeze depends on. C5 is the first row with both sides in
hand, so the cross-check belongs here and belongs in `effects`, next to the other
cross-plane adapter (`admission-bridge.ts`), not in `core`.

**Invariant preserved.** The collaboration plane writes zero delivery-plane bytes
and elects no successor. Every function this row adds either reads the delivery
plane or refuses; the only write is a `WorkStateHandoffV1` through the existing
C3 store, at the existing destination authorizer.

**Tradeoff taken.** `publishBoundTaskSuccessionHandoff()` *derives* the
`bound_task` context from the receipt instead of accepting one and validating it.
A validating signature would have been a smaller diff and would have let a caller
express the mismatch this row exists to prevent; the derived signature makes the
illegal record unrepresentable on the publish path. The read path still needs the
comparison, because a handoff persisted by any other route — including a future
row, or a hand-written record — must be provable at read time. So the comparison
exists once and is used from both sides.

**What fails first at 10x.** `resolveBoundTaskSuccession()` is one file read per
handoff. A projection that resolves a hundred bound-task handoffs pays a hundred
reads. That is C6's problem to batch when it builds the exchange snapshot, the
same way `listHandoffAdoptionReceipts()` already trades one shard scan for N
handoff reads; C5 has no list caller.

**No new abstraction beyond the join.** No new protocol constant, no new store,
no new record family, no second destination resolver, no successor field anywhere.
`TaskFreezeReceiptV1` gains nothing: succession is expressed by composing existing
records, which is the frozen three-way sentence stated as code.

## Task Breakdown

- [x] `src/effects/collaboration/succession.ts`: `handoffSuccessionRequirement()`,
      `boundTaskExecutionContext()`, `assertBoundTaskFrozenForSuccession()`,
      `publishBoundTaskSuccessionHandoff()`, `resolveBoundTaskSuccession()`,
      `assertSuccessorExecutionAuthority()`.
- [x] `tests/helpers/collaboration-succession-fixture.ts`: the three-actor
      collaboration repository plus a real bound task — persisted lease, claim
      actor receipt, exact WorkEnvelope, checks evidence — so `inspectBoundTask()`
      and `createTaskFreeze()` run against real Git state.
- [x] `tests/effects/collaboration-succession.test.ts`:
      (a) dirty executor refused before freeze, frozen, handoff published with the
      receipt-derived context, zero delivery-plane bytes moved, released, taken
      over through `stealLeaseRecord` at generation + 1, successor authority
      granted, handoff + receipt reconstruct the context;
      (b) adoption alone grants no write path — a non-owner adopter gets a receipt
      and is still refused by the succession gate and by `releaseLeaseRecord`'s
      claim check;
      (c) read-only Worker succession classified `knowledge_only`, completing with
      adoption and zero delivery-plane bytes and no freeze receipt;
      (d) a `bound_task` context whose receipt does not resolve, and one whose
      refs disagree with the receipt, both fail closed;
      plus: no successor field on `TaskFreezeReceiptV1`, handoff publication does
      not change lease generation, and the `bound_task_active` interaction with
      `assertNoLiveClaimForBindingRotation()`.
- [x] `tasks/workstreams/runtime-harness/collaboration/collaboration-substrate-program.md`:
      C5 closed, the delegated-worker adoption decision recorded, and how
      succession composes with C4's admission rounds.
- [x] `tasks/lessons.md`: the C4 sprint-backlog hand-edit correction.
- [ ] DEFERRED — Architecture: declare the succession surface on the capability
      node, accept the change if the projection classifies it major, render, and
      move the AXR7 pins in the same commit. The projection classified the change
      minor with no refresh signal, so nothing was declared; declaring
      `entrypoint.collaboration.succession` would require the internal-API
      acceptance route and is deferred to a separate architecture slice. Decision
      recorded in the "No architecture model change." bullet of
      `tasks/notes/20260830-0858-c5-taskfreeze-succession-integration.notes.md`.

## Acceptance

Dirty executor must freeze before succession is granted; handoff publication
moves zero Lease or Task bytes and no lease generation; a successor may write only
after the existing release / takeover / acquire lifecycle has granted it a live
Claim; a `bound_task` execution context whose freeze refs do not resolve or do not
match fails closed.

## Rollback

Delete `src/effects/collaboration/succession.ts` and its tests. Nothing else
depends on it, `collaboration.mode` is `off`, and no existing path calls into it.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `src/effects/collaboration/succession.ts`: `handoffSuccessionRequirement()`,
- [x] `tests/helpers/collaboration-succession-fixture.ts`: the three-actor
- [x] `tests/effects/collaboration-succession.test.ts`:
- [x] `tasks/workstreams/runtime-harness/collaboration/collaboration-substrate-program.md`:
- [x] `tasks/lessons.md`: the C4 sprint-backlog hand-edit correction.
- [ ] DEFERRED — Architecture: declare the succession surface on the capability
      node; see the "No architecture model change." bullet in
      `tasks/notes/20260830-0858-c5-taskfreeze-succession-integration.notes.md`.
