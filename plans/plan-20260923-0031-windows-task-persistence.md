# Plan: Windows persistence for Task reply authority

> **Status**: Executing
> **Created**: 20260923-0031
> **Slug**: windows-task-persistence
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260922-task-inbox-portable-paths.md
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Native Windows authority creation and delivery ACK reply with file-flush refusal evidence
> **Rollback Surface**: Code revert with unchanged canonical records and existing stores
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260923-0031-windows-task-persistence.contract.md`
> **Task Review**: `tasks/reviews/20260923-0031-windows-task-persistence.review.md`
> **Implementation Notes**: `tasks/notes/20260923-0031-windows-task-persistence.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: docs/researches/20260922-task-inbox-portable-paths.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260923-0031-windows-task-persistence.md`
- Sprint contract: `tasks/contracts/20260923-0031-windows-task-persistence.contract.md`
- Sprint review: `tasks/reviews/20260923-0031-windows-task-persistence.review.md`
- Implementation notes: `tasks/notes/20260923-0031-windows-task-persistence.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260923-0031-windows-task-persistence.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260923-0031-windows-task-persistence.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260923-0031-windows-task-persistence.md`.

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
- Contract file: `tasks/contracts/20260923-0031-windows-task-persistence.contract.md`
- Review file: `tasks/reviews/20260923-0031-windows-task-persistence.review.md`
- Implementation notes file: `tasks/notes/20260923-0031-windows-task-persistence.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260923-0031-windows-task-persistence.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260923-0031-windows-task-persistence.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Code revert with unchanged canonical records and existing stores
- **Verification boundary**: Native Windows authority creation and delivery ACK reply with file-flush refusal evidence
- **Review/acceptance boundary**: `tasks/reviews/20260923-0031-windows-task-persistence.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260923-0031-windows-task-persistence.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260923-0031-windows-task-persistence.contract.md`, `tasks/reviews/20260923-0031-windows-task-persistence.review.md`, and `tasks/notes/20260923-0031-windows-task-persistence.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260923-0031-windows-task-persistence.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Code revert with unchanged canonical records and existing stores

## Captured Planning Output

## Objective and authorization

The owner approved a separate repair of the Windows persistence blockers found in PR443 and then continuation of the whole refactor. Source baseline is49c5f9dcf90b3a0248d4fa78764554673b8db161. Execution is isolated in codex/windows-task-persistence at /Users/ancienttwo/Projects/repo-harness-wt-windows-task-persistence. Existing PR443 and other worktrees remain separate. No main merge, global installation, real data migration, Host admission, Campaign activation or canary.

## P1 Map

The real task-reply fixture constructs repository authority through bindEngineer -> enrollEngineerPrincipal -> createLeaseDirectory/writeLeaseOwnerDurably -> publishClaimActorReceipt -> send/consume/ACK/reply. The four persistence owners are binding-store, principal-store, coordination-lease-store and claim-actor-store. evidence/atomic-append already owns writable descriptor flushes. Task Inbox layout and checkpoint stores already implement explicit platform-specific directory flushing; they are not reasons to skip the real authority chain.

## P2 Trace and root cause

Windows job106819723526 in run35749499343 failed31 cases:30 reached binding-store directory fsync through withEngineerLock;1 reached coordination-lease-store through createLeaseDirectory. Both fsync read-only directory handles and throw EPERM before the intended assertions. Following the chain exposes the same directory calls in Principal/ClaimActor and Principal's read-only reopening of the file to flush. The Microsoft FlushFileBuffers API requires write access. Existing file publication uses canonical bytes, mode0600, exclusive creation, locks and atomic rename; preserve these owners.

## P3 Decision

Use one small directory-flush primitive in existing evidence/atomic-append for these four observed consumers: POSIX directory fsync remains mandatory and its failures propagate; Windows explicitly omits unsupported directory fsync while retaining file flushes. Principal publication keeps its exclusive writable descriptor open through write and fsync before rename. Do not catch EPERM indiscriminately, weaken authority checks, change storage protocols, normalize identities, add fallback parsers, add flags/dependencies, or skip native lifecycle tests. Existing compliant Inbox/checkpoint owners remain unchanged because this slice repairs the broken authority dependencies, not every persistence surface. Document that Windows file flushing plus existing atomic publication is not a POSIX-equivalent power-loss guarantee. At10x load, retained synchronous file flush cost and per-authority locking dominate; no new scans or metadata are introduced. Code revert restores the previous implementation with unchanged persisted data.

## Files and verification

Production scope: src/effects/evidence/atomic-append.ts, src/effects/engineers/binding-store.ts, src/effects/engineers/principal-store.ts, src/effects/engineers/claim-actor-store.ts, src/effects/state/coordination-lease-store.ts. Test scope: existing tests/unit/me0b-principal-store.test.ts and tests/coordination-lease-store.test.ts for deterministic syscall failure boundaries; tests/effects/task-reply.test.ts only if a proven fixture/environment contract fault obstructs the real lifecycle, never to bypass product errors. This exceeds five source/test files; it remains one cross-module durability invariant and one independently reviewable rollback surface.

Add a before/after regression to an existing owning suite simulating the Windows syscall restrictions with real file writes. Verify canonical byte retention, file fsync failure refusal, POSIX directory failure propagation, and existing access/revocation behavior. Run owning binding, principal, lease and protected reply suites plus migration and Task Inbox effects, typecheck and every root required integrity check through one contract Verification Plan. Existing three-platform CI matrix already exercises actual native delivery/ACK/reply plus migration; keep it intact, run full CI on the published frozen head. No new standalone test file, benchmark or redundant full local suite is needed. Architecture projection uses current deterministic proof once code freezes; indexing remains subject to the pending explicit user decision.

## Acceptance and integration

Capture one independent semantic review of this work-package after canonical evidence passes. Bind review to the policy-selected origin/main subject, while source verification is scoped to baseline49c5f9dc. Do not spend the review before final source freeze. Publish a stacked PR against codex/task-inbox-portable-paths with honest evidence. After accepted repair, integrate into PR443 and then its reader downstreams; existing consumed review budgets do not reset. Continue the full refactor without adding homepage features.

## Task Breakdown

- [x] Record the observed call chain, exact Windows failure evidence and bounded sibling classification in research; bind the approved plan and bugfix contract.
- [x] Add and run a failing owning regression before editing production persistence.
- [x] Repair directory-flush platform selection and Principal writable file-handle lifetime while retaining canonical bytes, locks and error propagation.
- [ ] Run focused suites and required checks, materialize current architecture proof, freeze source and obtain canonical verification.
- [ ] Run one independent review, publish a stacked PR and verify full native CI; record exact acceptance without main merge.
- [ ] Carry the accepted repair into PR443 and resume the existing staged reader/homepage integration roadmap.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Record the observed call chain, exact Windows failure evidence and bounded sibling classification in research; bind the approved plan and bugfix contract.
- [x] Add and run a failing owning regression before editing production persistence.
- [x] Repair directory-flush platform selection and Principal writable file-handle lifetime while retaining canonical bytes, locks and error propagation.
- [ ] Run focused suites and required checks, materialize current architecture proof, freeze source and obtain canonical verification.
- [ ] Run one independent review, publish a stacked PR and verify full native CI; record exact acceptance without main merge.
- [ ] Carry the accepted repair into PR443 and resume the existing staged reader/homepage integration roadmap.
