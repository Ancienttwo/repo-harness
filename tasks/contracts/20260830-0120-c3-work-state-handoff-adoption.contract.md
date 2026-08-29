# Task Contract: c3-work-state-handoff-adoption

> **Status**: Active
> **Plan**: plans/plan-20260830-0120-c3-work-state-handoff-adoption.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-collaboration
> **Last Updated**: 2026-08-30 01:20
> **Review File**: `tasks/reviews/20260830-0120-c3-work-state-handoff-adoption.review.md`
> **Notes File**: `tasks/notes/20260830-0120-c3-work-state-handoff-adoption.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

C3 is the row that makes a run's knowledge outlive its budget. If the handoff
record ships without `attempted_paths` and `dead_ends`, the successor re-burns
the predecessor's budget on paths already known to fail, which is the single
failure mode Child PRD A names as this protocol's reason to exist. If adoption
is modelled with exclusive-ownership semantics, the collaboration plane grows a
second scheduler beside the Task Lease, which is the key risk C0 froze against.
C4 derives handoff ids from `WorkerRunRef` + entry index and C5 wires succession
onto these records, so both schemas have to be right here rather than
renegotiated downstream.

## Goal

Deliver `WorkStateHandoffV1`, `HandoffExecutionContextV1` and
`HandoffAdoptionReceiptV1` in `src/core/collaboration/`, plus their two
append-only stores under `<git-common-dir>/repo-harness/collaboration/v1/`
(`handoffs/`, `adoptions/`), consuming C1's frozen `common.ts` unchanged.
Adoption is non-exclusive: distinct adopters each succeed against one handoff,
the same adopter with the same triple is idempotent, and no Claim, Lease,
Publication or Acceptance byte moves.

## Scope

- In scope:
  - `src/core/collaboration/handoff.ts` and `src/core/collaboration/adoption.ts`
  - `src/effects/collaboration/handoff-store.ts` and `adoption-store.ts`
  - `src/effects/collaboration/record-store.ts` and `actor.ts`: the durable
    create-once publish protocol and the server-side actor derivation, extracted
    from `signal-store.ts` with zero behavior change so three stores share one
    copy instead of three
  - the `capability.runtime-harness.collaboration` archcontext node, whose flow
    selectors named two symbols this row moved, and the two projection outputs
    regenerated from it
  - `src/effects/collaboration/signal-store.ts` rewired onto those two modules
  - four collaboration test files for this row, plus
    `tests/helpers/collaboration-store-fixture.ts` and C1's store test rewired
    onto it, so the three store tests share one disposable-repository fixture
  - the capability workstream ledger and this row's notes
- Out of scope:
  - `src/core/collaboration/common.ts` and `signal.ts` (C1-frozen; a needed
    change there is a stop condition, not an edit)
  - signal threads, discovery and hotspot projection (C2, parallel row)
  - the contribution collector and the admission bridge (C4)
  - TaskFreeze / takeover succession integration (C5)
  - the context-packet builder (C6), CLI/MCP (C7), Operator surface (C8)
  - any write path into a Task, Lease, Publication or Acceptance store
  - `AUTHORITY_INVENTORY`, `DELIBERATELY_EXCLUDED` and `FROZEN_INVENTORY_SHA256`
    in `tests/unit/collaboration-authority-baseline.test.ts`: this row mints no
    `*_PROTOCOL`, so the closed scan stays true unchanged
- Taste constraints: no second serializer, no second reference type, no
  healthy-empty fallback, and no "claim" vocabulary anywhere in the protocol,
  stores, error messages or tests for knowledge adoption.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if adoption cannot be made non-exclusive without either
serializing adopters behind a single-writer record or reaching into a
delivery-plane store to record who now holds the work. Cheapest proof point: in
one fixture repository, have two distinct authenticated Engineers adopt the same
handoff and then diff the `repo-harness/coordination/v1` and
`repo-harness/engineers/v1` trees against their pre-adoption digests; both
adoptions must persist and both digests must be unchanged.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260830-0120-c3-work-state-handoff-adoption.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260830-0120-c3-work-state-handoff-adoption.review.md`
- Notes file: `tasks/notes/20260830-0120-c3-work-state-handoff-adoption.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"collaboration-handoff-schema","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-adoption-schema","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-handoff-store","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-adoption-store","kind":"deterministic_test","paths":["*"]},{"id":"collaboration-signal-store-regression","kind":"deterministic_test","paths":["*"]},{"id":"repo-full-suite","kind":"deterministic_test","paths":["*"]},{"id":"repo-typecheck","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260830-0120-c3-work-state-handoff-adoption.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260830-0120-c3-work-state-handoff-adoption.contract.md
  - tasks/reviews/20260830-0120-c3-work-state-handoff-adoption.review.md
  - tasks/notes/20260830-0120-c3-work-state-handoff-adoption.notes.md
  - tasks/workstreams/runtime-harness/collaboration/
  - src/core/collaboration/handoff.ts
  - src/core/collaboration/adoption.ts
  - src/effects/collaboration/handoff-store.ts
  - src/effects/collaboration/adoption-store.ts
  - src/effects/collaboration/record-store.ts
  - src/effects/collaboration/actor.ts
  - src/effects/collaboration/signal-store.ts
  - tests/unit/collaboration-handoff.test.ts
  - tests/unit/collaboration-adoption.test.ts
  - tests/effects/collaboration-handoff-store.test.ts
  - tests/effects/collaboration-adoption-store.test.ts
  # the three-actor disposable repository the three store tests share, and C1's
  # store test rewired onto it so the isolation rules live in one place
  - tests/helpers/collaboration-store-fixture.ts
  - tests/effects/collaboration-signal-store.test.ts
  # Scope-gate self-amendment (2026-08-30). prepare-acceptance refused with
  # `unresolved-major-change` / `verified-flow-proof-changed`: the record-store
  # extraction moved two symbols the capability node's flow selectors named, so
  # the model must be corrected and the projection re-rendered. Both outputs are
  # projection-owned, regenerated by `runArchitectureProjection`, not hand-edited.
  - .archcontext/model/
  - docs/architecture/
  # workflow-owned: context-contract-sync rewrites the controlled architecture
  # block in both root contract files when an architecture event is recorded.
  - AGENTS.md
  - CLAUDE.md
  - tasks/lessons.md
  # pins the archcontext model inventory; C3 adds one required flow for the
  # handoff and adoption families, so the flow count moves 24 -> 25.
  - tests/architecture-projection-e2e.test.ts
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
    - src/core/collaboration/handoff.ts
    - src/core/collaboration/adoption.ts
    - src/effects/collaboration/handoff-store.ts
    - src/effects/collaboration/adoption-store.ts
    - src/effects/collaboration/record-store.ts
    - src/effects/collaboration/actor.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260830-0120-c3-work-state-handoff-adoption.notes.md
  tests_pass:
    - path: tests/unit/collaboration-handoff.test.ts
    - path: tests/unit/collaboration-adoption.test.ts
    - path: tests/effects/collaboration-handoff-store.test.ts
    - path: tests/effects/collaboration-adoption-store.test.ts
    - path: tests/effects/collaboration-signal-store.test.ts
    - path: tests/unit/collaboration-authority-baseline.test.ts
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

- Functional behavior: one immutable handoff file per identity carrying all four
  knowledge fields and a complete execution-context branch; one immutable
  adoption receipt per (handoff SHA, adopter actor SHA, context packet SHA);
  server-derived actor and retry-stable recorded time on both.
- Edge cases: two distinct adopters racing from independent processes on one
  handoff; the same adopter retrying the same triple; the same triple submitted
  with different bytes; an execution-context branch missing one reference; a
  handoff citing a signal from another repository; a supersede target owned by
  another actor lineage; a crash between the existence check and the create.
- Regression risks: `signal-store.ts` is rewired onto the extracted
  `record-store.ts` and `actor.ts`. `tests/effects/collaboration-signal-store.test.ts`
  is the guard, and the staging-name lookalike test in it proves the shared
  builder and matcher still move together.

## Rollback Point

- Commit / checkpoint: base `main@461107cb5f72108ec6573268c80c51ed69ae7ca9`
- Revert strategy: revert the single branch commit set. `collaboration.mode` is
  `off`, so no consumer path is live and no persisted collaboration state needs
  migration.
