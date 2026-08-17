> **Archived**: 2026-08-18 05:03
> **Related Plan**: plans/archive/plan-20260818-0450-unplanned-implementation-advice.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260818-0503

# Task Contract: unplanned-implementation-advice

> **Status**: Fulfilled
> **Plan**: plans/plan-20260818-0450-unplanned-implementation-advice.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 04:50
> **Review File**: `tasks/reviews/20260818-0450-unplanned-implementation-advice.review.md`
> **Notes File**: `tasks/notes/20260818-0450-unplanned-implementation-advice.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`PlanStatusGuard` is the only assertion that implementation changed without an approved plan, and it fires only on the `PreToolUse` `Edit|Write` matcher. Any shell write bypasses it. Inside a contract worktree that does not matter — `allowed_paths_check` is diff-derived and indifferent to the write mechanism — but on `main` with no active plan nothing observes it at all. Without a durable record of how often that happens, there is no basis for deciding whether the gate should ever block.

## Goal

At Stop, when the changed set contains implementation-surface paths and no active plan covers them, emit exactly one advisory line on stderr and append one JSONL evidence record. The Stop result must be unchanged in every case.

## Scope

- In scope: `src/cli/hook/stop-handler.ts` only, reusing the already-resolved `activePlan` and `changedSet` in `runStopHandler`; one new test file.
- Out of scope: enforce mode, a policy key, a `PreToolUse.bash` route, shell-command parsing, any new telemetry metric or typed journal contract, any change to the public route tuple.
- Taste constraints: reuse the exported `isImplementationSurfacePath`; do not write a second path classifier.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the Stop changed set were not diff-derived — if it came from tool-call observation rather than git — this advisory would inherit the same blind spot it exists to cover and the direction would be wrong. Cheapest proof point: `computeArchitectureDriftChangedSet` reads `git status --porcelain -z` (`src/cli/hook/architecture-drift.ts:96`).

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

## Workflow Inventory

- Source plan: `plans/plan-20260818-0450-unplanned-implementation-advice.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0450-unplanned-implementation-advice.review.md`
- Notes file: `tasks/notes/20260818-0450-unplanned-implementation-advice.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md
  - tasks/reviews/20260818-0450-unplanned-implementation-advice.review.md
  - tasks/notes/20260818-0450-unplanned-implementation-advice.notes.md
  - src/cli/hook/stop-handler.ts
  - tests/
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
    - src/cli/hook/stop-handler.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260818-0450-unplanned-implementation-advice.notes.md
  tests_pass:
    - path: tests/stop-handler-unplanned-implementation.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: one stderr line and one JSONL record when implementation paths change with no active plan; silent otherwise; Stop result never altered.
- Edge cases: active plan present; changed set is workflow-surface only; changed set empty; evidence append fails.
- Regression risks: this runs on every Stop, the route already measured as the largest share of hook time, so the added work must stay to one filter over an already-computed array plus one append.

## Rollback Point

- Commit / checkpoint: `af717f89`
- Revert strategy: revert the stop-handler change; the advisory is additive and the evidence file is ignored runtime state.
