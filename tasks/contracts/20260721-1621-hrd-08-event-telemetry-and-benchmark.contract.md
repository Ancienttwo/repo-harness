# Task Contract: hrd-08-event-telemetry-and-benchmark

> **Status**: Fulfilled
> **Plan**: plans/plan-20260721-1621-hrd-08-event-telemetry-and-benchmark.md
> **Task Profile**: code-change
> **Owner**: kito
> **Capability ID**: runtime-harness-hook-adapters
> **Last Updated**: 2026-07-21 16:21
> **Review File**: `tasks/reviews/20260721-1621-hrd-08-event-telemetry-and-benchmark.review.md`
> **Notes File**: `tasks/notes/20260721-1621-hrd-08-event-telemetry-and-benchmark.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The runtime currently emits independent per-script lines that cannot be joined safely into a host event and the diet report therefore claims no runtime evidence. Without one event authority, LOOP-12 latency/process/state/write budgets cannot be measured reliably, concurrent events can be mis-grouped, and HRD-09 would retire scripts without a trustworthy before/after runtime baseline.

## Goal

Write exactly one structured telemetry record per eligible host hook event, cut every live consumer from the retired per-script log to that record, and commit a reproducible JSON/Markdown report with valid sample counts, p50/p95, coverage, and explicit results for every LOOP-12 target.

## Scope

- In scope: an event-scoped telemetry protocol and writer; instrumentation at the existing route/state/PostEdit/Stop boundaries; one-shot authority cutover in the diet report and profile benchmark reader; targeted tests; characterization fixture update for the intentional telemetry write-set change; architecture/runtime docs; a measured local baseline-vs-target report.
- Out of scope: changing route registration or user-visible hook decisions; retiring legacy scripts (HRD-09); OS syscall/process profiling; optimizing failed targets merely to make the report green; provider-backed benchmark matrices; provider review calls during measurement; hook asset/source projection changes; EPC or SSD work.
- Taste constraints: fail closed when evidence is missing or incomplete, keep hook execution fail-open when non-authoritative telemetry append fails, never infer hidden legacy-script I/O, and do not retain a reader/writer fallback for `hook-invocations.jsonl`.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if a required target can only be claimed through OS-level syscall/process measurement rather than the approved logical/direct-runtime metric definitions.
- Stop if one event cannot be finalized centrally without changing host-visible hook decisions or error behavior.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a focused fixture shows that a single host invocation can bypass the central `runHook` finalization boundary, or that a named LOOP-12 metric required for PreEdit/PostEdit/Stop is observable only inside an opaque legacy shell script. The cheapest proof is a route fixture covering success, blocked, and error returns plus target-specific coverage assertions before changing report semantics.

## Root Cause Evidence

Not applicable: this is an instrumentation work-package, not a bugfix profile.

## Workflow Inventory

- Source plan: `plans/plan-20260721-1621-hrd-08-event-telemetry-and-benchmark.md`
- Source sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260721-1621-hrd-08-event-telemetry-and-benchmark.review.md`
- Notes file: `tasks/notes/20260721-1621-hrd-08-event-telemetry-and-benchmark.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: freeze the final semantic subject, run verification once, prepare one typed AcceptanceReceipt, then consume it through final closeout without a second semantic reviewer.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/loop/loop-event-protocol.ts
  - src/cli/hook/event-telemetry.ts
  - src/cli/hook/runtime.ts
  - src/cli/hook/mutation-observed.ts
  - src/cli/hook/stop-handler.ts
  - scripts/hook-dispatch-diet-report.ts
  - scripts/run-harness-profile-benchmark.ts
  - tests/unit/hrd-08-event-telemetry-and-benchmark.test.ts
  - tests/loop-event-protocol.test.ts
  - tests/hook-dispatch-diet-report.test.ts
  - tests/hook-runtime.test.ts
  - tests/harness-benchmark-matrix.test.ts
  - tests/hook-runtime-characterization.test.ts
  - tests/fixtures/loop-runtime/characterization.json
  - tests/state/fixtures/loop-semantics/characterization.json
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  - docs/reference-configs/harness-overview.md
  - docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.json
  - docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.md
  - plans/plan-20260721-1621-hrd-08-event-telemetry-and-benchmark.md
  - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260721-1621-hrd-08-event-telemetry-and-benchmark.contract.md
  - tasks/reviews/20260721-1621-hrd-08-event-telemetry-and-benchmark.review.md
  - tasks/notes/20260721-1621-hrd-08-event-telemetry-and-benchmark.notes.md
```

## Evidence Requirements

```yaml
evidence_requirements:
  # HRD-08 produces local event evidence and does not consume the provider-backed profile matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: 4
    wall_time_minutes: 45
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
    - src/cli/hook/event-telemetry.ts
    - docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.json
    - docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.md
  files_contain:
    - path: scripts/hook-dispatch-diet-report.ts
      pattern: "runtime_evidence"
    - path: docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.json
      pattern: "loop-engine-hook-diet-report/v2"
  tests_pass:
    - path: tests/unit/hrd-08-event-telemetry-and-benchmark.test.ts
    - path: tests/loop-event-protocol.test.ts
    - path: tests/hook-dispatch-diet-report.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/harness-benchmark-matrix.test.ts
    - path: tests/hook-runtime-characterization.test.ts
    - path: tests/state/loop-semantics-characterization.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:state-boundaries
    - bun run check:hooks
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
  manual_checks:
    - "Full repository test suite passes once after code freeze"
    - "Self-host adoption dry-run reports zero operations after code freeze"
    - "Frozen event sample contains exactly 220 valid records across all 11 routes"
```

## Acceptance Notes (Human Review)

- Functional behavior: one event record covers every eligible handled route result; the report uses only event records and provides measured p50/p95 plus all named LOOP-12 thresholds.
- Edge cases: blocked/error routes still finalize once; malformed, empty, mixed-protocol, or target-incomplete evidence cannot produce `available: true`; telemetry writer failure preserves the hook result.
- Regression risks: instrumentation must not change hook decisions, route order, Stop atomicity, or internal `git`/`bun` characterization counts. The only expected characterization write-set change is from the retired per-script JSONL to the new event JSONL.
- Authority cutover: no production writer or reader may reference `.ai/harness/runs/hook-invocations.jsonl`; no compatibility parser or migration path is allowed.
- Measurement boundary: direct runtime-dispatch children and logical observed files are distinct from OS process/syscall counts; telemetry self-writes are excluded.
- Evidence boundary: generate the committed local report once after code freeze with at least 20 fixture iterations; record actual failures rather than expanding scope to optimize them; do not run the full provider-backed profile matrix.

## Rollback Point

- Commit / checkpoint: pre-change branch base `e1fce20a73bea1df197ac5dba3270fbf43eb26b3`.
- Revert strategy: revert the single HRD-08 PR commit(s). The ignored event telemetry cache is non-authoritative and may be deleted locally; no compatibility reader or data migration is required.
