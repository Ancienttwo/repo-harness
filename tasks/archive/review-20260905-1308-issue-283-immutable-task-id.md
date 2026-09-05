> **Archived**: 2026-09-05 13:08
> **Related Plan**: plans/archive/plan-20260902-2101-issue-283-immutable-task-id.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260905-1308
> **Archive Projection V1**: `plans/plan-20260902-2101-issue-283-immutable-task-id.md` => `plans/archive/plan-20260902-2101-issue-283-immutable-task-id.md`
> **Archive Projection V1**: `tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md` => `tasks/archive/notes-20260905-1308-issue-283-immutable-task-id.md`
> **Archive Projection V1**: `tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md` => `tasks/archive/contract-20260905-1308-issue-283-immutable-task-id.md`
> **Archive Projection V1**: `tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md` => `tasks/archive/review-20260905-1308-issue-283-immutable-task-id.md`

# Task Review: issue-283-immutable-task-id

> **Status**: Pending
> **Plan**: plans/archive/plan-20260902-2101-issue-283-immutable-task-id.md
> **Contract**: tasks/archive/contract-20260905-1308-issue-283-immutable-task-id.md
> **Notes File**: tasks/archive/notes-20260905-1308-issue-283-immutable-task-id.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-02 21:01
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change
- Intended files changed: `src/core/state/sprint-backlog-rows.ts`, `src/core/state/coordination-identity.ts`, `src/core/state/sprint-schema-v1.ts` (new), `src/core/state/sprint-schema-migration.ts` (new), `src/effects/state/sprint-schema-migration.ts` (new), `src/effects/state/coordination-claim-token.ts`, `src/core/engineers/scheduling.ts`, `src/cli/commands/sprint.ts`, `src/cli/hook/session-context.ts`, the four sprint-reading shell helpers plus their `assets/templates/helpers/` mirrors, the sprint templates, `docs/`, `tasks/todos.md`, and the sprint fixtures across `tests/`.
- Actual files changed: 94 files, +6537 -1113 against `origin/main` at the merge base `b35fd0a78792069c07d28b0acf5d4fbef8b25ab5`; see `git diff origin/main...codex/issue-283-immutable-task-id --stat`.
- Commands passed: `bun run check:type`; `bun test --timeout 60000`; `bun run check:state-boundaries`; `bash scripts/check-deploy-sql-order.sh`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; `bash scripts/check-task-workflow.sh --strict`; `bun scripts/inspect-project-state.ts --repo . --format text`; `bun src/cli/index.ts init --repo . --dry-run`.
- Residual risks: both tracked sprints migrated to schema 2 on this branch (`772cc059`, `ed1a01de`), so the migration receipts must not be re-run — the migrated id preimage includes the migrating clone's git common directory. The plan `Source Ref` grammar still binds a plan to its row by exact Task cell text, so a title edit still needs a plan header update even though `task_id` survives (tracked as `plan-source-ref-task-cell-coupling` in `tasks/todos.md`).
- Reviewer action required: inspect diff and card
- Rollback: revert branch `codex/issue-283-immutable-task-id`; nothing outside the branch was mutated and the repo sprint file is unchanged.

## Mode Evidence

- Selected route: planning -> contract execution in an isolated worktree.
- P1/P2/P3 evidence: captured in `plans/archive/plan-20260902-2101-issue-283-immutable-task-id.md` `## Captured Planning Output`; the deviation from the issue's recommended row shape and the version-domain choice are argued in `tasks/archive/notes-20260905-1308-issue-283-immutable-task-id.md`.
- Root cause or plan evidence: not a bugfix contract; the defect is the identity derivation itself, documented in issue #283 and in `docs/architecture/shared-coordination-plane.md` section 2.

## Verification Evidence

- Waza `/check` run: not run; the acceptance gate is the orchestrator's.
- Commands run: the nine commands listed on the Human Review Card, all inside this worktree.
- Manual checks: `bun src/cli/index.ts sprint migrate-schema --sprint plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md --target-ref HEAD` against real repo state; it refused with `row 10 task_id=713faba2... lease=completing` and left both the sprint and the carrier untouched, which is the live-lease refusal the migration contract requires.
- Supporting artifacts: `tests/unit/sprint-schema-v2-identity.test.ts` (identity/revision properties, fail-closed cases, Work Graph join), `tests/unit/sprint-schema-migrate.test.ts` (byte-golden rewrite plus real-repo migration, live-lease refusal, receipt bindings), `tests/sprint-backlog-grammar-drift.test.ts` with two new schema 2 fixtures binding the awk authority to the TypeScript projection.
- Implementation notes reviewed: `tasks/archive/notes-20260905-1308-issue-283-immutable-task-id.md`.
- Run snapshot: `.ai/harness/runs/`.

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- `task_id` is now read from the backlog row's persisted `ID` cell instead of being derived from the exact Task cell text; `task_revision` gained the Task cell in its preimage and is domain-separated by the literal `protocol-v2`.
- `COORDINATION_PROTOCOL` is unchanged at 1, so every lease owner record already on disk still parses.
- `WorkPackageDefinitionV1.task_ref` became `task_id`; `task_ref` survives only on `ProjectedWorkPackageV1` as a derived display projection.
- A backlog schema 1 sprint can no longer mint identity anywhere: `projectCanonicalTasks` fails closed and names `repo-harness sprint migrate-schema`.
- Missing, malformed, or duplicated `ID` cells fail Sprint projection and `check-task-workflow --strict`.
- `sprint-backlog init` now mints a random 64-hex id for the template row; `complete-task` and `start-task` preserve the `ID` cell when rewriting.
- New command `repo-harness sprint migrate-schema`.

## Residual Risks / Follow-ups

- Both tracked sprints are backlog schema 2: the succession sprint migrated in `772cc059` after its stranded `completing` lease on row 10 was cleared through the bounded `sprint reconcile` recovery window, and the repair campaign sprint in `ed1a01de` once its owner released every lease. The v1-parser removal trigger stays recorded in `tasks/todos.md`, now waiting on archived sprints and downstream repos rather than on these two.
- `proveCanonicalTaskPlan()` still binds plans to rows through `sprint:<path>#<Task cell>`, so a rename still fails that proof with `plan_source_mismatch`; that is a separate authority and is tracked as the `plan-source-ref-task-cell-coupling` row in `tasks/todos.md`.
- Migrated ids carry the schema 1 preimage, which includes the migrating clone's git common-directory path. Migrate once and commit the result.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- None recorded by the implementer; the acceptance verdict belongs to the reviewer.

## Retest Steps

- Re-run: `bun run check:type`; `bun test --timeout 60000`; `bun run check:state-boundaries`; `repo-harness run check-task-workflow --strict`.
- Re-check: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-1308-issue-283-immutable-task-id.md --strict`.

## Summary

- Backlog schema 2 persists task identity in an `ID` column, so a Task title edit is a rename that keeps every Lease, message, Work Graph mapping, and external-source binding attached while still drifting stale offers through `task_revision`. A one-shot fail-closed migration with a byte-bound receipt carries each row's existing derived id forward.
