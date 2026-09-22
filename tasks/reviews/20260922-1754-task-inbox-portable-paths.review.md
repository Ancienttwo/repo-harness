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

- Verdict: independent review found one P2; corrected source requires fresh canonical verification, native CI and exact-subject owner acceptance.
- Change type: migration
- Intended files changed: Task Inbox path owner, storage-only token, offline migration, fleet inbox CLI, owning fixtures, native matrix, research and runbook.
- Actual files changed: within the contract allowlist; no Task/Lease/Binding/actor protocol or real data mutation.
- Check IDs and evidence disposition: focused implementation evidence is recorded below; the contract Verification Plan remains the sole executable acceptance authority.
- Residual risks: all clients must be offline; Windows directory durability differs from POSIX; exact published-head native CI is pending.
- Reviewer action required: consume the original review and correction evidence; the one independent review for this boundary is consumed.
- Rollback: revert code before migration; operator inverse requires exact receipt and unchanged v2 output.

## Mode Evidence

- Selected route: approved plan execution followed by Waza check and one independent semantic review.
- P1/P2/P3 evidence: research maps semantic identity, storage paths and shared Task locks; native Windows CI proves colon filenames fail before Activity can read; v2 changes storage components only.
- Root cause evidence: existing-suite regression failed before production changes on a raw claim filename, then passed with the fixed bounded token. See the contract Root Cause Evidence and retained before.log.

## Verification Evidence

- Canonical verification: pending source freeze and verify-sprint --prepare-acceptance.
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
