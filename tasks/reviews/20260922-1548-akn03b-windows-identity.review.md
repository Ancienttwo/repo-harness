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
> **Substantive Change SHA256**: `sha256:bbb69d3755af718e4916e05944555d109c2b0bc84b989bcfcee5047853238394`

## Diagnostic candidate

Two Windows attempts for #437 head769c065c failed the same mapped-status assertion. The existing fixture now checks the same-token authorization ID and a fresh child process using the server Git-root resolver, canonical principal mapping reader and inherited environment. Local focused E2E passes 28 assertions with all original assertions retained. These probes diagnose identity disagreement; they do not constitute a fix or current Windows acceptance. Production source is unchanged. No semantic review has been invoked for this diagnostic candidate.

## PR base verification binding

The narrow diagnosis starts at769c065c. The complete PR diff is separately bound against the actual #435 base3195ffc6 below.

> **Substantive Change SHA256**: `sha256:0e3e1091fc24079925cd5b330e2b74fd76b5bed3ac9cb529380339b311fc19ae`

## Confirmed root cause and corrected candidate

Windows job106662452605 at255ecbb0 independently returned the long Git root while the fixture used its8.3 alias. Repository IDs differed; mapping-home and authorization IDs agreed. The correction calls the existing MCP root resolver after Git initialization, before publishing any fixture identity. The temporary diagnostic subprocess is removed; the real mapped-status guard and same-token identity assertion remain. Focused local HTTP passes26 assertions. No production code changed. Freeze this candidate before full canonical checks and the package's sole semantic review against policy origin/main. Hosted Windows acceptance is still pending.
