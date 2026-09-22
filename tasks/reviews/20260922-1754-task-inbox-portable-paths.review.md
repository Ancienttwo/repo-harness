# Task Review: task-inbox-portable-paths

> **Status**: Pending
> **Plan**: plans/plan-20260922-1754-task-inbox-portable-paths.md
> **Contract**: tasks/contracts/20260922-1754-task-inbox-portable-paths.contract.md
> **Notes File**: tasks/notes/20260922-1754-task-inbox-portable-paths.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-22 18:01
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: the original review and subsequent upstream review findings are corrected; owner-accepted dependency #444 is integrated; 21 current checks (27 total criteria) passed and evidence binding to the committed integration contract is being finalized. This contract's owner acceptance remains pending.
- Change type: migration
- Intended files changed: Task Inbox path owner, storage-only token, offline migration, fleet inbox CLI, owning fixtures, native matrix, research and runbook.
- Actual files changed: within the contract allowlist; no Task/Lease/Binding/actor protocol or real data mutation.
- Check IDs and evidence disposition: focused implementation evidence is recorded below; the contract Verification Plan remains the sole executable acceptance authority.
- Residual risks: all clients must be offline; Windows directory durability differs from POSIX; full native CI is valid for unchanged source `2948a041`; this contract's receipt remains pending.
- Reviewer action required: consume the original review and correction evidence; the one independent review for this boundary is consumed.
- Rollback: revert code before migration; operator inverse requires exact receipt and unchanged v2 output.

## Mode Evidence

- Selected route: approved plan execution followed by Waza check and one independent semantic review.
- P1/P2/P3 evidence: research maps semantic identity, storage paths and shared Task locks; native Windows CI proves colon filenames fail before Activity can read; v2 changes storage components only.
- Root cause evidence: existing-suite regression failed before production changes on a raw claim filename, then passed with the fixed bounded token. See the contract Root Cause Evidence and retained before.log.

## Verification Evidence

- Historical canonical verification: `verify-sprint --prepare-acceptance` passed 27/27 at source `121b10e11c8240bbbcd84209f9f36baf90e91109`; run `run-20260922T234043-62075-20260922-1754-task-inbox-portable-paths.json`. Publication head `7f4397d89d8413aab7d373c429b1f4bdfb64b53c` preserves subject `sha256:ea02c8047350304f17f3f10b85aee60c3c9b3cd8b65896ea1076052ae3a44196`, verified by the canonical subject builder.
- Focused migration effects: 38 passed, including transaction interruption, actual process exit, injected file-operation failures, exact-byte retention, external-link refusal and rollback after new writes.
- Historical reply migration: three fixture cases passed for intent-only, event-uncommitted and complete; no active sprint or live historical actor required.
- Native local lifecycle: deep-path delivery/ACK/reply and separate Alice/alice receipts passed. Windows/macOS/Linux hosted coverage is required on the published head.
- Implementation-stage correction: one test grouped three expensive fixtures into a single default five-second test. Split the three semantic cases into independent parameterized tests; all three passed without raising timeouts or weakening assertions.
- Canonical, hosted CI and independent acceptance are not inferred from these focused runs.

## Manual Check Evidence

No non-built-in manual check is declared by this contract. Real data migration, main merge, global installation, Host admission and canary are excluded.

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- Runtime serves one v2 layout and rejects legacy, active migration or inconsistent retirement artifacts.
- Migration preserves canonical bytes and historical states; it cannot reconstruct missing ACKs, replies or commits.
- Rollback cannot discard subsequent v2 writes. Ordinary reads never initialize a migration.

## Residual Risks / Follow-ups

- Complete corrected exact-subject canonical verification and native CI, then record explicit owner acceptance; do not repeat semantic review.
- Carry the accepted source into #442 and automation-summary before narrowing #439; #442 uses owner acceptance for its already-consumed review boundary.

## Independent review and correction

Reviewed source: e6dd175c322d887b6488ef9815676ab55f13394b. Reviewed subject: `sha256:eba1112be474bd925cafbd0b5e96ec8cfd58790cc126e78f8f814a5cde3dc457`. The original transcript follows verbatim:

