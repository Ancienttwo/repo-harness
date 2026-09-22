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

- Verdict: implementation complete; canonical verification and independent acceptance pending.
- Change type: migration
- Intended files changed: Task Inbox path owner, storage-only token, offline migration, fleet inbox CLI, owning fixtures, native matrix, research and runbook.
- Actual files changed: within the contract allowlist; no Task/Lease/Binding/actor protocol or real data mutation.
- Check IDs and evidence disposition: focused implementation evidence is recorded below; the contract Verification Plan remains the sole executable acceptance authority.
- Residual risks: all clients must be offline; Windows directory durability differs from POSIX; exact published-head native CI is pending.
- Reviewer action required: consume frozen canonical evidence and evaluate the single migration boundary.
- Rollback: revert code before migration; operator inverse requires exact receipt and unchanged v2 output.

## Mode Evidence

- Selected route: approved plan execution followed by Waza check and one independent semantic review.
- P1/P2/P3 evidence: research maps semantic identity, storage paths and shared Task locks; native Windows CI proves colon filenames fail before Activity can read; v2 changes storage components only.
- Root cause evidence: existing-suite regression failed before production changes on a raw claim filename, then passed with the fixed bounded token. See the contract Root Cause Evidence and retained before.log.

## Verification Evidence

- Canonical verification: pending source freeze and verify-sprint --prepare-acceptance.
- Focused migration effects: 26 passed, including transaction interruption, actual process exit, injected file-operation failures, exact-byte retention, external-link refusal and rollback after new writes.
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

- Complete exact-subject canonical verification, the new package's independent review and native CI.
- Carry the accepted source into #442 and automation-summary before narrowing #439; #442 uses owner acceptance for its already-consumed review boundary.
