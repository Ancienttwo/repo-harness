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

## Human Review Card

- Verdict: pending one independent final-subject review.
- Change type: code-change; protected message disposition and current-request auth.
- Scope: roadmap sections 5.3 and 5.5-5.7, as frozen in the captured plan.
- P1/P2/P3: existing inbox authority; Binding to Task to mapping to registry lock order; original WorkEnvelope digest; synchronous OAuth recheck and physical crash boundaries.
- Rollback: revert named entrypoints and writer; preserve existing and partial records.
- Doc debt: none within the implemented slice; notification and Host acceptance remain explicit separate items.

## Verification Evidence

Development evidence: 16 effects tests passed, including five real child exits and original-ID recovery, late token revocation, revoked mapping, rotated Lease, ACK recovery, orphan/missing records and bounded reads. The real Engineer OAuth HTTP smoke passed with exact inventory, SDK current-request token propagation and existing session isolation. Final canonical verification follows source and projection freeze; these development runs do not replace it.

## Residual Risks / Follow-ups

- Real Host/H0 protected-store isolation and legal Campaign canaries remain unproven; no runtime was installed or activated.
- Notification reconciliation under the exact runtime control reference is a later AKN-03 boundary.
- Initial authority validation is outside the read-scan deadline; shared mapping/registry locks prioritize consistency and may contend at higher concurrency.
- Stacked source includes PR #435. Its separately accepted inventory correction is retained, not re-authored.
