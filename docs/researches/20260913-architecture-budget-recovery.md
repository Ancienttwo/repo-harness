# Architecture work budget recovery

Scope: bounded Stop projection and measured refactor observations. Base: `f1596f094423018e35ceb6f46f74a8d07b7b182c`.

## Cause and invariant

The installed managed Stop adapter allows 150 seconds, but the handler previously passed one 20-second deadline to projection, the legacy cascade, journal work and recommendation observation. The standalone observer additionally bounded serial scan plus lifecycle readback to ten seconds. The installed provider was enabled and version-correct; the enclosing deadlines prevented complete work.

The timing authority is now `src/core/hook-work-budget.ts`, shared by the managed adapter, Stop and observer. Stop work has a 140-second deadline; projection receives at most 110 seconds, also bounded by any shorter configured provider timeout; observation receives at most 30 seconds and any shorter positive caller remainder. Journal and disabled-provider cascade work retain the original entry-anchored 20 seconds. No queue, semantic authority, execution authorization or provider configuration was replaced.

A host-budget yield retains the pending job and does not advance the cursor or consume a business retry. Oversized work remains an explicit `architecture-projection drain --json` operation. At ten times the workload these bounded stages may still time out; the change prevents the observed scheduling mismatch and does not claim unlimited throughput. Budget-exhausted observation is visible; cooldown deferral remains quiet.

## Verification

- Four deterministic regressions fail on frozen base `f1596f09` and pass on the candidate: a 23.6-second projection followed by 16-second observation; visible zero-budget deferral; serial observation beyond ten seconds; positive caller remainder without resetting its deadline.
- Stop and recommendation focused files: 49 passed. Typecheck and the packed hook build passed.
- Canonical run `run-20260913T153557-35519`: 13 of 14 executable checks passed, including provider/orchestration regressions, typecheck, required integrity checks, init dry-run and bundle build. Task-sync initially lacked a diff-bound notes digest; after adding that digest its direct rerun exited 0. The original failed report is retained, not rewritten as an all-green acceptance report. Subsequent changes only record these findings in workflow/research documents.
- Native architecture specialist review passed the timing/dependency boundary without blocking findings. This is not the contract's typed AcceptanceReceipt.
- A normal package build/pack and isolated installation succeeded; CLI version and hook module loading passed. No global installation, merge, hosted CI or publication was performed.
- Disposable real-provider Stop completed in 16.8 seconds and returned `proof_required`, rather than timing out. A copied pending job produced an applied receipt. Evidence: `.ai/harness/runs/architecture-budget-stop-final-result.json`, `architecture-budget-canary-projection-receipt.json`, and `architecture-budget-provider-readback-summary.json` in the same directory.

## Runtime ownership

The original 224-path live job `job-4792c825bf82aa7748433f1f` was completed by another execution path while this repair was being prepared. Its durable receipt and the current cursor are evidence of that progress, not attribution to this candidate. The primary workspace's externally produced projection files and archive card are preserved. The candidate canary uses a disposable clone and HOME; no live semantic acceptance or automated refactor is inferred from its recommendations.

## Initial acceptance gaps and ownership

1. **repo-harness queue scheduling:** the authorized live candidate command `architecture-projection drain --json` returned `idle`, `pending: 1`, `running: 0`, `deadLetters: 0`. Job `job-b2b6d09c1ea6a0f5062deefa` remains pending. In `src/effects/architecture/projection-orchestrator.ts`, the `events.length > 0 && eligible.length === 0` return occurs before `claimNextArchitectureProjectionJob`. A current drift event containing only projection-owned paths therefore prevents the old pending job from being claimed. The isolated clone had different current drift input and did consume its copied job; it does not prove the live queue is empty. Preserve the job and cursor; no manual queue deletion or cursor advancement was used. Evidence: `.ai/harness/runs/architecture-budget-live-drain-result.json`.
2. **Recommendation proof:** a real discovery readback completed in 17.418 seconds, with `coverage: partial`, `truncated: true`, edge limit 5000, 29 undeclared node footprints and 75 multiply owned files. The observer correctly refused to synthesize a recommendation. Model footprint/ownership repair belongs to this repository's `.archcontext/model/nodes/`; the truncation and caller-coverage boundary needs a separate trace through ArchContext and CodeGraph before assigning an upstream defect. Do not weaken the proof gate or treat discovered candidates as accepted recommendations.

