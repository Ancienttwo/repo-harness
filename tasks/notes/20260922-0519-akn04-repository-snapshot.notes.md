# Implementation Notes: akn04-repository-snapshot

> **Status**: Active
> **Plan**: plans/plan-20260922-0519-akn04-repository-snapshot.md
> **Contract**: tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md
> **Review**: tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md
> **Last Updated**: 2026-09-22 05:19
> **Lifecycle**: notes

## Design Decisions

AKN-04d is split at an independently useful verification boundary: d1 repository collection/admission and d2 original automation summary. All Fleet observations share one process slot, retaining the existing per-round provider cap. Queued work can time out while cleanup holds capacity; that is a deliberate bound, not a fallback.

## Deviations From Plan Or Spec

No product deviation. Automation summary remains the explicit next slice; repository protocol1 here carries only observed Fleet data and epoch/generation.

## Evidence and Corrections

Existing cancellation regression failed before the fix because cancellation retired the promise and admitted a second collector during cleanup; it passes with exit-held admission. HTTP failure fixtures were corrected to existing error.code. Empty registered repository is an existing valid empty Board. A new missing-repository fixture initially had an invalid registry ID and was corrected to the registry owner's path-derived identity; validation was not weakened. One existing 1s fixture exceeded its deadline under concurrent test processes; isolated recheck passed unchanged.

## Open Questions

Current worktree CodeGraph indexing permission and exact canonical/semantic acceptance are pending. No review run has been consumed.
