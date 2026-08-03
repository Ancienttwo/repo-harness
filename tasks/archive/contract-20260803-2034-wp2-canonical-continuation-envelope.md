> **Archived**: 2026-08-03 20:34
> **Related Plan**: plans/archive/plan-20260803-1949-wp2-canonical-continuation-envelope.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260803-2034

# Task Contract: wp2-canonical-continuation-envelope

> **Status**: Fulfilled
> **Plan**: plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-03 19:49
> **Review File**: `tasks/reviews/20260803-1949-wp2-canonical-continuation-envelope.review.md`
> **Notes File**: `tasks/notes/20260803-1949-wp2-canonical-continuation-envelope.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Long-run drift happens when chat context becomes the de-facto authority: after
compaction or session restart, an agent re-derives "what is next" from
degraded memory instead of repo state. The durable frontier already exists
(active plan Task Breakdown, sprint backlog with deterministic `cmd_next` row
selection, `EffectiveStateV1` with `readiness`/`next_action`/`blockers`/
`progress_token`), but no single deterministic entry composes those surfaces
into one per-turn answer. WP2 is the fetch entry the whole continuation loop
(sprint `plans/sprints/20260803-1810-long-run-anti-drift.sprint.md`) stands
on; WP3 extends it with stall detection and WP4 documents the host loop
around it.

## Goal

Add `repo-harness state next --json`: a read-only command emitting
`ContinuationEnvelopeV1` — `{protocol: 1, kind:
"repo-harness-continuation-envelope", route, unit_ref, authority_revision,
progress_token, command, reason}` — where `route ∈ {continue_active_plan,
advance_sprint, verify_or_finish, halt, complete, idle}`. The envelope is a
pure projection composed ONLY from the existing Effective State resolution
plus the active-sprint marker/backlog state. It returns exactly one unit or
one halt per call, and for actionable routes carries the exact existing
command to run next (e.g. `repo-harness run sprint-backlog start-task
--execute`, `repo-harness run verify-sprint`) — it never re-implements row
selection, never creates plans/contracts/worktrees, never advances the
sprint, and never writes anything. No `ask`/`wait` semantics: blocked and
needs-user states are `halt` with `reason` carried by existing
blockers/next_action vocabulary. Identical repo bytes must yield
byte-identical JSON output (stable key order, no timestamps, no absolute
paths that vary per machine beyond the repo root handling the resolver
already does).

## Scope

- In scope: `src/cli/commands/state.ts` (new `next` subcommand), new
  projection module under `src/core/state/` or `src/effects/state/`
  (whichever matches the existing read-model layering — follow the
  resolver/projector split already in place), envelope type definition
  alongside `EffectiveStateV1` types, new unit/integration tests under
  `tests/`, the contract's notes file.
- Out of scope: WP1 journal surfaces (`scripts/`, `assets/templates/helpers/`
  — do not touch); WP3 attempt receipts / stall counter (`.ai/harness/runs/
  continuation/` does not exist in this WP); WP4 conformance doc;
  `.ai/harness/policy.json` (pending architecture request — do not touch);
  any change to `resolveEffectiveState`'s inputs or `progress_token` recipe;
  any write path, cache file, or state mutation from the new command; MCP
  surface changes.
- Taste constraints: match existing `src/` style and the typed read-model
  conventions (see `EffectiveStateV1` / `project-effective-state.ts`);
  envelope emission is a deterministic function of resolved state — inject
  nothing environmental (time, PID, locale).

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if a route cannot be derived from existing Effective State + sprint
  surfaces without adding a new state source or persisting anything — that is
  a design fork for the parent, not a worker decision.

## Falsifier

Direction is wrong if the existing Effective State + sprint-backlog surfaces
cannot distinguish the six routes without new persistent state — e.g. if
"active plan finished but not yet finished/merged" (`verify_or_finish`) is
not observable from current resolution fields. Cheapest proof point first:
enumerate the route decision table against `EffectiveStateV1`'s actual fields
and the sprint backlog parser before writing the command; if a route has no
deriving fields, stop and hand back with the missing-field list.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md`
- Sprint: `plans/sprints/20260803-1810-long-run-anti-drift.sprint.md` (WP2 spec)
- Research: `docs/researches/20260803-loopx-comparative-analysis.md` (round-2 addendum: route vocabulary rationale)
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260803-1949-wp2-canonical-continuation-envelope.review.md`
- Notes file: `tasks/notes/20260803-1949-wp2-canonical-continuation-envelope.notes.md`
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
  - src/
  - tests/
  # plans/ and tasks/todos.md stay at scaffold scope: finish machinery moves
  # the plan into plans/archive/, back-fills the sprint row, and stamps the
  # ledger (WP1 lesson - machinery write surfaces must not be narrowed away).
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260803-1949-wp2-canonical-continuation-envelope.contract.md
  - tasks/reviews/20260803-1949-wp2-canonical-continuation-envelope.review.md
  - tasks/notes/20260803-1949-wp2-canonical-continuation-envelope.notes.md
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
    - src/cli/commands/state.ts
    - tests/continuation-envelope.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260803-1949-wp2-canonical-continuation-envelope.notes.md
  tests_pass:
    - path: tests/continuation-envelope.test.ts
    - path: tests/sprint-backlog-grammar-drift.test.ts
    - path: tests/effective-state.test.ts
    - path: tests/check-state-boundaries.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: each of the six routes has a fixture proving its
  derivation from Effective State + sprint surfaces; two consecutive
  invocations on identical repo bytes produce byte-identical stdout; the
  command performs no writes (fixture asserts repo tree + `.ai/harness/`
  unchanged after invocation).
- Edge cases: no active plan and no sprint → `idle`; sprint with all rows
  complete → `complete`; blockers present → `halt` with blocker-derived
  reason; active plan mid-execution vs finished-awaiting-closeout
  distinguished (`continue_active_plan` vs `verify_or_finish`).
- Regression risks: `state` command family behavior unchanged for existing
  subcommands; no new inputs into `resolveEffectiveState`; `progress_token`
  recipe untouched.

## Rollback Point

- Commit / checkpoint: worktree branch `codex/wp2-canonical-continuation-envelope` based on main `3ab8fe29`.
- Revert strategy: discard the branch/worktree; no primary-tree state is touched before finish.
