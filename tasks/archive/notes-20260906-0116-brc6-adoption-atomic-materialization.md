> **Archived**: 2026-09-06 01:16
> **Related Plan**: plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260906-0116
> **Archive Projection V1**: `plans/plan-20260905-1835-brc6-adoption-atomic-materialization.md` => `plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/notes/20260905-1835-brc6-adoption-atomic-materialization.notes.md` => `tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1835-brc6-adoption-atomic-materialization.contract.md` => `tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1835-brc6-adoption-atomic-materialization.review.md` => `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md`

# Implementation Notes: BRC6 adoption and atomic materialization

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md
> **Contract**: tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md
> **Lifecycle**: notes

## Decisions

- Budget prerequisite is consumed from main 2be1268b; this work does not edit budget core/store or authoring/step.
- WorkPackage has mandatory execution policies not present in Issue metadata. `--publication-policy` names an exact-main regular JSON file with required_acceptance, rollback_boundary and retry_policy. Referenced acceptance/rollback documents must match their exact-main content digests. No policy inheritance from a sibling task and no synthesized defaults.
- Publication uses a Git ref transaction verifying canonical target and creating candidate ref together. Sprint, WorkGraph and manifest share one temporary index/commit; the user's index/worktree are preserved. Human canonical integration remains separate.
- Challenge responses are recorded before usage settlement. A completed response has a separate immutable terminal capture; a recoverable capture is resumed only by reading its exact existing browser session, never by resending a replayed reservation. Missing response after an unknown call requires operator reconciliation.
- Final provider observation follows authoring seal and compares against the pre-seal snapshot. A source change fails closed instead of becoming a fresh baseline.
- BRC5 journal consumption is limited to its reconciliation/source observation and metadata-repair projections. Budget usage always comes from the existing budget terminal ledger.

## Verification boundary

Development checks: exact readback/core adoption, six publication crash boundaries, compare-and-swap race, actual canonical TaskOffer visibility, partial/full budget terminal, model/profile binding and unresolved session replay. No real GPT invocation is part of local fixtures.
Final full suite is required by supplied AGENTS for runtime/shared-contract edits; run once via canonical prepare after code and target freeze (expected 20–25 minutes). Existing budget full pass remains upstream evidence only.

## Downstream boundary

BRC7 owns transition from published/adopted work into local planning and campaign running state. BRC6 does not create a planning job, Claim, Lease, WorkEnvelope, PR, or merge. It emits the materialization candidate/receipt for that consumer.

## Pre-freeze review

Read-only security specialist found no blocking issues. Architecture specialist identified full provider revision drift across final seal and stale controlled architecture projections. The source fix persists immutable pre-seal source revisions and rejects any final-snapshot or retry change, including title/labels; effect regression fixtures pass. Architecture projections must still be regenerated canonically before acceptance.

Publication validates the new group as a closed DAG while preserving existing cross-graph dependencies. Focused publication fixtures: 10 pass, 0 fail; adoption fixtures: 12 pass, 0 fail. These are development evidence, not final acceptance receipts.

Architecture closure: canonical accept applied projections but returned applied-reconcile-required because the generated architecture document changed worktreeDigest. After committing projections, canonical apply returned noop; both strict-ancestor semantic candidates were retired through architecture-projection retire-stale. Architecture sync reports blocking=0 and human_actions=0. Approval reference points to the explicit BRC6 execution instruction in session 01a06fed-31b6-7093-b9f6-b7b4575b2373; no semantic acceptance receipt is inferred from implementation authorization.

Frozen development baseline: implementation a9751248, integrated main 5a6a2121, architecture projection 148eefa2. Six focused files pass 62 tests / 0 fail. Final canonical verification is pending.

## Formal review repair

The sole codex-plugin review identified premature-adoption poisoning: an immutable pre-seal source set could survive a rejected budget seal and prevent a later authorized fill. BRC6 now owns a group seal lock coordinating staged sources with the existing budget terminal. While no terminal exists, retry replaces staged sources; when a terminal exists, the exact staged set is mandatory and immutable. The snapshot is persisted before terminal creation so a crash after sealing retains its source binding. The budget store remains the only terminal/admission authority.

Regression: partial rejection -> authorized fill -> successful retry, and crash after terminal -> same-source recovery. Adoption effect suite passes 14 tests. External review is not repeated; final owner acceptance remains required under the one-review-per-work-package rule.

Canonical prepare run-20260906T002131-98991 was intentionally interrupted after the formal finding required a source edit; the interrupted full command is recorded as failed/exit 1, not a passing baseline. Its type/state and integrity checks passed. A new complete full run is required for the repaired frozen subject.

## Frozen full verification

Candidate ce7d2c97 completed full bun test --timeout 60000 with exit 0 in 1208444 ms (run-20260906T003115-49256). All 15 contract criteria passed, including type/state and six integrity checks. Enclosing prepare run-20260906T003105-46378 failed only Change Assessment oracle_gap: the new abstractions lacked declared deterministic_test/runtime_readback oracles. Contract-only repair names the already executed six-file fixtures and their actual persistent Git/ledger readback, following sprint-contracts baseline-plus-delta guidance. No old cache is rewritten or rebound; no further full execution is needed for this declaration-only delta.

## Ready for owner acceptance

Final prepare run-20260906T005411-67005 passes 15/15 criteria, Change Assessment, allowed paths and frozen criterion context. Subject remains sha256:a257ccae789261dd27787f40af34bbb5943fe36f12861d427ba74e7042b339f9 against main 5a6a2121. The full baseline and the declaration-only focused prepare bind the same product subject, while preserving their distinct contract contexts.

Implementation and evidence are committed; typed AcceptanceReceipt remains pending. The sole external review finding is fixed with passing recovery regressions, but its original FAIL transcript is retained. Next authorized boundary requires the named owner's acceptance, followed by canonical receipt/finish. No BRC6 main merge, push, real GPT canary, or BRC7 expansion has occurred.
