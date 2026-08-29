# Task Contract: c1-coordination-signal-store

> **Status**: Active
> **Plan**: plans/plan-20260829-2137-c1-coordination-signal-store.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-collaboration
> **Last Updated**: 2026-08-29 21:38
> **Review File**: `tasks/reviews/20260829-2137-c1-coordination-signal-store.review.md`
> **Notes File**: `tasks/notes/20260829-2137-c1-coordination-signal-store.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

C1 is the first row that writes collaboration runtime code. Every later row
(C2-C9) consumes `src/core/collaboration/common.ts` as frozen shared mechanics,
so a wrong actor union, scope-ref shape, ID derivation or recorded-time rule
here has to be renegotiated in eight downstream rows. C1 is also the first
module the C0 inclusion criterion must classify without hindsight; shipping it
without the closed scan leaves the criterion enforced by hand forever.

## Goal

Deliver the `CoordinationSignalV1` protocol, the C1-exclusive shared mechanics
in `src/core/collaboration/common.ts`, and the append-only signal store under
`<git-common-dir>/repo-harness/collaboration/v1/signals/`, together with the
three items C0 handed to C1: the closed `src/core/**` `*_PROTOCOL` scan, the
`capability.runtime-harness.collaboration` registration (archcontext node,
architecture module doc, workstream ledger), and the `collaboration.mode`
feature flag defaulting to `off`.

## Scope

- In scope:
  - `src/core/collaboration/common.ts` and `src/core/collaboration/signal.ts`
  - `src/effects/collaboration/feature-flag.ts` and
    `src/effects/collaboration/signal-store.ts`
  - one evidence-ref validator extraction in `src/core/engineers/delegation.ts`
    with zero wire change, so D8's single-validator rule holds
  - the four collaboration test files
  - the archcontext capability and component nodes, the architecture module doc,
    and the capability workstream ledger
  - `.ai/harness/policy.json` gains `collaboration.mode = "off"`
  - additive handoff closure in the C0 freeze record
- Out of scope:
  - any CLI, MCP or Operator surface (C7, C8)
  - thread, discovery and hotspot projection (C2)
  - `WorkStateHandoffV1`, adoption receipts (C3)
  - the admission bridge and contribution collector (C4)
  - Review, Verification and Merge surfaces (D12)
  - any write path into a Task, Lease, Publication or Acceptance store
  - `AUTHORITY_INVENTORY` and `FROZEN_INVENTORY_SHA256` in the baseline test
- Taste constraints: reuse `src/core/messages/mechanics.ts` and
  `src/effects/locking/exclusive-directory-lock.ts`; no second serializer, no
  second reference type, no healthy-empty fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the collaboration store cannot be written without
touching a delivery-plane store, or if a signal's recorded time cannot be made
retry-stable without a second authority. Cheapest proof point: publish the same
signal identity twice in one fixture repo and diff the `repo-harness/coordination/v1`
and `repo-harness/engineers/v1` trees plus the persisted signal bytes; both must
be byte-identical across the retry.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260829-2137-c1-coordination-signal-store.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260829-2137-c1-coordination-signal-store.review.md`
- Notes file: `tasks/notes/20260829-2137-c1-coordination-signal-store.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"collaboration-authority-baseline","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-signal-store","kind":"deterministic_test","paths":["*"]},{"id":"repo-full-suite","kind":"deterministic_test","paths":["*"]},{"id":"repo-typecheck","kind":"deterministic_test","paths":["*"]},{"id":"c1-capability-registration","kind":"manual_acceptance","paths":[".archcontext/model/nodes/capability.runtime-harness.collaboration.yaml","docs/architecture/modules/runtime-harness/collaboration.md","docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260829-2137-c1-coordination-signal-store.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260829-2137-c1-coordination-signal-store.contract.md
  - tasks/reviews/20260829-2137-c1-coordination-signal-store.review.md
  - tasks/notes/20260829-2137-c1-coordination-signal-store.notes.md
  - tasks/workstreams/runtime-harness/collaboration/
  - src/core/collaboration/
  - src/effects/collaboration/
  - src/core/engineers/delegation.ts
  - tests/unit/collaboration-common.test.ts
  - tests/unit/collaboration-signal.test.ts
  - tests/unit/collaboration-authority-baseline.test.ts
  - tests/effects/collaboration-signal-store.test.ts
  - .archcontext/model/nodes/
  - docs/architecture/modules/runtime-harness/collaboration.md
  - docs/architecture/domains/runtime-harness.md
  - docs/architecture/index.md
  - docs/architecture/requests/
  # workflow-owned: workstream-sync and context-contract-sync rewrite the
  # controlled architecture block when a capability workstream is created.
  - AGENTS.md
  - CLAUDE.md
  - docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md
  - .ai/harness/policy.json
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
    - src/core/collaboration/common.ts
    - src/core/collaboration/signal.ts
    - src/effects/collaboration/signal-store.ts
    - src/effects/collaboration/feature-flag.ts
    - .archcontext/model/nodes/capability.runtime-harness.collaboration.yaml
    - docs/architecture/modules/runtime-harness/collaboration.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260829-2137-c1-coordination-signal-store.notes.md
  tests_pass:
    - path: tests/unit/collaboration-common.test.ts
    - path: tests/unit/collaboration-signal.test.ts
    - path: tests/unit/collaboration-authority-baseline.test.ts
    - path: tests/effects/collaboration-signal-store.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
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

- Functional behavior: one immutable signal file per identity; server-derived
  actor and recorded time; append-only with supersede-only revision.
- Edge cases: retry after a crash between the existence check and the create;
  concurrent same-identity publish from independent processes; supersede target
  missing or owned by another actor lineage; source ref from another repository;
  unreadable store shard.
- Regression risks: the evidence-ref validator extraction in
  `src/core/engineers/delegation.ts` must keep `WorkerResultV1` bytes identical;
  `tests/unit/me2a-me3b-readonly-delegation.test.ts` is the guard.

## Rollback Point

- Commit / checkpoint: base `main@74e8b6524f4be6c43332e7aeb1c249abe11211fd`
- Revert strategy: revert the single branch commit set. `collaboration.mode` is
  `off`, so no consumer path is live and no persisted collaboration state needs
  migration.
