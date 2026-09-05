> **Archived**: 2026-09-06 04:00
> **Related Plan**: plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260906-0400
> **Archive Projection V1**: `plans/plan-20260906-0134-brc7-local-planning-handoff.md` => `plans/archive/plan-20260906-0134-brc7-local-planning-handoff.md`
> **Archive Projection V1**: `tasks/notes/20260906-0134-brc7-local-planning-handoff.notes.md` => `tasks/archive/notes-20260906-0400-brc7-local-planning-handoff.md`
> **Archive Projection V1**: `tasks/contracts/20260906-0134-brc7-local-planning-handoff.contract.md` => `tasks/archive/contract-20260906-0400-brc7-local-planning-handoff.md`
> **Archive Projection V1**: `tasks/reviews/20260906-0134-brc7-local-planning-handoff.review.md` => `tasks/archive/review-20260906-0400-brc7-local-planning-handoff.md`

# BRC7 implementation decisions

- Existing ExternalSourceBinding input is sufficient: store deduplicates observations by source revision and retains first immutable observation bytes. A suspected repeated-refresh ambiguity was disproved before implementation; no bind CLI change was made.
- The job/result store carries host evidence, never an alternative readiness verdict. Fleet admission verifies the existing binding and current hashes before exposing the existing execution_ready value.
- Shared test fixture extraction serves the existing BRC6 tests and BRC7 materialization integration tests. Canonical realpath is required by the actual registry; a synthetic noncanonical temp path initially prevented the fixture from reaching assertions.
- Full verification will run once after review fixes and architecture freeze. Focused development runs currently exercise real materialization, preflight, bindings and TaskOffer. No live GPT/GitHub calls are needed for fixtures; injected providers expose prohibited calls as failures.

- Check specialists identified missing protection snapshot binding, a board target mismatch, and ambient helper source override at the readiness gate. The implementation now binds protection tree/blob digests, checks the board's symbolic ref/commit, and selects the existing protected helper context per authority-sensitive invocation. Regression cases pass. Evidence files must also be distinct.
- Package smoke: `bash scripts/check-tarball-install-smoke.sh` passed with the built 0.18.0 tarball in disposable install/target directories. It exercised packaged CLI, helper resolution, init dry-run/apply and Operator start. No publish/push occurred.

## CLI Command Surface

- Existing entrypoint: `campaign step`; host/session/result options apply after canonical BRC6 materialization. Help rendered by the real CLI and tests read its wrapped output. No root lifecycle command or new runtime dependency.
- JSON stdout carries handoff/outcomes; hard admission errors use stderr with typed error/outcome and exit 1. Arguments remain noninteractive; malformed CLI arguments exit 2.
- Mutations are bounded to immutable local planning evidence and the existing external-source observation/binding stores. Off rejects, shadow is a no-write projection; jobs/results replay or reject conflicting bytes.
- The preflight call selects trustedPackage before helper resolution; source overrides and ambient environment remerge cannot select or inject its helper. Generic helper callers preserve their existing behavior.

- Adversarial review fixes: step-key replay now avoids repeated provider reads and interrupted reservations fail closed; negative terminal results no longer starve later slots. Canonical primary capability existence and the protection reader’s own inputs are checked. Claim/token post-mutation checks reuse campaign admission, with compensating release on drift.
- Review dispositions: the alleged empty feature classification bypass was withdrawn because the approved contract assigns intended categories to the trusted local planner; actual future code scope belongs to BRC8. The alleged shared latest-refresh ordering defect was withdrawn as existing fail-closed behavior. Neither requires a shadow parser or a second refresh authority.

> **Substantive Change SHA256**: `sha256:97bd6fefdad71dd595c136812d6b8fa2295858c5d4e3b83edeb7528b47ca33fb`

- Formal Codex plugin review thread `01a072ca-f303-73d1-bc68-c8d421f3df52` found lifecycle revocation (P1) and closed-slot source drift starvation (P2). The shared admission now permits only existing operational campaign states; closed negative slots are skipped before source freshness for later jobs. Canonical directory scopes also reject because Allowed Paths has prefix semantics. Stop/reconciliation, later-slot admission and directory cases cover the corrections. The human-attention transition fixture used an existing mutation API with an original-target fence and was removed; no shared lifecycle API was changed.

- Formal repaired-candidate review additionally required recording a matching stale job’s negative terminal outcome before provider freshness. That path only persists the issued job’s closed result and never binds a plan or authorizes execution; plan_ready still requires complete current observation. This closes the third bounded correction of the slot-progress issue; further failure in the same issue must stop rather than repeat the loop.

## Paused after bounded review rounds

