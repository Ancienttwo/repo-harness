# Task Contract: context-map-drift-check

> **Status**: Active
> **Plan**: plans/plan-20260906-0323-context-map-drift-check.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-06 03:23
> **Review File**: `tasks/reviews/20260906-0323-context-map-drift-check.review.md`
> **Notes File**: `tasks/notes/20260906-0323-context-map-drift-check.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`.ai/context/context-map.json#discoverable_contexts` is the agent-facing map of capability contracts. It is append-only with no check and no runtime reader, so it has drifted: root CLAUDE.md/AGENTS.md are registered 5 times under 5 capability ids. A stale map makes agents load the wrong local contract with confidence. Without a gate the drift only grows.

## Goal

`bun run check:context-map` validates the map against archcontext nodes, disk, and the generated-projection manifest under the four invariants in the plan's P3, is red on the current map and green after a one-shot `--write` repair committed in the same change, runs as a named step in `scripts/check-ci.sh`, and both writers (`scripts/context-contract-sync.sh`, `scripts/architecture-event.ts`) skip root-context-file paths at the push site.

## Scope

- In scope: new `scripts/check-context-map.ts` and `tests/check-context-map.test.ts`; root-path guard in both writers plus their `assets/templates/helpers/` projections and a regression test; one-shot repair of `.ai/context/context-map.json`; `package.json` script; `scripts/check-ci.sh` step; `tests/bootstrap-files.test.ts` only if it asserts the step list.
- Out of scope: unifying the two writers; editing archcontext nodes, `src/core/capabilities/registry.ts`, root `CLAUDE.md`/`AGENTS.md`, or any nested contract file content; changing the map schema or the non-contract glob entries.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If some `src/` runtime or hook actually reads `discoverable_contexts` entries by capability_id (not just the file path), removing the root duplicates could change behavior. Cheapest check: `rg -n 'discoverable_contexts' src scripts --glob '*.ts'` and read every hit before writing `--write`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260906-0323-context-map-drift-check.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260906-0323-context-map-drift-check.review.md`
- Notes file: `tasks/notes/20260906-0323-context-map-drift-check.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"context-map-check","kind":"deterministic_test","paths":["scripts/check-context-map.ts","tests/check-context-map.test.ts"]},{"id":"writer-root-guard","kind":"deterministic_test","paths":["scripts/context-contract-sync.sh","scripts/architecture-event.ts","tests/architecture-event.test.ts","tests/hook-contracts.test.ts"]},{"id":"map-repair","kind":"runtime_readback","paths":[".ai/context/context-map.json"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260906-0323-context-map-drift-check.md
  - tasks/contracts/20260906-0323-context-map-drift-check.contract.md
  - tasks/reviews/20260906-0323-context-map-drift-check.review.md
  - tasks/notes/20260906-0323-context-map-drift-check.notes.md
  - tasks/todos.md
  - scripts/check-context-map.ts
  - scripts/context-contract-sync.sh
  - scripts/architecture-event.ts
  - assets/templates/helpers/context-contract-sync.sh
  - assets/templates/helpers/architecture-event.ts
  - tests/check-context-map.test.ts
  - tests/architecture-event.test.ts
  - tests/hook-contracts.test.ts
  - tests/bootstrap-files.test.ts
  - .ai/context/context-map.json
  - package.json
  - scripts/check-ci.sh
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

Choose the smallest checks that cover the changed behavior. Add a full suite
only for an explicit release requirement or an observed cross-module coverage
gap; state that reason and expected cost in Acceptance Notes. Do not duplicate
coverage between `tests_pass` and `commands_succeed`. Before the first run,
list eligible deterministic criteria in `criterion_reuse`; eligibility requires
all inputs to be bound by the frozen subject/toolchain context. Leave external
or mutable-state criteria ineligible. The canonical acceptance runner owns the
expensive execution; workers and reviewers consume its evidence.

If a full suite already passed before a bounded follow-up edit, preserve its
run identity as baseline evidence and choose focused checks for the actual delta.
The parent revises these criteria and records the baseline plus coverage rationale
in Acceptance Notes, unless an explicit user/release requirement still requires
a full run on the new subject. A cache miss alone does not justify another full
suite; never label the old subject's pass as a full pass for the new subject.

```yaml
exit_criteria:
  files_exist:
    - scripts/check-context-map.ts
    - .ai/context/context-map.json
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260906-0323-context-map-drift-check.notes.md
  tests_pass:
    - path: tests/check-context-map.test.ts
    - path: tests/architecture-event.test.ts
    - path: tests/hook-contracts.test.ts
  commands_succeed:
    - bun run check:context-map
    - bun run check:helpers
    - bash -n scripts/check-ci.sh
    - bun run check:type
criterion_reuse:
  tests_pass:
    - path: tests/check-context-map.test.ts
    - path: tests/architecture-event.test.ts
    - path: tests/hook-contracts.test.ts
  commands_succeed:
    - bun run check:context-map
    - bun run check:helpers
    - bash -n scripts/check-ci.sh
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
