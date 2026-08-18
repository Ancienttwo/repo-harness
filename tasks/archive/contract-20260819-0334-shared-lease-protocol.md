> **Archived**: 2026-08-19 03:34
> **Related Plan**: plans/archive/plan-20260818-1156-shared-lease-protocol.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260819-0334

# Task Contract: shared-lease-protocol

> **Status**: Fulfilled
> **Plan**: plans/plan-20260818-1156-shared-lease-protocol.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 12:00
> **Review File**: `tasks/reviews/20260818-1156-shared-lease-protocol.review.md`
> **Notes File**: `tasks/notes/20260818-1156-shared-lease-protocol.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Two linked worktrees of one clone can concurrently claim the same sprint backlog row today.
`scripts/sprint-backlog.sh:555` derives `in_flight_dir()` from a repo-relative path, so
`task_in_flight()` (:563) only sees claims made from the same working tree, and
`acquire_backlog_lock()` (:160) has the same per-worktree scope so back-fill is not
serialized across agents either. Contract mode keeps a claimed row `[ ]` until finish
back-fills it, so the tracked status cells can never express global "doing" state.

If this ships wrong, two agents silently do the same task, or worse, an agent whose task was
reassigned deletes the new owner's lease or marks the new owner's in-flight work complete.

## Goal

Move sprint execution ownership onto the shared coordination plane at
`$GIT_COMMON_DIR/repo-harness/coordination/v1/`, so that exactly one worktree can own a task
at a time and every ownership transfer is safe under crash and race.

Authority split that must hold after this lands:

- the tracked sprint row on the canonical target ref owns task definition, acceptance, and completion
- the common-dir lease owner record plus its fencing token owns execution ownership
- `git worktree list --porcelain` owns whether a worktree exists
- attempt receipts stay evidence and never transfer ownership

Identity and revision derivation, which everything else depends on:

- `task_id = hash(protocol + repo identity + canonical sprint path + exact Task cell text)`; the row
  index is excluded, because deleting or reordering a row would otherwise rewrite the identity of
  every row below it and orphan live leases
- `task_revision = hash(task_id + Mode cell + Acceptance cell)`; the Status cell is excluded, because
  a sibling row completing must not invalidate a live claim

## Scope

- In scope: coordination types and identity derivation; the coordination plane primitives
  (per-task transaction lock with stale reclaim, durable owner write, `unknown` classification for
  empty lease dirs and malformed or symlinked owner records); `claim` as a compare-and-swap against
  the canonical target ref plus `bind`, `release`, `steal`, `reconcile`, each gated on `claim_id`
  inside the per-task lock; `start-task` integration replacing `record_in_flight` and relocating
  `acquire_backlog_lock()`; retirement of `--force`; explicit `--task-id` with no multi-agent
  claim-next; completion split by transaction boundary (contract finish validates claim before
  building the publication tree and releases after publishing, inline completes under the common
  backlog lock, `reconcile` clears a residual lease whose canonical row is already complete);
  quiescent fail-closed cutover; the concurrency falsification harness over real linked worktrees.
- Out of scope: the read-only board projection and any `state board` command; any hook wiring;
  worktree metadata relocation into the coordination plane; `allowed_paths` conflict detection;
  lock-wait or merge-wait telemetry; any change to sprint row columns or row semantics; any change
  to `AttemptReceiptV1`'s shape or meaning; any cross-machine or cross-clone coordination.
- Taste constraints: mirror the existing pure-projection split in `src/core/state/` and
  `src/effects/state/`; shell changes follow the existing style in `scripts/sprint-backlog.sh` and
  `scripts/contract-worktree.sh`, whose `assets/templates/helpers/` mirrors must stay byte-identical.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a claim cannot survive an unrelated row completing. Cheapest proof point,
to run before building anything else: derive `task_revision` for row B, complete row A so the sprint
file changes, re-derive row B's `task_revision`, and assert it is unchanged. If that assertion cannot
be made to hold, the revision granularity is wrong and every downstream verb inherits the defect.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260818-1156-shared-lease-protocol.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-1156-shared-lease-protocol.review.md`
- Notes file: `tasks/notes/20260818-1156-shared-lease-protocol.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"coordination-deterministic-suite","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260818-1156-shared-lease-protocol.md
  - tasks/todos.md
  - tasks/contracts/20260818-1156-shared-lease-protocol.contract.md
  - tasks/reviews/20260818-1156-shared-lease-protocol.review.md
  - tasks/notes/20260818-1156-shared-lease-protocol.notes.md
  - src/core/state/
  - src/effects/state/
  - src/cli/commands/
  - src/cli/index.ts
  - scripts/sprint-backlog.sh
  - scripts/contract-worktree.sh
  - assets/templates/helpers/sprint-backlog.sh
  - assets/templates/helpers/contract-worktree.sh
  - tests/
  # Amended after slice B acceptance: this work package made start-task require
  # --task, which stranded the bare `start-task --execute` form still named by the
  # continuation envelope's advance_sprint route and by these two documents.
  # Repairing prose this change itself invalidated is completing the change, not
  # widening it; both files are named exactly, no docs/ or assets/ prefix is opened.
  - docs/reference-configs/long-run-continuation.md
  - assets/skills/repo-harness-product/references/sprint.md
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
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
    - tasks/notes/20260818-1156-shared-lease-protocol.notes.md
  tests_pass:
    - path: tests/coordination-identity.test.ts
    - path: tests/coordination-lease-store.test.ts
    - path: tests/sprint-claim-concurrency.test.ts
  commands_succeed:
    - bun test
    - cmp scripts/sprint-backlog.sh assets/templates/helpers/sprint-backlog.sh
    - cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
