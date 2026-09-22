# Task Review: akn03b-windows-identity

> **Status**: Pending
> **Plan**: plans/plan-20260922-1548-akn03b-windows-identity.md
> **Contract**: tasks/contracts/20260922-1548-akn03b-windows-identity.contract.md
> **Notes File**: tasks/notes/20260922-1548-akn03b-windows-identity.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Substantive Change SHA256**: `sha256:169f0d0f13082f9f1927d81790dcf079f95e59774befb770f0d1f13163a21acc`

## Diagnostic candidate

Two Windows attempts for #437 head769c065c failed the same mapped-status assertion. The existing fixture now checks the same-token authorization ID and a fresh child process using the server Git-root resolver, canonical principal mapping reader and inherited environment. Local focused E2E passes 28 assertions with all original assertions retained. These probes diagnose identity disagreement; they do not constitute a fix or current Windows acceptance. Production source is unchanged. No semantic review has been invoked for this diagnostic candidate.

## PR base verification binding

The narrow diagnosis starts at769c065c. The complete PR diff is separately bound against the actual #435 base3195ffc6 below.

> **Substantive Change SHA256**: `sha256:ac2a9db93e840c5fa68c305701f3a176bd95f55257e44d751225415f1525e601`
