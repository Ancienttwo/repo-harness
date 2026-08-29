# Task Contract: c2-thread-hotspot-projection

> **Status**: Active
> **Plan**: plans/plan-20260830-0121-c2-thread-hotspot-projection.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-30 01:21
> **Review File**: `tasks/reviews/20260830-0121-c2-thread-hotspot-projection.review.md`
> **Notes File**: `tasks/notes/20260830-0121-c2-thread-hotspot-projection.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The collaboration substrate stores signals but nothing yet reads them. Without a
deterministic read model, every downstream row (C6 exchange, C7 CLI/MCP, C8
Operator view) would each invent its own aggregation and ranking, and the first
one to read a wall clock would make the same store bytes produce a different
answer on every rebuild. C2 fixes one projection: threads aggregate on exact
opaque key equality, attention ordering is an integer function of committed
bytes, and a context packet is byte-identical for the same input. If this ships
wrong, hotspot heat leaks into scheduling authority or the packet digest stops
being reproducible, and every later row inherits the defect.

## Goal

Deliver the pure C2 read-model layer over the C1 signal store:
`src/core/collaboration/thread-projection.ts`,
`src/core/collaboration/hotspot.ts` and
`src/core/collaboration/context-packet.ts`, plus their three unit test files.
Threads aggregate by exact `thread_key`; hotspot scoring is a total integer
function whose recency term is relative to the deterministic epoch (the latest
`created_at` in the source signal set); contribution opportunities use only the
closed structural reason set; `RelevantSignalV1` carries a closed retrieval
reason plus `matched_refs`; `CollaborationContextPacketV1` is assembled under a
deterministic 60/40 exploitation/exploration quota inside a 1,500 estimated-token
budget with explicit truncation evidence, and carries no `built_at` and no
wall-clock input anywhere in its digest preimage.

## Scope

- In scope:
  - `src/core/collaboration/thread-projection.ts`, `src/core/collaboration/hotspot.ts`, `src/core/collaboration/context-packet.ts`
  - `tests/unit/collaboration-thread-projection.test.ts`, `tests/unit/collaboration-hotspot.test.ts`, `tests/unit/collaboration-context-packet.test.ts`
  - `.archcontext/model/nodes/capability.runtime-harness.collaboration.yaml` entrypoint/verification additions
  - `docs/architecture/modules/runtime-harness/collaboration.md` and `docs/architecture/.projection-manifest.json` re-render when a size bucket moves
  - `tasks/workstreams/runtime-harness/collaboration/` durable progress
- Out of scope:
  - `src/core/collaboration/common.ts` and `src/core/collaboration/signal.ts`: C1-frozen, consumed unchanged; a needed change here stops the task
  - handoff, adoption, receipt, admission-bridge, contribution and exchange code (C3/C4/C6), owned by a sibling worker in parallel
  - any CLI, MCP or Operator surface (C7/C8)
  - any `src/effects/**` file, any store, any cache file, any write path
  - the five program plan and PRD files
  - `AUTHORITY_INVENTORY`, `DELIBERATELY_EXCLUDED` and `FROZEN_INVENTORY_SHA256` in `tests/unit/collaboration-authority-baseline.test.ts`
- Taste constraints: pure functions only, integer arithmetic only in scoring, no floating point in any digested value, no clock read on any path.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the same source signal bytes produced two different `packet_sha256` values
across two builds in one process, or if a hotspot score changed when only the
process wall clock advanced, the epoch design is wrong. Cheapest proof point:
`bun test tests/unit/collaboration-context-packet.test.ts --timeout 60000`,
which builds the same packet twice and compares canonical bytes, and drives the
recency path with a fixed synthetic epoch far from any real clock value.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260830-0121-c2-thread-hotspot-projection.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260830-0121-c2-thread-hotspot-projection.review.md`
- Notes file: `tasks/notes/20260830-0121-c2-thread-hotspot-projection.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"collaboration-thread-projection","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-hotspot","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-context-packet","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-authority-baseline","kind":"deterministic_test","paths":["*"]},{"id":"repo-full-suite","kind":"deterministic_test","paths":["*"]},{"id":"repo-typecheck","kind":"deterministic_test","paths":["*"]},{"id":"c2-architecture-projection","kind":"manual_acceptance","paths":[".archcontext/model/nodes/capability.runtime-harness.collaboration.yaml","docs/architecture/modules/runtime-harness/collaboration.md","docs/architecture/.projection-manifest.json"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260830-0121-c2-thread-hotspot-projection.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260830-0121-c2-thread-hotspot-projection.contract.md
  - tasks/reviews/20260830-0121-c2-thread-hotspot-projection.review.md
  - tasks/notes/20260830-0121-c2-thread-hotspot-projection.notes.md
  - tasks/workstreams/runtime-harness/collaboration/
  - src/core/collaboration/thread-projection.ts
  - src/core/collaboration/hotspot.ts
  - src/core/collaboration/context-packet.ts
  - tests/unit/collaboration-thread-projection.test.ts
  - tests/unit/collaboration-hotspot.test.ts
  - tests/unit/collaboration-context-packet.test.ts
  - .archcontext/model/nodes/capability.runtime-harness.collaboration.yaml
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
    - src/core/collaboration/thread-projection.ts
    - src/core/collaboration/hotspot.ts
    - src/core/collaboration/context-packet.ts
  artifacts_exist:
    - tasks/notes/20260830-0121-c2-thread-hotspot-projection.notes.md
  tests_pass:
    - path: tests/unit/collaboration-thread-projection.test.ts
    - path: tests/unit/collaboration-hotspot.test.ts
    - path: tests/unit/collaboration-context-packet.test.ts
    - path: tests/unit/collaboration-authority-baseline.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
