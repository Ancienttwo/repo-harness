> **Archived**: 2026-08-18 05:48
> **Related Plan**: plans/archive/plan-20260818-0509-worktree-metadata-authority.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260818-0548

# Notes: worktree-metadata-authority

> **Plan**: plans/plan-20260818-0509-worktree-metadata-authority.md
> **Contract**: tasks/contracts/20260818-0509-worktree-metadata-authority.contract.md

## The defect the comment denied

The previous emitter's own comment said the guard and the resolver "must agree on which record describes this worktree". They did not. It emitted every matching row and let each caller choose: the guard took `head -1`, the resolver walked rows looking for the first usable value. A record matching this worktree with every field empty joins to two separators, which is not the empty string, so it passed the row filter, satisfied the guard's non-empty check, decoded to nothing, and returned silently — while the resolver skipped it and used the stale base in the next file.

Reproduced before the change and preserved as the first regression case. The lesson is narrower than "test more": a comment asserting an invariant is not the invariant. Selection is now one function returning one record, and both sides read it, so agreement is structural rather than asserted.

## Fail-closed boundaries, and the one that had to be relaxed

Seven distinct causes replace a single "was rebased" message: `metadata_malformed`, `metadata_unparseable`, `parser_unavailable`, `duplicate_exact_worktree_metadata`, `duplicate_branch_metadata`, `base_ref_unresolvable`, `base_ref_unsynchronized`, `no_common_ancestor`, `ambiguous_merge_base`, `stacked_source_start`, `stale_base_commit`. The old text sent readers hunting for a rebase in cases where none had happened.

The first draft failed closed whenever `base_commit` was absent, which broke `tests/helper-scripts.test.ts`'s legacy-metadata case — a record carrying `base_branch` and `started_at` but no `base_commit`, where the resolver derives a base every run. Nothing stored can go stale there, so the guard has no claim. The rule now splits three ways:

- no `base_commit`, no `started_at`, no `base_branch` — the record supplies nothing; malformed.
- no `base_commit`, but a usable fallback — the documented legacy shape; guard returns.
- `base_commit` present — verify it, and require `base_branch` to verify it against.

That regression is the useful part of this slice: fail-closed is not a posture you can apply uniformly, it has to be applied to states that are actually unverifiable.

## `stacked_source_start` is a classification, not a permission

`contract-worktree start` records `base_commit = source HEAD` for a new branch and `merge-base(HEAD, base_branch)` for a reused one. Starting from a parent branch ahead of the target therefore produces a base that is not the fork point and never was — no rebase happened. The old guard called that a rebase.

It still fails closed, and deliberately: publishing that worktree's tree would carry the parent branch's commits into the target without them appearing in this contract's own scope. The message now says so and points at landing the parent work first. Whether stacked contract worktrees become a supported shape — which would need `base_commit` split into a scope origin and an integration base — is a product decision left open; this slice only stops mislabelling them.

## `--all`, not a single merge base

Criss-cross history can leave several equally-best merge bases and plain `git merge-base` picks one without guaranteeing which, so a single-value comparison is non-deterministic there. Accepting any member of the set would be worse than failing: scope computed from a different base is a different changed set. Ambiguity is its own class, and the message points at `REPO_HARNESS_DIFF_BASE` for an explicit choice.

## Upstream check without network

A local `base_branch` lagging its remote-tracking ref makes the fork point look current while the real integration target has moved, and everything computed before `finish` fetches — scope, checks, review, acceptance — binds to the wrong base. The guard compares the branch against an already-present `@{upstream}` and never fetches; a repo with no tracking ref simply skips the check.

## Out of scope

No change to `contract-worktree start`. No field split, no `base_epoch`, no automatic metadata refresh. The env override short-circuit is deliberate: when `REPO_HARNESS_DIFF_BASE` or `HARNESS_DIFF_BASE` is set the metadata is not the diff base, so the guard has nothing to assert.
