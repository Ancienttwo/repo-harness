# Task Contract: hook-effect-failure-contract

> **Status**: Fulfilled
> **Plan**: plans/plan-20260814-1635-hook-effect-failure-contract.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-14 16:42
> **Review File**: `tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md`
> **Notes File**: `tasks/notes/20260814-1635-hook-effect-failure-contract.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The typed hook runtime currently reports a thrown handler as the same generic
`handler-failed` result whether no durable write landed or a prefix of journal
or Stop projection writes already committed. Its only complete-write knowledge
is also encoded as handler-ID conditionals in `runtime.ts`. If this remains
implicit, retry safety cannot be falsified, partial writes can be mistaken for
zero effects, and future runtime adapters can copy an unsound in-memory receipt
model onto append-only repository state.

## Goal

Add a narrow, contract-driven durable-effect observation for
`mutation-observed` and `stop`; remove their handler-ID completeness branches;
represent thrown executions as known-none, unknown-partial, committed-partial,
or committed-complete without changing the public hook result; and prove by
per-phase fault injection that the next host-delivered same-route event reaches
the normalized no-fault terminal state or fails closed with explicit
reconcile-required evidence.

## Scope

- In scope: the optional `TypedHookHandler` effect contract; invocation-local
  effect tracking through existing post-commit observers; additive validated
  telemetry and fingerprinting; contract-driven complete metrics for only
  `mutation-observed` and `stop`; mutation journal and Stop projection
  commit-then-fail tests; the smallest Stop-local stable-operation/idempotency
  repair only if its red fault test proves one is required; hook-adapters
  architecture acceptance clauses and canonical projection-manifest refresh.
- Out of scope: MCP lifecycle/authorization, global-runtime reconciliation,
  Prompt/AgentSurface assembly, subagent/prompt/command-observed/trace-observer/
  session-context/mutation-guard effect migrations, Cordis or another runtime
  dependency, dynamic handler/provider loading, disposer APIs, generic
  `EffectSink`/transaction journals, compatibility parsers, heuristic rollback,
  production fault flags, and reversal of Git/network/PR/release emissions.
- Taste constraints: keep the static single-route/single-handler authority;
  absence of an effect contract means uninstrumented and never zero effects;
  telemetry is diagnostic only; durable artifacts remain recovery authority;
  prefer deletion of handler-ID special cases over a parallel registry.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if a fault phase requires product-semantic changes outside
  `mutation-observed` or `stop`, or if the next host-delivered same-route event
  does not carry a stable enough identity for a bounded handler-local repair.
- Stop if more than the two named handlers must declare effect semantics to
  make this slice compile or pass; revise the plan instead of silently widening
  the schema.
- Stop if the change would require a new success-path durable write, a generic
  transaction abstraction, or a public hook protocol change.

## Falsifier

The direction is falsified if a commit-then-fail invocation followed by the
next same-route host event cannot converge without cross-handler recovery
state, or if effect completeness cannot be derived without instrumenting the
six explicitly excluded handlers. The cheapest proof is to add the seven-case
fault matrix first against the unfixed mutation journal and Stop projection
paths; if Stop's append phase duplicates a semantic event, permit only the
bounded Stop-local operation-key repair named in Scope.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260814-1635-hook-effect-failure-contract.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md`
- Notes file: `tasks/notes/20260814-1635-hook-effect-failure-contract.notes.md`
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
  - plans/plan-20260814-1635-hook-effect-failure-contract.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md
  - tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md
  - tasks/notes/20260814-1635-hook-effect-failure-contract.notes.md
  - src/cli/hook/handler-contract.ts
  - src/cli/hook/handler-registry.ts
  - src/cli/hook/runtime.ts
  - src/cli/hook/event-telemetry.ts
  - src/core/loop/loop-event-protocol.ts
  - src/cli/hook/mutation-observed.ts
  - src/cli/hook/stop-handler.ts
  - tests/hook-runtime.test.ts
  - tests/mutation-observed.test.ts
  - tests/stop-handler.test.ts
  - tests/unit/hrd-08-event-telemetry-and-benchmark.test.ts
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  - docs/architecture/.projection-manifest.json
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
    - plans/plan-20260814-1635-hook-effect-failure-contract.md
    - tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md
    - tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260814-1635-hook-effect-failure-contract.notes.md
  tests_pass:
    - path: tests/hook-runtime.test.ts
    - path: tests/mutation-observed.test.ts
    - path: tests/stop-handler.test.ts
    - path: tests/unit/hrd-08-event-telemetry-and-benchmark.test.ts
  commands_succeed:
    - bun test tests/hook-runtime.test.ts tests/mutation-observed.test.ts tests/stop-handler.test.ts tests/unit/hrd-08-event-telemetry-and-benchmark.test.ts
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
    - git diff --check
  manual_checks:
    - "Only mutation-observed and Stop declare effect contracts; every absent contract is interpreted as uninstrumented, never as zero effects"
    - "A thrown targeted handler never reports complete write metrics or false zero/pass state"
    - "Production retry means the next host-delivered PostToolUse/edit or Stop/default event; no retry scheduler or production fault flag was added"
    - "Every named fault phase reaches the normalized no-fault terminal state after a fresh invocation or emits explicit reconcile-required evidence"
    - "Stop event append has no duplicate semantic event after commit-then-fail retry"
    - "Public RunHookResult and host output vocabulary are unchanged"
    - "Final diff is confined to Allowed Paths and does not absorb primary-checkout WIP"
```

## Acceptance Notes (Human Review)

- Functional behavior: inspect effect state on success, before-first-commit
  failure, partial failure, and complete-then-throw; compare durable baseline and
  retry artifacts rather than telemetry alone.
- Edge cases: zero-effect mutation no-op, observer callback gap after durable
  commit, Stop append idempotency, missing effect contract, and unstable retry
  identity all fail closed.
- Regression risks: additive telemetry validation/fingerprint drift, accidental
  public protocol change, false completeness for excluded handlers, duplicate
  Stop events, and new success-path synchronous IO.

## Rollback Point

- Commit / checkpoint: `b2fd1379a5eca9e18eee011482f59fb9cfd27954`
- Revert strategy: revert the single hook effect-contract work-package commit;
  no schema migration or external-state cleanup is authorized.
