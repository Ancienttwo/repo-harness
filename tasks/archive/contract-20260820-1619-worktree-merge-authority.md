> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260817-2055-worktree-merge-authority.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1619

# Task Contract: worktree-merge-authority

> **Status**: Fulfilled
> **Plan**: plans/plan-20260817-2055-worktree-merge-authority.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-17 20:55
> **Review File**: `tasks/reviews/20260817-2055-worktree-merge-authority.review.md`
> **Notes File**: `tasks/notes/20260817-2055-worktree-merge-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Contract worktrees accumulate without bound for every downstream user whose PRs
merge as squash, which is the GitHub default and this project's house flow. The
batch cleanup entrypoint reports those worktrees as unmerged and skips them, so
the only working cleanup path is naming each slug by hand. Reported in issue
\#196 by a user who reached 100+ worktree directories. Shipping this wrong in the
other direction is worse than the bug: a widened merge check would delete
worktrees holding unpushed work.

## Goal

The merge determination for a contract worktree branch has exactly one
implementation, and `ship-worktrees --cleanup-merged` recognizes squash-absorbed
branches exactly as `contract-worktree cleanup --slug` already does.

## Scope

- In scope: extract `scripts/worktree-merge-lib.sh` exposing
  `worktree_merge_mode <branch> <target>` that prints `ancestor`, `absorbed`, or
  `unmerged`; make `scripts/contract-worktree.sh` and `scripts/ship-worktrees.sh`
  both consume it; register the lib in `assets/workflow-contract.v1.json#helpers.scripts`
  and the mirrored `.ai/harness/workflow-contract.json`; run `bun run sync:helpers`
  so `assets/templates/helpers/` stays a clean projection of `scripts/`; add the
  batch-path regression case to `tests/contract-worktree-squash-cleanup.test.ts`.
- Path decision: the lib sits at `scripts/` top level, not `scripts/lib/`.
  `helpers.scripts` is a flat 54-entry list with zero directory separators, and
  `tests/helper-scripts.test.ts:580-583` compares it against a non-recursive
  `readdirSync`. `scripts/lib/` holds helpers that are deliberately NOT projected
  downstream (`project-init-lib.sh` is absent from the manifest); this lib must be
  projected because `contract-worktree.sh` sources it in installed repos, so it
  belongs to the packaged tier by definition, not by convenience.
- Out of scope: Phase 2 of the source plan (the SessionStart backlog section in
  `src/cli/hook/session-context.ts`) is a separate contract and must not be
  started here. No automatic deletion, no remote branch deletion, no new CLI
  command or flag. The dirty-worktree guards
  (`ensure_worktree_status_for_cleanup`, `guard_dirty_merged_worktree`,
  `--discard-scaffold-only`) are not touched: only the merge determination moves.
- Taste constraints: the `-d` versus `-D` split at
  `scripts/contract-worktree.sh:1857-1871` must survive unchanged. Force delete
  stays scoped to the `absorbed` predicate; no path may reach `-D` without a
  prior absorbed determination.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if collapsing the two determinations into one would change what
  `unmerged` refuses. The lib must stay fail-closed: merge-tree failure,
  conflict, or a differing tree all mean `unmerged`.

## Falsifier

If `worktree_merge_mode` returns `absorbed` for a branch that carries commits
main does not have, the direction is wrong and the extraction has widened the
check instead of relocating it. Cheapest proof: build a branch with one extra
commit on top of a squash-merged tree and assert the function prints `unmerged`.

## Root Cause Evidence

- root_cause: scripts/ship-worktrees.sh:1120 filters batch cleanup with `git merge-base --is-ancestor` only, while scripts/contract-worktree.sh:1793-1810 additionally accepts a `git merge-tree --write-tree` squash-absorbed branch, so squash-merged worktrees are reported unmerged and never cleaned.
- repro: bash scripts/ship-worktrees.sh --cleanup-merged --dry-run prints `[Ship] Skipped unmerged branch: codex/debug-ground-truth-eval-v1` while bash scripts/contract-worktree.sh cleanup --slug debug-ground-truth-eval-v1 --target main --dry-run prints `absorbed into main (squash-equivalent tree)` and would remove it.
- regression_guard: tests/contract-worktree-squash-cleanup.test.ts
- pre_fix_failure_artifact: tasks/notes/20260817-worktree-merge-authority.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260817-2055-worktree-merge-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260817-2055-worktree-merge-authority.review.md`
- Notes file: `tasks/notes/20260817-2055-worktree-merge-authority.notes.md`
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
  - tasks/contracts/20260817-2055-worktree-merge-authority.contract.md
  - tasks/reviews/20260817-2055-worktree-merge-authority.review.md
  - tasks/notes/20260817-2055-worktree-merge-authority.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/evidence/
  - .ai/harness/workflow-contract.json
  - assets/workflow-contract.v1.json
  - assets/templates/helpers/
  - scripts/
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
    - tasks/notes/20260817-2055-worktree-merge-authority.notes.md
  tests_pass:
    - path: tests/contract-worktree-squash-cleanup.test.ts
    - path: tests/helper-scripts.test.ts
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