Third official codex-plugin review (`01a072d1-c4d4-7723-a4b3-7e5a6a330573`) still reports two P2 findings. No fourth slot-progress correction, full suite, AcceptanceReceipt or merge has been attempted. The user-supplied three-round stop rule is the pause authority.

1. `src/cli/commands/campaign.ts`, `runCampaignPlanningPreflight`: normalize a relative repository input before passing it as both helper context and `--repo`; current helper cwd causes `./project` to resolve as `project/project`. Reproduce with a real relative CLI target and an otherwise valid contract.
2. `src/effects/automation/campaign-planning.ts`: an admitted pending Task with `lease_unavailable` is not source-stale. When requesting another job, distinguish an existing valid planning proof from lease availability and continue to later slots. Add a real claimed-first-slot fixture while keeping stale admission fail-closed. This is the remaining slot-progress issue after three bounded rounds.

Current evidence: 124/0 focused baseline before lifecycle/terminal corrections; 24/0 admission run after lifecycle/closed-slot corrections; final terminal run passed behavior assertions but five existing assertions expected the previous conflict-message wording. The corrected six-test delta passed (including stale-job closure). Type and state-boundaries pass, package smoke passed before the final internal planning corrections. No full-pass claim applies to this checkpoint. Architecture projection acceptance remains at applied-reconcile-required with zero receipt; after implementation closes, commit/reindex/apply and retire the exact stale signal through canonical reconciliation.

Resume only after the user directs continuation beyond the bounded retry stop. Fix the two review findings, validate their deltas, then complete formal review, architecture reconciliation, frozen canonical full verification and owner acceptance. Preserve main and other agents’ changes.

## Authorized P2 continuation

The user transferred both third-review P2 repairs to the BRC7 fix session and explicitly resumed work beyond the prior bounded stop. The original worktree was clean at 64ad4556. The CLI helper now receives one absolute repository path as both cwd and --repo. Planning skips an admitted pending task only for a new-job request when the existing TaskOffer retains its validated plan proof and its sole blocker is lease_unavailable; no admission or readiness authority is duplicated.

Root Cause Evidence: relative repo was interpreted again after helper cwd changed; a real preflight fixture fails on the old invocation with contract-not-found and passes on the normalized invocation. The claimed-first-slot fixture performs real sprint claim, observes unsupported/lease_unavailable with valid offer.plan, and reproduces source_stale instead of the next job before the fix. Its fixed run obtains the next job and then invalidates evidence to confirm source_stale still fails closed. Guards live in tests/cli/campaign-planning.test.ts and tests/effects/campaign-planning.test.ts. Red artifacts: /tmp/brc7-p2-cli-red.txt and /tmp/brc7-p2-red.txt. Development green: 26 effects tests and 3 CLI tests; the initial CLI fixture was completed with required Allowed Paths/Exit Criteria and its red/green rerun passed. No new dependency, production file or abstraction. Sibling sweep: campaign has one helper preflight invocation and one execution_ready-to-result branch; both are covered. Canonical acceptance, architecture reconciliation and fresh formal review remain pending.

The fresh official codex-plugin review found a separate pre-handoff stale-slot closure gap: drift before the first job returns source_stale but there is no issued job for terminal closure. This is not lease unavailability. The user explicitly preserved genuine stale fail-closed behavior; auto-skipping or minting a controller terminal outcome would require a separate bounded closure decision. The two assigned P2 repairs are complete; this finding prevents final acceptance. No full suite was started. The review artifact contains the verbatim finding. Latest tarball smoke passes. Main moved to 29b3fd12; merge-tree is conflict-free but no main integration was performed.

> **Substantive Change SHA256**: `sha256:fa5e66d2fd0b7014c131fda0f690dcb42af1264180024827fdf3759955cdc411`

Architecture recovery completed through codegraph index, ordinary architecture-projection apply, check status noop, then canonical retire-stale for f476d88f427d1319dca9021e9caf41655f8bf31ad8b824d5d1094b4b9902023b using the existing user:20260906-brc7-implementation-approval. Stale-retirement receipt digest: sha256:1ce44a71161c040d9cdb15f0871be5279ec0c1454d8cd1e2df5de0df85272bae. Readback: unresolvedCandidates=0, staleRetirementReceipts=1, acceptance receipts=0. This is architecture cleanup, not BRC7 acceptance. The first architecture integrity check reported the uncommitted projection; final post-commit gate readback follows.

Final branch-wide task-sync evidence (base 86fac685):

> **Substantive Change SHA256**: `sha256:fb5f4e989355426329a0e200155c0a92cd284c3d84927e4b34a2481e8ac3fac8`

Post-commit architecture integrity passed: provider state ready, blocking=0, uncommitted=0. Final strict workflow passed. The branch remains unmerged and unpushed with no canonical full-suite or AcceptanceReceipt.

## Approved pre-handoff closure

