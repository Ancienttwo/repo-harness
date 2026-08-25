> **Archived**: 2026-08-26 01:09
> **Related Plan**: plans/archive/plan-20260825-2339-me1b-engineering-overlay.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260826-0109

# Task Contract: me1b-engineering-overlay

> **Status**: Fulfilled
> **Plan**: plans/plan-20260825-2339-me1b-engineering-overlay.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-engineering-overlay
> **Last Updated**: 2026-08-25 23:39
> **Review File**: `tasks/reviews/20260825-2339-me1b-engineering-overlay.review.md`
> **Notes File**: `tasks/notes/20260825-2339-me1b-engineering-overlay.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Fleet already owns canonical task lifecycle, but the organization lacks a stable projection for Engineer/Binding/Claim/message/runtime attention. If these facts are folded into Fleet columns or cached by a UI, runtime liveness becomes a second task authority and later delegation/acceptance slices cannot join against exact component revisions.

## Goal

Deliver the minimal ME-1B CLI/JSON control board: exact Engineering Overlay and Organization Attention schemas with double-read consistency, a canonical ME-1A Planning Graph command, and three semantically independent read views. No read command may mutate or recompute Task/Lease/Fleet authority.

## Scope

- In scope: ME-1B core schemas; Profile/Binding/Claim/message/ME-3A observation projection; closed support states; `engineer board`; `sprint graph`; semantic-independence and consistency fixtures; ArchContext capability; PRD/workstream/acceptance evidence.
- Out of scope: web UI, mutation endpoints, HumanControl composite/cache, automatic Provider effects, delegation/writer state before its owning PRD, changes to Fleet columns or Task/Lease/Publication/Acceptance.
- Taste constraints: every displayed datum carries its owning component revision/digest; unavailable later domains are `unsupported`, unreadable authority is `unreadable/degraded`, and neither is translated into healthy-empty state.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if changing only Binding/runtime observations changes serialized Fleet cards/columns, or if a binding generation mutation during projection can still produce `stable`. The cheapest proof is a paired pure-projection fixture before CLI integration.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260825-2339-me1b-engineering-overlay.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260825-2339-me1b-engineering-overlay.review.md`
- Notes file: `tasks/notes/20260825-2339-me1b-engineering-overlay.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me1b-semantic-independence","kind":"deterministic_test","paths":["src/core/engineers/engineering-overlay.ts","src/effects/engineers/engineering-overlay.ts","src/effects/engineers/module-inbox.ts","tests/unit/me1b-engineering-overlay.test.ts"]},{"id":"me1b-overlay-runtime-readback","kind":"runtime_readback","paths":["src/effects/engineers/engineering-overlay.ts","src/effects/engineers/module-inbox.ts","src/cli/commands/engineer.ts","tests/cli/engineer.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260825-2339-me1b-engineering-overlay.contract.md
  - tasks/reviews/20260825-2339-me1b-engineering-overlay.review.md
  - tasks/notes/20260825-2339-me1b-engineering-overlay.notes.md
  - .ai/context/capabilities.json
  - .archcontext/
  - AGENTS.md
  - CLAUDE.md
  - .claude/templates/
  - docs/architecture/
  - docs/researches/20260824-persistent-module-engineer-organization.md
  - plans/prds/20260824-1653-engineering-overlay-control-board.prd.md
  - tasks/current.md
  - tasks/workstreams/runtime-harness/engineering-overlay/
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
    - src/core/engineers/engineering-overlay.ts
    - src/effects/engineers/engineering-overlay.ts
    - tests/unit/me1b-engineering-overlay.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260825-2339-me1b-engineering-overlay.notes.md
  tests_pass:
    - path: tests/unit/me1b-engineering-overlay.test.ts
    - path: tests/cli/engineer.test.ts
    - path: tests/cli/sprint.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: three read views preserve their separate authorities and exact component fences.
- Edge cases: missing/unreadable bindings, mid-read generation changes, no-task organization attention, unavailable later protocols.
- Regression risks: read-side repair or accidental Fleet status derivation; tests bind Task/Lease/Fleet bytes and route inventory.

## Rollback Point

- Commit / checkpoint: exact ME-1B candidate frozen by verify-sprint.
- Revert strategy: revert the ME-1B publication commit; all new runtime surface is read-only and introduces no persistent mutation store.