The budget implementation is locally verified, but the approved end-to-end goal remains partial. The second independent gap ends scope expansion under the repository stop rule. The owner subsequently approved source-only delivery on 2026-09-13 (“合并现有代码，保留运行时缺口”); these runtime outcomes remain deferred rather than being declared passed. No semantic acceptance receipt exists. The next bounded implementation slice is the repo-harness queue eligibility/claim ordering, with a regression proving an existing pending job is handled when the new event contains only projection-owned paths.

## Approved pending drain recovery

The owned-only early return was removed from `drainArchitectureProjectionJobs`. An empty eligible set still creates no job; the existing locked claim can now resume an older pending job. When there is no claim, owned-only input still returns `idle` and acknowledges its own filtered event. A claimed job continues through its original success/failure and source-identity paths.

Two new cases in `tests/architecture-projection-orchestration.test.ts` fail on the unfixed source with `idle` and `pending: 1`, and pass after the fix: successful consumption leaves a receipt without enqueueing generated paths; provider failure retains the original pending task and does not acknowledge success. The existing empty-queue generated-path suppression case also passes. The remaining aggregate running/receipt/dead-letter returns retain their existing identity and ownership behavior; this narrow fix does not change scheduling across unrelated source slots.

Verification baseline: `6c8739132445a3df9d7dee0247da266e50fb729a`. Another execution path committed the earlier budget work at `76a2052` and merged the independent unmapped fix while this continuation ran; those actions are not attributed to this execution. A frozen disposable candidate at `68be9dad976b3408c801e7bfdc94a27d341886e0`, with independent HOME and real ArchContext, started with exactly one copied pending job and only projection-owned current paths. Explicit drain completed in 79.750 seconds with `applied`, pending/running/dead-letter all zero.

The same frozen candidate then executed the authorized live drain. Job `job-b2b6d09c1ea6a0f5062deefa` completed in 67.078 seconds with an `applied` receipt at attempt 1. Live readback: pending 0, running 0, dead-letter 0, receipts 341, source journal pending 0. Cursor remains on main HEAD `f1596f094423018e35ceb6f46f74a8d07b7b182c`; acknowledgement went through the normal command, with no manual cursor/queue edits. The provider-owned working-tree outputs remain uncommitted on main.

Executable evidence: `.ai/harness/runs/pending-drain-verification.json` contains 13 passing executable checks, including all required repository-integrity checks, typecheck, Stop/recommendation coverage and hook build. Two additional integration checks initially failed: the legacy cascade test inherited the real enabled provider configuration, and a 500ms process fixture failed before creating its descendant PID file. The 40 legacy/unmapped tests passed under isolated HOME; the unchanged provider process-tree test passed when rerun alone under isolated HOME. `.ai/harness/runs/pending-drain-followup-verification.json` preserves those followups separately; the original canonical failure report is not rewritten as an acceptance pass. Native architecture delta review passed on the fixed baseline. No hosted CI, typed AcceptanceReceipt, commit of this queue delta, global install or release was performed by this execution.

Runtime evidence: `.ai/harness/runs/pending-drain-before-drain.json`, `pending-drain-drain-result.json`, `pending-drain-live-drain-result.json`, and `pending-drain-live-receipt.json`. The budget and queue code are now locally verified and the observed queue is recovered. The broader recommendation goal still requires complete code facts and unambiguous model ownership; do not weaken that proof gate.

## Semantic review correction before installation

The official codex-plugin review of `8603e04f1279c790679471d20ac6cb4dcaa49cd5` returned a P1: after a long projection, the expired entry-anchored journal budget could cause an unattempted verification trigger to be deleted. A typed reject receipt was recorded; that package was not installed.

The corrected consumer retains the event when the deadline is already exhausted or the remaining time cannot cover helper process cleanup. The original 20-second entry-anchored journal ceiling stays unchanged, and a later pass can consume the retained trigger. Actual attempted failures/timeouts still warn and retire under the existing policy; no new queue, budget authority or effect replay model was introduced. Updated existing Stop regressions fail on the unfixed consumer for both 25,000ms preceding work and only 1ms remaining, then pass after the correction and positively verify consumption on a fresh budget. Stop plus mutation-observed coverage: 66 passed. Evidence: `.ai/harness/runs/journal-budget-pre-fix.log` and `journal-budget-focused.log`.

The contract admits this directly blocking lifecycle correction and includes the existing mutation-observed suite. The frozen policy permits one semantic review per work-package; it has been consumed. A fresh passing prepared verification plus an explicitly authorized owner waiver is required before merge/install. No prior approval is treated as that waiver. Main's three generated output/archive files remain protected and uncommitted.
