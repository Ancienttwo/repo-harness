# Task Review: AKN-03b protected Task reply persistence and Engineer MCP

> **Status**: Pending
> **Plan**: plans/plan-20260922-0204-akn03-protected-replies.md
> **Contract**: tasks/contracts/20260922-0204-akn03-protected-replies.contract.md
> **Notes File**: tasks/notes/20260922-0204-akn03-protected-replies.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Substantive Change SHA256**: `sha256:ed3b605a02dcb742514baa338ae21111bfcb14d557611325251af711230e97e4`

## Human Review Card

- Verdict: independent needs-attention; original findings fixed; cumulative AKN-04a dependency findings corrected with pre-fix failures and targeted regressions; corrected final verification and owner acceptance pending.
- Change type: code-change; protected message disposition and current-request auth.
- Scope: roadmap sections 5.3 and 5.5-5.7, as frozen in the captured plan.
- P1/P2/P3: existing inbox authority; Binding to Task to mapping to registry lock order; original WorkEnvelope digest; synchronous OAuth recheck and physical crash boundaries.
- Rollback: revert named entrypoints and writer; preserve existing and partial records.
- Doc debt: none within the implemented slice; notification and Host acceptance remain explicit separate items.

## Verification Evidence

Development evidence: 16 effects tests plus the exact stored-path identity regression passed, including five real child exits and original-ID recovery, late token revocation, revoked mapping, rotated Lease, ACK recovery, orphan/missing records and bounded reads. The real Engineer OAuth HTTP smoke passed with exact inventory, SDK current-request token propagation and existing session isolation. Final canonical verification follows source and projection freeze; these development runs do not replace it.

## Residual Risks / Follow-ups

- Real Host/H0 protected-store isolation and legal Campaign canaries remain unproven; no runtime was installed or activated.
- Notification reconciliation under the exact runtime control reference is a later AKN-03 boundary.
- Initial authority validation is outside the read-scan deadline; shared mapping/registry locks prioritize consistency and may contend at higher concurrency.
- Stacked source includes PR #435. Its separately accepted inventory correction is retained, not re-authored.

## Independent Review Transcript

Review subject: `sha256:c87c011cd1e9865a9eff72640e8885d2073f6e1b22f67d304857de97db264211` at `57e236ec77e73ec6002d1ffe473922167f331e3c`. The provider verdict governs; the wrapper's advisory PASS label is not treated as acceptance.

```json
{
  "verdict": "needs-attention",
  "summary": "Do not ship yet: MCP recovery omits required retry data, and reply submission changes the supposedly exact body bytes.",
  "findings": [
    {
      "severity": "medium",
      "title": "Expose frozen reply bytes for interrupted-operation recovery",
      "body": "After intent publication, a restarted caller that lost its request body can discover only the reply ID and chain state here. replyToTaskSteer requires the original body and rejects any different bytes, but no Engineer MCP tool exposes the stored intent or resumes it directly. Even with the original WorkEnvelope and live fence, the caller cannot recover this partial operation through the protected API. The crash tests retain replyArgs outside the terminated child, masking this gap.",
      "file": "src/effects/fleet/task-inbox.ts",
      "line_start": 1216,
      "line_end": 1218,
      "confidence": 0.96,
      "recommendation": "Expose the frozen reply body through an authorized, bounded recovery read, or provide an explicit resume operation using the stored intent under the same live fence. Test recovery without retaining the original request body."
    },
    {
      "severity": "medium",
      "title": "Preserve exact reply body bytes at the MCP boundary",
      "body": "Passing body through requiredString invokes optionalString, which returns value.trim(). Leading indentation and trailing newlines are therefore removed before hashing and persistence. Requests with different surrounding whitespace also become identical retries instead of producing task_reply_conflict. This violates the exact-body protocol and can alter code or other whitespace-sensitive reply content.",
      "file": "src/cli/mcp/engineer-tools.ts",
      "line_start": 678,
      "line_end": 678,
      "confidence": 1,
      "recommendation": "Validate body as a string without normalization and pass its original bytes to the protocol validator. Add MCP-boundary coverage for preserved indentation/newlines and whitespace-only changes on retry."
    }
  ],
  "next_steps": []
}
```

## Review resolution

Both findings reproduced in `review-regressions-before.log`: exact whitespace was lost, and a fresh caller had no recovery body. The protected read now returns frozen retry bytes for incomplete chains; MCP passes original body bytes unchanged. Regression coverage generates the body exclusively inside the child that exits, then recovers through the authorized MCP read and reply tools. The existing current-fence check remains mandatory. Final canonical verification and owner acceptance follow the corrected source/projection freeze; the earlier reviewer verdict does not cover the new subject.

## AKN-04a dependency findings

The cumulative independent review rejected 75036305-derived behavior: unrelated canonical commits prevented ongoing communication, and full-history scan exhaustion prevented known-operation recovery. The owner request for the earlier f306 subject is superseded. `review-recovery-before.log` captured three failing regression cases. The corrected targeted run passed all three: communication survives unrelated canonical advancement while acquisition remains strict and changed Plan proof fails closed; authenticated exact-parent recovery survives both scan and byte exhaustion, retains immutable history, and rejects wrong digest, pagination mixing and revoked token. The code uses shared authority checks and an explicitly scoped exact-parent read requiring the original persisted intent. Unknown-parent discovery beyond the list bound remains incomplete and is not represented as solved.

No second independent review was run. Acceptance must bind the corrected source and canonical verification.

## Corrected canonical evidence

Source `92f1b3b68fb3920fc47ff5a9f63ce0c6a1ef1d0e`; subject `sha256:de587bc9199084e7c8eef152f9a528d34d878f684c1e46782a316312677c3379`. Canonical prepare-acceptance passed all 23 criteria with zero failures, including recovery/effects, acquisition effects, MCP/OAuth/HTTP, authority inventory, type and required repository integrity checks. Run: `.ai/harness/runs/run-20260922T040623-9736-20260922-0204-akn03-protected-replies.json`. Architecture materialization was noop with current proof. This is machine verification, not an AcceptanceReceipt. Explicit owner acceptance remains pending and the previous request does not cover this corrected subject.

## AKN-05a dependency finding: cursor ordering

- root_cause: observeTaskSteers sorted UUIDs with localeCompare but applied an exclusive code-point cursor; a valid uppercase UUID could be silently skipped.
- repro: bun test tests/effects/task-reply.test.ts --test-name-pattern 'mixed-case UUID pagination'
- regression_guard: tests/effects/task-reply.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/akn05-reader-corrections/pagination-red.log (PRE_FIX_EXIT=1)

The original review rejection remains. This correction supersedes prior source-bound verification and owner-acceptance subjects; it is not a new external review or a passing receipt.
