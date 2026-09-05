# Task Contract: fleet-board-card-containment

> **Status**: Active
> **Plan**: plans/plan-20260905-1413-fleet-board-card-containment.md
> **Task Profile**: bugfix
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 15:40
> **Review File**: `tasks/reviews/20260905-1413-fleet-board-card-containment.review.md`
> **Notes File**: `tasks/notes/20260905-1413-fleet-board-card-containment.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`
> **Substantive Change SHA256**: `sha256:90257428749442ca0f918e76db281c384950fbdbc02723fd8a5650df0076e01f`

## Why

The Fleet read model is the Task Board's only view of every registered
repository. Its failure unit was the repository, so a single throwing card
observation replaced every readable row of that repository with an empty
`unreadable` row, and a single sprint-cell edit made the task inbox permanently
unreadable through that same path. An operator watching the board could not
tell the difference between "this repository has no work" and "one receipt is
missing". Cards with no sound column were silently absent from the totals, so
the board's own numbers did not add up to the rows it displayed.

## Goal

Contain Fleet board observation failures at the card boundary: a throwing card
observation yields a typed card error and no classification while its sibling
cards stay readable; unclassified cards are counted; the round deadline can
preempt a synchronous card phase; and the operator write stops holding the
machine-global registry authorization lock across the per-task lock.

## Scope

- In scope: card-level failure containment and card `error`; `counts.unclassified`
  through the core projection, the digest basis, and the operator transport view;
  inbox scans skipping superseded-revision events with `superseded_revision_count`;
  event-loop yields plus deadline preemption bookkeeping; provider limiter slot
  transfer; registry authority realpath comparison; Agent Runtime read folded into
  card consistency; registry/task lock order in the operator write.
- Out of scope: browser chips and browser decoding of the additive card `error`
  and `counts.unclassified` fields (`src/operator-web/**`); deriving the
  claim-scope canonical fence from the lease record; `task_label` null versus
  empty-cell ambiguity; R1 delivery/reachability contributing to
  `attention_owner`.
- Taste constraints: keep the public repository/card error vocabulary closed and
  message-normalized; never invent field values for a failed observation.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If containing a card failure hid a genuinely unreadable repository — that is, if
a repository whose registry, authority, sprint, or board resolution failed still
reported `status: 'ok'` — this direction would be wrong. The cheapest proof is
`tests/effects/fleet-board.test.ts`, which still requires a repository-level
throw to produce `status: 'unreadable'` with no cards while a card-level throw
produces `status: 'ok'` with a typed card error.

## Root Cause Evidence

- root_cause: `src/effects/fleet/board.ts:307-314` let `collectBounded` rethrow the
  first card observation error out of `collectRepository`, and `collectFleetBoard`
  (`:460-462`) mapped that throw to a repository-level `repositoryError`, so one
  `MergeReadinessError('receipt_unavailable')` on one reviewing card produced
  `status: 'unreadable'` with `cards: []` for the whole repository; the same path
  turned one superseded-revision inbox event, thrown by `assertEventCanonical`
  (`src/effects/fleet/task-inbox.ts:603-607`), into a permanently unreadable
  repository card.
- repro: `bun test --timeout 60000 tests/effects/fleet-board.test.ts` on the unfixed
  source; the containment guard builds a two-card reviewing fixture whose second
  publication receipt cache is absent and observes `status: 'unreadable'` with zero
  cards instead of one readable card beside one failed card.
- regression_guard: tests/effects/fleet-board.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/pre-fix-fleet-board-card-containment.log

## Workflow Inventory

- Source plan: `plans/plan-20260905-1413-fleet-board-card-containment.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260905-1413-fleet-board-card-containment.review.md`
- Notes file: `tasks/notes/20260905-1413-fleet-board-card-containment.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"fleet-board-card-containment-regression-guards","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/fleet/board.ts
  - src/core/operator/fleet-snapshot.ts
  - src/effects/fleet/board.ts
  - src/effects/fleet/task-inbox.ts
  - src/effects/fleet/task-message-request.ts
  - src/effects/operator/fleet-collector-process.ts
  - tests/
  - docs/architecture/
  - plans/plan-20260905-1413-fleet-board-card-containment.md
  - tasks/todos.md
  - tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md
  - tasks/reviews/20260905-1413-fleet-board-card-containment.review.md
  - tasks/notes/20260905-1413-fleet-board-card-containment.notes.md
```

## Evidence Requirements

```yaml
evidence_requirements:
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260905-1413-fleet-board-card-containment.notes.md
  tests_pass:
    - path: tests/effects/fleet-board.test.ts
    - path: tests/unit/fleet-board.test.ts
    - path: tests/unit/operator-fleet-snapshot.test.ts
    - path: tests/unit/task-inbox-v1.test.ts
    - path: tests/effects/task-inbox.test.ts
    - path: tests/effects/operator-task-message.test.ts
    - path: tests/cli/operator-serve.test.ts
    - path: tests/cli/fleet-board.test.ts
    - path: tests/cli/fleet-task-inbox.test.ts
    - path: tests/board-snapshot-consistency.test.ts
  commands_succeed:
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun run build:operator-web
```

## Acceptance Notes (Human Review)

- Functional behavior: a card whose own observation throws carries a typed
  `error`, has `column: null`, and leaves its sibling cards readable; the
  repository stays `status: 'ok'` and `snapshot_consistency: 'degraded'`.
  `counts.unclassified` reports every card with no sound column. An inbox scan
  skips superseded-revision events and reports `superseded_revision_count`; a
  caller naming one exact event and revision still fails closed. The operator
  write releases the registry authorization lock before taking the task lock and
  re-proves the same registry revision under that lock.
- Edge cases: round preemption is never contained at the card boundary, so a
  deadline or abort still fails the whole repository; a repository that returned
  its observation before the round aborted keeps its result even if the round
  clock has since passed the deadline; a registered path under a symlinked
  ancestor or with a trailing separator is valid authority while a symlinked leaf
  is still rejected.
- Regression risks: `bun run check:type` reports six errors inside
  `src/operator-web/**` because the additive `FleetBoardCardV1.error` and
  `FleetBoardCountsV1.unclassified` fields are required by the shared transport
  type while the browser decoder and its demo fixture still construct the
  pre-additive literals. That surface is this work package's declared non-goal
  and is not in Allowed Paths, so the decoder change belongs to the sibling
  browser work package. Two existing lock-order assertions changed meaning:
  a revocation that lands while a publication waits for the task lock now wins,
  and a blocked canonical read no longer pins the machine-global registry lock.

## Rollback Point

- Commit / checkpoint: `1a9a5ae1` (branch base on `main`)
- Revert strategy: revert the fleet board, task inbox, task message request, and
  transport projection commits on `codex/fleet-board-card-containment` together
  with their tests; no persisted artifact format changes, so no data migration.
