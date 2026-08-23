# Plan: Close Fleet PRD workflow artifacts

> **Status**: Archived
> **Created**: 20260823-1652
> **Slug**: fleet-prd-closeout
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Four separately rebound contract verifications and receipts plus archive-workflow closeout
> **Rollback Surface**: Revert the single ledger-closeout publication commit
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260823-1652-fleet-prd-closeout.contract.md`
> **Task Review**: `tasks/reviews/20260823-1652-fleet-prd-closeout.review.md`
> **Implementation Notes**: `tasks/notes/20260823-1652-fleet-prd-closeout.notes.md`

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

- Active plan: `plans/plan-20260823-1652-fleet-prd-closeout.md`
- Sprint contract: `tasks/contracts/20260823-1652-fleet-prd-closeout.contract.md`
- Sprint review: `tasks/reviews/20260823-1652-fleet-prd-closeout.review.md`
- Implementation notes: `tasks/notes/20260823-1652-fleet-prd-closeout.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260823-1652-fleet-prd-closeout.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260823-1652-fleet-prd-closeout.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260823-1652-fleet-prd-closeout.md`.

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
- Contract file: `tasks/contracts/20260823-1652-fleet-prd-closeout.contract.md`
- Review file: `tasks/reviews/20260823-1652-fleet-prd-closeout.review.md`
- Implementation notes file: `tasks/notes/20260823-1652-fleet-prd-closeout.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260823-1652-fleet-prd-closeout.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260823-1652-fleet-prd-closeout.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single ledger-closeout publication commit
- **Verification boundary**: Three separately rebound contract verifications and receipts plus archive-workflow closeout
- **Review/acceptance boundary**: `tasks/reviews/20260823-1652-fleet-prd-closeout.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260823-1652-fleet-prd-closeout.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260823-1652-fleet-prd-closeout.contract.md`, `tasks/reviews/20260823-1652-fleet-prd-closeout.review.md`, and `tasks/notes/20260823-1652-fleet-prd-closeout.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260823-1652-fleet-prd-closeout.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single ledger-closeout publication commit

## Captured Planning Output

## Goal

Close the already-landed Fleet Acquire + Publication Readiness WP0-A, WP0-B, and WP0-C workflow artifacts plus the already-merged GPT Pro advisory orchestration workflow against current `main`, without changing product code or starting deferred WP5.

## P1 architecture

- Product implementation WP0-A through WP4 and GPT Pro orchestration commit `63cebdbe` are already on `main`; four workflow families remain unarchived.
- Each old contract owns its own verification and AcceptanceReceipt authority; the global current receipt cannot authorize another contract.
- `archive-workflow` is the only owner of terminal artifact moves and current-status refresh.

## P2 trace

For WP0-A, WP0-B, WP0-C, and GPT Pro orchestration in order: re-run exact contract verification on current target -> prepare Change Assessment -> record the policy-matching typed AcceptanceReceipt after independent gate evidence -> finalize verify-sprint -> archive as Completed. Then verify no related active markers remain and main is clean.

## P3 decision

Use one isolated ledger-closeout work-package, but preserve three separate verification/receipt subjects. Do not edit production code, do not synthesize compatibility evidence, do not repair unrelated archived review projections, and keep the PRD `Approved` because the legal PRD lifecycle has no `Complete` state.

## Scope

- Rebind WP0-A/B/C and GPT Pro orchestration verification and typed receipts to current `main`.
- Promote any still-Active old contracts through the canonical archive workflow.
- Archive the four plan/contract/review/notes/todo families and refresh `tasks/current.md`.
- Verify WP0-A through WP4 remain present and Required/CI remains green after publication.

## Out of scope

- Product source or tests, WP1-WP4 historical review projection rewrites, deferred WP5, and PRD lifecycle vocabulary changes.

## Verification

- Each old contract's machine-verifiable exit criteria and final `verify-sprint` pass.
- Each archived family records `Outcome: Completed` and a valid Receipt projection.
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bash scripts/check-architecture-sync.sh`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `git diff --check`

## Task Breakdown

- [x] Freeze a self-sufficient ledger-closeout contract and exact allowed paths.
- [x] Reverify and archive WP0-A PublicationReceipt.
- [x] Reverify and archive WP0-B Lease Protocol 2 + lifecycle.
- [x] Reverify and archive WP0-C Recovery + Reconcile.
- [x] Reverify and archive the already-merged GPT Pro orchestration workflow; remove its obsolete worktree/branch after absorption is proven.
- [ ] Independently gate the final artifact-only diff, close this closeout workflow, merge, push, and confirm Required/CI.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze a self-sufficient ledger-closeout contract and exact allowed paths.
- [x] Reverify and archive WP0-A PublicationReceipt.
- [x] Reverify and archive WP0-B Lease Protocol 2 + lifecycle.
- [x] Reverify and archive WP0-C Recovery + Reconcile.
- [x] Reverify and archive the already-merged GPT Pro orchestration workflow; remove its obsolete worktree/branch after absorption is proven.
- [ ] Independently gate the final artifact-only diff, close this closeout workflow, merge, push, and confirm Required/CI.