```json
{
  "verdict": "needs-attention",
  "summary": "Do not ship yet: successful rollback prevents any supported future upgrade to v2.",
  "findings": [
    {
      "severity": "medium",
      "title": "Completed rollback permanently blocks migration",
      "body": "The retained rollback receipt forces inspection into `rolled_back`: apply rejects that state, while resume returns without migrating. After the previous release writes new v1 history, checkedReceipt also rejects the changed inventory, blocking even dry-run. Confirmed through the actual migration function with an in-memory filesystem. Following the documented rollback procedure therefore strands the repository on v1 unless operators manually remove transaction evidence.",
      "file": "src/effects/fleet/task-inbox-layout-migration.ts",
      "line_start": 311,
      "line_end": 311,
      "confidence": 0.99,
      "recommendation": "Add an explicit transition from completed rollback to a fresh, digest-approved migration, preserving the old receipt separately. Cover apply → rollback → reapply both with unchanged history and after legitimate v1 writes."
    }
  ],
  "next_steps": [
    "Implement and verify the post-rollback migration transition.",
    "Restore checkout dependencies and rerun browser types tests; the attempted run had 106 passes and one suite blocked by missing React."
  ]
}
```

Both requested regression cases failed before correction. Current migration coverage verifies fresh approval after rollback with unchanged or newly appended v1 history, and resume/rollback after nine reapply boundaries, preserving both old and new receipts. A prepared-journal rollback additionally failed before its correction. Reviewer-checkout missing React is not current canonical evidence; the corrected candidate will have its own declared verification. No second semantic review is authorized by this package's review budget.

## Publication evidence

Draft PR: https://github.com/Ancienttwo/repo-harness/pull/443, based on #442. Published head: `7f4397d89d8413aab7d373c429b1f4bdfb64b53c`. Full manual CI: https://github.com/Ancienttwo/repo-harness/actions/runs/35749499343 (FAILURE: Windows failed; full Test, Linux, macOS and Governance passed). Draft PR event 35749461228 passed Governance but deliberately deferred tests and failed Required / CI; it is not test evidence. The version/tag warnings from the release-gate helper concern the pre-existing package release baseline; this work publishes a Draft source PR, no package release.

## Windows blocker outside the contract

Windows job 106819723526 failed 31 tests: one migration unknown-Lease case reached `coordination-lease-store.ts:168` through `createLeaseDirectory`, and 30 Task reply cases reached `binding-store.ts:163` through `withEngineerLock` during fixture creation. Both call directory `fsyncSync` through a read-only handle and throw EPERM. Neither source file differs from approved baseline12518117, and neither is in this contract allowlist. Real deep-path delivery/ACK/reply is therefore unproven on Windows. Existing platform passing tests do not waive this blocker. Original job log is retained under `.ai/harness/runs/task-inbox-portable-paths/windows-ci-35749499343.log`.

The user was asked to authorize a separate bounded Windows persistence work-package, following the second out-of-scope discovery stop rule. No production source fix, test skip, main merge, installation or real migration was performed in response to this failure.

## Integrated accepted dependency and current evidence

- Accepted dependency #444: `daa05cbf`, typed owner acceptance for subject `c21805db55803c9e4430b04ed63d788c55fd2d0bfe5684af7d6c2927c57c5770`, provider-free seal and archived lifecycle. Fast-forward integration retains this package's active contract.
- Source comparison: `git diff 2948a041 HEAD -- src tests .github package.json bun.lock` is empty; [CI35765127664](https://github.com/Ancienttwo/repo-harness/actions/runs/35765127664) passed full Test, Governance and Windows/macOS/Linux. Windows: 210 pass, 6 existing skips, 0 fail, including exact identities and prepared receipt rollback/refusal guards. No new exact-head full run is claimed for workflow-only integration commits.
- Current contract checks: 21/21 (27/27 total criteria) passed in `run-20260923T023742-64840-20260922-1754-task-inbox-portable-paths.json`. The first binding refused an uncommitted contract amendment; commit the exact contract and re-prepare using valid execution records before acceptance.
- Frozen content subject remains `sha256:c21805db55803c9e4430b04ed63d788c55fd2d0bfe5684af7d6c2927c57c5770`, target `origin/main` at `0d4371c3`.
- This package's own owner acceptance remains pending. The #444 receipt records that dependency's contract; it is not copied into this contract or represented as a second external review.
