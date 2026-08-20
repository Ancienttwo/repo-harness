> **Archived**: 2026-08-20 17:11
> **Related Plan**: plans/archive/plan-20260820-1629-deferred-goals-cleanup.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1711

# Task Contract: deferred-goals-cleanup

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-1629-deferred-goals-cleanup.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 16:29
> **Review File**: `tasks/reviews/20260820-1629-deferred-goals-cleanup.review.md`
> **Notes File**: `tasks/notes/20260820-1629-deferred-goals-cleanup.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Three deferred-goal ledger rows have fired their revisit triggers; leaving them open keeps a masked machine shim (trusted-Node discovery), a misdirecting architecture doc (§3.3 ranking contradicted by the repo's own telemetry), and flaky ship gates (timing-sensitive tests) in place.

## Goal

Close the three due-trigger deferred goals as one merge unit: (1) `trustedNodeCandidates` includes `~/.local/bin/node` with updated provider tests; (2) `docs/architecture/modules/runtime-harness/hook-adapters.md` §3.3 ranking, sink attribution, and SessionStart degradation description match measured telemetry; (3) the full-suite timing-flake class is reproduced under controlled load with only mechanism-backed test-side determinism changes applied. Each closed goal's ledger row is removed or updated in `tasks/todos.md`.

## Scope

- In scope: `src/effects/runtime/node-candidates.ts`, `tests/architecture-projection-provider.test.ts`, `docs/architecture/modules/runtime-harness/hook-adapters.md`, timing-flake member test files, `tasks/todos.md`, this contract family.
- Out of scope: production-source changes for the flake class beyond proven test-side fixes; guard/policy changes; the parallel session's WIP (v0.5 refactor plan deletions); any other ledger row.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

What observable evidence would prove this task's direction wrong, and the cheapest proof point to check first. Leave as-is if not applicable.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260820-1629-deferred-goals-cleanup.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-1629-deferred-goals-cleanup.review.md`
- Notes file: `tasks/notes/20260820-1629-deferred-goals-cleanup.notes.md`
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
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260820-1629-deferred-goals-cleanup.contract.md
  - tasks/reviews/20260820-1629-deferred-goals-cleanup.review.md
  - tasks/notes/20260820-1629-deferred-goals-cleanup.notes.md
  - tasks/notes/20260820-timeout-contract.pre-fix.log
  - .ai/context/capabilities.json
  - .claude/templates/
  - package.json
  - bunfig.toml
  - CLAUDE.md
  - AGENTS.md
  - docs/architecture/modules/runtime-harness/hook-adapters.md
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
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260820-1629-deferred-goals-cleanup.notes.md
  tests_pass:
    - path: tests/architecture-projection-provider.test.ts
    - path: tests/readme-dx.test.ts
    - path: tests/test-timeout-contract.test.ts
    - path: tests/architecture-projection-orchestration.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
