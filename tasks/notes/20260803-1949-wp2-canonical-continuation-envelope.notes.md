# Implementation Notes: wp2-canonical-continuation-envelope

> **Status**: Active
> **Plan**: plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md
> **Contract**: tasks/contracts/20260803-1949-wp2-canonical-continuation-envelope.contract.md
> **Review**: tasks/reviews/20260803-1949-wp2-canonical-continuation-envelope.review.md
> **Last Updated**: 2026-08-03 19:49
> **Lifecycle**: notes

## Design Decisions

### Route decision table (Falsifier gate result)

Evaluated in order, first match wins. Every condition reads a field the
effective-state projector or the sprint file already publishes, so no route
needed a new state source or any persisted state.

| # | Route | Condition | Deriving field |
|---|-------|-----------|----------------|
| 1 | `halt` | any hard blocker | `blockers` |
| 2 | `halt` | active-plan marker points at a missing plan | `stale_sources` contains `active_plan_marker` |
| 3 | `halt` | plan present, status not `approved`/`executing` | `authoritative_plan.status` |
| 4 | `continue_active_plan` | plan `approved`/`executing` with a next step | `authoritative_plan`, `next_action` |
| 5 | `verify_or_finish` | plan `approved`/`executing`, no next step left | `authoritative_plan`, `next_action === null` |
| 6 | `idle` | no plan and no active sprint | `authoritative_plan`, `active_sprint.path` |
| 7 | `halt` | sprint marker set but its file is not fresh | `active_sprint.freshness` |
| 8 | `halt` | sprint status not `Approved`/`Executing` | sprint `> **Status**:` header |
| 9 | `halt` | backlog empty or carrying an unrecognized row status | sprint `## Backlog` rows |
| 10 | `advance_sprint` | at least one `[ ]` backlog row | sprint `## Backlog` rows |
| 11 | `complete` | every backlog row `[x]` | sprint `## Backlog` rows |

### `next_action` is the `continue` vs `verify_or_finish` discriminator

The obvious alternative was `readiness`'s `complete_approved_work_package`
requirement key, which the effective-state projector derives from exactly the
condition wanted here (plan approved/executing with no open task). It is
unusable as the discriminator: that key exists only in the `standard` and
`strict` requirement matrices, so under `lite` it never appears in
`readiness.requirements` and a satisfied/missing read is not available at all.
`next_action` is total, is the projector's single "next step inside the active
plan" field, and its handoff fallback is a real remaining step rather than a
false positive. The requirement-key name is still reused as the
`verify_or_finish` reason so the vocabulary stays shared.

### Resolution is the read-only inspect path, not `resolveEffectiveState`

`state next` calls `resolveEffectiveStateReadOnly(cwd, nowMs, { targetPaths:
[], operationKind: 'inspect' })`. Two independent reasons:

- `resolveEffectiveState` publishes `.ai/harness/state/effective.json` and
  allocates a Git-common-dir state version. The contract requires the command
  to perform no writes, so the read-only entry is the only admissible one.
- With a plan present and no target paths, the resolver deliberately leaves
  `operationKind` undefined and fails closed on
  `workflow_profile:invalid_risk_input`. Every `state next` call in a repo with
  an active plan would then be `halt`, which is a resolver artifact, not a real
  halt. Passing `operation: 'inspect'` is the existing whole-repo inspection
  convention already used by `buildStateSnapshot` and the Stop hook's
  `resolveStopEffectiveState`; it changes no resolver input or recipe.

Consequence worth knowing for WP3: `progress_token` folds the hard-blocker set,
so the token in the envelope is the inspect-resolution token and can differ
from `state resolve --json` run with edit-scoped risk input. Envelope-to-
envelope comparison (what WP3 does) stays consistent.

### The sprint file is read for exactly two predicates

`EffectiveState` exposes the active sprint only as `{path, freshness}`, which
cannot separate `advance_sprint` from `complete`. The projector therefore reads
the sprint file itself, but only for its `> **Status**:` header and the status
cell of each `## Backlog` row (mirroring `sprint-backlog.sh`'s `backlog_rows`
scan). It never reads the task, mode, acceptance, or plan cells and never picks
a row: which row runs next stays `sprint-backlog start-task`'s decision, and
the envelope only names that command.

### Anomaly halts are fail-closed totality, not extra features

Rows 2, 7, 8, 9 exist because the alternative is a confidently wrong actionable
answer: naming `start-task` for a Draft sprint (the helper refuses anything
outside Approved/Executing), or reporting `complete` for a sprint whose backlog
is empty or whose row status is neither `[ ]` nor `[x]`. `[ ]` and `[x]` are the
only cells `sprint-backlog` writes -- in-flight work keeps its row pending and
lives in a separate marker directory -- so any other cell is an unrecognized
state, never a finished goal.

## Deviations From Plan Or Spec

- None. `continue_active_plan` carries `repo-harness state resolve --json`, the
  "active plan/contract status command" named in the plan's task breakdown
  (`repo-harness status` reports CLI install state, not plan state), and
  `verify_or_finish` carries `repo-harness run verify-sprint` verbatim from the
  contract Goal.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `readiness.complete_approved_work_package` as the closeout discriminator | Rejected | Absent from the `lite` requirement matrix, so it is not derivable for every profile |
| Shell out to `sprint-backlog next` for sprint state | Rejected | Makes the projection effectful and helper-installation dependent; two text predicates are cheaper and keep row selection where it is |
| Put the backlog row scan in `artifact-parsers.ts` | Rejected | One consumer only; keeping it private to the projector avoids advertising a second row-parsing authority |
| Include the pending row index in `unit_ref` | Rejected | Row identity is `sprint-backlog`'s authority; the sprint path is a stable unit reference across a loop |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
