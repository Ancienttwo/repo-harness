> **Archived**: 2026-09-05 03:14
> **Related Plan**: plans/archive/plan-20260903-0437-issue-282-automation-budget.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-0314
> **Archive Projection V1**: `plans/plan-20260903-0437-issue-282-automation-budget.md` => `plans/archive/plan-20260903-0437-issue-282-automation-budget.md`
> **Archive Projection V1**: `tasks/notes/20260903-0437-issue-282-automation-budget.notes.md` => `tasks/archive/notes-20260905-0314-issue-282-automation-budget.md`
> **Archive Projection V1**: `tasks/contracts/20260903-0437-issue-282-automation-budget.contract.md` => `tasks/archive/contract-20260905-0314-issue-282-automation-budget.md`
> **Archive Projection V1**: `tasks/reviews/20260903-0437-issue-282-automation-budget.review.md` => `tasks/archive/review-20260905-0314-issue-282-automation-budget.md`

# Plan: Add an enforceable per-goal automation budget ledger and stop receipt

> **Status**: Archived
> **Created**: 20260903-0437
> **Slug**: issue-282-automation-budget
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: github:Ancienttwo/repo-harness#282
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0314-issue-282-automation-budget.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260903-0437-issue-282-automation-budget.md`; after execution revert branch `codex/issue-282-automation-budget` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-0314-issue-282-automation-budget.md`
> **Task Review**: `tasks/archive/review-20260905-0314-issue-282-automation-budget.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-0314-issue-282-automation-budget.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: github:Ancienttwo/repo-harness#282
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260903-0437-issue-282-automation-budget.md`
- Sprint contract: `tasks/archive/contract-20260905-0314-issue-282-automation-budget.md`
- Sprint review: `tasks/archive/review-20260905-0314-issue-282-automation-budget.md`
- Implementation notes: `tasks/archive/notes-20260905-0314-issue-282-automation-budget.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-0314-issue-282-automation-budget.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260903-0437-issue-282-automation-budget.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260903-0437-issue-282-automation-budget.md`.

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
- Contract file: `tasks/archive/contract-20260905-0314-issue-282-automation-budget.md`
- Review file: `tasks/archive/review-20260905-0314-issue-282-automation-budget.md`
- Implementation notes file: `tasks/archive/notes-20260905-0314-issue-282-automation-budget.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0314-issue-282-automation-budget.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260903-0437-issue-282-automation-budget.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260903-0437-issue-282-automation-budget.md`; after execution revert branch `codex/issue-282-automation-budget` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0314-issue-282-automation-budget.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-0314-issue-282-automation-budget.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260903-0437-issue-282-automation-budget.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-0314-issue-282-automation-budget.md`, `tasks/archive/review-20260905-0314-issue-282-automation-budget.md`, and `tasks/archive/notes-20260905-0314-issue-282-automation-budget.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-0314-issue-282-automation-budget.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260903-0437-issue-282-automation-budget.md`; after execution revert branch `codex/issue-282-automation-budget` or the explicitly reviewed diff.

## Captured Planning Output

## Goal and success criteria
Resolve GitHub issue #282: one typed, machine-enforced per-goal automation budget authority with an append-only consumption ledger, per-budget reservation under lock/CAS before every claim/dispatch/retry/provider invocation, and an immutable stop receipt on exhaustion. Success: all acceptance criteria in issue #282 are covered (cannot start unattended without an enforceable budget; refuse-before-exceed for acquisitions, steps and invocations; frozen wall-clock deadline; hard token budget rejected at preflight when usage is not provider-verified; same-key single charge; crash between reservation and usage append → typed reconciliation; cross-process reservation contention; stable digest-bound stop receipt visible on the board; limit increase requires a new human-authorized revision) and full required checks pass.

## Scope
- SCHEMA REUSE (hard constraint from the Repair Campaign program, the first non-interactive consumer): the host-owned authorization and budget schema is `ProgramAuthorizationV1` with `ProgramBudgetLimitV1` as already specified in `plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md` (§ around line 239). Implement `AutomationBudgetV1` as that schema (or a thin exact projection of it keyed by automation run/goal), not a second `ControllerAuthorization`/budget shape. Reconcile any field differences by extending the PRD-defined type, and record the mapping in notes.
- New core module under `src/core/automation/` (pure: limits, strictest-composition with contract-level runner budgets, reservation arithmetic, stop receipt digest) and effects under `src/effects/automation/` (ledger store, per-budget lock/CAS reservation, usage append, reconciliation). Runtime store under `<git-common-dir>/repo-harness/automation-budget/v1/`.
- Contracts: `AutomationBudgetV1`, `AutomationBudgetReservationV1`, `AutomationUsageEventV1`, `AutomationBudgetCurrentV1`, `AutomationStopReceiptV1`; usage-event kind string follows the PRD (`repo-harness-program-budget-event` if that is the PRD's wire kind).
- v1 hard limits: wall-clock deadline (frozen absolute timestamp), max controller steps, max successful acquisitions, max provider/runner invocations, max consecutive no-progress/transient-failure steps. Token/cost limits only when the provider path exposes verified attributable usage (metric support/capability revision bound into the budget); unenforceable configured hard metric → preflight rejects.
- Enforcement API: `reserveAutomationBudget(op)` → typed refusal or reservation; `appendAutomationUsage(reservation, result)`; `reconcileAutomationReservation(reservation, evidence)` (never assume zero); `currentAutomationBudget()`; `publishAutomationStopReceipt()`. Idempotency key per operation; replay returns the original charge.
- Composition: strictest applicable limit when a task contract carries enforceable runner limits; derivation recorded in the budget digest. Budget never rewrites Task/Lease/Work Graph/contract authority; exhaustion never releases or steals claims.
- Board/Operator projection of current budget, reservation and stop receipt (no provider-sensitive data).
- Docs/spec/ArchContext updates; deferred-goal ledger row for the "no cost ceiling" item closed.

## Non-scope
- No controller loop (#279) — provide the enforcement API and one end-to-end fixture that drives it as a controller would; no provider usage extraction changes beyond reading existing verified usage evidence; no lease/attempt changes (#286/#287 in parallel worktrees); no budget auto-renewal.

## P1 Architecture map
Guarded-merge PRD defines `ProgramAuthorizationV1`/budget; existing verified provider usage evidence lives in the delegated-run / provider-thread effects (`src/effects/engineers/delegated-run-store.ts`, provider thread effects); contract runner budgets in the contract `delegation.budget` block; runtime stores under git common dir; board projections in `src/core/fleet/board.ts`.

## P2 Concrete trace
Controller step → `reserveAutomationBudget({kind: acquisition|dispatch|retry|invocation, idempotency_key})` → re-read budget + ledger → validate goal/contract/Engineer fences → CAS reservation under per-budget lock → refuse (typed) if any hard limit would be exceeded → operation runs → `appendAutomationUsage` with provider-authoritative usage → current projection → on limit reached `AutomationStopReceiptV1` (metric, limit, consumed/reserved, last step, in-flight authority) → controller state `budget_exhausted`. Crash between reservation and append → reservation stays open → next reserve refuses until `reconcileAutomationReservation` resolves from exact evidence.

## P3 Decision rationale
Reserve-before-act is the only shape that prevents the next spend; post-hoc totals cannot. Reusing the PRD schema keeps one host-owned authorization authority for both the campaign and the controller. At 10x the first pressure is per-step lock contention on the budget file; keep reservations small and the ledger append-only.

## Task Breakdown
- [x] #1 Failing tests: schema validation (no null/unlimited for unattended), strictest-composition, reservation arithmetic, frozen deadline, token preflight rejection, replay single charge, stop receipt digest.
- [x] #2 Core types aligned to `ProgramAuthorizationV1`/`ProgramBudgetLimitV1` + pure functions.
- [x] #3 Effects: ledger store, per-budget lock/CAS reservation, usage append, reconciliation; cross-process contention and crash fixtures.
- [x] #4 Stop receipt publication + board/Operator projection; end-to-end stop-before-next-claim fixture.
- [x] #5 Docs/spec/ArchContext, todos ledger closure, focused tests + root required checks, evidence.

## Verification
bun test --timeout 60000; bun run check:type; bun run check:state-boundaries; bash scripts/check-deploy-sql-order.sh; bash scripts/check-architecture-sync.sh; bash scripts/check-task-sync.sh; repo-harness run check-task-workflow --strict; bun scripts/inspect-project-state.ts --repo . --format text; bun src/cli/index.ts init --repo . --dry-run.

## Annotations
