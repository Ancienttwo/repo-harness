# Plan: Scaffold discard survives an empty untracked array

> **Status**: Archived
> **Created**: 20260817-2327
> **Slug**: scaffold-discard-empty-array
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: tracked-only scaffold dirt must clean through --cleanup-merged --discard-scaffold-only on bash 3.2
> **Rollback Surface**: single-expression revert, no external state
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260817-2327-scaffold-discard-empty-array.contract.md`
> **Task Review**: `tasks/reviews/20260817-2327-scaffold-discard-empty-array.review.md`
> **Implementation Notes**: `tasks/notes/20260817-2327-scaffold-discard-empty-array.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260817-2327-scaffold-discard-empty-array.md`
- Sprint contract: `tasks/contracts/20260817-2327-scaffold-discard-empty-array.contract.md`
- Sprint review: `tasks/reviews/20260817-2327-scaffold-discard-empty-array.review.md`
- Implementation notes: `tasks/notes/20260817-2327-scaffold-discard-empty-array.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260817-2327-scaffold-discard-empty-array.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260817-2327-scaffold-discard-empty-array.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260817-2327-scaffold-discard-empty-array.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260817-2327-scaffold-discard-empty-array.contract.md`
- Review file: `tasks/reviews/20260817-2327-scaffold-discard-empty-array.review.md`
- Implementation notes file: `tasks/notes/20260817-2327-scaffold-discard-empty-array.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260817-2327-scaffold-discard-empty-array.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260817-2327-scaffold-discard-empty-array.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single-expression revert, no external state
- **Verification boundary**: tracked-only scaffold dirt must clean through --cleanup-merged --discard-scaffold-only on bash 3.2
- **Review/acceptance boundary**: `tasks/reviews/20260817-2327-scaffold-discard-empty-array.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260817-2327-scaffold-discard-empty-array.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260817-2327-scaffold-discard-empty-array.contract.md`, `tasks/reviews/20260817-2327-scaffold-discard-empty-array.review.md`, and `tasks/notes/20260817-2327-scaffold-discard-empty-array.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260817-2327-scaffold-discard-empty-array.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single-expression revert, no external state

## Captured Planning Output

# Scaffold discard survives an empty untracked array

## Problem

`scripts/ship-worktrees.sh:806` iterates `"${untracked_paths[@]}"` under
`set -euo pipefail`. On bash 3.2 an empty array expanded that way raises
`unbound variable`, so `discard_scaffold_dirty_paths` aborts whenever every
dirty scaffold path is tracked and none are untracked.

bash 3.2 is not an edge case here: `/bin/bash` on macOS is 3.2.57, and
`scripts/ship-worktrees.sh:7` defaults `BASH_BIN` to exactly that path.

Reproduced directly:

```
$ /bin/bash -c 'set -euo pipefail; a=(); for x in "${a[@]}"; do echo "$x"; done; echo REACHED_END'
/bin/bash: a[@]: unbound variable
exit=1
```

The failure is partial, which is what makes it worth fixing rather than
tolerating: `discard_scaffold_dirty_paths` restores the tracked scaffold paths
first (`git checkout --`), then dies on the untracked loop. The operator sees a
non-zero exit and an `unbound variable` message after their tracked files were
already reverted.

## Why now

This is a pre-existing defect, not a regression. It was confirmed against
`main` before the merge-authority fix: swapping in the pre-fix
`ship-worktrees.sh` and driving an `ancestor` branch reproduces the same abort.

What changed is reachability. Before `b456121a`, squash-merged branches were
filtered out as unmerged and never reached the discard path at all, so this
only fired on `--no-ff` merges. Squash is this project's house flow and the
GitHub default, so the path is now routinely reachable and the crash moves from
rare to common. Issue #196's reporter clearing 100+ worktrees is the likely
first encounter.

## Scope

- `scripts/ship-worktrees.sh:806` becomes
  `for path in ${untracked_paths[@]+"${untracked_paths[@]}"}; do`, matching the
  idiom already used twice in this same file at `:1085` and `:1105`
  (`${child_args[@]+"${child_args[@]}"}`). No new pattern is introduced.
- Mirror to `assets/templates/helpers/ship-worktrees.sh` via `bun run sync:helpers`.
- Add the missing success-path test: a merged worktree whose dirty scaffold is
  entirely tracked, cleaned through `--cleanup-merged --discard-scaffold-only`,
  must complete and remove the worktree. Existing coverage at
  `tests/helper-scripts.test.ts:1913` and `:1951` only exercises the refusal
  branches, which is why this defect survived.

## Non-scope

- No change to which paths count as scaffold, to the refusal branches, or to
  the `--discard-scaffold-only` gate itself. Only the empty-array expansion.
- No bash version bump and no change to `BASH_BIN` resolution.

## Entity delta

`+0 / -0`. One expression changes; the fix reuses an idiom already present in
the same file.

## Verification

The guard is behavior-preserving when the array is non-empty, including
elements containing spaces:

```
$ /bin/bash -c 'set -euo pipefail; a=("p q" r); for x in ${a[@]+"${a[@]}"}; do echo "[$x]"; done'
[p q]
[r]
```

Commands:

```
bun test tests/helper-scripts.test.ts
bun test tests/contract-worktree-squash-cleanup.test.ts
bun run check:helpers
bun run check:type
bun test
```

The new test must fail before the fix and pass after. Capture the pre-fix run as
the Root Cause Evidence artifact.

## Rollback

Single-expression source change, no external state, no migration. Revert the
commit; behavior returns to aborting on empty untracked arrays.

## Follow-through

Issue #196 already carries a public warning to avoid `--discard-scaffold-only`
until this lands. Post a follow-up there once merged.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Scaffold discard survives an empty untracked array