The user approved the bounded closure slice, BRC7 acceptance/commit, and beginning BRC8 afterward. P1/P2: source freshness returned before job persistence, while terminal outcomes require a persisted job. P3: preserve original Task/Issue binding by building the existing job from the immutable adoption observation before returning source_stale. Only the authorized parent may explicitly close it. No controller-authored terminal outcome, new schema, dependencies, files, or readiness authority. Source drift remains fail closed. Red: /tmp/brc7-prehandoff-red.txt (missing job identity); green: 30 tests across campaign effects/CLI before adding the closed-Issue variant, plus type check. The final parameterized guard covers both edited and closed Issues, replay, owner mismatch, denied plan_ready, explicit closure and second-slot admission.

The final closure regression passed for both edited and closed Issues (2/0); the full campaign effects/CLI development run passed 30/0 before parameterizing the same guard. Main 29b3fd12 was merged before acceptance; the sole conflict was tasks/current.md and was resolved by canonical regeneration. No source conflict or out-of-scope repair was needed. Architecture ordinary apply completed without humanActions/refreshSignals.

> **Substantive Change SHA256**: `sha256:2e6505b610db3fac3fc5644916ede3cdebcbd8e61c177dd7f59da72b2cf90f45`

## Canonical attempt and pending Claude audit

Canonical prepare run run-20260906T024947-9067 (implementation e20f926f, target 29b3fd12, subject sha256:60344e8f069637b70fd30d8f7bd5d4814a39aa96715795c9225a731f529dd83d) completed in 1361390 ms. Full-suite result: 4513 pass, 4 skip, 2 fail across 364 files; no full-suite pass or AcceptanceReceipt exists. Type, state boundaries and frozen retry-context guard passed. Retained failure log: .ai/harness/runs/run-20260906T024958-12978-bun-test-timeout-60000.log.

Both failures are tests/unit/fleet-acquire-effect.test.ts fixture setup: injected board/plan readers lived in a plain temporary directory, but BRC7 campaign membership correctly reads Git-common storage and the canonical main tree. Standalone reproduction also failed, ruling out suite pollution. The approved acceptance repair adds only git init and an empty main seed commit to the fixture; production code is unchanged. Allowed Paths was extended explicitly for that one directly blocking fixture. Targeted rerun: 2 pass, 0 fail (9 assertions); type check passed. No dependency, file, abstraction or fallback was added. Red/green logs: /tmp/brc7-fleet-fixture-red.txt and /tmp/brc7-fleet-fixture-green.txt.

A fresh external review request was rejected before provider invocation with review_budget_exhausted; no retry was made. The user then announced a Claude audit result. Its contents/path and reviewed subject were requested but have not arrived. Receipt issuance and merge are held until those findings are consumed. Keep the explicit full-suite criterion pending; do not label the failed attempt plus fixture delta a full-suite pass, and do not start another expensive run before incorporating that audit. BRC8 starts after BRC7 acceptance and canonical finish, as requested.

> **Substantive Change SHA256**: `sha256:b4e41f2488bf36c7f7134d0877c87f2c70ef9d8cb94d24486935605514034327`

## Final owner acceptance

The user subsequently instructed “合入BRC7，启动BRC8”, authorizing completion after the bounded fixes. The announced Claude audit was not supplied and is not represented as external review evidence. Canonical prepare run run-20260906T032157-9397 passed all 9 criteria on subject sha256:e7c690baa909af0e8f1b95735bbeb621000dce177b3a05945c63ef88544c7b5c and target 29b3fd12a02c4ad3d50790bde818a01b719daaea. Full bun test --timeout 60000 exited 0 in 1368333 ms; type and state boundaries passed. All six root integrity checks passed before this final prepare. Source and tests were frozen throughout; prepare materialized only the ordinary architecture projection before freezing context.

The canonical UserWaiverGrant and user_waiver AcceptanceReceipt were issued from that passing evidence. This is owner acceptance, not an external_pass. Remaining closeout is installed contract-worktree finish and sprint archival/backfill. Main currently has unrelated uncommitted work from another pane; it must be preserved, and its writer status is pending before any temporary save/restore. BRC8 parent research and plan draft are ready but no BRC8 source has been changed.

Final installed finish readback: refreshed the local ignored worktree base_commit from 86fac685 to the observed fork point 29b3fd12, then retried canonical finish. Architecture passed and verify-sprint finalized acceptance from prepared evidence without rerunning verification. Finish refused only because the target main worktree is dirty. No merge, archival or BRC8 implementation occurred; the pending writer-status question concerns preserving the unrelated main changes. BRC8 decision-complete scratch plan: /tmp/brc8-bounded-worker-plan.md. All six final repository-integrity checks passed, and receipt verify returned pass/User/user-waiver/user_waiver.
