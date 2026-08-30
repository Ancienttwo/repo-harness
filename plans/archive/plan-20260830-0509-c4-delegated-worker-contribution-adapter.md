# Plan: C4 delegated Worker contribution adapter and admission bridge

> **Status**: Archived
> **Created**: 20260830-0509
> **Slug**: c4-delegated-worker-contribution-adapter
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#5
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Full bun suite, tsc --noEmit, check-task-sync, check-task-workflow --strict and architecture-projection check all green; three real parallel readers admitted and a fourth real request rejected at max_parallel_readers=3 by the bridge; completed and failed readers release their seat; reconciliation_required and unreadable readers fail closed; every persistence-boundary fault injection converges to one visible contribution commit, one WorkerResult and zero duplicate signals; an unparsable draft is a typed rejection that still persists a normal WorkerResult
> **Rollback Surface**: Single revertable commit adding src/core/collaboration/contribution.ts and admission.ts, src/effects/collaboration/admission-bridge.ts, provider-output-adapter.ts, contribution-store.ts and contribution-collector.ts plus their tests; collaboration.mode=off leaves every new write path inert and the existing delegation path unchanged
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260830-0509-c4-delegated-worker-contribution-adapter.contract.md`
> **Task Review**: `tasks/reviews/20260830-0509-c4-delegated-worker-contribution-adapter.review.md`
> **Implementation Notes**: `tasks/notes/20260830-0509-c4-delegated-worker-contribution-adapter.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#5
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md`
- Sprint contract: `tasks/contracts/20260830-0509-c4-delegated-worker-contribution-adapter.contract.md`
- Sprint review: `tasks/reviews/20260830-0509-c4-delegated-worker-contribution-adapter.review.md`
- Implementation notes: `tasks/notes/20260830-0509-c4-delegated-worker-contribution-adapter.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260830-0509-c4-delegated-worker-contribution-adapter.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md`.

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
- Contract file: `tasks/contracts/20260830-0509-c4-delegated-worker-contribution-adapter.contract.md`
- Review file: `tasks/reviews/20260830-0509-c4-delegated-worker-contribution-adapter.review.md`
- Implementation notes file: `tasks/notes/20260830-0509-c4-delegated-worker-contribution-adapter.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260830-0509-c4-delegated-worker-contribution-adapter.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revertable commit adding src/core/collaboration/contribution.ts and admission.ts, src/effects/collaboration/admission-bridge.ts, provider-output-adapter.ts, contribution-store.ts and contribution-collector.ts plus their tests; collaboration.mode=off leaves every new write path inert and the existing delegation path unchanged
- **Verification boundary**: Full bun suite, tsc --noEmit, check-task-sync, check-task-workflow --strict and architecture-projection check all green; three real parallel readers admitted and a fourth real request rejected at max_parallel_readers=3 by the bridge; completed and failed readers release their seat; reconciliation_required and unreadable readers fail closed; every persistence-boundary fault injection converges to one visible contribution commit, one WorkerResult and zero duplicate signals; an unparsable draft is a typed rejection that still persists a normal WorkerResult
- **Review/acceptance boundary**: `tasks/reviews/20260830-0509-c4-delegated-worker-contribution-adapter.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260830-0509-c4-delegated-worker-contribution-adapter.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260830-0509-c4-delegated-worker-contribution-adapter.contract.md`, `tasks/reviews/20260830-0509-c4-delegated-worker-contribution-adapter.review.md`, and `tasks/notes/20260830-0509-c4-delegated-worker-contribution-adapter.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260830-0509-c4-delegated-worker-contribution-adapter.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revertable commit adding src/core/collaboration/contribution.ts and admission.ts, src/effects/collaboration/admission-bridge.ts, provider-output-adapter.ts, contribution-store.ts and contribution-collector.ts plus their tests; collaboration.mode=off leaves every new write path inert and the existing delegation path unchanged

## Captured Planning Output

## P1 Map

Two planes, one direction (C0 D1). C4 lands the last two pieces of the
collaboration substrate that touch the delegation plane without writing it.

- Collaboration plane (this row writes): `src/core/collaboration/` schemas,
  `src/effects/collaboration/` stores. C1 froze `common.ts`; C2 owns projection;
  C3 owns handoff/adoption plus the shared `record-store.ts` / `actor.ts`
  substrate. C4 adds a contribution family and one admission bridge.
- Delegation plane (this row reads and pre-steps, never edits):
  `src/core/engineers/delegation.ts` (`DELEGATION_PROTOCOL = 1`, `max_turns = 1`,
  `WorkerResultV1`), `src/effects/engineers/delegated-run-store.ts`
  (`admitReadOnlyDelegation`, `prepareDelegatedRun`, `dispatchDelegatedRun`,
  `collectDelegatedRunResult`).
- Identity authorities read only: `profile-store.ts` (ModuleEngineerProfile and
  its `delegation_policy`), `binding-store.ts`, `principal-store.ts`,
  `claim-actor-store.ts`.
- Out of scope: CollaborationRunContextBinding and context-packet wiring (C6),
  CLI/MCP (C7), Operator surface (C8), succession/TaskFreeze (C5).

## P2 Traced path

Admission: caller hands the bridge a parent `ClaimActorReceiptV1`, a
`logical_role` and a `round_index`. The bridge resolves the parent engineer's
`ModuleEngineerProfileV1` through `loadEngineerProfile()`, re-reads the current
Binding and the Principal mapping, loads the tracked `LogicalRoleProfileV1`
through `loadLogicalReadOnlyRoleProfile()` (tracked-in-git plus exact read-only
TOML), checks the role is in `delegation_policy.allowed_roles`, then takes a lock
keyed on `(parent claim, round_index)` and enumerates every delegated run whose
envelope names that claim and whose intent names that round. Active states
(`intent_persisted`, `launch_claimed`, `running`, `collecting`) hold a seat;
`completed` and `failed` release it; `reconciliation_required`, an unreadable
reader and a reader whose immutable join fails all reject fail closed. Only when
`active < max_parallel_readers` does it call `admitReadOnlyDelegation()`
unchanged, inside the same lock.

Contribution: after `dispatchDelegatedRun()` reaches `completed`, the persisted
`CodexProcessReceiptV1` names the exact stdout blob. The collector reads that
blob through a versioned provider-output adapter, validates one
`CollaborationContributionDraftV1` in full, derives each signal and handoff id
from `WorkerRunRefV1.run_ref_sha256` plus the item index, publishes every
candidate immutably, then publishes exactly one
`CollaborationContributionCommitV1` as the sole visibility boundary, and finally
builds the single `WorkerResultV1` carrying the commit as an evidence ref.

Pressure point: every one of those writes can be interrupted, and the retry must
converge on one commit, one WorkerResult and zero duplicate signals. All three
identities are content-derived from the run, so a retry recomputes the same ids
and reconciles through the existing create-once `EEXIST` branch.

## P3 Decision rationale

- No `*_PROTOCOL` is minted. C1-C3 kept one `COLLABORATION_PROTOCOL` for the
  whole plane; a second constant would be a fabricated wire authority and a real
  `DELIBERATELY_EXCLUDED` edit for nothing. The closed inclusion scan stays true.
- The bridge is a new file. D7's negative proof exists precisely so the policy
  check cannot be smuggled into `admitReadOnlyDelegation()`, whose input shape
  stays byte-identical.
- The commit rides on `WorkerResultV1.evidence_refs`, whose `ref` is already a
  free printable string. No protocol bump, no `max_turns` change.
- The draft never carries an actor. The Host derives `delegated_worker` from the
  persisted `WorkerRunRefV1` and the admission receipt, so a Worker cannot name
  itself.

## Task Breakdown

- [ ] Resolve the carried D9 lock deviation and correct the false compliance
      comment at `src/effects/collaboration/record-store.ts:163-186`.
- [ ] Add `src/core/collaboration/contribution.ts`: draft and commit schemas,
      deterministic id derivation from run ref plus index.
- [ ] Add `src/core/collaboration/admission.ts`: the admission record and its
      closed decision-reason set matching C0 D6.
- [ ] Extend `src/effects/collaboration/actor.ts` with the Host-derived
      `delegated_worker` actor and move both stores onto one authorization union.
- [ ] Add `src/effects/collaboration/provider-output-adapter.ts`: versioned parse
      of the exact persisted stdout blob, typed rejection on failure.
- [ ] Add `src/effects/collaboration/admission-bridge.ts` implementing D5 and D6.
- [ ] Add `src/effects/collaboration/contribution-store.ts` and
      `contribution-collector.ts` with the full transaction.
- [ ] Tests: schemas, adapter rejection, the seven-boundary fault-injection
      matrix, the D6 decision table, and the real multi-process admission canary.
- [ ] Architecture: correct the capability node, accept the major change, render
      the projection, pin the AXR7 and e2e counts.
- [ ] Record the D9 deviation in the C0 freeze record ledger.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Resolve the carried D9 lock deviation and correct the false compliance
- [ ] Add `src/core/collaboration/contribution.ts`: draft and commit schemas,
- [ ] Add `src/core/collaboration/admission.ts`: the admission record and its
- [ ] Extend `src/effects/collaboration/actor.ts` with the Host-derived
- [ ] Add `src/effects/collaboration/provider-output-adapter.ts`: versioned parse
- [ ] Add `src/effects/collaboration/admission-bridge.ts` implementing D5 and D6.
- [ ] Add `src/effects/collaboration/contribution-store.ts` and
- [ ] Tests: schemas, adapter rejection, the seven-boundary fault-injection
- [ ] Architecture: correct the capability node, accept the major change, render
- [ ] Record the D9 deviation in the C0 freeze record ledger.
