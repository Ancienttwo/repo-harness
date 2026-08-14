# Implementation Notes: contract-worktree-single-publication

> **Status**: Active
> **Plan**: plans/plan-20260814-1629-contract-worktree-single-publication.md
> **Contract**: tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md
> **Review**: tasks/reviews/20260814-1629-contract-worktree-single-publication.review.md
> **Last Updated**: 2026-08-14 16:29
> **Lifecycle**: notes

## Design Decisions

- Keep checkpoint commits on the source branch and synthesize a separate target commit with `git commit-tree`; do not rewrite the source branch because its HEAD and journal snapshot are the recovery authority.
- Bind the publication commit to the frozen target base as its sole parent and to the verified lifecycle HEAD's exact tree. The existing merge seal continues to verify the source HEAD; tree/parent assertions bridge that authority to the target commit.
- Record `publication_prepared` before mutating the target so a fresh recovery process can distinguish “object created only” from “target ref updated”.
- Preserve `finish --no-merge` behavior: without a publication boundary its checkpoint history is intentionally still available for later PR shipping.

## Deviations From Plan Or Spec

- The full `bun test` run reached 2,362 pass / 1 skip but remained red on six pre-existing environment-sensitive ArchContext/global-runtime bootstrap cases after the reference-config projection drift introduced by this slice was fixed. Focused reruns confirm the reference-config projection now passes; the remaining failures are outside this contract's changed paths.
- External Claude acceptance could not run because sending the private worktree diff to an external provider requires explicit user authorization. No waiver or synthetic receipt was recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Rewrite source branch with reset/squash | Reject | Destroys the branch HEAD used by receipt/seal and complicates crash rollback. |
| `git merge --squash` in the primary worktree | Reject | Mutates index/worktree before the final atomic boundary and enlarges the crash surface. |
| `git commit-tree` plus fast-forward target | Use | Creates one commit object without touching either worktree, then reuses Git's atomic ref/worktree update and dirty-target protection. |

## Open Questions

- Final AcceptanceReceipt remains pending a second Claude pass over the post-review corrections.

## External Review Corrections

- The first authorized Claude pass returned no P1 findings and six P2 implementation/test findings. The slice treats them as actionable rather than recording an immediate pass.
- Complete-journal replay now checks the durable effect named by the complete ref: source HEAD for ordinary closeout, synthesized target ref for merge publication.
- The pre-cutover lifecycle fallback now has an end-to-end landed-legacy-ff recovery test and a next-major removal boundary in the canonical workflow documentation.
- `commit.gpgsign=true` now selects `commit-tree -S` and therefore fails before target mutation when signing cannot complete.
- Static publication-order assertions now prove every marker exists before comparing indices; fake Git shims resolve the actual executable instead of assuming `/usr/bin/git`.
- Crash coverage now includes the object-only window after `commit-tree` but before `publication_prepared` is durably written.
- The second Claude pass returned no P1 findings and five new P2 findings. Automatic EXIT-trap rollback is now blocked after target publication, preserving the journal and lifecycle state for explicit reconcile; a real merged-phase write failure test covers this in-process error path.
- Signing policy reads now distinguish unset, valid, invalid, and unreadable states. Invalid values fail closed, and a fake-Git runtime test proves `commit.gpgsign=true` reaches `commit-tree -S` and leaves the target untouched on signing failure.
- Empty publication commits are rejected when lifecycle and target trees match, with a focused negative control. Complete replay resolves `refs/heads/<target>` rather than an ambiguous short ref.
- The third Claude pass returned no P1 and one P2: completed publication replay used exact target-HEAD equality. The predicate now uses the same ancestry semantics as landed-effect detection. A direct runtime test proves later target commits preserve completion while a target reset that removes the publication invalidates it.
- The post-fix 148-test combined run had three failures: the new replay test failed before its positional-argument harness was corrected, while two unrelated ship-worktrees cases failed from transient account-home resolution. Focused reruns after correction passed 1/1 and 2/2 respectively; the prior full publication suite remains 147/0 before this final one-test addition.

## Architecture Major-Change Adjudication

- The first ArchContext pass reported `unresolved-major-change` only because this linked worktree had no CodeGraph index (`codeGraphStatus: unavailable`, all 11 capabilities lost flow proof). No acceptance override was applied.
- After `codegraph init .` indexed 487 files / 9,572 nodes / 37,332 edges, the same projection classified `majorChange.mode: none`. The canonical docs apply completed with receipt `sha256:7193de83d43aa29a50f2712219f7ce3f7dd4b86800a4c3b7976b160211efe438`.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
