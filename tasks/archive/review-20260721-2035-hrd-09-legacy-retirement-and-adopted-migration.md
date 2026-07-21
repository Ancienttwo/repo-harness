> **Archived**: 2026-07-21 20:35
> **Related Plan**: plans/archive/plan-20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260721-2035

# Task Review: hrd-09-legacy-retirement-and-adopted-migration

> **Status**: Reviewed
> **Plan**: plans/plan-20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.md
> **Contract**: tasks/contracts/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.contract.md
> **Notes File**: tasks/notes/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-21 20:13 +0800
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass; AcceptanceReceipt still pending
- Change type: migration / typed runtime authority cutover
- Intended files changed: the seven remaining typed route handlers, exhaustive route binding, delegation-state transaction, exact-fingerprint adoption retirement, removal of host-event Bash runtime, preservation regressions, runtime docs, and workflow artifacts.
- Actual files changed: matches the contract `allowed_paths`; the independent ship gate counted all 143 dirty paths inside the declared scope, and the final LSC characterization marker was added to that scope before modification.
- Commands passed: focused handler/adoption/concurrency suites; 75-test environment falsifier rerun; full 1,671-test repository suite; type/state/hook projection gates; tarball install smoke; deploy/architecture/task/workflow gates; inspector; adoption dry-run; and diff check.
- Residual risks: typed handlers still perform synchronous Git/filesystem work on some prompt/subagent paths; exact-fingerprint retirement intentionally preserves modified legacy files for explicit operator handling instead of guessing ownership.
- Reviewer action required: issue the contract-authorized typed owner waiver once against the final frozen subject; no provider call or second semantic review is required.
- Rollback: revert the HRD-09 PR. Downstream adoption mutations retain their transaction rollback manifest; do not reinstall the retired dispatcher as a fallback.

## Mode Evidence

- Selected route: approved `$think` work-package executed in the isolated HRD-09 contract worktree.
- P1/P2/P3 evidence: recorded in the plan and durable research artifact, covering the direct host adapter to typed runtime path, one real adopted-repo transaction, and the single-authority/no-compatibility decision.
- Root cause or plan evidence: HRD-08 proved seven routes still crossed opaque Bash steps; the HRD-09 fixture proves one adoption transaction removes that authority and all eleven current routes stay in-process.

## Verification Evidence

- Waza `/check` run: equivalent local verification complete; the independent read-only ship gate returned PASS with no blockers after the bootstrap authority correction.
- Commands run: `bun test`; the contract's focused test set; `bun run check:type`; `bun run check:state-boundaries`; `bun run check:hooks`; `bash scripts/check-tarball-install-smoke.sh`; deploy/architecture/task/workflow checks; inspector; adoption dry-run; and `git diff --check`.
- Manual checks: all four exact contract criteria are checked below with concrete evidence.
- Supporting artifacts: `docs/researches/20260721-hrd09-legacy-retirement-evidence.md`, the complete HRD-09 fixture, the real-process delegation concurrency fixture, and ignored `.ai/harness/checks` / run evidence.
- Implementation notes reviewed: yes.
- Run snapshot: Bun full suite 1,670 pass / 1 platform skip / 0 fail across 140 files; 13,939 expectations; 485.98 seconds. Final affected-environment rerun: 75 pass / 1 platform skip / 0 fail; 1,028 expectations.

## Manual Check Evidence

- [x] Full repository test suite passes once after code freeze
  - Evidence: final `bun test` completed on the frozen implementation with 1,670 pass, 1 Windows-only skip, 0 fail, and 13,939 expectations across 140 files in 485.98 seconds.
- [x] Self-host adoption dry-run reports zero operations after code freeze
  - Evidence: `bun src/cli/index.ts adopt --repo . --dry-run` exited 0 with 0 total, 0 planned, and 0 skipped operations and the expected source-checkout boundary warning.
- [x] One disposable adopted fixture migrates atomically and all eleven routes emit unique event records with zero legacy or opaque steps
  - Evidence: `tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts` passed in both the focused and full suites; it records one transaction, all eleven route identities, zero provider calls, and no subprocess/opaque/retired runtime step.
- [x] A same-scope Stop/SubagentStart interleaving preserves monotonic spawned/fallback state and Stop blocks only after an in-lock fallback claim
  - Evidence: the real two-process barrier in `tests/delegation-state-concurrency.test.ts`, plus focused Stop/SubagentStart suites, passed 22 tests with 182 assertions and passed again in the full suite.

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: kito
> **Reviewed Subject SHA256**: sha256:cc193de957215307d72babd40bab370e78bdf3c494689abd5327d1314354da79
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 49da8563a38e03ecca5288da55c71980b3830a74
> **Verification Evidence SHA256**: sha256:227c09718401827a8499e9b2d78b662537836167b4b48f7dedce21cf840b9a63
> **Issued At**: 2026-07-21T12:23:57.095Z

- Summary: Owner kito granted the HRD-09 user waiver in-session on 2026-07-21 and accepts the residual risks recorded in the task review.
- Findings: none

## Behavior Diff Notes

- All eleven public `(event, routeId, matcher, hosts)` tuples remain stable while the internal `Route.scripts` field and Bash dispatch branch are gone.
- Seven formerly opaque route scripts now execute through typed handlers and contribute one truthful `in_process` step to the HRD-08 event record.
- Stop, SubagentStart, and advisor creation now share one lock-internal delegation-state read/merge/projection transaction; `spawned` and `fallback_used` are monotonic.
- Canonical adoption is the sole legacy-retirement writer. It removes only exact package-owned fingerprints and managed adapter commands, while init/create preserve repo-local hooks and host config.
- Packaged tarball smoke confirms the final published `0.10.1` artifact installs and both CLI bins start without the retired runtime.

## Residual Risks / Follow-ups

- Prompt and subagent typed handlers still have synchronous Git/filesystem cost; HRD-09 removes process duplication but does not introduce an unmeasured cache.
- A modified legacy hook file is deliberately preserved because exact ownership cannot be proven. The operator must resolve that explicit mismatch; no compatibility runtime executes it.
- Hosted PR CI and merge remain operational gates after the receipt/local seal; they are not missing semantic evidence.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All eleven routes and the adopted migration fixture pass with no legacy or opaque execution. |
| Product depth | 9/10 | Runtime, migration, package, downstream preservation, and closeout evidence share one authority model. |
| Design quality | 9/10 | Typed exhaustive dispatch and one adoption transaction replace duplicate runtime and mutation authorities without a shim. |
| Code quality | 9/10 | Focused concurrency/security fixtures, independent gate review, and the full repository suite pass. |

## Failing Items

- None in the reviewed subject. Acceptance receipt, hosted CI, and merge are the remaining closeout operations.

## Retest Steps

- Re-run: targeted tests only if semantic source changes after receipt; review/lifecycle projections require only local reseal.
- Re-check: `bun run check:hooks`, adoption dry-run, and the HRD-09 complete fixture if a runtime or migration authority path changes.

## Summary

- Pass for HRD-09. The terminal migration establishes one typed host-event runtime, one atomic adopted-repo retirement authority, and one cross-writer delegation transaction; the final full suite and package smoke pass. Closeout now requires exactly one typed owner waiver followed by the provider-free local seal, PR CI, and merge.
