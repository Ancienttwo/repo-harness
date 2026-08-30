# Task Contract: c8-read-only-operator-collaboration-surface

> **Status**: Active
> **Plan**: plans/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-30 13:45
> **Review File**: `tasks/reviews/20260830-1344-c8-read-only-operator-collaboration-surface.review.md`
> **Notes File**: `tasks/notes/20260830-1344-c8-read-only-operator-collaboration-surface.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

C1-C6 shipped a collaboration substrate that only an Agent can read. A human running the local board
can see delivery-plane task state and nothing about the lanes, discoveries, handoffs or contributors
the substrate now holds, so the one participant who decides whether collaboration is worth keeping
cannot observe it. Shipping it wrong is worse than not shipping it in two specific ways: a browser
write route added here would break the program's standing boundary that the task-message POST is the
only browser write, and a collaboration store that cannot be read rendered as an empty panel would
turn "unreadable" into "healthy and quiet", which is the exact fallback the program forbids.

## Goal

One read-only, browser-safe projection of C6's `CollaborativeWorkExchangeSnapshotV1` served over a
single new GET route, rendered as lanes, discoveries, handoffs with adoption counts, hotspots and
contributors inside the existing attention-first board, with a machine-readable route inventory
proving the task-message POST is still the only write.

## Scope

- In scope:
  - `OperatorCollaborationSnapshotV1` plus its redacting projection in
    `src/core/operator/collaboration-snapshot.ts`, dropping `execution_offers` and `snapshot_sha256`
    and reducing each handoff's `execution_context` to its discriminant.
  - The per-repository read effect and its typed public failures in
    `src/effects/operator/collaboration.ts`.
  - One new GET route plus the exported `OPERATOR_ROUTES` write inventory in
    `src/effects/operator/server.ts`.
  - The browser transport decoder, collaboration panels, fixtures and `en`/`zh` dictionary entries in
    `src/operator-web/`.
- Out of scope:
  - `src/cli/commands/`, `src/cli/mcp/` and the delegation dispatch path, all owned by C7 in
    parallel.
  - Every collaboration store mutation, and any Lease, Claim, Publication or Acceptance byte.
  - Any change to the collaboration protocols, the Fleet snapshot protocol, or the task-message
    write path.
- Taste constraints: no compatibility fallback. A repository that is not registered, a collaboration
  store that cannot be read, and a payload that does not decode each surface a typed failure; none of
  them degrade into an empty but healthy-looking panel.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the read-only projection turns out to need a browser write to be useful, or
if a browser-safe payload cannot be produced without re-deriving collaboration semantics in the
client. Cheapest proof point: serialize the projection of a fixture collection and assert that it
contains no absolute local path, no repository root, no sprint path, no execution offer list and no
raw `bound_task` Claim, while still carrying every field the panels render.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260830-1344-c8-read-only-operator-collaboration-surface.review.md`
- Notes file: `tasks/notes/20260830-1344-c8-read-only-operator-collaboration-surface.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"operator-route-inventory","kind":"deterministic_test","paths":["*"]},{"id":"operator-collaboration-projection","kind":"deterministic_test","paths":["*"]},{"id":"operator-collaboration-ui","kind":"deterministic_test","paths":["*"]},{"id":"operator-board-regression","kind":"deterministic_test","paths":["*"]},{"id":"repo-full-suite","kind":"deterministic_test","paths":["*"]},{"id":"repo-typecheck","kind":"deterministic_test","paths":["*"]},{"id":"operator-web-build","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260830-1344-c8-read-only-operator-collaboration-surface.md
  - plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/lessons.md
  - tasks/contracts/20260830-1344-c8-read-only-operator-collaboration-surface.contract.md
  - tasks/reviews/20260830-1344-c8-read-only-operator-collaboration-surface.review.md
  - tasks/notes/20260830-1344-c8-read-only-operator-collaboration-surface.notes.md
  - tasks/workstreams/runtime-harness/collaboration/
  - src/core/operator/
  - src/effects/operator/
  - src/operator-web/
  - tests/cli/operator-serve.test.ts
  - tests/operator-web/
  # Declared up front. src/core/operator/** and src/effects/operator/** belong to no ArchContext
  # capability node today, so no node, relation or flow is expected to move; these paths are held
  # open only so the projection and its pins can move with the code if the check reports otherwise.
  - .archcontext/model/
  - docs/architecture/
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
    - src/core/operator/collaboration-snapshot.ts
    - src/effects/operator/collaboration.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260830-1344-c8-read-only-operator-collaboration-surface.notes.md
  tests_pass:
    - path: tests/cli/operator-serve.test.ts
    - path: tests/operator-web/operator-collaboration.test.tsx
  commands_succeed:
    - bun run check:type
    - bun run build:operator-web
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
