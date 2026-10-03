# BRC final integration closeout

Integrates the already accepted BRC packages with main cfb26baa and audit PR #358. The authoring conflict retains the frozen-revision capability schema together with the parser-valid example and all exact metadata constraints. The audit test receives the now-required capability argument. Architecture projection provenance remains its original baseline and is not relabeled as new evidence.

> **Substantive Change SHA256**: `sha256:41c4587a65f9c05d513d2e2349be75321fcd4c1b1546b4b5ac3b8573364e4a77`

Validation: 113 focused tests across eight files pass, metadata-specific rerun passes, typecheck passes, SQL/architecture/workflow/state/adoption checks pass. Original package acceptance remains evidence only for its original revision. Remote CI is still required for the integrated candidate.

Owner narrowed this round to integration and bounded failure closeout. BRC6a and BRC15a remain closed; BRC14 and BRC15 have unfulfilled live acceptance and must not be marked passed. No active campaign started. R4 failed before prompt submission; reservation reconciled conservatively with no open reservation, not evidence of a model turn. Oracle 14cfbfc6 fixes the reproduced hydration race; 26 browser tests and a no-send Profile 13 real UI check pass. No new model probe is part of this closeout.

Full PR integration binding against main cfb26baa:

> **Substantive Change SHA256**: `sha256:8834b4d41c05f13294883d24a88e4b4aa8f213aed9a8b089358e0b15d1762334`

## Final CI delta

CI 34199753915 finished with two stale test expectations: campaign command enumeration omitted observe-revision, and the loop characterization retained two digests of the old readiness golden files. Updated only the command list and those two fixture hashes. All 18 affected CLI/state tests pass; repository integrity checks pass. No production behavior changed.

> **Substantive Change SHA256**: `sha256:c925689f594146d003d1cd34eedf36e70e3cc2eb9a5cfb0b331ec080252b862d`

> **Substantive Change SHA256**: `sha256:ca529db4ad9248d04f7616314900ea5591571ddc97f07982b4de458d1c3c64f3`

## Owner review correction: independent supervision

The Owner rejected e9eea7af: revision/budget validation could return successfully before the live worker had an independently protected supervision channel (#354), the production-closed test invoked the guard without arguments, and observe-revision always exited 1. Snapshot-only 76624907 did not fix these findings; its in-flight CI was cancelled.

The conservative fix retains revision validation and then explicitly refuses new active preparation/launch with `independent supervision unavailable`. No capability flag or bypass is introduced. Existing final settlement and recovery call paths are unchanged. Full-argument tests now supply valid history, actual observed settlement and a stored active intent: both the guard and real adoption entry refuse on the supervision reason, with zero external calls and unchanged budget/Git state. Missing revision, stopped budget/campaign and elapsed deadline retain distinct refusal reasons. The argument-less test was removed.

CLI returns 0 only for the effect's settled verified result, including replay; unavailable/errors return 1. Four command-handler cases and a real CLI replay of a persisted verified observation cover the exit contract.

Root cause evidence: five red regressions reproduced the two active-success holes and the two CLI success/replay exit failures (three guard-path cases, two CLI cases). After the fix, 48 tests across observation, CLI, actual failure finalization and worker recovery pass. Completed/not-reproducible/transient final replay still settles once without preparing, renewing or spawning. Typecheck and repository integrity checks pass. No real provider invocation or new containment implementation was used.

> **Substantive Change SHA256**: `sha256:b3e65100955feeb5d8517eccab678be6c36ed5e04447d50c796ab4cc39d4742f`

> **Substantive Change SHA256**: `sha256:6853c94330ea4a541c7aa19d72bebb603efd80900024484efee02d7d6d31f91b`
