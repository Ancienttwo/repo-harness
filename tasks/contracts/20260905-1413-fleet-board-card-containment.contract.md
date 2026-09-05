# Task Contract: fleet-board-card-containment

> **Status**: Fulfilled
> **Plan**: plans/plan-20260905-1413-fleet-board-card-containment.md
> **Task Profile**: bugfix
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 17:35
> **Review File**: `tasks/reviews/20260905-1413-fleet-board-card-containment.review.md`
> **Notes File**: `tasks/notes/20260905-1413-fleet-board-card-containment.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`
> **Substantive Change SHA256**: `sha256:1c833dc36fd235517ec1b4bd75207700591f34b53f87f8c281bf16b40144c255`

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
- Also in scope, as the one blocking out-of-scope fix: the browser transport
  decode of the two additive fields in `src/operator-web/types.ts` and
  `src/operator-web/fixture.ts`, because they are required members of the type
  the browser shares and the branch must type-check on its own.
- Out of scope: browser board chips, composer copy, i18n, and styling for the
  new fields; deriving the claim-scope canonical fence from the lease record;
  `task_label` null versus empty-cell ambiguity; R1 delivery/reachability
  contributing to `attention_owner`.
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

- card containment pre-fix artifact: `.ai/harness/runs/pre-fix-fleet-board-card-containment.log`
  captures the same work package's first defect, where `src/effects/fleet/board.ts:307-314`
  let `collectBounded` rethrow the first card observation error out of
  `collectRepository` and `collectFleetBoard` mapped it to a repository-level
  `repositoryError`, so one missing publication receipt produced `status: 'unreadable'`
  with `cards: []` for the whole repository.
- root_cause: `src/effects/fleet/task-message-request.ts` released the registry
  authorization lock after resolving the repository and then re-checked that authority
  with an unlocked read at the top of the task-lock section, so a `read_only` revocation
  committing between that re-check and `writeImmutableEvent` was never observed and the
  operator send returned `created: true` against a repository that was already read only.
- repro: `bun test --timeout 60000 tests/effects/operator-task-message.test.ts` on the
  unfixed source; the guard pauses the sender's canonical `git show` only while the task
  lock is held, commits a `read_only` revocation, releases the barrier, and observes
  `{ ok: true, created: true }` instead of `repository_read_only`.
- regression_guard: tests/effects/operator-task-message.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/pre-fix-operator-task-message-publication-authority.log

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
  # Blocking type-level fix only: the two additive fields are required members of
  # the transport type this browser package constructs by literal.
  - src/operator-web/types.ts
  - src/operator-web/fixture.ts
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
    - path: tests/unit/operator-web-types.test.ts
  commands_succeed:
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun run build:operator-web
    - bun run check:type
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
- Regression risks: the operator write now nests registry inside task. The
  nesting is one-directional: `withRepoHarnessRegistryAuthorizationLock` has one
  product caller, nothing `src/effects/repo-registry.ts` runs under that lock
  acquires a task lock, and its only caller-supplied hook writes a config file,
  so no cycle exists. Three existing assertions changed meaning: a revocation
  that lands while a publication waits for the task lock now wins, a blocked
  canonical read no longer pins the machine-global registry lock, and the
  browser decoder now requires `counts.unclassified` and a nullable card
  `error` in the payload it accepts.

## Rollback Point

- Commit / checkpoint: `1a9a5ae1` (branch base on `main`)
- Revert strategy: revert the fleet board, task inbox, task message request, and
  transport projection commits on `codex/fleet-board-card-containment` together
  with their tests; no persisted artifact format changes, so no data migration.
