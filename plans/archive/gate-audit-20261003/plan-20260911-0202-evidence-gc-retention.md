# Plan: Bound harness run summaries and add an evidence reclaim path

> **Status**: Executing
> **Created**: 20260911-0202
> **Slug**: evidence-gc-retention
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: focused retention tests plus helper projection drift checks
> **Rollback Surface**: additive delete-only policy; revert restores unbounded growth
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260911-0202-evidence-gc-retention.contract.md`
> **Task Review**: `tasks/reviews/20260911-0202-evidence-gc-retention.review.md`
> **Implementation Notes**: `tasks/notes/20260911-0202-evidence-gc-retention.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260911-0202-evidence-gc-retention.md`
- Sprint contract: `tasks/contracts/20260911-0202-evidence-gc-retention.contract.md`
- Sprint review: `tasks/reviews/20260911-0202-evidence-gc-retention.review.md`
- Implementation notes: `tasks/notes/20260911-0202-evidence-gc-retention.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260911-0202-evidence-gc-retention.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260911-0202-evidence-gc-retention.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260911-0202-evidence-gc-retention.md`.

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
- Contract file: `tasks/contracts/20260911-0202-evidence-gc-retention.contract.md`
- Review file: `tasks/reviews/20260911-0202-evidence-gc-retention.review.md`
- Implementation notes file: `tasks/notes/20260911-0202-evidence-gc-retention.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260911-0202-evidence-gc-retention.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260911-0202-evidence-gc-retention.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: additive delete-only policy; revert restores unbounded growth
- **Verification boundary**: focused retention tests plus helper projection drift checks
- **Review/acceptance boundary**: `tasks/reviews/20260911-0202-evidence-gc-retention.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260911-0202-evidence-gc-retention.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260911-0202-evidence-gc-retention.contract.md`, `tasks/reviews/20260911-0202-evidence-gc-retention.review.md`, and `tasks/notes/20260911-0202-evidence-gc-retention.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260911-0202-evidence-gc-retention.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: additive delete-only policy; revert restores unbounded growth

## Captured Planning Output

## Problem

`.ai/harness/` has two unbounded growth paths and no operator reclaim path.

1. **Evidence checkpoints (fixed upstream, no downstream exit).** Every Stop
   publishes a whole-ledger checkpoint (`src/core/evidence/checkpoint.ts:188`),
   so each `checkpoint.json` restates the complete covered-event list. Growth is
   O(n^2). Retention (`collectObsoleteCheckpoints`,
   `src/effects/evidence/checkpoint-store.ts:144`) landed in `701aeebf`
   (2026-09-10, released in 0.19.0) and runs unconditionally on every successful
   publish (`checkpoint-store.ts:430`), including the idempotent path. Downstream
   repos therefore self-heal on their next Stop -- but only if publish is reached.
   `publishCheckpointFromLedger` returns `skipped: no-ledger` when the ledger is
   absent, and an abandoned repo never Stops again. Measured backlog on this
   machine before manual cleanup: 9.7 GB in one repo, ~10.5 GB across eight.
   `pruneCheckpointCache` (`checkpoint-store.ts:174`) is exported but has zero
   CLI surface, so an operator cannot reclaim the space or even measure it.

2. **Stop run summaries.** `src/cli/hook/stop-handler.ts:436` writes
   `${runsDir}/${runId}.json` on every Stop and nothing ever deletes it. This
   repo holds 5931 files / 24 MB back to 2026-05-25.

`runs/hook-events.jsonl.archive` is explicitly **out of scope**: it is already
bounded at 8 MB segments / 256 MB / 32 segments
(`src/effects/hook-event-log.ts:8-10`) and works as designed. Operator decision
this round: leave those constants alone.

## Hard constraint discovered in P2

`scripts/verify-sprint.sh:913-937` reads a run summary **back**: after
`--prepare-acceptance` freezes a run, the finalize step resolves `.run_file`
from `.ai/harness/checks/*.json` and re-validates that exact snapshot. A
time-or-count-only sweep of `runs/*.json` would delete a prepared acceptance
snapshot and strand the acceptance with no operator exit (the same failure shape
as a wedged reservation).

`src/effects/evidence/verification-execution.ts:919-921` is a third writer in the
same directory: an immutable `verification-${executionId}.json` the evidence
ledger binds by sha256. `readValidRunResult:507-510` treats a missing file as an
absent baseline, so `baselineResult:574-580` fails a `baseline_with_delta`
criterion permanently -- a rerun only mints a new execution id, and the only
escape is editing the contract, which discards the whole `criterion_reuse` cache.

Stop's summaries and `verify-sprint.sh:1009`'s snapshots share the `run-` prefix,
so no filename rule separates the three. Only the record shapes do.

## Decision

One retention policy, one owner, two callers.

- New `src/effects/run-summary-retention.ts` owns the policy: delete only records
  carrying Stop's own `reason: "session-stop"` marker, keeping the newest
  `RUN_SUMMARY_RETENTION_COUNT` by mtime. Positive identification, not a denylist
  of the other writers' names: a fourth writer is protected by default, and no
  second authority is consulted to decide what to keep. Count cap, not byte cap
  -- these are ~4 KB fixed-shape records, so count is the honest bound, and it
  mirrors `HOOK_LOG_ARCHIVE_SEGMENTS` rather than inventing a new policy surface.
  No `policy.json` key: there is no second consumer asking to tune it.
- `stop-handler.ts` calls it after its run-summary write, so the bound is
  self-healing and needs no operator step.
- New `scripts/evidence-gc.ts` helper (`repo-harness run evidence-gc`) calls the
  same function plus `pruneCheckpointCache`, with `--dry-run` reporting
  reclaimable bytes per class. This is the missing downstream exit for the
  checkpoint backlog: it works on a repo whose ledger is gone and on a repo that
  will never Stop again.

Retention failure never fails Stop: a sweep error is reported, not thrown, on
the hook path. The gc helper fails closed and reports.

## Task Breakdown

- [ ] Add `src/effects/run-summary-retention.ts` with the pin-aware
      sweep and `RUN_SUMMARY_RETENTION_COUNT`, plus focused tests covering: pin
      set honoured, newest-N kept, unreadable checks entry does not widen the
      delete set, symlinked run entry refused.
- [ ] Wire the sweep into `stop-handler.ts` after the run-summary write, fail-open
      on the hook path, with a regression test proving a pinned snapshot survives
      a sweep that exceeds the count bound.
- [ ] Add `scripts/evidence-gc.ts` + helper registration in
      `assets/workflow-contract.v1.json` (`helpers.scripts`, `helpers.descriptions`),
      `.ai/harness/workflow-contract.json`, and the `Verification & maintenance`
      group in `src/cli/commands/run.ts`; support `--dry-run` and `--repo`.
- [ ] Document the reclaim path for pre-0.19.0 upgraders in `docs/` and the
      release surface, stating the self-heal-on-next-Stop behaviour and when the
      manual command is required.

## Verification

- `bun test --timeout 60000 tests/evidence-checkpoint.test.ts` plus the new
  retention tests (focused; the changed behaviour is confined to two modules).
- `bun run check:hooks`, `bun run check:helpers` (helper projection drift),
  `bash scripts/check-task-workflow.sh --strict`,
  `bun src/cli/index.ts init --repo . --dry-run`.
- `repo-harness run evidence-gc --dry-run` against a fixture repo seeded with a
  pinned prepared snapshot, proving the pinned file is reported as retained.

## Rollback

Both changes are additive and delete-only-on-explicit-policy. Reverting the
commit restores unbounded growth; no data is migrated or reshaped, and no
existing file format changes.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Add `src/effects/run-summary-retention.ts` with the pin-aware
- [ ] Wire the sweep into `stop-handler.ts` after the run-summary write, fail-open
- [ ] Add `scripts/evidence-gc.ts` + helper registration in
- [ ] Document the reclaim path for pre-0.19.0 upgraders in `docs/` and the
