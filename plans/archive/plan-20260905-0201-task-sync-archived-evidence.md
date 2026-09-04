> **Archived**: 2026-09-05 02:36
> **Related Plan**: plans/archive/plan-20260905-0201-task-sync-archived-evidence.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-0236
> **Archive Projection V1**: `plans/plan-20260905-0201-task-sync-archived-evidence.md` => `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/notes/20260905-0201-task-sync-archived-evidence.notes.md` => `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0201-task-sync-archived-evidence.contract.md` => `tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0201-task-sync-archived-evidence.review.md` => `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md`

# Plan: Accept same-publication archived task-sync evidence

> **Status**: Archived
> **Created**: 20260905-0201
> **Slug**: task-sync-archived-evidence
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md`; after execution revert branch `codex/task-sync-archived-evidence` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md`
> **Task Review**: `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md`
- Sprint contract: `tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md`
- Sprint review: `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md`
- Implementation notes: `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-0201-task-sync-archived-evidence.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-0201-task-sync-archived-evidence.md`.

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
- Contract file: `tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md`
- Review file: `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md`
- Implementation notes file: `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md`; after execution revert branch `codex/task-sync-archived-evidence` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md`, `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md`, and `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md`; after execution revert branch `codex/task-sync-archived-evidence` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

Make `check-task-sync` accept exact-digest workflow evidence that is newly archived in the same evaluated publication, while continuing to reject edits to historical archive files as evidence.

## Root Cause

The changed-path classifier excludes every `plans/archive/*` and `tasks/archive/*` path. The closeout flow archives the only exact-digest plan/contract/review/notes evidence before CI evaluates the push base range, so `evidence_files` is empty even though the published archive contains the correct digest.

## Scope

- Update the source helper and packaged template mirror.
- Add a regression reproducing the CI base-range failure.
- Add a negative regression proving a pre-existing archive cannot be edited to launder a digest.
- Preserve all other substantive-path and evidence classification behavior.

## Task Breakdown

- [x] Add red regressions for same-publication archive admission and historical archive rejection.
- [x] Track paths newly added since the effective base and admit only newly added archived plan/contract/review/notes artifacts.
- [x] Run targeted tests, mirror drift checks, and the repository required checks.

## Verification

- `bun test tests/check-task-sync.test.ts --timeout 60000`
- `bun test --timeout 60000`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts init --repo . --dry-run`

## Rollback

Revert the classifier and its two regressions; no persisted data or wire contract changes are involved.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add red regressions for same-publication archive admission and historical archive rejection.
- [x] Track paths newly added since the effective base and admit only newly added archived plan/contract/review/notes artifacts.
- [x] Run targeted tests, mirror drift checks, and the repository required checks.
