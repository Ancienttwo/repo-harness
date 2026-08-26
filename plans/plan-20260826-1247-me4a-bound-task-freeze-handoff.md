# Plan: ME-4A Bound Task Freeze and Handoff

> **Status**: Approved
> **Created**: 20260826-1247
> **Slug**: me4a-bound-task-freeze-handoff
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Exact double-read freeze/refusal and stale-proof boundary
> **Rollback Surface**: Task-freeze core/effect/CLI plus active-Claim binding guard
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260826-1247-me4a-bound-task-freeze-handoff.contract.md`
> **Task Review**: `tasks/reviews/20260826-1247-me4a-bound-task-freeze-handoff.review.md`
> **Implementation Notes**: `tasks/notes/20260826-1247-me4a-bound-task-freeze-handoff.notes.md`

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

- Active plan: `plans/plan-20260826-1247-me4a-bound-task-freeze-handoff.md`
- Sprint contract: `tasks/contracts/20260826-1247-me4a-bound-task-freeze-handoff.contract.md`
- Sprint review: `tasks/reviews/20260826-1247-me4a-bound-task-freeze-handoff.review.md`
- Implementation notes: `tasks/notes/20260826-1247-me4a-bound-task-freeze-handoff.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260826-1247-me4a-bound-task-freeze-handoff.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260826-1247-me4a-bound-task-freeze-handoff.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260826-1247-me4a-bound-task-freeze-handoff.md`.

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
- Contract file: `tasks/contracts/20260826-1247-me4a-bound-task-freeze-handoff.contract.md`
- Review file: `tasks/reviews/20260826-1247-me4a-bound-task-freeze-handoff.review.md`
- Implementation notes file: `tasks/notes/20260826-1247-me4a-bound-task-freeze-handoff.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260826-1247-me4a-bound-task-freeze-handoff.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260826-1247-me4a-bound-task-freeze-handoff.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Task-freeze core/effect/CLI plus active-Claim binding guard
- **Verification boundary**: Exact double-read freeze/refusal and stale-proof boundary
- **Review/acceptance boundary**: `tasks/reviews/20260826-1247-me4a-bound-task-freeze-handoff.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260826-1247-me4a-bound-task-freeze-handoff.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260826-1247-me4a-bound-task-freeze-handoff.contract.md`, `tasks/reviews/20260826-1247-me4a-bound-task-freeze-handoff.review.md`, and `tasks/notes/20260826-1247-me4a-bound-task-freeze-handoff.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260826-1247-me4a-bound-task-freeze-handoff.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Task-freeze core/effect/CLI plus active-Claim binding guard

## Captured Planning Output

## Objective

Deliver ME-4A as an inspect/freeze/refusal control-plane slice. A current Engineer Binding with a live Claim can be inspected under exact Lease, ClaimActorReceipt, Binding, worktree and Git-state fences; unsafe rotation is refused and an immutable `TaskFreezeReceiptV1` may be persisted. No successor, content carrier, claim transfer or execution takeover is introduced.

## Architecture Map

- `src/core/engineers/task-freeze.ts` owns the closed receipt, observation and refusal schemas plus canonical hashing and stale comparison.
- `src/effects/engineers/task-freeze-store.ts` owns double-read observation, git-common immutable receipt persistence and revalidation.
- `src/effects/engineers/binding-store.ts` remains the sole Binding transition authority; it receives a fail-closed live-Claim guard so replace/retire cannot silently rotate a bound task.
- `src/cli/commands/engineer.ts` exposes only `engineer task-freeze inspect|create|verify`; no command or effect named takeover exists.
- Existing Lease, ClaimActorReceipt, EngineerBinding and Git remain the sole authorities. `.ai/harness/checks/latest.json` and task-local notes/handoff files are observation bytes only. ME-2B writer-grant authority is absent in this slice, so any observed grant must fail closed and P0 receipts carry null grant fields.

## Concrete Trace

1. Resolve a current Engineer Binding and its one live ClaimActorReceipt; reject zero/multiple/stale identities.
2. Under the existing task lock, read Lease raw bytes, ClaimActorReceipt canonical bytes, Binding current bytes, exact worktree topology/branch/unit, HEAD/tree, binary diff, untracked filename inventory, verification projection bytes and task-local hypothesis inventory.
3. Repeat the authoritative read. Any changed subject returns `changed_during_read`; no receipt is written.
4. Classify clean release eligibility. A live Claim always blocks Binding replace/retire until the existing explicit Lease release path completes; dirty/unverified work returns closed Human choices and never mutates Claim/Lease/Binding.
5. `create` persists canonical immutable receipt bytes under Git common dir with exclusive creation and directory fsync. `verify` reobserves all subjects and rejects stale receipts.

## Invariants

- Inspection and freeze never mutate Task, Lease, Claim, Binding, Publication or Acceptance bytes.
- `untracked_inventory_sha256` hashes only sorted filename/type metadata; it is explicitly not a content carrier.
- A missing/unreadable verification projection is unverified, not clean.
- Active writer grant support stays disabled until ME-2B; no local shadow grant registry is created.
- Existing identity and wire contracts remain intact; the new guard only removes the previously unsafe active-Claim Binding transition.

## Task Breakdown

- [ ] Approve the ME-4A PRD with the exact source and actor/refusal boundaries above.
- [ ] Implement closed canonical core schemas and focused unit tests.
- [ ] Implement double-read observation, immutable store, stale verification and active-Claim Binding guard.
- [ ] Add bounded CLI inspect/create/verify surfaces and prove no takeover command exists.
- [ ] Add ArchContext capability/module projection, contract/workstream evidence and closeout artifacts.
- [ ] Run focused tests, typecheck, required repository checks, full suite and independent acceptance/merge gates.

## Verification Boundary

Focused schema/store/CLI/binding-guard tests must prove dirty refusal, clean classification, changed-during-read rejection, immutable idempotency/conflict behavior, post-freeze staleness on every fenced subject, unchanged Lease/Binding bytes, and absence of takeover. The final frozen subject must pass typecheck, full `bun test --timeout 60000`, all root required checks, Architecture Acceptance when requested, and Protocol-2 external acceptance.

## Rollback Surface

Revert the new task-freeze core/effect/CLI/capability files and the narrow live-Claim guard in Binding transitions as one unit. No migration or persisted current pointer is introduced; immutable freeze receipts may remain unread historical evidence.

## Out of Scope

Successor election, untracked content transport, automatic release/reacquire, execution takeover, writable delegation, Parent freeze, Provider runtime changes, daemon/query loop, Publication/Acceptance mutation, and ME-4B/ME-2B.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Approve the ME-4A PRD with the exact source and actor/refusal boundaries above.
- [ ] Implement closed canonical core schemas and focused unit tests.
- [ ] Implement double-read observation, immutable store, stale verification and active-Claim Binding guard.
- [ ] Add bounded CLI inspect/create/verify surfaces and prove no takeover command exists.
- [ ] Add ArchContext capability/module projection, contract/workstream evidence and closeout artifacts.
- [ ] Run focused tests, typecheck, required repository checks, full suite and independent acceptance/merge gates.
