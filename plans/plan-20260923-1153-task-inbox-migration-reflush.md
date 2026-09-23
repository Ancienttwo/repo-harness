# Plan: Task Inbox migration recovery file flush

> **Status**: Executing
> **Created**: 20260923-1153
> **Slug**: task-inbox-migration-reflush
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: review:akn05-task-evidence:sha256:b8b29629b9086491cb65a492d79c119bc570b92969d68714faf39e526ab92cab
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Durable file flush before migration receipt publication
> **Rollback Surface**: Remove recovery-only flush repair without altering Task Inbox data
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260923-1153-task-inbox-migration-reflush.contract.md`
> **Task Review**: `tasks/reviews/20260923-1153-task-inbox-migration-reflush.review.md`
> **Implementation Notes**: `tasks/notes/20260923-1153-task-inbox-migration-reflush.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: review:akn05-task-evidence:sha256:b8b29629b9086491cb65a492d79c119bc570b92969d68714faf39e526ab92cab
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260923-1153-task-inbox-migration-reflush.md`
- Sprint contract: `tasks/contracts/20260923-1153-task-inbox-migration-reflush.contract.md`
- Sprint review: `tasks/reviews/20260923-1153-task-inbox-migration-reflush.review.md`
- Implementation notes: `tasks/notes/20260923-1153-task-inbox-migration-reflush.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260923-1153-task-inbox-migration-reflush.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260923-1153-task-inbox-migration-reflush.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260923-1153-task-inbox-migration-reflush.md`.

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
- Contract file: `tasks/contracts/20260923-1153-task-inbox-migration-reflush.contract.md`
- Review file: `tasks/reviews/20260923-1153-task-inbox-migration-reflush.review.md`
- Implementation notes file: `tasks/notes/20260923-1153-task-inbox-migration-reflush.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260923-1153-task-inbox-migration-reflush.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260923-1153-task-inbox-migration-reflush.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Remove recovery-only flush repair without altering Task Inbox data
- **Verification boundary**: Durable file flush before migration receipt publication
- **Review/acceptance boundary**: `tasks/reviews/20260923-1153-task-inbox-migration-reflush.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260923-1153-task-inbox-migration-reflush.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260923-1153-task-inbox-migration-reflush.contract.md`, `tasks/reviews/20260923-1153-task-inbox-migration-reflush.review.md`, and `tasks/notes/20260923-1153-task-inbox-migration-reflush.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260923-1153-task-inbox-migration-reflush.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Remove recovery-only flush repair without altering Task Inbox data

## Captured Planning Output

## Goal
Prevent explicit Task Inbox layout migration recovery from reporting a committed receipt when a transaction-owned file was fully written but its file fsync failed before interruption.

## P1/P2/P3
P1: `task-inbox-layout-migration.ts` owns the one-shot migration transaction; `atomic-append.ts#createFileExclusiveDurably` writes and fsyncs new files; `writeOwned` reuses matching bytes on resume; `publishMetadata` owns pending and final receipt publication. The original Task Inbox remains the authority until the transaction publishes. This is a separate narrow repair beneath the accepted AKN-05 supervision stack, with Task Evidence acceptance blocked by its single independent review finding.
P2: a complete `writeSync` followed by failed `fsyncSync` leaves readable bytes. Resume finds matching bytes in `writeOwned`, returns without retrying file fsync, and `finishForward` can flush directories and publish a receipt. Directory fsync does not establish file-content durability. The same shortcut can occur with a complete `.pending` metadata file and, on an already published tree, a matching receipt. A fault-injected test must reproduce the current false success before production repair.
P3: securely reopen only exact transaction-owned, single-link regular files without following symlinks and fsync the existing inode before treating equal bytes as durable. Recheck identity before and after the flush so a swapped path fails closed. Apply the same rule to complete prepared metadata and already published transaction-owned files before receipt publication. Preserve one-shot migration semantics and do not change ordinary Task Inbox readers/writers. At 10x file count the extra flush is bounded by the manifest inventory; failure returns resumable incomplete state instead of a success receipt.

## Scope
- Source: `src/effects/fleet/task-inbox-layout-migration.ts`; existing test: `tests/effects/task-inbox-layout-migration.test.ts`.
- Evidence: this plan, one contract/review/notes set, generated architecture manifest if deterministic projection requires it, and deferred todo timestamp only if workflow machinery updates it.
- No real-data migration, native Host admission, main merge, global installation, or unrelated Windows durability fixes.

## Verification and acceptance
First reproduce the complete-write/failed-fsync recovery gap and repeated-failure refusal in the existing migration suite. Repair and run that suite, typecheck, repository integrity checks and guarded migration/Task Inbox neighbors required by the contract. Refresh CodeGraph only if the owner grants this new worktree's index permission. Then deterministic architecture projection, one canonical acceptance, one independent review, typed receipt and a stacked PR against AKN-05a. Merge its accepted source into Task Evidence, repeat its canonical verification and resolve the review blocker without claiming the original failed review as a pass.

## Task Breakdown
- [x] Reproduce the complete-file fsync failure and resume behavior with an existing-suite regression.
- [x] Repair the exact transaction-owned file flush boundary and verify staged/pending/published recovery.
- [ ] Freeze architecture and canonical evidence; perform one semantic review and typed acceptance.
- [ ] Publish a corrective stacked PR and integrate its accepted source into Task Evidence.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
