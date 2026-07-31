# Implementation Notes: contract-worktree-squash-cleanup

> **Status**: Active
> **Plan**: plans/plan-20260731-0952-contract-worktree-squash-cleanup.md
> **Contract**: tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md
> **Review**: tasks/reviews/20260731-0952-contract-worktree-squash-cleanup.review.md
> **Last Updated**: 2026-07-31 09:52
> **Lifecycle**: notes

## Design Decisions

- `cleanup_worktree()` in `scripts/contract-worktree.sh` now gates deletion on a two-tier, fail-closed predicate instead of pure ancestry:
  1. **Ancestor fast path (unchanged)**: `git merge-base --is-ancestor "$branch_name" "$target_branch"`. Logs `Merge check for $branch_name: ancestor of $target_branch`.
  2. **Absorption check (new)**: only reached when (1) fails. Runs `git merge-tree --write-tree "$target_branch" "$branch_name"`; if that exits 0 (no conflicts) AND its one-line stdout (the resulting tree OID) exactly equals `git rev-parse "$target_branch^{tree}"`, the branch is treated as merged (`absorbed`). Any other outcome — non-zero exit (conflict or command failure) or a differing tree OID — falls through to the original, unchanged refusal message/exit path. Verified empirically (scratch repos) before wiring into the script: clean squash gives exit 0 with stdout == target tree; an extra un-merged commit gives exit 0 but a *different* tree; a genuine content conflict gives exit 1 with conflict markers on stdout. All three cases behave as required.
  - `local target_tree merge_tree_output absorbed=0` is declared before the `if merge_tree_output="$(...)"; then` assignment (not `local x=$(...)` on one line) — required so `set -e`/the `if` condition actually see the command substitution's real exit status, matching the existing `worktree_status_for_cleanup` pattern already in this file (that pattern is the local precedent this change follows).
  - `[[ "$merge_tree_output" == "$target_tree" ]] && absorbed=1` is safe under `set -euo pipefail`: a failing `[[ ]]` on the left of `&&` does not trigger errexit (verified with a standalone repro), matching the common idiom already used throughout this file.
  - Canonical source is `scripts/contract-worktree.sh` only; `assets/templates/helpers/contract-worktree.sh` is a generated projection, regenerated via `bun run sync:helpers` and never hand-edited.

## Deviations From Plan Or Spec

- The plan's smoke step anticipated all four existing shipped worktrees flipping from refusal to `absorbed`. Actual result: 2 of 4 flip (`receipt-fingerprint-normalization`, `reference-configs-projection`); the other 2 (`mcp-allowed-root-canonicalization`, `cli-init-rename`) still refuse. This is not an implementation defect — see "Real-World Smoke Results" below for root cause (verified with direct `git merge-tree` inspection: genuine content conflicts against main's *current* tree, not stale predicate behavior). No code changed in response; the frozen fail-closed design is working exactly as specified for both outcomes.

## Real-World Smoke Results

Read-only (`--dry-run` only, nothing deleted): ran the fixed `scripts/contract-worktree.sh` from this worktree against the primary repo (`REPO_HARNESS_TARGET_REPO_ROOT=/Users/ancienttwo/Projects/repo-harness`, invoked from the primary checkout since `cleanup` refuses to run from a linked worktree) for all four worktrees named in the contract's Root Cause Evidence:

| Slug | PR | Result | Predicate hit |
|------|----|--------|----------------|
| `mcp-allowed-root-canonicalization` | #138 | refused | neither (real conflict) |
| `cli-init-rename` | #139 | refused | neither (real conflict) |
| `receipt-fingerprint-normalization` | #140 | accepted | `absorbed` |
| `reference-configs-projection` | #141 | accepted | `absorbed` |

The 2 accepted cases list the expected deletions (`would remove worktree` / `would delete branch` / `would remove metadata`) and log `absorbed into main (squash-equivalent tree)`.

The 2 refused cases were verified independently (not just trusted at face value) by running `git merge-tree --write-tree main <branch>` directly: both hit a genuine, non-fabricated content conflict —
- `mcp-allowed-root-canonicalization`: `CONFLICT (content): Merge conflict in tasks/todos.md`
- `cli-init-rename`: `CONFLICT (content): Merge conflict in tests/readme-dx.test.ts` (plus several clean `Auto-merging` hunks in other shared files)

Root cause: these are the two *oldest* of the four worktrees; `main` has since absorbed 2-3 further PRs (#139, #140, #141 for the #138 worktree) that also touched the same shared "living" files, producing real divergence between the stale worktree branch and `main`'s current tree on those files. The predicate is fail-closed by design (a real conflict must refuse), so this is correct, verified behavior, not a bug — see "Open Questions" for the workflow-level implication.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| `git cherry` (patch-id per-commit comparison) | Rejected | After a squash merge, N branch commits become 1 main commit; patch-ids never line up 1:1, so `cherry` reports the branch as unmerged even when fully absorbed — same false-negative the ancestry check already has. |
| `git diff target...branch` (triple-dot, merge-base diff) | Rejected | This is base-to-branch-tip diff, not target-vs-branch content comparison. After a squash merge it is structurally guaranteed non-empty (target and branch diverge from base in different-shaped ways) even when target's tree already contains 100% of branch's content, so it cannot prove absorption. |
| `git merge-tree --write-tree` + tree-OID equality (chosen) | Use | The only check of the three that directly answers "does target's tree already contain everything branch has": a clean synthetic merge whose result *is* target's tree proves branch adds nothing target lacks. Fails closed on conflict, command failure, or tree mismatch — no widening of the safety gate. |
| Two-tier (ancestor fast path retained + absorption fallback) vs. absorption-only | Use two-tier | Ancestry is cheaper and already correct for the non-squash case (e.g. `--no-ff` merges, or a worktree cleaned up before any divergence); no reason to pay for a `merge-tree` call when the existing check already proves the answer. |

## Open Questions

- Cross-worktree drift risk (surfaced by the smoke test, not a defect in this change): once *other* PRs land on `main` after a worktree ships, further ships that touch the same shared "living" files (`tasks/todos.md`, `AGENTS.md`, `docs/architecture/**`, etc.) can leave an older, already-shipped worktree's branch in a state where `git merge-tree` now finds a genuine content conflict against `main`'s *current* tree on those shared files — even though the worktree's actual code contribution has been in `main` all along. The absorption predicate correctly refuses cleanup in that case (fail-closed, as designed), but the practical effect is that an already-shipped worktree can silently lose cleanup eligibility over time. This is adjacent to, but distinct from, the already-tracked `tasks/todos.md` entry about `contract-worktree` + `git rebase` and `verify-sprint`'s `base_commit` ancestry (that one is about rebasing a worktree; this one is about *not* rebasing while siblings ship around it). Not fixed here: the frozen design is deliberately conflict-classification-free (any conflict refuses, full stop), and doing better would be a workflow-engine design change outside a single bugfix's allowed paths. Left for the parent to decide whether it belongs in `tasks/todos.md`.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
- The cross-worktree drift observation under Open Questions is a single-occurrence finding (not yet a repeated pattern) — do not promote yet; revisit if a future task hits the same "already-shipped worktree loses cleanup eligibility as siblings ship around it" symptom again.
