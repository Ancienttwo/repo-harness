# Task Contract: worktree-metadata-authority

> **Status**: Active
> **Plan**: plans/plan-20260818-0509-worktree-metadata-authority.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 05:09
> **Review File**: `tasks/reviews/20260818-0509-worktree-metadata-authority.review.md`
> **Notes File**: `tasks/notes/20260818-0509-worktree-metadata-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The base-staleness guard shipped in `6ad02039` is the authority that decides which commit every scope gate diffs from. A reproduced bypass lets a stale base through silently while the resolver uses it, and a missing optional dependency removes the guard entirely. A scope authority that can be silently absent is worse than none, because the passing gate is read as evidence.

## Goal

One typed selector chooses exactly one metadata record; the resolver and the guard consume that same record; every state that is neither "no matching metadata" nor "verified current" fails closed with a distinct cause.

- In scope: `scripts/verify-sprint.sh` and its byte-identical mirror `assets/templates/helpers/verify-sprint.sh`; the existing base-guard test file.
- Out of scope: `contract-worktree start` behaviour, splitting `base_commit` into scope-origin and integration-base fields, `base_epoch`, automatic metadata refresh, any network access from `verify-sprint`.
- Taste constraints: agreement between guard and resolver must hold by construction, not by comment. The previous comment asserted an invariant the code did not hold. <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If failing closed on these states blocked ordinary work rather than catching real ambiguity, the direction would be wrong. Cheapest proof point: after the change, this repo's own three live contract worktrees must still pass their gates unchanged.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `contract_worktree_metadata_rows` in `scripts/verify-sprint.sh` skipped a row only when it serialized to the empty string, but an all-empty matching record joins to two separators, so the guard's `head -1` consumed it and returned silently while the resolver skipped it and used the next row's stale base.
- repro: two metadata files in one fixture -- an exact-worktree match with every field empty, and a branch match carrying a pre-rebase base -- then run `bash scripts/verify-sprint.sh`; the guard prints nothing while `contract_worktree_base_commit` returns the stale SHA.
- regression_guard: tests/verify-sprint-rebase-base-guard.test.ts
- pre_fix_failure_artifact: tasks/notes/20260818-0509-worktree-metadata-authority.prefix-failure.txt

## Workflow Inventory

- Source plan: `plans/plan-20260818-0509-worktree-metadata-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0509-worktree-metadata-authority.review.md`
- Notes file: `tasks/notes/20260818-0509-worktree-metadata-authority.notes.md`
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
  - tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md
  - tasks/reviews/20260818-0509-worktree-metadata-authority.review.md
  - tasks/notes/20260818-0509-worktree-metadata-authority.notes.md
  - tasks/notes/20260818-0509-worktree-metadata-authority.prefix-failure.txt
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
    - tasks/notes/20260818-0509-worktree-metadata-authority.notes.md
  tests_pass:
    - path: tests/verify-sprint-rebase-base-guard.test.ts
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
