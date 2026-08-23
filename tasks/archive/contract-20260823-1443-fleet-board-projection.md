> **Archived**: 2026-08-23 14:43
> **Related Plan**: plans/archive/plan-20260823-1049-fleet-board-projection.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260823-1443

# Task Contract: fleet-board-projection

> **Status**: Fulfilled
> **Plan**: plans/plan-20260823-1049-fleet-board-projection.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-23 13:19
> **Review File**: `tasks/reviews/20260823-1049-fleet-board-projection.review.md`
> **Notes File**: `tasks/notes/20260823-1049-fleet-board-projection.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

WP0-WP3-A now provide exact task, publication, readiness, feedback, and inbox facts, but an operator still cannot observe authorized repositories through one deterministic read-only surface. Without WP4, fleet assignment remains repository-by-repository, faults hide healthy work, and there is no measured basis for deciding whether a later daemonized WP5 is justified.

## Goal

Implement PRD v3 Module 7 as a projection-only work-package: `fleet board --json` produces one deterministic `FleetBoardSnapshotV1` over every authorized registry repository, while `fleet watch --format jsonl` emits the same schema in immediate, non-overlapping rounds. Repository-local faults are isolated as typed rows, final WP3/WP3-A authority is reused without mutation, and the ten-repository acceptance fixture completes within ten seconds with a hard thirty-second per-round ceiling.

## Scope

- In scope: pure fleet schema/digest/column classification; strict all-authorized registry snapshot; lock-free body-free inbox summary; bounded cross-repository collector; existing readiness/feedback joins; abortable provider observation through the readiness boundary; JSON/JSONL CLI; fault, consistency, signal, performance, and zero-mutation tests.
- Out of scope: MCP/UI/daemon/webhook/SSE/filesystem watcher; PTY/session wake/resume; acquisition/bind/reopen/takeover/merge; feedback intake/delivery; inbox delivery/ack; lease or task mutation; provider cache; changing the single-repository board contract; compatibility parsers; WP5.
- Taste constraints: registry, board, readiness, feedback, and inbox each remain their datum's sole authority. No shadow parser, provider identity synthesis, priority inference, global atomicity claim, or `COORDINATION_PROTOCOL`/task-digest change. `priority_counts` is absent because Task Inbox V1 has no priority authority. Attention precedence is `user > agent > external > none`; missing publication means `head_sha: null`.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if final read-side APIs cannot produce a lock-free body-free inbox observation, if the existing readiness boundary cannot share provider validation with an abortable adapter, or if one bad repository cannot be isolated without hiding healthy rows. Cheapest proof: effect fixtures must demonstrate unchanged authority bytes, a killed/timeout provider child with no partial snapshot, and nine healthy rows remaining when the tenth repository fails.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260823-1049-fleet-board-projection.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260823-1049-fleet-board-projection.review.md`
- Notes file: `tasks/notes/20260823-1049-fleet-board-projection.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"fleet-board-deterministic-contract","kind":"deterministic_test","paths":["src/core/fleet/board.ts","src/effects/fleet/board.ts","src/cli/commands/fleet.ts","src/effects/repo-registry.ts","src/effects/publication/merge-readiness.ts","src/effects/fleet/task-inbox.ts","tests/unit/fleet-board.test.ts","tests/effects/fleet-board.test.ts","tests/cli/fleet-board.test.ts","tests/board-projection.test.ts","tests/board-snapshot-consistency.test.ts","tests/cli/registry.test.ts","tests/unit/merge-readiness-v1-effect.test.ts","tests/unit/task-inbox-v1.test.ts"]},{"id":"fleet-board-runtime-readback","kind":"runtime_readback","paths":["src/effects/fleet/board.ts","src/cli/commands/fleet.ts","src/effects/repo-registry.ts","src/effects/publication/merge-readiness.ts","src/effects/fleet/task-inbox.ts","tests/effects/fleet-board.test.ts","tests/cli/fleet-board.test.ts","tests/cli/registry.test.ts","tests/unit/merge-readiness-v1-effect.test.ts","tests/unit/task-inbox-v1.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260823-1049-fleet-board-projection.contract.md
  - tasks/reviews/20260823-1049-fleet-board-projection.review.md
  - tasks/notes/20260823-1049-fleet-board-projection.notes.md
  - docs/architecture/.projection-manifest.json
  - src/core/fleet/board.ts
  - src/effects/fleet/board.ts
  - src/cli/commands/fleet.ts
  - src/effects/repo-registry.ts
  - src/effects/publication/merge-readiness.ts
  - src/effects/fleet/task-inbox.ts
  - tests/unit/fleet-board.test.ts
  - tests/effects/fleet-board.test.ts
  - tests/cli/fleet-board.test.ts
  - tests/board-projection.test.ts
  - tests/board-snapshot-consistency.test.ts
  - tests/cli/registry.test.ts
  - tests/unit/merge-readiness-v1-effect.test.ts
  - tests/unit/task-inbox-v1.test.ts
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
    - src/core/fleet/board.ts
    - src/effects/fleet/board.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260823-1049-fleet-board-projection.notes.md
  tests_pass:
    - path: tests/unit/fleet-board.test.ts
    - path: tests/effects/fleet-board.test.ts
    - path: tests/cli/fleet-board.test.ts
    - path: tests/board-projection.test.ts
    - path: tests/board-snapshot-consistency.test.ts
    - path: tests/cli/registry.test.ts
    - path: tests/unit/merge-readiness-v1-effect.test.ts
    - path: tests/unit/task-inbox-v1.test.ts
  commands_succeed:
    - bun run check:type
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: five-column deterministic fleet snapshot; strict registry authority; all authorized repos; immediate non-overlapping JSONL watch; typed repository fault isolation; exact readiness/feedback/inbox joins; no mutation.
- Edge cases: malformed registry, unreadable/symlink repo authority, torn single-repo board or inbox read, missing/ambiguous publication, provider unavailable/timeout, one slow repository, abort before/after first line, unsupported task state, empty registry.
- Regression risks: weakening existing registry fallback consumers, duplicating provider parsing, exposing inbox bodies, constructing locks from a read path, changing single-repo board semantics, leaking absolute paths/secrets, overlapping watch rounds, orphan provider children, or touching coordination digest domains.

## Rollback Point

- Commit / checkpoint: pre-WP4 `71a7a877`.
- Revert strategy: revert the single WP4 fleet-board publication unit; WP0-WP3-A read and mutation surfaces remain independently usable.
