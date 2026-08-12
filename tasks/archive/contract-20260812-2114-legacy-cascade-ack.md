> **Archived**: 2026-08-12 21:14
> **Related Plan**: plans/archive/plan-20260812-1448-legacy-cascade-ack.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260812-2114

# Task Contract: legacy-cascade-ack

> **Status**: Fulfilled
> **Plan**: plans/plan-20260812-1448-legacy-cascade-ack.md
> **Task Profile**: bugfix
> **Workflow Profile**: strict
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-12 14:48
> **Review File**: `tasks/reviews/20260812-1448-legacy-cascade-ack.review.md`
> **Notes File**: `tasks/notes/20260812-1448-legacy-cascade-ack.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The merged Stop-time drift cursor advances after a projection-disabled drain even when the legacy architecture cascade never ran. A transiently missing runner or non-zero `architecture-queue record` therefore acknowledges committed paths that were not delivered, recreating the silent architecture-card loss this cursor was introduced to prevent.

## Goal

Make legacy architecture cascade delivery observable and fail closed: Stop and manual `architecture-projection drain` advance the drift cursor only after every changed path completes the legacy cascade successfully. Failed delivery remains retryable from the prior cursor and emits a bounded diagnostic.

## Scope

- In scope:
  - `src/cli/hook/mutation-observed.ts#processArchitectureCascade` result contract.
  - Stop-handler and manual-drain cursor acknowledgement.
  - Failure-path regression tests and the hook-adapters architecture note required by the architecture sync gate.
- Out of scope:
  - changed-set construction, journal authority, fan-out caps/deduplication, Codex mutation guard parity, consumer repository repairs, release or deployment.
- Taste constraints: preserve the git cursor as the single changed-set authority; do not add a fallback classifier, receipt store, or compatibility path.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a committed-only path disappears from `computeArchitectureDriftChangedSet` after Stop when the runner is unavailable or the cascade helper exits non-zero. Cheapest proof: focused Stop and manual-drain tests using controlled stub runners.

## Root Cause Evidence

- root_cause: `src/cli/hook/stop-handler.ts` and `src/cli/commands/architecture-projection.ts` consume `acknowledgeSourceEvents=true` from the disabled provider after calling `processArchitectureCascade`, but `src/cli/hook/mutation-observed.ts#processArchitectureCascade` returns `void` and silently swallows runner absence and helper failures.
- repro: create a committed change after the stored cursor, disable projection, remove the repo-harness runner from the hook environment, run Stop, then observe cursor at HEAD and an empty next changed set.
- regression_guard: tests/stop-handler.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/legacy-cascade-ack-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260812-1448-legacy-cascade-ack.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260812-1448-legacy-cascade-ack.review.md`
- Notes file: `tasks/notes/20260812-1448-legacy-cascade-ack.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260812-1448-legacy-cascade-ack.contract.md
  - tasks/reviews/20260812-1448-legacy-cascade-ack.review.md
  - tasks/notes/20260812-1448-legacy-cascade-ack.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - docs/architecture/
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
    - tasks/notes/20260812-1448-legacy-cascade-ack.notes.md
  tests_pass:
    - path: tests/stop-handler.test.ts
    - path: tests/architecture-projection-orchestration.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior: cursor advances only after every legacy cascade delivery succeeds in both automatic Stop and manual drain.
- Edge cases: missing runner, primary helper non-zero exit, request-triggered follow-up failure, empty changed set, and the existing successful fleet path.
- Regression risks: per-path Stop fan-out remains intentionally unchanged and tracked in `tasks/todos.md`.

## Rollback Point

- Commit / checkpoint: branch `codex/legacy-cascade-ack`, fork `221a3732`.
- Revert strategy: revert this branch; the unchanged prior cursor is already the rollback/retry boundary.
