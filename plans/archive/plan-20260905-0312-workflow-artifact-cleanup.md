> **Archived**: 2026-09-05 03:33
> **Related Plan**: plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-0333
> **Archive Projection V1**: `plans/plan-20260905-0312-workflow-artifact-cleanup.md` => `plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md`
> **Archive Projection V1**: `tasks/notes/20260905-0312-workflow-artifact-cleanup.notes.md` => `tasks/archive/notes-20260905-0333-workflow-artifact-cleanup.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0312-workflow-artifact-cleanup.contract.md` => `tasks/archive/contract-20260905-0333-workflow-artifact-cleanup.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0312-workflow-artifact-cleanup.review.md` => `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md`

# Plan: Reconcile historical workflow artifacts

> **Status**: Archived
> **Created**: 20260905-0312
> **Slug**: workflow-artifact-cleanup
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: maintenance:historical-workflow-artifacts
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Historical classifier, archive lifecycle checks, Todo trigger audit, and root required workflow checks.
> **Rollback Surface**: Revert the single cleanup publication commit; archived artifacts retain their complete original content and projection mapping.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-0333-workflow-artifact-cleanup.md`
> **Task Review**: `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-0333-workflow-artifact-cleanup.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: maintenance:historical-workflow-artifacts
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md`
- Sprint contract: `tasks/archive/contract-20260905-0333-workflow-artifact-cleanup.md`
- Sprint review: `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md`
- Implementation notes: `tasks/archive/notes-20260905-0333-workflow-artifact-cleanup.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-0333-workflow-artifact-cleanup.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md`.

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
- Contract file: `tasks/archive/contract-20260905-0333-workflow-artifact-cleanup.md`
- Review file: `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md`
- Implementation notes file: `tasks/archive/notes-20260905-0333-workflow-artifact-cleanup.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0333-workflow-artifact-cleanup.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single cleanup publication commit; archived artifacts retain their complete original content and projection mapping.
- **Verification boundary**: Historical classifier, archive lifecycle checks, Todo trigger audit, and root required workflow checks.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-0312-workflow-artifact-cleanup.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-0333-workflow-artifact-cleanup.md`, `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md`, and `tasks/archive/notes-20260905-0333-workflow-artifact-cleanup.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-0333-workflow-artifact-cleanup.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single cleanup publication commit; archived artifacts retain their complete original content and projection mapping.

## Captured Planning Output

## Goal and success criteria
Reconcile the root workflow surface without touching the active GPT Pro repair Sprint or its BRC4 linked worktree. Classify every non-archived historical Plan with the repository classifier, archive only with a truthful terminal outcome, remove the one deferred-goal row whose task-ID/dependency/acquire-next prerequisites have landed, and leave main clean with all required workflow checks passing.

## Scope
- Audit the 13 root `plans/plan-*.md` families and their declared Contract, Review, and Notes artifacts.
- Preserve `plans/sprints/20260902-2238-gpt-pro-seeded-repair-campaign.sprint.md` and make no cleanup-branch edits to BRC4-owned paths; the parallel BRC4 process may advance independently.
- Archive the abandoned 202607 Draft as `Abandoned`.
- Promote release 0.17.0 to `Fulfilled` only if read-only contract verification and the sealed-terminal classifier pass, then archive it as `Completed`.
- Archive other historical families as `Superseded` only where current main, closed issue/release state, or a later canonical workflow proves they are no longer execution authority; retain any ambiguous family.
- Remove or rewrite only deferred Todo rows whose revisit trigger is demonstrably satisfied; do not duplicate Sprint work into Todo.

## P1/P2/P3
- P1: authority is split across root Plan/Contract/Review/Notes families, `tasks/todos.md`, the active Sprint, and linked-worktree state.
- P2: classifier observes Plan -> Contract -> Review -> AcceptanceReceipt; archive helper moves the complete family and rewrites projections transactionally.
- P3: use truthful `Abandoned`/`Superseded` outcomes instead of fabricating missing AcceptanceReceipts. Preserve the current Sprint and parallel BRC4 ownership boundary.

## Verification
- `repo-harness run classify-historical-plans -- --repo . --format tsv`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/check-architecture-sync.sh`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts init --repo . --dry-run`
- `git diff --check`
- verify the cleanup branch contains no current-Sprint, BRC4, source, test, architecture, or release changes.

## Task Breakdown
- [x] Capture the pre-cleanup classifier, root artifact inventory, Todo ledger, and BRC4 ownership boundary.
- [x] Apply truthful terminal outcomes through `archive-workflow`; never bypass the Completed evidence gate.
- [x] Prune only demonstrably fulfilled Todo content.
- [x] Run verification, review the final diff, archive this cleanup workflow, and publish one mainline unit.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture the pre-cleanup classifier, root artifact inventory, Todo ledger, and BRC4 ownership boundary.
- [x] Apply truthful terminal outcomes through `archive-workflow`; never bypass the Completed evidence gate.
- [x] Prune only demonstrably fulfilled Todo content.
- [x] Run verification, review the final diff, archive this cleanup workflow, and publish one mainline unit.
