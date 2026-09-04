> **Archived**: 2026-09-04 18:52
> **Related Plan**: plans/archive/plan-20260831-1239-operator-board-r1-presentation.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260904-1852
> **Archive Projection V1**: `plans/plan-20260831-1239-operator-board-r1-presentation.md` => `plans/archive/plan-20260831-1239-operator-board-r1-presentation.md`
> **Archive Projection V1**: `tasks/notes/20260831-1239-operator-board-r1-presentation.notes.md` => `tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md`
> **Archive Projection V1**: `tasks/contracts/20260831-1239-operator-board-r1-presentation.contract.md` => `tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md`
> **Archive Projection V1**: `tasks/reviews/20260831-1239-operator-board-r1-presentation.review.md` => `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md`

# Task Contract: operator-board-r1-presentation

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260831-1239-operator-board-r1-presentation.md
> **Task Profile**: frontend
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-31 13:11
> **Review File**: `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md`
> **Notes File**: `tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The Operator server emits the accepted protocol-3 Fleet DTO carrying R1 runtime/delivery evidence. The source browser validator already consumes that DTO exactly, but the UI footer still reports protocol 2 and an old ignored `dist/operator-ui` build can preserve the former validator until the package build runs. The current worklist also hides non-empty groups below expanded empty groups, the mobile/tablet drawer does not fully isolate its modal context, and the message label does not name the actual recipient mode. Shipping those states unchanged makes the Human Control Board misleading precisely where R1 adds provider-neutral observability.

## Goal

Render the exact protocol-3 Operator Fleet snapshot in the packaged browser, expose authoritative R1 delivery/runtime evidence as secondary Task Drawer context and exception-only badges, correct default worklist/message semantics, and restore an opaque isolated drawer on tablet/mobile without changing five-column Task authority or adding any automatic decision or workflow mutation.

## Scope

- In scope: protocol-3 browser DTO validation; exact R1 inbox runtime/delivery rendering; exception-only runtime badges; zero-count group default collapse; first non-empty/actionable group expansion; truthful claimant/next-claimant message copy; responsive drawer opacity/background isolation; 44px narrow-viewport targets; focused tests and design/workflow documentation.
- Out of scope: changing Fleet columns or Task/Lease/Publication/Acceptance authority; runtime-derived column movement; automatic architecture decisions; provider apply; acquiring, merging, reconciling, starting runtime sessions, drag/drop, auto-refresh, SSE/WebSocket, or compatibility parsing for protocol 2.
- Taste constraints: preserve the existing warm-paper/ink/carrot system, Space Grotesk/IBM Plex Sans/JetBrains Mono roles, compact desktop density, minimal chrome, and exact-one-write boundary. Runtime evidence is secondary context, never another dashboard-card grid.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the unmodified protocol-3 server DTO cannot be consumed without duplicating or inferring domain semantics in the browser, stop: the DTO boundary rather than the UI must change. The cheapest proof is the current `OperatorFleetSnapshotV1` type plus `tests/unit/operator-fleet-snapshot.test.ts`; browser fields must be a literal projection of that accepted payload. The package build is the sole browser asset authority; no runtime compatibility parser is permitted for an old ignored build.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260831-1239-operator-board-r1-presentation.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260904-1852-operator-board-r1-presentation.md`
- Notes file: `tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md`
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
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - docs/design/DESIGN-local-human-control-board-v1.md
  - plans/
  - tasks/todos.md
  - tasks/archive/contract-20260904-1852-operator-board-r1-presentation.md
  - tasks/archive/review-20260904-1852-operator-board-r1-presentation.md
  - tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
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
    - docs/spec.md
    - docs/design/DESIGN-local-human-control-board-v1.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260904-1852-operator-board-r1-presentation.md
  tests_pass:
    - path: tests/unit/operator-fleet-snapshot.test.ts
    - path: tests/operator-web/operator-ui.test.tsx
    - path: tests/operator-web/operator-interactions.test.tsx
    - path: tests/cli/operator-serve.test.ts
  commands_succeed:
    - bun test tests/unit/operator-fleet-snapshot.test.ts tests/operator-web/operator-ui.test.tsx tests/operator-web/operator-interactions.test.tsx tests/cli/operator-serve.test.ts --timeout 60000
    - bun run check:type
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: protocol-3 stable snapshots render without a shim; the drawer shows exact runtime/delivery facts; card columns remain unchanged; empty groups no longer dominate the first viewport; message targets are explicit; responsive drawers isolate the active context.
- Edge cases: protocol-2/unknown snapshots remain invalid; null R1 receipt/effect values render as explicit unavailable/none states rather than inferred success; read-only message sends remain disabled; all-zero worklists retain a clear empty state.
- Regression risks: browser/server schema drift, card grouping accidentally depending on runtime facts, responsive drawer z-index/scroll behavior, and localized copy parity.

## Rollback Point

- Commit / checkpoint: the final work-package commit on `codex/operator-board-r1-presentation`.
- Revert strategy: revert the single browser/read-projection merge unit; no persistent data or authority migration requires rollback handling.
