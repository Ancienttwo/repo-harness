> **Archived**: 2026-08-21 12:26
> **Related Plan**: plans/archive/plan-20260821-1136-basegate-ancestor-relax.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260821-1226

# Task Contract: basegate-ancestor-relax

> **Status**: Fulfilled
> **Plan**: plans/plan-20260821-1136-basegate-ancestor-relax.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-21 11:36
> **Review File**: `tasks/reviews/20260821-1136-basegate-ancestor-relax.review.md`
> **Notes File**: `tasks/notes/20260821-1136-basegate-ancestor-relax.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The equality-based base-sync guard blocked the ship chain three times on 2026-08-20/21 (each: rebase + ~13min re-freeze) for a state that is not the harm it guards against — local main strictly ahead of origin is safe for acceptance binding (evidence targets origin/main) and stale-fork publication is separately guarded by contract-worktree finish's ancestor check. If this ships WRONG (over-relaxed), a behind/diverged local main could freeze acceptance evidence against a base that origin has moved past — so behind and diverged must still fail, with tests proving all four quadrants.

## Goal

Execute the plan's `## Task Breakdown` exactly; frozen decisions 1-5 in `plans/plan-20260821-1136-basegate-ancestor-relax.md` are authoritative. Outcome: the base-sync guard in `scripts/verify-sprint.sh` (~:444-453) fails iff upstream exists and is NOT an ancestor of local main (behind/diverged), passes on equal or ahead; both script twins stay byte-identical; existing criteria and the `base_ref_unsynchronized`-pinning surfaces reconciled.

## Scope

- In scope: `scripts/verify-sprint.sh` base-sync guard, its twin `assets/templates/helpers/verify-sprint.sh` (via sync-helper-sources), verify-sprint tests, any test/doc pinning the `base_ref_unsynchronized` literal.
- Out of scope: restamp advisory, contract-worktree finish gates, acceptance-receipt semantics, all other verify-sprint criteria, policy keys.
- Taste constraints: keep the guard's existing shell idiom and output token shape; smallest diff that changes the criterion.

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

- Source plan: `plans/plan-20260821-1136-basegate-ancestor-relax.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260821-1136-basegate-ancestor-relax.review.md`
- Notes file: `tasks/notes/20260821-1136-basegate-ancestor-relax.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"quadrant-matrix","kind":"deterministic_test","paths":["*"]},{"id":"full-suite","kind":"deterministic_test","paths":["*"]},{"id":"gatekeeper-acceptance","kind":"manual_acceptance","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260821-1136-basegate-ancestor-relax.contract.md
  - tasks/reviews/20260821-1136-basegate-ancestor-relax.review.md
  - tasks/notes/20260821-1136-basegate-ancestor-relax.notes.md
  - scripts/verify-sprint.sh
  - assets/templates/helpers/verify-sprint.sh
  - tests/
  - docs/
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
    - scripts/verify-sprint.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260821-1136-basegate-ancestor-relax.notes.md
  tests_pass:
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - bun run check:type
    - bash -c 'grep -q "merge-base --is-ancestor" scripts/verify-sprint.sh'
    - bash -c 'cmp scripts/verify-sprint.sh assets/templates/helpers/verify-sprint.sh || bun scripts/sync-helper-sources.ts --check'
```

## Acceptance Notes (Human Review)

- Functional behavior: four-quadrant base-sync matrix (equal/ahead pass, behind/diverged fail).
- Edge cases: missing upstream (behavior preserved as-is), detached states, token pinned by other tests/docs.
- Regression risks: over-relaxation letting behind/diverged freeze stale evidence; twin drift; sibling criteria disturbed.

## Rollback Point

- Commit / checkpoint: worktree base (fork from main at a47cde10 or later)
- Revert strategy: single revert restores the equality criterion in both twins.
