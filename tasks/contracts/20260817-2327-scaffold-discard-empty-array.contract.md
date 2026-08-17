# Task Contract: scaffold-discard-empty-array

> **Status**: Active
> **Plan**: plans/plan-20260817-2327-scaffold-discard-empty-array.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-17 23:27
> **Review File**: `tasks/reviews/20260817-2327-scaffold-discard-empty-array.review.md`
> **Notes File**: `tasks/notes/20260817-2327-scaffold-discard-empty-array.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`discard_scaffold_dirty_paths` aborts halfway on macOS whenever every dirty
scaffold path is tracked: it restores the tracked paths first, then dies on the
untracked loop, leaving the operator with a non-zero exit and an `unbound
variable` message after their files were already reverted.

The defect predates `b456121a` but was nearly unreachable: squash-merged
branches were filtered out as unmerged and never entered the discard path, so
it only fired on `--no-ff` merges. Squash is this project's house flow and the
GitHub default, so the path is now routinely reachable. Issue #196's reporter,
clearing 100+ worktrees, is the likely first encounter — that issue already
carries a public warning to avoid `--discard-scaffold-only` until this lands.

## Goal

`ship-worktrees --cleanup-merged --discard-scaffold-only` completes on bash 3.2
when the dirty scaffold set contains zero untracked paths, and a test locks that
success path.

## Scope

- In scope: change `scripts/ship-worktrees.sh:806` to
  `for path in ${untracked_paths[@]+"${untracked_paths[@]}"}; do`; mirror to
  `assets/templates/helpers/ship-worktrees.sh` via `bun run sync:helpers`; add a
  success-path test covering a merged worktree whose dirty scaffold is entirely
  tracked.
- Out of scope: which paths count as scaffold, the refusal branches, the
  `--discard-scaffold-only` gate itself, `BASH_BIN` resolution, and any bash
  version bump. Only the empty-array expansion changes.
- Taste constraints: use the idiom already present twice in this same file at
  `:1085` and `:1105` (`${child_args[@]+"${child_args[@]}"}`). Do not introduce a
  different empty-array pattern, do not restructure the loop, and do not relax
  `set -euo pipefail`.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if the fix would change behavior when the array is non-empty. Word
  splitting and quoting must be preserved for elements containing spaces.

## Falsifier

If the guarded expansion changes iteration for a non-empty array — in
particular if an element containing a space is split into two iterations — the
fix is wrong regardless of the empty case passing. Cheapest proof:

```
/bin/bash -c 'set -euo pipefail; a=("p q" r); for x in ${a[@]+"${a[@]}"}; do echo "[$x]"; done'
```

must print `[p q]` and `[r]`, not `[p]` `[q]` `[r]`.

## Root Cause Evidence

- root_cause: scripts/ship-worktrees.sh:806 expands `"${untracked_paths[@]}"` under `set -euo pipefail`, and bash 3.2 (macOS `/bin/bash`, the `BASH_BIN` default at scripts/ship-worktrees.sh:7) raises `unbound variable` for an empty array, so discard_scaffold_dirty_paths exits 1 after already reverting the tracked paths.
- repro: /bin/bash -c 'set -euo pipefail; a=(); for x in "${a[@]}"; do echo "$x"; done; echo REACHED_END' prints `/bin/bash: a[@]: unbound variable` and exits 1; end to end, `ship-worktrees --cleanup-merged --discard-scaffold-only` against a merged worktree whose dirty scaffold is entirely tracked aborts the same way.
- regression_guard: tests/helper-scripts.test.ts
- pre_fix_failure_artifact: tasks/notes/20260817-scaffold-discard-empty-array.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260817-2327-scaffold-discard-empty-array.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260817-2327-scaffold-discard-empty-array.review.md`
- Notes file: `tasks/notes/20260817-2327-scaffold-discard-empty-array.notes.md`
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
  - tasks/contracts/20260817-2327-scaffold-discard-empty-array.contract.md
  - tasks/reviews/20260817-2327-scaffold-discard-empty-array.review.md
  - tasks/notes/20260817-2327-scaffold-discard-empty-array.notes.md
  - .ai/context/capabilities.json
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
    - tasks/notes/20260817-2327-scaffold-discard-empty-array.notes.md
  tests_pass:
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
