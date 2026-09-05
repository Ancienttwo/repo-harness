> **Archived**: 2026-09-05 23:07
> **Related Plan**: plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260905-2307
> **Archive Projection V1**: `plans/plan-20260905-1841-campaign-authoring-budget-prerequisite.md` => `plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/notes/20260905-1841-campaign-authoring-budget-prerequisite.notes.md` => `tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1841-campaign-authoring-budget-prerequisite.contract.md` => `tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1841-campaign-authoring-budget-prerequisite.review.md` => `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md`

# Implementation Notes: campaign-authoring-budget-prerequisite

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md
> **Contract**: tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md
> **Review**: tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md
> **Last Updated**: 2026-09-05 18:42
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Budget and BRC6 boundary

- BRC6 owner retains adoption/challenge implementation and sprint edits. This slice owns campaign-scoped authoring admission within the existing budget ledger. Each initial/fill_missing/edit_issue costs one started round; challenge consumes the existing provider_invocation limits without spending a round. It does not claim complete BRC9 provider-call or controller-step accounting.
- Global stop and authoring terminal are different scopes. A round cap forbids new authoring for one group; a final seal binds its evidence and prevents reopening. A legal challenge remains globally budgeted and BRC6 completes it before reading final terminal evidence.
- Only completed browser responses settle automatically after immutable session persistence. Failed includes timeout in the existing browser contract; failed/cancelled/recoverable/running/incomplete capture cannot alone prove quiescence. They retain budget reservation and require existing explicit reconciliation.
- Heartbeat prepares the budgeted continuation before its BRC5 mutation journal reservation, so a quota rejection does not create a fictitious attempted metadata edit. If the journal CAS then refuses, no browser call occurs and the open budget reservation must follow the existing not-started reconciliation path; it cannot be silently charged or retried.
- Historical BRC5 full-suite evidence does not cover this shared contract change. Final full suite is required by the supplied AGENTS runtime/shared-contract rule; focused development evidence is useful before the single final run, not a replacement.

## Focused verification and architecture

- Budget core/store: six suites, 91 pass / 0 fail, 451 assertions; includes a real two-process last-round race and exact terminal freshness checks.
- Authoring/campaign integration: five suites, 47 pass / 0 fail, 176 assertions. Typecheck and state-boundary check pass.
- The architecture projection reports the expected automation-budget flow-proof change from integrating campaign admission. The parent traced this flow against the approved upstream work-package; canonical acceptance references the user's explicit start instruction for that scope. No unrelated capability ownership is adopted.

- Architecture acceptance initially failed because the old P2 selector named reserveAutomationBudget as the direct decision owner. The actual code now centralizes both public reservation paths in reserveAutomationBudgetAdmission; CodeGraph proves reserveAutomationBudget -> reserveAutomationBudgetAdmission -> evaluateAutomationReservation. Updated the owning node/flow selector to the shared enforcement function, retaining the same required sink. No architecture provider source or third-party package was changed.

## Acceptance blocker — 2026-09-05

- Implementation commit: `8bdf7259b68ad4416bd93f39ff65116d5855f555`; focused tests total 138 pass / 0 fail. Full suite, formal review and final acceptance have not run.
- After correcting the model selector, `archctx docs plan --profile repo-harness/v1` no longer reports selector-evidence-unmatched or unprovable P2 flow evidence.
- Third canonical acceptance attempt for signal `sha256:0591d24b6a27789cfcf55d3e86944068e784e49c4b9b07e3e84389fb6ca41fad` wrote architecture projections but exited 1 with `applied-reconcile-required`: post-apply `worktreeDigest` diverged from the accepted snapshot. Status reports 3 unresolved candidates and 0 acceptance receipts. Generated changes remain uncommitted for inspection; they are not accepted evidence.
- Stopped after the repository's three-round limit. Next bounded investigation is the post-apply digest/projection reconciliation boundary; do not repeat acceptance, fabricate receipts, modify dependency packages, or hand this candidate to BRC6 as verified. Logs: `/tmp/campaign-budget-aligned-plan.json`, `/tmp/campaign-budget-model-aligned-projection.json`; acceptance stderr recorded in this note.

## Approved recovery

- User approved continuing the digest/reconciliation investigation. Current canonical `architecture-projection check --json` reports `noop` with no files, human actions or refresh signals. The committed projection transaction has a valid current model/proof; recovery will use existing proof reconciliation and strict-ancestor semantic retirement commands, not manufacture an acceptance receipt.

- Recovery completed through two canonical proof reconciliation receipts (`aa7573655825bdb7d47c758a6ec41b89326a6663ab1209baa9ae9ec58bff539b`, `bf491a0e7a3f2c9dabcc65899b43b3936b7071079d70f94dd92e5b3a0a16afdd`) and semantic stale-retirement receipt `sha256:7a7e8b4649494da228a0db79c9dac0b6666ed5b7c2d0f2d3dc4deb6d1697411a`. After committing the model/projection, ordinary apply refreshed manifest provenance before reconciliation. Architecture sync reports blocking=0. No architecture runtime or package modification was required.

## Final acceptance attempt — blocked

