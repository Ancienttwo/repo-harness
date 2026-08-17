# Task Contract: lite-enforce-gap

> **Status**: Fulfilled
> **Plan**: plans/plan-20260818-0133-lite-enforce-gap.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 01:33
> **Review File**: `tasks/reviews/20260818-0133-lite-enforce-gap.review.md`
> **Notes File**: `tasks/notes/20260818-0133-lite-enforce-gap.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The `minimal_change` enforce gate sat below Stop's `workflow_profile === 'lite'` early return, so a `review` verdict raised under a lite profile was silently discarded. That intersection is reachable: a single dependency-manifest edit, or a single source file carrying an `interface`/`abstract class`/forwarding wrapper, keeps the deterministic risk floor at lite while producing exactly the findings the gate exists to stop. Left unfixed, the enforce mode advertises a guarantee it does not deliver on the smallest, most common change shapes — the ones least likely to get a human review.

## Goal

Run the `minimal_change` enforce review before Stop's lite early return, so a `review` verdict without a matching audit receipt blocks Stop under every workflow profile, while a lite session with nothing to audit keeps its zero-ceremony silence (no stdout, no `[MinimalChange]` stderr).

## Scope

- In scope: hoisting the policy load, review, summary, and enforce gate above the lite early return in `src/cli/hook/stop-handler.ts`; adding `'lite'` to the gate's profile resolution so the circuit breaker keys on the real profile; two regression tests in `tests/stop-handler.test.ts` (lite + enforce + `review` blocks; lite with no report stays silent); refreshing the three flipped `ordering` cells in the loop-semantics characterization golden; filling this contract and the task notes.
- Out of scope: the profile derivation itself (`src/core/workflow/profile.ts`) and its inputs; `minimal_change` policy defaults; the minimal-change signal collector; repackaging or reinstalling the global runtime (the installed build still predates this fix); any commit, push, or publish; user WIP under `docs/architecture/**`, `tasks/todos.md`, and `docs/researches/20260818-*.md`.
- Taste constraints: no compatibility shim and no second gate call site — the gate keeps its existing lazy exits and stays a single authority. <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

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

- Source plan: `plans/plan-20260818-0133-lite-enforce-gap.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0133-lite-enforce-gap.review.md`
- Notes file: `tasks/notes/20260818-0133-lite-enforce-gap.notes.md`
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
  - plans/plan-20260818-0133-lite-enforce-gap.md
  - tasks/contracts/20260818-0133-lite-enforce-gap.contract.md
  - tasks/reviews/20260818-0133-lite-enforce-gap.review.md
  - tasks/notes/20260818-0133-lite-enforce-gap.notes.md
  - src/cli/hook/stop-handler.ts
  - tests/stop-handler.test.ts
  - tests/state/fixtures/loop-semantics/characterization.json
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
    - src/cli/hook/stop-handler.ts
    - tests/stop-handler.test.ts
  artifacts_exist:
    - tasks/notes/20260818-0133-lite-enforce-gap.notes.md
    - tests/state/fixtures/loop-semantics/characterization.json
  tests_pass:
    - path: tests/stop-handler.test.ts
    - path: tests/minimal-change-policy.test.ts
    - path: tests/state/loop-semantics-characterization.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-task-sync.sh
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
