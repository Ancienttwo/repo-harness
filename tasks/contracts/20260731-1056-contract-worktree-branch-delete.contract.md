# Task Contract: contract-worktree-branch-delete

> **Status**: Active
> **Plan**: plans/plan-20260731-1056-contract-worktree-branch-delete.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-31 10:56
> **Review File**: `tasks/reviews/20260731-1056-contract-worktree-branch-delete.review.md`
> **Notes File**: `tasks/notes/20260731-1056-contract-worktree-branch-delete.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

#142 taught cleanup's merge gate to recognize squash absorption, but the subsequent branch deletion still uses `git branch -d` — git's own ancestry-based safety — which refuses every squash-absorbed branch. Verified 2026-07-31 on all three absorbed cleanups: worktree and metadata removed, branch left behind with `error: the branch '…' is not fully merged`, non-zero exit. Every future squash package repeats this, forcing manual `-D` as a habit and hollowing out the safety gate #142 just fixed.

## Goal

The merge gate's matched predicate flows into the deletion step: `absorbed` branches delete via `git branch -D` (the absorption check just proved zero delta against main — git's ancestry check is a guaranteed false positive there), `ancestor` branches keep `-d` (double insurance intact), gate-refused branches never reach deletion. A squash-merged branch's real `cleanup --slug <slug>` removes worktree, metadata, and branch in one pass with exit 0; a merge-commit branch still deletes via `-d`.

## Scope

- In scope: predicate-flag plumbing + conditional deletion in `scripts/contract-worktree.sh` (around :1091); mirror via `bun run sync:helpers`; extend `tests/contract-worktree-squash-cleanup.test.ts` (real-cleanup positive case + ancestor `-d` case; existing negative control untouched); notes file.
- Out of scope: the #142 gate logic itself (flag export only, no predicate change); start/finish/status branches; other safety checks; other helpers; any real worktree cleanup (closeout already done, none exist).
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `-D` ever fires on a branch the gate did NOT judge absorbed (or the flag leaks across invocations), the change converts a guaranteed-false-positive bypass into an unconditional force-delete and the direction is wrong. Cheapest proof point: the gate-refused negative control must still exit 1 before any deletion, and the ancestor case must still log/delete via `-d`.

## Root Cause Evidence

- root_cause: `scripts/contract-worktree.sh:1091` deletes with `git branch -d`, whose built-in ancestry check independently re-judges "merged" and refuses every squash-absorbed branch that the #142 gate (same script, :1029-1053) has already proven tree-identical to main, so cleanup half-completes (worktree+metadata removed, branch left, non-zero exit).
- repro: on a squash-merged branch, `bash scripts/contract-worktree.sh cleanup --slug <slug>` → gate logs `absorbed into main (squash-equivalent tree)`, worktree removed, then `error: the branch 'codex/<slug>' is not fully merged` (observed 2026-07-31 on all three absorbed cleanups: receipt-fingerprint-normalization, reference-configs-projection, contract-worktree-squash-cleanup).
- regression_guard: tests/contract-worktree-squash-cleanup.test.ts
- pre_fix_failure_artifact: tasks/notes/20260731-branch-delete.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260731-1056-contract-worktree-branch-delete.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260731-1056-contract-worktree-branch-delete.review.md`
- Notes file: `tasks/notes/20260731-1056-contract-worktree-branch-delete.notes.md`
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
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md
  - tasks/reviews/20260731-1056-contract-worktree-branch-delete.review.md
  - tasks/notes/20260731-1056-contract-worktree-branch-delete.notes.md
  - tasks/notes/20260731-branch-delete.pre-fix.log
  - .ai/context/capabilities.json
  - .claude/templates/
  - scripts/contract-worktree.sh
  - assets/templates/helpers/contract-worktree.sh
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260731-1056-contract-worktree-branch-delete.notes.md
  tests_pass:
    - path: tests/contract-worktree-squash-cleanup.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:helpers
    - bun test
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: `a37c16e4` (main at worktree creation, branch `codex/contract-worktree-branch-delete`)
- Revert strategy: revert the merge commit — deletion returns to unconditional `-d` (safe direction: half-completed cleanups with orphan branches, never over-deletion); the real-cleanup guard case fails again by design.
