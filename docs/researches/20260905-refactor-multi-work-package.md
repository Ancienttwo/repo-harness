# Refactor recommendation → multiple Work Packages

## Authority and execution boundary

ArchContext 0.5.7 emits one recommendation per proposal. RefactorProgramV1 retains its flat bindings shape and allows repeated recommendation IDs only with identical fingerprint and candidate alias. Work Package IDs and task references remain unique. Existing single-task Programs are a subset of the same contract; there is no alternate read path or migration translator.

Canonical Sprint owns task ID/revision; Program references it through taskRef. Materialization selects a binding by exact Sprint task reference, not recommendation ID. Each unit still has one distinct architecture node, plan and rollback boundary, and WorkGraph owns dependency/concurrency. The accepted provider payload and ProgramAuthorization must authorize the whole Program before atomic Git publication.

## Candidate and final-main measurement

The same recommendation can be executed in sequential Work Packages. Candidate verification selects the exact recommendation/task pair and retains the four-gate order: Contract → Cutover Closure → provider measurement → AcceptanceReceipt. For a recommendation mapped to multiple tasks, authoritative `resolved`, `partially_resolved` and `not_improved` measurements can pass a task candidate; `stale` and `regressed` fail. Single-task candidates still require `resolved`. A passing candidate never changes recommendation lifecycle or supplies final Board resolution.

Post-merge input must cover each Program task exactly once with its own persisted candidate and execution binding. All merge commits must be ancestors of the current exact target HEAD. Both the begin_merge event evidence and task contract, closure, acceptance and merge references are aggregated in Program binding order; one verification request and one lifecycle resolution are issued per recommendation. The provider resolution digest remains opaque and distinct from the recommendation fingerprint. Retry consumes the same stored aggregate measurement even if caller item order changes, and rejects changed aggregate references.

Board remains a rebuildable projection with one card per Program binding, now exposing `workPackageId` and `taskRef`. A stored recommendation resolution requires execution evidence for every mapped task. Partial execution remains visible per Work Package, and no card resolves from another task's receipt alone.

## Evidence and limits

The pre-fix Program/materialization regression failed with `bindings.recommendationId must be unique` (two failures; `/tmp/refactor-multiwp-red.log`). The Git-backed test `tests/unit/refactor-multi-work-package.test.ts` materializes one accepted cross-module recommendation, creates two distinct canonical tasks and real persisted candidate receipts, merges the tasks sequentially, and verifies one final-main request containing both groups of four evidence references. It also covers missing/duplicate/crossed identities, stale/regressed candidates, incomplete Board projection and interrupted lifecycle retry.

The fixture injects provider/Contract/closure/acceptance ports; it proves the consumer composition and does not claim the complete live-provider activation canary ladder. Published provider 0.5.7 validation and lifecycle smoke remain documented in `20260905-refactor-057-audit-repairs.md`. Activation stays off until the existing ten-canary set and rung promotion evidence are refreshed for the final installed consumer.

Baseline: `78bb171628ea8ecc3b33d1f0df763b2acbf14ca0`, with the previous audit's 350-file partitioned test coverage. This slice verifies its bounded delta with all refactor tests, canonical task identity tests, typecheck, state boundaries and repository-integrity checks; it does not relabel that baseline as a new full-suite pass.
