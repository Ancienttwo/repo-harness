# Plan: Close PR 265 review gaps

> **Status**: Review
> **Created**: 20260901-1119
> **Slug**: close-265-review-gaps
> **Planning Source**: codex-plan
> **Orchestration Kind**: codex-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260901-1119-close-265-review-gaps.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260901-1119-close-265-review-gaps.md`; after execution revert branch `codex/close-265-review-gaps` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260901-1119-close-265-review-gaps.contract.md`
> **Task Review**: `tasks/reviews/20260901-1119-close-265-review-gaps.review.md`
> **Implementation Notes**: `tasks/notes/20260901-1119-close-265-review-gaps.notes.md`
> **Substantive Change SHA256**: `sha256:7c1f670df4eec41c76678d5e62535635d3a4c6532f082eb4e57b3c8b1e832d9e`

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

- Active plan: `plans/plan-20260901-1119-close-265-review-gaps.md`
- Sprint contract: `tasks/contracts/20260901-1119-close-265-review-gaps.contract.md`
- Sprint review: `tasks/reviews/20260901-1119-close-265-review-gaps.review.md`
- Implementation notes: `tasks/notes/20260901-1119-close-265-review-gaps.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260901-1119-close-265-review-gaps.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260901-1119-close-265-review-gaps.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260901-1119-close-265-review-gaps.md`.

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
- Contract file: `tasks/contracts/20260901-1119-close-265-review-gaps.contract.md`
- Review file: `tasks/reviews/20260901-1119-close-265-review-gaps.review.md`
- Implementation notes file: `tasks/notes/20260901-1119-close-265-review-gaps.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260901-1119-close-265-review-gaps.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260901-1119-close-265-review-gaps.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260901-1119-close-265-review-gaps.md`; after execution revert branch `codex/close-265-review-gaps` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260901-1119-close-265-review-gaps.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260901-1119-close-265-review-gaps.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260901-1119-close-265-review-gaps.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260901-1119-close-265-review-gaps.contract.md`, `tasks/reviews/20260901-1119-close-265-review-gaps.review.md`, and `tasks/notes/20260901-1119-close-265-review-gaps.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260901-1119-close-265-review-gaps.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260901-1119-close-265-review-gaps.md`; after execution revert branch `codex/close-265-review-gaps` or the explicitly reviewed diff.

## Captured Planning Output

## Goal and success criteria
Close all ten independently reproduced post-merge review gaps from audit baseline 1ead6cea. Success means each listed acceptance criterion is covered by focused regression tests, the full repository required checks pass, and the change is bound to canonical plan/contract/review evidence.

## Scope
- Task Message cooperative cancellation, deadline coverage, and lock-safe shutdown.
- Task Inbox staging isolation.
- Fleet provider subprocess supervision.
- Fleet/card/repository consistency roll-up and browser decoder invariants.
- Stale-draft rebind freshness and Task Message success envelope validation.
- Collaboration mode consistency fencing.
- Diff-aware canonical workflow evidence gate.

## Non-scope
- New product features, protocol compatibility aliases, UI redesign, or changes to external GitHub issue state.

## P1 Architecture map
Operator HTTP routes in src/effects/operator/server.ts own request deadlines and child-process lifecycle. Task Message durability is owned by task-message-process.ts, task-message-request.ts, repo-registry.ts, exclusive-directory-lock.ts, and task-inbox.ts. Fleet collection spans fleet-collector-process.ts, the server-held controller child whose exact collector handle owns the Windows Job, the server-held POSIX process group, Fleet board effects/core projections, and merge-readiness provider subprocesses. Browser authority validation lives in src/operator-web/types.ts and App.tsx. Workflow evidence gates live in scripts/check-task-sync.sh, scripts/check-task-workflow.sh, scripts/check-ci.sh and CI configuration. Collaboration consistency lives in work-exchange.ts.

## P2 Concrete traces
- Route deadline -> bounded POST body read -> Task Message child process -> registry authorization lock -> task lock -> immutable event; cancellation sends TERM then bounded KILL, waits for process death, and permits only dead-PID stale-lock reclamation before completion.
- Fleet request -> Windows controller-created collector with exact `Process.Handle` (or a POSIX detached collector) -> board collector -> gh provider process; cancellation first requests cooperative abort, then the controller-owned Job or server-held POSIX process group reaps collector and descendants before the request completes.
- Board/feedback/inbox double-read -> card -> repository -> Fleet snapshot -> browser decoder -> Composer; consistency may only degrade upward and impossible cross-field payloads must fail closed.
- PR/push diff -> substantive path classification -> bound workflow evidence or explicit typed waiver -> CI result.

## P3 Decision rationale
Preserve single authorities: a dedicated process owns each Task Message lock lifetime and cancellation cannot report completion before that PID is dead; the server-owned process group/Job is the sole Fleet descendant-lifecycle authority; canonical scans enumerate only committed records; consistency is projected in the pure core layer; browser acknowledgments are accepted only when exactly bound to the request; workflow evidence is change-identity-bound. No semantic fallback or shadow inference is introduced. At 10x load, bounded grace periods and provider process trees are the first pressure points, so tests must prove bounded cleanup and idempotent retries.

## Fragile assumptions and rollback
Task Message work can run in a dedicated killable child process, and provider commands inherit either an unnamed Windows Job with `KILL_ON_JOB_CLOSE` or a detached POSIX process group. If assignment or bounded termination cannot be proved, fail closed without a PID-based tree fallback. Rollback is one merge unit reverting this plan's source, tests, and workflow artifacts together.

## Task Breakdown
- [x] #1 Prevent Task Message cancellation from orphaning registry and task locks.
- [x] #2 Keep Task Inbox staging files outside canonical event and receipt scans.
- [x] #3 Roll card-level changed_during_read up to repository and Fleet consistency.
- [x] #4 Require a newer stable snapshot before stale-draft rebind.
- [x] #5 Fail CI when substantive changes lack bound canonical workflow evidence.
- [x] #6 Supervise Fleet provider subprocesses when cancelling snapshot Workers.
- [x] #7 Start the Task Message deadline before reading the HTTP request body.
- [x] #8 Include collaboration mode in Work Exchange consistency fencing.
- [x] #9 Validate Task Message success envelopes before clearing browser drafts.
- [x] #10 Reject unreadable repository payloads that still contain actionable cards.
- [x] Run focused tests, root required checks, diff review, and record acceptance evidence.

## Verification
Run every issue-specific command from the audit, then bun test --timeout 60000, bash scripts/check-deploy-sql-order.sh, bash scripts/check-architecture-sync.sh, bash scripts/check-task-sync.sh, repo-harness run check-task-workflow --strict, bun scripts/inspect-project-state.ts --repo . --format text, and bun src/cli/index.ts init --repo . --dry-run.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] #1 Prevent Task Message cancellation from orphaning registry and task locks.
- [x] #2 Keep Task Inbox staging files outside canonical event and receipt scans.
- [x] #3 Roll card-level changed_during_read up to repository and Fleet consistency.
- [x] #4 Require a newer stable snapshot before stale-draft rebind.
- [x] #5 Fail CI when substantive changes lack bound canonical workflow evidence.
- [x] #6 Supervise Fleet provider subprocesses when cancelling snapshot Workers.
- [x] #7 Start the Task Message deadline before reading the HTTP request body.
- [x] #8 Include collaboration mode in Work Exchange consistency fencing.
- [x] #9 Validate Task Message success envelopes before clearing browser drafts.
- [x] #10 Reject unreadable repository payloads that still contain actionable cards.
- [x] Run focused tests, root required checks, diff review, and record acceptance evidence.
