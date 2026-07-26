> **Archived**: 2026-07-26 13:32
> **Related Plan**: plans/archive/plan-20260725-2254-session-state-authority-inprocess.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260726-1332

# Task Contract: session-state-authority-inprocess

> **Status**: Fulfilled
> **Plan**: plans/plan-20260725-2254-session-state-authority-inprocess.md
> **Task Profile**: bugfix
> **Workflow Profile**: strict
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-26 08:48
> **Review File**: `tasks/reviews/20260725-2254-session-state-authority-inprocess.review.md`
> **Notes File**: `tasks/notes/20260725-2254-session-state-authority-inprocess.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`SessionStart.default` still resolves Effective State by spawning this package's own CLI, although
PreEdit and Stop already call the same TypeScript authority in-process. The subprocess silently
turns missing package layout, empty stdout, and resolver throws into `null`, so the only mandatory
section carrying task, phase, blockers, and allowed paths can disappear without either host-visible
context or persisted evidence. Leaving the split path also preserves an unnecessary process and
anonymous JSON retyping at the most frequently used recovery boundary.

## Goal

Resolve SessionStart Effective State in-process through the existing typed authority, preserve exact
healthy context/evidence bytes, distinguish a successful non-actionable state from resolver
unavailability, and persist bounded failure diagnostics without leaking raw errors. Preserve
PreEdit and Stop behavior and retain the frozen HRD-08/09 meaning of `child_processes`.

## Scope

- In scope: `runtime.ts` resolver/retry/projector cutover; the existing handler dependency boundary
  needed to carry one event-scoped diagnostic sink; the eight `session-context.ts` advisory provider
  diagnostics; failure-only optional protocol-1 budget evidence; deterministic characterization,
  failure, and parity tests.
- Out of scope: changing `event-telemetry.ts`; instrumenting internal Git/Bun/helper processes in
  `mutation-observed.ts` or `prompt-handler.ts`; root context diet; `tasks/current.md`; delegation
  writer ownership; provider-to-section splitting; `tasks/todos.md`.
- Taste constraints: one typed Effective State authority; no parallel envelope, fallback resolver,
  raw-error persistence, test-only `RunHookOptions`, or compatibility path. A missing state authority
  is represented as bounded fail-closed evidence, never synthesized task/scope data.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Stop and return the plan to Draft if a deterministic pre-change healthy fixture cannot be made
byte-stable, if the in-process path cannot preserve PreEdit's existing non-transient/residual-
transient partition, or if SessionStart failure survival requires a second state authority or
product-only test seam. Cheapest proof: land the focused regression guard against the unfixed
runtime and capture its non-zero pre-fix result before editing production source.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/cli/hook/runtime.ts:179-243` uses `spawnSync` plus missing/empty/parse `return null` branches for SessionStart Effective State, conflating resolver failure with a successful non-actionable state and bypassing mandatory-section evidence.
- repro: `bun test tests/session-state-authority.test.ts` on base `998cb519` fails because the SessionStart state path still contains `spawnSync`/`PACKAGE_ROOT`, has no three-outcome resolver, and cannot emit bounded `HarnessStateUnavailable`.
- regression_guard: tests/session-state-authority.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/session-state-authority-inprocess-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260725-2254-session-state-authority-inprocess.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260725-2254-session-state-authority-inprocess.review.md`
- Notes file: `tasks/notes/20260725-2254-session-state-authority-inprocess.notes.md`
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
  - plans/plan-20260725-2254-session-state-authority-inprocess.md
  - tasks/contracts/20260725-2254-session-state-authority-inprocess.contract.md
  - tasks/reviews/20260725-2254-session-state-authority-inprocess.review.md
  - tasks/notes/20260725-2254-session-state-authority-inprocess.notes.md
  - .ai/harness/runs/session-state-authority-inprocess-pre-fix.log
  - .ai/harness/checks/latest.json
  - src/cli/hook/runtime.ts
  - src/cli/hook/handler-contract.ts
  - src/cli/hook/handler-registry.ts
  - src/cli/hook/session-context.ts
  - src/cli/hook/session-context-budget.ts
  - tests/fixtures/session-start/state-authority-baseline.json
  - tests/session-state-authority.test.ts
  - tests/session-context.test.ts
  - tests/harness-context-budget.test.ts
  - tests/hook-runtime-characterization.test.ts
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - tests/fixtures/session-start/state-authority-baseline.json
    - tests/session-state-authority.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/session-state-authority-inprocess-pre-fix.log
    - tasks/notes/20260725-2254-session-state-authority-inprocess.notes.md
  tests_pass:
    - path: tests/session-state-authority.test.ts
    - path: tests/session-context.test.ts
    - path: tests/harness-context-budget.test.ts
    - path: tests/hook-runtime-characterization.test.ts
    - path: tests/state/effective-state-stability.test.ts
    - path: tests/unit/hrd-08-event-telemetry-and-benchmark.test.ts
    - path: tests/hook-dispatch-diet-report.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
  files_contain:
    - path: src/cli/hook/runtime.ts
      pattern: "HarnessStateUnavailable"
    - path: src/cli/hook/session-context-budget.ts
      pattern: "provider_diagnostics"
  files_not_contain:
    - path: src/cli/hook/runtime.ts
      pattern: "spawnSync"
    - path: src/cli/hook/runtime.ts
      pattern: "PACKAGE_ROOT"
  manual_checks:
    - "Healthy SessionStart additional context and protocol-1 evidence are byte-identical to the captured pre-change fixture"
    - "Resolver failure emits bounded mandatory HarnessStateUnavailable context while runHook returns ok"
    - "child_processes retains direct route-runtime child semantics and remains zero in typed route characterization"
```

## Acceptance Notes (Human Review)

- Functional behavior: SessionStart resolves the existing Effective State authority in-process;
  healthy model context is unchanged; failures become bounded mandatory context plus evidence.
- Edge cases: actionable, non-actionable, blocked, transient-then-success, transient exhaustion,
  non-transient throw, advisory provider throw, all-provider/zero-section evidence.
- Regression risks: root selection, PreEdit retry mapping, evidence dedupe/serialization,
  mandatory-budget handling, and accidental redefinition of `child_processes`.

## Rollback Point

- Commit / checkpoint: base `998cb519` plus generated workflow artifacts before production edits.
- Revert strategy: revert the single implementation commit; no data migration or protocol bump.
