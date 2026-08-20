> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260731-1056-contract-worktree-branch-delete.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-1619

# Implementation Notes: contract-worktree-branch-delete

> **Status**: Active
> **Plan**: plans/plan-20260731-1056-contract-worktree-branch-delete.md
> **Contract**: tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md
> **Review**: tasks/reviews/20260731-1056-contract-worktree-branch-delete.review.md
> **Last Updated**: 2026-07-31 10:56
> **Lifecycle**: notes

## Design Decisions

- **`-D` safety argument**: the merge gate (`scripts/contract-worktree.sh:1029-1053`) already runs two independent predicates before any deletion happens — `git merge-base --is-ancestor` (ancestor case) or, on a fresh conflict-free `git merge-tree --write-tree`, an exact tree-equality check against `$target_branch^{tree}` (absorbed case). The absorbed branch is only reached when that tree-equality proof already holds, i.e. the branch's full content is a strict subset of target's — there is no code path to `merge_mode="absorbed"` without that proof running first. Given that, `git branch -d`'s own ancestry re-check at deletion time is a *guaranteed* false positive for every absorbed branch: squash-merge (this repo's house ship flow) rewrites history, so the branch tip is structurally never an ancestor of `main`, regardless of content. `-d` refusing here is not a second opinion, it is git re-asking a question the gate already answered with a stronger proof (full tree equality, not just ancestry). Using `-D` on this predicate only converts a redundant, always-wrong safety check into the intended force-delete, without weakening the gate itself (the gate's `exit 1` refusal path is untouched — see Deviations).
- **Ancestor keeps `-d` (double insurance)**: the ancestor branch never rewrites history relative to target, so `git branch -d`'s ancestry check is not redundant there — it is a real, cheap, independently-computed second confirmation that riding on `merge_mode="ancestor"` alone would give up. Keeping `-d` on that path costs nothing (it always succeeds when the gate's own `--is-ancestor` check already passed) and preserves the pre-#142 safety property for the common (non-squash) case. The deletion step's `else` branch (i.e. anything that is not exactly `merge_mode == "absorbed"`) uses `-d`, so this is the safe default, not a second literal check of `merge_mode == "ancestor"`.
- **Flag scope verification**: `merge_mode` is declared with the rest of `cleanup_worktree`'s `local` variables (`scripts/contract-worktree.sh:1004`) and assigned inside the nested `if/else` at :1029-1053. Bash `local` is function-scoped, not block-scoped, and there is no subshell (`( … )`, pipeline stage, or `$(...)` around the assignment itself — the surrounding `if` bodies run in the current shell) between that assignment and the deletion step at :1090-1093, so the value set by the gate is visible unchanged at the deletion site within the same `cleanup_worktree` invocation. Verified empirically, not just by reading: the new ancestor-path regression test asserts the exact log annotation `(-d, ancestor)` and the absorbed-path test asserts `(-D, absorbed)` — if scope leaked or defaulted wrong, the wrong annotation (or the wrong git flag) would fire and the corresponding assertion would fail. Both pass post-fix (see Evidence Links). `cleanup_worktree` is invoked once per script execution (no loop reuses the function across multiple branches in one process), so there is no cross-invocation leak surface to test.

## Deviations From Plan Or Spec

- None recorded. Implementation matches the frozen design exactly: flag export only in the gate (`merge_mode="ancestor"` / `merge_mode="absorbed"`, two one-line additions, no predicate logic touched), conditional deletion at the single named site (:1090-1093), mirror regenerated via `bun run sync:helpers` (not hand-edited).

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Pass predicate via explicit function return value / global associative array keyed by branch | Rejected | `cleanup_worktree` is a single straight-line function processing one branch per invocation; a `local` flag already crosses the gate-to-deletion distance with correct scope (verified, see Design Decisions) — a return-value or global-map plumbing would be a wider change for no added safety, and would touch more of the function than the frozen design allows |
| Re-run the `merge-tree` absorption check again at deletion time instead of reusing the gate's result | Rejected | Re-deriving the same proof a second time is exactly the anti-pattern this fix removes (git's `-d` ancestry re-check is already a redundant, wrong re-derivation); trusting the gate's result once it has already fail-closed on every other outcome is the smallest coherent change |
| Default the deletion `if` on `merge_mode == "ancestor"` explicitly, treat unset as a third error case | Rejected | The gate's `exit 1` refusal already makes "reached deletion with `merge_mode` unset and branch still present" an unreachable state (unset only happens on the "branch already absent" path, which fails the deletion step's own `git show-ref` guard); adding a third branch for an unreachable state is complexity the invariant doesn't need, and `else -> -d` is the safe default if that invariant is ever violated by a future edit |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix RED capture: `tasks/notes/20260731-branch-delete.pre-fix.log` (`PRE_FIX_EXIT=1`; absorbed real-cleanup case fails on exit code, ancestor real-cleanup case fails only on the new log annotation — proving the pre-existing `-d` path already worked and only the mode-annotation/`-D` behavior was missing)
- Post-fix guard: `bun test tests/contract-worktree-squash-cleanup.test.ts` — 4 pass, 0 fail
- Full suite: `bun test` — 2105 pass, 1 skip (pre-existing, unrelated), 0 fail
- `bun run check:type` — clean
- `bun run check:helpers` — projection OK (mirror regenerated via `bun run sync:helpers`, identical diff to `scripts/contract-worktree.sh`)

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
