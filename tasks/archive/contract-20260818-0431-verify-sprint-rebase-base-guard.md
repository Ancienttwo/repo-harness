> **Archived**: 2026-08-18 04:31
> **Related Plan**: plans/archive/plan-20260818-0347-verify-sprint-rebase-base-guard.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260818-0431

# Task Contract: verify-sprint-rebase-base-guard

> **Status**: Fulfilled
> **Plan**: plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 03:47
> **Review File**: `tasks/reviews/20260818-0347-verify-sprint-rebase-base-guard.review.md`
> **Notes File**: `tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

A contract worktree that gets rebased produces a scope-gate failure naming files the slice never touched. The failure text points at neither the base nor the rebase, so the whole diagnosis cost sits in the gap between symptom and cause — paid twice already (`tasks/lessons.md` 2026-08-18, both entries). If this ships wrong, the gate either keeps lying about scope violations or, worse, silently picks a different base and stops measuring what the contract promised.

## Goal

`verify-sprint` exits non-zero, naming the stale `base_commit` and the refresh command, whenever `.ai/harness/worktrees/<slug>.json`'s recorded `base_commit` is not an ancestor of `HEAD`. It must not fall back to another diff base.

## Scope

- In scope: an ancestry assertion in `scripts/verify-sprint.sh` called at top level before the diff base is consumed; the byte-identical mirror in `assets/templates/helpers/verify-sprint.sh`; one regression test.
- Out of scope: `base_epoch`, `previous_base_commit`, `verification_invalidated`, self-refreshing metadata, any automatic fallback to `origin/main`, and any change to `scripts/contract-worktree.sh`.
- Taste constraints: fail closed with a named cause; no silent semantic fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the recorded `base_commit` were derived rather than stored — refreshed by some other code path on rebase — the guard would fire on a healthy worktree and this direction would be wrong. Cheapest proof point: `grep -n 'base_commit' scripts/contract-worktree.sh` shows `write_start_metadata` returns early when metadata already exists (`:232`), so nothing refreshes it after start.

## Root Cause Evidence

- root_cause: `scripts/verify-sprint.sh:237` accepts the recorded `base_commit` on `git rev-parse --verify` alone, so a commit that left the branch during a rebase still outranks `origin/main` in `git_diff_base_ref` (`:261`) and becomes the scope-gate diff base.
- repro: in a contract worktree rebased onto a moved target, `bash scripts/verify-sprint.sh` reports `allowed_paths_check` `outside` entries belonging to the target branch's own commits.
- regression_guard: tests/verify-sprint-rebase-base-guard.test.ts
- pre_fix_failure_artifact: tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.prefix-failure.txt

## Workflow Inventory

- Source plan: `plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0347-verify-sprint-rebase-base-guard.review.md`
- Notes file: `tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.notes.md`
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
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md
  - tasks/reviews/20260818-0347-verify-sprint-rebase-base-guard.review.md
  - tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.notes.md
  - tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.prefix-failure.txt
  - scripts/verify-sprint.sh
  - assets/templates/helpers/verify-sprint.sh
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
    - scripts/verify-sprint.sh
    - assets/templates/helpers/verify-sprint.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260818-0347-verify-sprint-rebase-base-guard.notes.md
  tests_pass:
    - path: tests/verify-sprint-rebase-base-guard.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: a rebased worktree's gate run stops with the stale base named; an unrebased worktree and a non-worktree repo are unaffected.
- Edge cases: no worktree metadata at all (guard returns early); metadata present but `base_commit` empty (guard returns early); `base_commit` equal to `HEAD` (ancestor of itself, passes).
- Regression risks: the guard runs before every gate invocation, so a false positive would block all closeouts; the ancestry test is the only thing standing between correct and blocking.

## Rollback Point

- Commit / checkpoint: `bdc75c21`
- Revert strategy: revert the two `verify-sprint.sh` copies; the guard is additive and has no persisted state.
