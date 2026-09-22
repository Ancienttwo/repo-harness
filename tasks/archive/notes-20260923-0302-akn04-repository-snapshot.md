> **Archived**: 2026-09-23 03:02
> **Related Plan**: plans/archive/plan-20260922-0519-akn04-repository-snapshot.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260923-0302
> **Archive Projection V1**: `plans/plan-20260922-0519-akn04-repository-snapshot.md` => `plans/archive/plan-20260922-0519-akn04-repository-snapshot.md`
> **Archive Projection V1**: `tasks/notes/20260922-0519-akn04-repository-snapshot.notes.md` => `tasks/archive/notes-20260923-0302-akn04-repository-snapshot.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0519-akn04-repository-snapshot.contract.md` => `tasks/archive/contract-20260923-0302-akn04-repository-snapshot.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0519-akn04-repository-snapshot.review.md` => `tasks/archive/review-20260923-0302-akn04-repository-snapshot.md`

# Implementation Notes: akn04-repository-snapshot

> **Status**: Active
> **Plan**: plans/archive/plan-20260922-0519-akn04-repository-snapshot.md
> **Contract**: tasks/archive/contract-20260923-0302-akn04-repository-snapshot.md
> **Review**: tasks/archive/review-20260923-0302-akn04-repository-snapshot.md
> **Last Updated**: 2026-09-22 05:19
> **Lifecycle**: notes

## Design Decisions

AKN-04d is split at an independently useful verification boundary: d1 repository collection/admission and d2 original automation summary. All Fleet observations share one process slot, retaining the existing per-round provider cap. Queued work can time out while cleanup holds capacity; that is a deliberate bound, not a fallback.

## Deviations From Plan Or Spec

No product deviation. Automation summary remains the explicit next slice; repository protocol1 here carries only observed Fleet data and epoch/generation.

## Evidence and Corrections

Existing cancellation regression failed before the fix because cancellation retired the promise and admitted a second collector during cleanup; it passes with exit-held admission. HTTP failure fixtures were corrected to existing error.code. Empty registered repository is an existing valid empty Board. A new missing-repository fixture initially had an invalid registry ID and was corrected to the registry owner's path-derived identity; validation was not weakened. One existing 1s fixture exceeded its deadline under concurrent test processes; isolated recheck passed unchanged.

## Open Questions

Index permission is granted and canonical verification has passed. The one semantic review found P1 and is consumed; the corrected candidate still requires owner acceptance and hosted CI.

## Frozen upstream integration

P1: Context89837138 is canonically verified and in its one semantic review; activity26778190 is accepted with passing CI. This worktree can integrate frozen upstream source independently while preserving the context worktree freeze. P2: repository route -> versioned IPC scope -> pre-provider selection -> exactly matching envelope; Fleet and task-reader pools remain separate and each retains capacity until actual cleanup settlement. P3: preserve shared context/activity lifecycle and scoped Fleet queue; only generated architecture metadata needs regeneration. Context acceptance and its archive must be integrated before this package closeout. At10x distinct scopes, bounded queue admission fails busy before provider amplification. Existing server/collector/browser tests own the behavior; no second classifier or new test file.

## P1 task-reader cancellation correction

- root_cause: handleBoundedTaskRead used Node Worker.terminate while its activity/context reader was blocked in synchronous execFileSync Git; HTTP could time out without releasing admission or completing close.
- repro: bun test tests/effects/operator-task-context.test.ts --test-name-pattern 'blocked native'
- regression_guard: tests/effects/operator-task-context.test.ts; both real Git FIFO cases assert timeout, later admission and bounded shutdown.
- pre_fix_failure_artifact: .ai/harness/runs/akn04-task-reader-cancellation/before.log contains both failures and PRE_FIX_EXIT=1; after.log passes both and POST_FIX_EXIT=0.

P1 mapped the existing Fleet process-group/Windows Job supervisor and the two task-reader entrypoints. P2 traced HTTP timeout -> thread termination -> synchronous Git child -> missing exit -> occupied admission/close; the native reproduction confirmed both failures. P3 shares the existing supervisor with three actual consumers (Fleet, context, activity), preserves separate pools and original DTO/error authorities, removes both retired thread entrypoints and waits for process-tree cleanup. This adds process startup cost to provider-free reads in exchange for controllable cancellation; at10x requests the existing bounded pool refuses busy first.

Focused verification:68 pass,3 Windows-only skips,465 assertions across context/activity/server/collector suites. The actual blocked-Git pair passed in2.52s after failing in8.79s before the change. Typecheck passed. Existing Windows Job coverage now includes an execFileSync-blocked collector; hosted three-platform matrix also runs the real context/activity HTTP suites. The local host does not prove Windows behavior.

Sibling boundary check: both activity/context thread entrypoints are removed and no source or package entry still references them. Existing TaskDiff and collaboration workers are outside this reader correction; their synchronous cancellation behavior is not accepted by these tests. No code changes were made to those unrelated paths.

CI context: #441 rerun35706735105 attempt2 passed architecture-queue but failed two unchanged task-reply scan/byte assertions because the actual deadline budget exhausted first under hosted load. Original and retry logs are retained in /tmp/akn04c-ci-{failed,retry-failed}.log. No additional rerun or architecture-queue edit is authorized or performed.

## Accepted migration and Windows dependency integration

P1: #443 is owner-accepted and archived at `1c99e618`, incorporating accepted #444 at `daa05cbf`. Both typed receipts bind content subject `c21805db55803c9e4430b04ed63d788c55fd2d0bfe5684af7d6c2927c57c5770`. P2: repository-scoped reads retain their original registry, admission, process cleanup and no-write authorities while Inbox paths and the required persistence chain come from the accepted dependencies. P3: fast-forward the exact accepted source and archives, enumerate inherited paths in this contract, preserve source base `9227c93c`, and add the existing migration effects suite as the integrated runtime-readback oracle. No new source behavior is introduced. At10x reads the original admission and deadline bounds remain the bottleneck.

Full CI35765127664 on `2948a041` covers the identical source, tests and CI configuration, including the actual Windows matrix (210 pass,6 existing skips,0 fail). Canonical verification is refreshed for this contract; no full hosted suite is repeated for workflow-only integration. The original P1 review remains consumed and its correction retains real blocked-Git proof. The user's updated whole-program authorization permits autonomous staged execution and acceptance; record the policy-allowed delegated owner disposition truthfully after current verification, never an invented external review.

> **Substantive Change SHA256**: `sha256:a36e8c77cbda9ee354a0c509ce73e76dd0b430d2f40f2f6a4f6d0029c3651e39`
