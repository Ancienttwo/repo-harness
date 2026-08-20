# Plan: Architecture queue idempotent events

> **Status**: Archived
> **Created**: 20260814-0157
> **Slug**: architecture-queue-idempotent-events
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: repo-harness-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Red-green request/index/event byte-idempotency regression plus helper parity and repository tests.
> **Rollback Surface**: Revert the queue helper, event helper, packaged projections, regression test, and workflow plan.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260814-0157-architecture-queue-idempotent-events.contract.md`
> **Task Review**: `tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md`
> **Implementation Notes**: `tasks/notes/20260814-0157-architecture-queue-idempotent-events.notes.md`

## Agentic Routing
- Selected route: bugfix
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260814-0157-architecture-queue-idempotent-events.md`
- Sprint contract: `tasks/contracts/20260814-0157-architecture-queue-idempotent-events.contract.md`
- Sprint review: `tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md`
- Implementation notes: `tasks/notes/20260814-0157-architecture-queue-idempotent-events.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260814-0157-architecture-queue-idempotent-events.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260814-0157-architecture-queue-idempotent-events.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260814-0157-architecture-queue-idempotent-events.md`.

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
- Contract file: `tasks/contracts/20260814-0157-architecture-queue-idempotent-events.contract.md`
- Review file: `tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md`
- Implementation notes file: `tasks/notes/20260814-0157-architecture-queue-idempotent-events.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260814-0157-architecture-queue-idempotent-events.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260814-0157-architecture-queue-idempotent-events.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the queue helper, event helper, packaged projections, regression test, and workflow plan.
- **Verification boundary**: Red-green request/index/event byte-idempotency regression plus helper parity and repository tests.
- **Review/acceptance boundary**: `tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260814-0157-architecture-queue-idempotent-events.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260814-0157-architecture-queue-idempotent-events.contract.md`, `tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md`, and `tasks/notes/20260814-0157-architecture-queue-idempotent-events.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260814-0157-architecture-queue-idempotent-events.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the queue helper, event helper, packaged projections, regression test, and workflow plan.

## Captured Planning Output

## Goal

Stop repeated observations of an unchanged pending architecture file from rewriting the request card, index entry, and event log solely with a newer timestamp.

## Scope

- Make `architecture-event upsert-request` report whether the pending file event changed semantically.
- Make `architecture-queue record` reconcile audit event, request card, and index under one cross-process lock so unchanged and interrupted retries converge without data loss.
- Keep canonical helpers and packaged helper projections byte-identical.
- Add a regression test covering immediate repetition and repetition after another file event.

## Non-scope

- Changing architecture classification, capability routing, projection policy, or request archival semantics.
- Rewriting existing downstream WIP or automatically resolving pending requests.

## Design

Treat a pending request as one current semantic event per file. Compare the stored file row plus the card's full latest scope fields against the incoming normalized event, excluding wall-clock `ts`. If equal, return `unchanged`; otherwise preserve the existing merge behavior. The queue consumes this typed result and avoids every durable write on `unchanged`.

## Verification

- Red-green the focused byte-idempotency regression.
- Run architecture queue/event tests and helper parity.
- Run the full test suite; classify baseline failures separately.
- Run repository architecture/task checks and record environment blockers.

## Task Breakdown

- [x] Prove timestamp-only drift and trace the Stop-to-card path.
- [x] Add the focused failing regression.
- [x] Implement semantic no-op detection and queue short-circuit.
- [x] Sync packaged helper projections.
- [x] Complete full-suite verification and record the final acceptance receipt.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Prove timestamp-only drift and trace the Stop-to-card path.
- [x] Add the focused failing regression.
- [x] Implement semantic no-op detection and queue short-circuit.
- [x] Sync packaged helper projections.
- [x] Complete full-suite verification and record the final acceptance receipt.
