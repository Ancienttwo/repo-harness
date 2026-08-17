> **Archived**: 2026-08-18 04:31
> **Related Plan**: plans/archive/plan-20260818-0347-verify-sprint-rebase-base-guard.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260818-0431

# Notes: verify-sprint-rebase-base-guard

> **Plan**: plans/plan-20260818-0347-verify-sprint-rebase-base-guard.md
> **Contract**: tasks/contracts/20260818-0347-verify-sprint-rebase-base-guard.contract.md

## The predicate: fork-point equality, not ancestry

The first implementation of this guard asserted `git merge-base --is-ancestor "$base_commit" HEAD`, passed its own tests, passed the full contract gate, and was wrong. Caught before merge by reproducing the ledger row's own scenario:

    feat forks from B -> main advances to M -> feat is rebased onto main
    git merge-base --is-ancestor B HEAD  -> exit 0   (B is still reachable: M grew from B)
    git diff B..HEAD                     -> feat.txt main-only.txt

Ancestry is trivially satisfied whenever the target is a descendant of the recorded base, which is the normal case. It only fails on a rebase onto a *diverged* base — the rare shape, not the one observed twice.

The predicate that holds is equality with the current fork point:

    base_commit == git merge-base HEAD <base_branch>

This covers both shapes. `tests/verify-sprint-rebase-base-guard.test.ts` asserts the ancestry precondition explicitly in the first case, so any future rewrite back to `--is-ancestor` fails loudly instead of silently regressing.

## Guard placement

The guard is a top-level statement (`scripts/verify-sprint.sh:491`), not a branch inside `git_diff_base_ref`. Every consumer reads the base through a `$(... || true)` command substitution (`:280`, `:301`, `:641`), so an `exit` inside the function would only unwind the subshell and the caller would silently continue with an empty base. Putting it at top level is the only placement where fail-closed actually closes.

It runs before contract resolution rather than next to the diff-base computation. A stale base is a property of the worktree, not of the contract, and diagnosing it first is the entire point — the failure this replaces surfaced as an `allowed_paths` violation listing 20 unrelated files, with the real cause visible only in the run snapshot's `diff_base` field.

## Fail closed, no fallback

Returning `1` from `contract_worktree_base_commit` on a stale base would have made `git_diff_base_ref` fall through to `origin/main`, which after a rebase is arguably the *correct* base. That was rejected: it is a silent semantic fallback, and it would leave the metadata wrong while making the symptom disappear, so the next gate run on the same worktree measures a base nobody chose. The ledger entry (`tasks/todos.md` row 22) asks for fail-closed; refreshing the metadata stays an explicit operator action.

## Deferred deliberately

No `base_epoch`, `previous_base_commit`, or `verification_invalidated` field. Those come from the external analysis that prompted this slice and model the *evidence invalidation* consequence of a rebase, which is a larger design question than the ancestry check. The ledger's stated minimum viable fix is the ancestry check alone.

## Detour worth recording

The first pre-fix artifact was RED for the wrong reason. `verify-sprint.sh:31` picks its working repo from `REPO_HARNESS_TARGET_REPO_ROOT` and otherwise falls back to its own checkout's git toplevel, so a test that deletes that variable (copying the isolation list from `tests/contract-worktree-single-publication.test.ts`) runs the helper against the harness repo, not the fixture. The artifact was re-captured after the test was corrected. Any future fixture test for this helper must set that variable rather than clear it.

## Out of scope / Future work

The same review proposed a post-publish path invariant in `contract-worktree.sh finish`. It was checked and found redundant after `bdc75c21`: target head is asserted equal to the frozen base (`:1633`), the frozen base is asserted to be an ancestor of the branch (`:1637`), the publication tree is asserted equal to the verified tree (`:1678`), and the landing is `merge --ff-only` (`:1685`). Together these make the target's published delta exactly the gated delta, so a path-set comparison at that point can only ever be a tautology. Not filed as a deferred goal — there is nothing left to defer.