- Frozen implementation HEAD `015bf1af`; subject `sha256:e2baa54180ab965f8baa074992f69d3e843809b4135f6fab099ee9b9bea22d09`; target `c73633f46c56e09071767b01917f26a9feea3439`.
- Canonical run `run-20260905T201713-60598`; full-suite log `.ai/harness/runs/run-20260905T201723-62740-bun-test-timeout-60000.log`: 4384 pass, 4 skip, 13 fail, 55321 assertions, 4401 tests / 356 files, 1267.93 seconds. Full-suite evidence is failed, not a reusable passing baseline.
- In scope: one closed inclusion scan failure at `tests/unit/collaboration-authority-baseline.test.ts:637`. New `src/core/automation/campaign-authoring-budget.ts` requires explicit adjudication alongside the existing automation cost-plane exclusion and corresponding update to `docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md`. No runtime behavior change is needed for that registration.
- Outside scope: eleven `tests/state/cli-state-golden.test.ts` failures compare old guidance with the current appended snapshot/re-resolve guidance; one `tests/state/loop-semantics-characterization.test.ts` failure expects the retired `runEditPlanGate(ctx, filePath, workflowProfile);` source marker. The state tests and associated state / mutation-guard implementation have zero diff from task base c73633f4. Relevant prior mutation-guard commit is `6c19234e`. These are not claimed as independently reproduced baseline failures; unchanged-file evidence and exact failing output are recorded.
- Typecheck, state boundaries, deploy SQL, architecture sync, task sync, strict workflow, inspect-project-state and init dry-run all passed in the canonical run.
- Per the second-out-of-scope-discovery stop boundary, no state-test fix, further acceptance retry, formal external review, or merge was performed. The in-scope registration fix is also pending at the stop boundary.
- Projection mismatch diagnosis: `.archcontext/generated/ARCHITECTURE.md` is generated by projection but included in both the provider digest traversal (`src/effects/architecture/archctx-provider.ts`) and ArchContext 0.5.7 traversal. Git ignores it, but these traversals do not consume Git ignore rules. Existing canonical reconciliation recovered the current task without altering either runtime.

## Approved verification repair

- User approved the bounded follow-up: budget protocol inclusion registration plus state guidance/marker characterization repair.
- P1/P2: existing `6c19234e` changed runEditPlanGate's third argument from workflowProfile to EffectiveState and clarified projected guidance. The repaired tests retain all guards and runtime behavior; eleven guidance goldens and four dependent fixture hashes now match the current source. No state runtime source changed.
- Budget terminal is adjudicated outside C0 on C-1 (automation cost evidence, not one of the five frozen authority planes). Both closed inclusion scan and corresponding research inventory now register the new module.
- Focused results: authority baseline 19 pass / 95 assertions; two state suites 14 pass / 843 assertions. All 13 full-run failures are covered by these targeted passes. The prior full suite remains a failed run, not final passing evidence. Formal review precedes the next final full run so review fixes do not cause another unnecessary full run.

## Formal review and fixes

- One formal codex-plugin review ran against base c73633f4 / head 1e6c3588, subject `sha256:de715cbe060e69e8732ef9b9e9b4bcd5336f25015e6ac386319a372274dc1412`. It reported P1 historical non-campaign reservation unreadability and P2 effect retries blocked after not-started reconciliation. Original transcript is preserved in the task review below. This was a FAIL, not acceptance. No second external review will be run.
- P1 decision: preserve the original generic reservation wire kind/field set/digest unchanged; campaign reservations use a distinct kind with required context. Both remain one budget ledger and accounting path. Reject generic-plus-context and campaign-without-context, no field default, shape translation or migration.
- P2 decision: derive a new attempt only from exact durable not-started settlement under the existing run lock. Original key + predecessor reservation/event digest bind the replacement; unknown and completed attempts remain replay-only.

- Post-fix parent verification: campaign-step/authoring effects 33 pass / 123 assertions; campaign/core/inclusion suites 57 pass / 217 assertions. Store worker additionally verified the existing budget store, contention, e2e and PRD-drift suites and typecheck. The final full suite is still pending; no claim of external post-fix PASS is made.

## Passing full-suite baseline

- Canonical run `run-20260905T210102-90177` on c2ed377a: full suite PASS in 1270968ms; typecheck, state boundaries and six integrity commands PASS; all 14 contract checks pass. Outer prepare was blocked only by the empty Change Assessment oracle declaration.
- Filled deterministic and persisted-ledger runtime-readback oracle declarations. This is contract-only evidence repair; product/test bytes remain those of the passing full run. Final criteria now name focused ledger/effect/state regressions plus integrity checks; no third full suite and no second external review.

## Final prepared acceptance

- `repo-harness run verify-sprint --prepare-acceptance` PASS: `run-20260905T212755-54698`, all 14 criteria pass. Candidate source remains the full-suite passing c2ed377a tree; follow-up contract-only evidence declaration is bd20c7aa. Final focused regression command passed in 34283ms; typecheck and all repository-integrity commands passed.
- Final subject: `sha256:8ee76d43e52fb9f94a8d0933a8d0928ee31cc63adfb00d75f610d0723a8b9948`. External review P1 and P2 were repaired and parent-verified; no external post-fix PASS or Owner Waiver is claimed. Await Owner Acceptance for the repaired version before merge.
- BRC6 consumption entrypoints and recovery/kind semantics are recorded in `docs/researches/20260905-repair-campaign-sprint-execution-boundaries.md`. BRC6 implementation and its main-worktree plan/sprint edits remain owned by its Codex process.

## Owner acceptance and main integration

- User explicitly approved Owner Acceptance and merge to main after post-fix verification.
- Integrated origin/main at 71010315 (reader-scoped language and identical state golden repair) and BRC6 owner's independent plan commit e913d311. Main integration point is 9bd95888; no merge conflict or budget runtime change occurred.
- Additional upstream integration verification: init/adoption CLI suites 64 pass / 361 assertions. Fresh canonical prepare `run-20260905T223901-96464` passed all 14 criteria against the integrated target. The contract worktree base_commit was refreshed to the observed `git merge-base HEAD main` as required by the preflight.
