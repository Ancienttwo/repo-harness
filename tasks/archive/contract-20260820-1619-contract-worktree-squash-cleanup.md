> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260731-0952-contract-worktree-squash-cleanup.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1619

# Task Contract: contract-worktree-squash-cleanup

> **Status**: Active
> **Plan**: plans/plan-20260731-0952-contract-worktree-squash-cleanup.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-07-31 09:52
> **Review File**: `tasks/reviews/20260731-0952-contract-worktree-squash-cleanup.review.md`
> **Notes File**: `tasks/notes/20260731-0952-contract-worktree-squash-cleanup.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The repo's established ship convention is squash merge (#134 onward; #138–#141 this round), but `contract-worktree cleanup` decides "fully merged" by pure ancestry — squash-merged branch commits are never ancestors of main, so the safety gate refuses every legitimately absorbed worktree (2026-07-31: all four shipped worktrees refused despite per-file content verification on main). The gate is structurally dead under the house flow; humans route around it with raw `git worktree remove`, losing the protection entirely.

## Goal

Cleanup's merged-detection becomes two-tier and fail-closed: the existing ancestry fast path stays; a new absorption check treats a branch as merged when `git merge-tree --write-tree <target> <branch>` merges cleanly AND yields a tree OID identical to the target's tree (branch adds nothing). Conflicts, differing trees, or command failure keep refusing. Messages name the matched predicate; all other cleanup safety checks (uncommitted changes, unpushed commits) stay intact. The four existing shipped worktrees' `cleanup --dry-run` flips from refusal to listing deletions (read-only smoke; actual removal happens post-merge by the coordinator).

## Scope

- In scope: the merged-detection segment of `scripts/contract-worktree.sh` cleanup; mirror `assets/templates/helpers/contract-worktree.sh` via `bun run sync:helpers`; new guard `tests/contract-worktree-squash-cleanup.test.ts` (RED-first, positive squash case + fail-closed negative control); notes file.
- Out of scope: contract-worktree start/finish/status branches; merge-gate; other helpers; the remaining cleanup safety checks; actually deleting any existing worktree (smoke is dry-run only).
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the absorption predicate ever accepts a branch carrying content absent from the target (extra commit, conflicting edit), the change has widened a destructive-operation gate and the direction is wrong. Cheapest proof point: the guard's negative control (branch with one un-merged extra commit must still be refused) passes on unfixed code and must still pass post-fix.

## Root Cause Evidence

- root_cause: the cleanup branch of `scripts/contract-worktree.sh` gates deletion on a pure git-ancestry "fully merged into main" test, so any branch integrated via the repo's standard squash-merge flow (branch commits never become main ancestors) is refused even when `git merge-tree` proves main already contains its entire tree.
- repro: on any squash-merged shipped worktree (verified 2026-07-31 on all four of `mcp-allowed-root-canonicalization` / `cli-init-rename` / `reference-configs-projection` / `receipt-fingerprint-normalization`): `repo-harness run contract-worktree -- cleanup --slug <slug> --dry-run` → `branch codex/<slug> is not fully merged into main; refusing cleanup`, while per-file content checks show everything present on main.
- regression_guard: tests/contract-worktree-squash-cleanup.test.ts
- pre_fix_failure_artifact: tasks/notes/20260731-worktree-squash-cleanup.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260731-0952-contract-worktree-squash-cleanup.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260731-0952-contract-worktree-squash-cleanup.review.md`
- Notes file: `tasks/notes/20260731-0952-contract-worktree-squash-cleanup.notes.md`
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
  - tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md
  - tasks/reviews/20260731-0952-contract-worktree-squash-cleanup.review.md
  - tasks/notes/20260731-0952-contract-worktree-squash-cleanup.notes.md
  - tasks/notes/20260731-worktree-squash-cleanup.pre-fix.log
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
    - tasks/notes/20260731-0952-contract-worktree-squash-cleanup.notes.md
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

- Commit / checkpoint: `83792a81` (main at worktree creation, branch `codex/contract-worktree-squash-cleanup`)
- Revert strategy: revert the merge commit — cleanup returns to ancestry-only refusal (safe direction: over-refuses, never over-deletes); the guard's positive case fails again by design.
