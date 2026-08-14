# Plan: Contract Worktree Single Publication Commit

> **Status**: Executing
> **Created**: 20260814-1629
> **Slug**: contract-worktree-single-publication
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: finish --merge publishes exactly one target commit with a tree equal to the verified lifecycle head
> **Rollback Surface**: revert the finish publication algorithm and helper projection without changing receipt schemas
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md`
> **Task Review**: `tasks/reviews/20260814-1629-contract-worktree-single-publication.review.md`
> **Implementation Notes**: `tasks/notes/20260814-1629-contract-worktree-single-publication.notes.md`

## Agentic Routing
- Selected route: implementation
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260814-1629-contract-worktree-single-publication.md`
- Sprint contract: `tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md`
- Sprint review: `tasks/reviews/20260814-1629-contract-worktree-single-publication.review.md`
- Implementation notes: `tasks/notes/20260814-1629-contract-worktree-single-publication.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260814-1629-contract-worktree-single-publication.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260814-1629-contract-worktree-single-publication.md`.

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
- Contract file: `tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md`
- Review file: `tasks/reviews/20260814-1629-contract-worktree-single-publication.review.md`
- Implementation notes file: `tasks/notes/20260814-1629-contract-worktree-single-publication.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260814-1629-contract-worktree-single-publication.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: revert the finish publication algorithm and helper projection without changing receipt schemas
- **Verification boundary**: finish --merge publishes exactly one target commit with a tree equal to the verified lifecycle head
- **Review/acceptance boundary**: `tasks/reviews/20260814-1629-contract-worktree-single-publication.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260814-1629-contract-worktree-single-publication.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md`, `tasks/reviews/20260814-1629-contract-worktree-single-publication.review.md`, and `tasks/notes/20260814-1629-contract-worktree-single-publication.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260814-1629-contract-worktree-single-publication.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: revert the finish publication algorithm and helper projection without changing receipt schemas

## Captured Planning Output

## Goal

Make one work-package publish as one commit on the target branch while preserving the existing fail-closed AcceptanceReceipt, post-freeze lifecycle allowlist, crash journal, and dirty-target protections.

## Architecture Decision

- Checkpoint commits remain legal and auditable on the contract branch.
- `contract-worktree finish --merge` publishes one synthesized commit whose tree is byte-identical to the verified post-lifecycle branch tree.
- The source branch is not rewritten; recovery still has the original branch HEAD and closeout journal.
- `finish --no-merge` keeps the current branch-local lifecycle commit behavior because it has no publication boundary.
- The merge seal remains bound to the verified source HEAD; publication additionally proves target base immutability and source-tree equality before creating the target commit.
- No compatibility fallback: if the target moved, the published tree differs, identity cannot be established, or commit creation fails, closeout aborts before target mutation.

## Task Breakdown

- [x] Add a regression fixture where multiple checkpoint commits plus lifecycle closeout publish exactly one target commit.
- [x] Add negative controls for target movement and tree mismatch.
- [x] Replace the merge-mode `--ff-only` publication with a single atomic commit/ref update while retaining no-merge behavior.
- [x] Update closeout journal reconciliation and observable output for the synthesized publication SHA.
- [x] Synchronize packaged helper, workflow documentation, architecture projection, and task artifacts.
- [ ] Run red-green, focused closeout suites, root required checks, and independent diff acceptance.

## Verification

- Targeted RED must show current `--ff-only` publishes more than one commit.
- GREEN must prove target first-parent count increases by exactly one and `target^{tree} == source^{tree}`.
- Existing SIGKILL/reconcile tests must remain green.
- `bun test`, architecture/task sync, strict workflow, state inspection, and init dry-run must pass.

## Out of Scope

- Rewriting existing `main` history.
- Changing external review semantics or normalized implementation content.
- Adding publication-count heuristics based on changed lines or file counts.
- Changing PR-provider merge strategy outside `contract-worktree finish --merge`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add a regression fixture where multiple checkpoint commits plus lifecycle closeout publish exactly one target commit.
- [x] Add negative controls for target movement and tree mismatch.
- [x] Replace the merge-mode `--ff-only` publication with a single atomic commit/ref update while retaining no-merge behavior.
- [x] Update closeout journal reconciliation and observable output for the synthesized publication SHA.
- [x] Synchronize packaged helper, workflow documentation, architecture projection, and task artifacts.
- [ ] Run red-green, focused closeout suites, root required checks, and independent diff acceptance.
