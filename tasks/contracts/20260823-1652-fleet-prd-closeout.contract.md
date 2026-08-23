# Task Contract: fleet-prd-closeout

> **Status**: Active
> **Plan**: plans/plan-20260823-1652-fleet-prd-closeout.md
> **Task Profile**: ledger-closeout
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-23 16:52
> **Review File**: `tasks/reviews/20260823-1652-fleet-prd-closeout.review.md`
> **Notes File**: `tasks/notes/20260823-1652-fleet-prd-closeout.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

WP0-A through WP0-C shipped and passed their historical reviews, but their live plan/contract families were never terminally archived. Leaving them active makes the workflow read model claim unfinished Fleet work and permits stale receipts to be mistaken for current-target acceptance.

## Goal

Rebind WP0-A, WP0-B, WP0-C, and the already-merged GPT Pro orchestration work package to current-target verification and their own typed AcceptanceReceipts, archive each family as `Completed`, and leave the Fleet PRD legally `Approved` with no related active marker.

## Scope

- In scope: the four historical workflow families, their current-target evidence/receipt projections, canonical archive moves, cleanup of the absorbed GPT Pro worktree/branch, the closeout workflow family, and derived `tasks/current.md`/`tasks/todos.md` projections.
- Out of scope: product source/tests, WP1-WP4 historical review reconstruction, deferred WP5, and PRD lifecycle vocabulary changes.
- Taste constraints: preserve four separate contract/receipt authorities; no synthetic evidence, compatibility path, or bulk status rewrite.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If any old contract fails its unchanged exit criteria on current `main`, or its typed Receipt cannot be rebound without editing product code, it is not safe to archive. Run each contract's `verify-sprint --prepare-acceptance` before its archive operation.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260823-1652-fleet-prd-closeout.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260823-1652-fleet-prd-closeout.review.md`
- Notes file: `tasks/notes/20260823-1652-fleet-prd-closeout.notes.md`
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
  - plans/plan-20260823-1652-fleet-prd-closeout.md
  - plans/plan-20260822-1222-publication-receipt.md
  - plans/plan-20260822-1538-lease-protocol-2-lifecycle.md
  - plans/plan-20260822-1915-publication-recovery-reconcile.md
  - plans/archive/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260823-1652-fleet-prd-closeout.contract.md
  - tasks/reviews/20260823-1652-fleet-prd-closeout.review.md
  - tasks/notes/20260823-1652-fleet-prd-closeout.notes.md
  - tasks/contracts/20260822-1222-publication-receipt.contract.md
  - tasks/contracts/20260822-1538-lease-protocol-2-lifecycle.contract.md
  - tasks/contracts/20260822-1915-publication-recovery-reconcile.contract.md
  - tasks/reviews/20260822-1222-publication-receipt.review.md
  - tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md
  - tasks/reviews/20260822-1915-publication-recovery-reconcile.review.md
  - tasks/notes/20260822-1222-publication-receipt.notes.md
  - tasks/notes/20260822-1538-lease-protocol-2-lifecycle.notes.md
  - tasks/notes/20260822-1915-publication-recovery-reconcile.notes.md
  - tasks/archive/
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
    - plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md
    - plans/archive/plan-20260822-1222-publication-receipt.md
    - plans/archive/plan-20260822-1538-lease-protocol-2-lifecycle.md
    - plans/archive/plan-20260822-1915-publication-recovery-reconcile.md
    - plans/archive/plan-20260822-1240-gpt-pro-orchestrate-mode.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260823-1652-fleet-prd-closeout.notes.md
  commands_succeed:
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bash scripts/check-architecture-sync.sh
    - bun scripts/inspect-project-state.ts --repo . --format text
    - git diff --check
```

## Acceptance Notes (Human Review)

- Functional behavior: no product behavior changes; three already-landed work packages become truthful terminal workflow artifacts.
- Edge cases: each receipt must bind its own contract and current target; WP5 remains deferred; the obsolete GPT Pro worktree is removed only after its landed tree is proven on `main`.
- Regression risks: archiving the wrong family or projecting one receipt across contracts; canonical `archive-workflow` and per-contract verification prevent both.

## Rollback Point

- Commit / checkpoint: `d742cede`
- Revert strategy: revert the single closeout publication commit; product commits remain unchanged.
