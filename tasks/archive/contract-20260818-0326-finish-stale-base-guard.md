> **Archived**: 2026-08-18 03:26
> **Related Plan**: plans/archive/plan-20260818-0233-finish-stale-base-guard.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260818-0326

# Task Contract: finish-stale-base-guard

> **Status**: Fulfilled
> **Plan**: plans/plan-20260818-0233-finish-stale-base-guard.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-18 02:33
> **Review File**: `tasks/reviews/20260818-0233-finish-stale-base-guard.review.md`
> **Notes File**: `tasks/notes/20260818-0233-finish-stale-base-guard.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Incident 2026-08-18: `contract-worktree finish --merge` published commit `d2950ae7` whose tree was the un-rebased lifecycle HEAD, parented onto an advanced `main` tip — silently reverting two parallel-session commits (`35346e39` stop-handler enforce-gate fix, `e18937bd` lite-enforce-gap closeout). Recovery needed a manual restoration commit (`61b60e98`). In multi-session periods this recurs deterministically whenever the target advances between worktree start and finish. Docs already state the invariant ("The target base must remain frozen ... through publication", `docs/reference-configs/sprint-contracts.md:221`); the code never enforced the fork-point half.

## Goal

`finish --merge` must fail closed when the frozen target tip is not an ancestor of the worktree branch (i.e. target advanced past the fork point and the branch was never rebased):

1. Primary guard in `scripts/contract-worktree.sh` inside the `merge_back` pre-flight block (immediately after the existing dirty-target check at ~`:1455-1458`, before `closeout_journal_begin`): `git merge-base --is-ancestor "$frozen_base_sha" "$current_branch"` — on failure, print an actionable refusal naming the frozen base and the remedy (rebase or restart, re-run gates), `exit 1`. Zero side effects: claim lock releases via the existing `closeout_claim_on_exit` trap; no journal is created.
2. Same-shape recheck adjacent to the existing pre-publication freeze recheck (~`:1616-1627`), rolling back via the existing `finish_transaction_abort` path.
3. Regression test in `tests/contract-worktree-single-publication.test.ts` (pattern of the `:208-233` case): advance the primary/target with extra commits before finish on an un-rebased linked worktree; assert non-zero exit, guard message in stderr, target tip unchanged, linked worktree intact.
4. `assets/templates/helpers/contract-worktree.sh` mirror updated via `bun run sync:helpers`; `bun run check:helpers` green.

Semantics to preserve: target unmoved since fork → pass; worktree rebased onto advanced tip → pass; advanced + un-rebased → refuse.

## Scope

- In scope: `scripts/contract-worktree.sh`, `assets/templates/helpers/contract-worktree.sh` (sync projection), `tests/contract-worktree-single-publication.test.ts`, one new pre-fix artifact, this contract's workflow artifacts (notes/review/plan checkboxes).
- Out of scope (EXECUTION_BOUNDARY — absent requirements are forbidden design space; unrequested extras fail closed): `worktree-merge-lib.sh` / `worktree_merge_mode`, auto-rebase, metadata `base_commit` self-refresh, `verify-sprint.sh` scope-diff logic, journal/transaction phase restructuring, any refactor beyond the guard.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If legitimate finish flows exist where the frozen target tip is intentionally NOT an ancestor of the worktree branch, the guard would break them. Cheapest proof point: the existing test suite — `tests/contract-worktree-single-publication.test.ts:173-206` (normal publication, target unmoved) and `tests/contract-worktree-closeout-journal.test.ts` (journal semantics) must stay green; any legitimate-flow breakage surfaces there immediately.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/contract-worktree.sh:1335-1679` `finish_worktree()` never checks that `frozen_base_sha` (target tip at finish time, `refresh_and_freeze_base` `:1313-1333`) is an ancestor of the worktree branch, so `git commit-tree -p "$frozen_base_sha"` (`:1650/1654`) parents a stale un-rebased tree onto an advanced tip — a legal fast-forward that reverts the target's newer content.
- repro: create primary+linked worktrees, commit on linked from the original base, advance primary's target branch with extra commits, run `finish --merge` — publication succeeds and target content from the extra commits is reverted (observed live as commit `d2950ae7` reverting `35346e39`+`e18937bd`).
- regression_guard: tests/contract-worktree-single-publication.test.ts
- pre_fix_failure_artifact: tasks/notes/20260818-0233-finish-stale-base-guard.prefix-failure.txt

## Workflow Inventory

- Source plan: `plans/plan-20260818-0233-finish-stale-base-guard.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260818-0233-finish-stale-base-guard.review.md`
- Notes file: `tasks/notes/20260818-0233-finish-stale-base-guard.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"stale-base-guard-regression","kind":"deterministic_test","paths":["*"]}]}
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
  - tasks/contracts/20260818-0233-finish-stale-base-guard.contract.md
  - tasks/reviews/20260818-0233-finish-stale-base-guard.review.md
  - tasks/notes/20260818-0233-finish-stale-base-guard.notes.md
  - tasks/notes/20260818-0233-finish-stale-base-guard.prefix-failure.txt
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
  - scripts/
  - assets/templates/helpers/
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
    - tasks/notes/20260818-0233-finish-stale-base-guard.notes.md
  tests_pass:
    - path: tests/contract-worktree-single-publication.test.ts
    - path: tests/contract-worktree-closeout-journal.test.ts
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

- Commit / checkpoint: worktree base `a24990b5` (branch `codex/finish-stale-base-guard`)
- Revert strategy: single revertable commit (one shell script + projection mirror + one test file); no state files, schemas, or wire formats.
