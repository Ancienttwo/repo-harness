# Task Review: akn03b-windows-fixture

> **Status**: Accepted
> **Plan**: plans/plan-20260922-1417-akn03b-windows-fixture.md
> **Contract**: tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md
> **Notes File**: tasks/notes/20260922-1417-akn03b-windows-fixture.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-22 14:17
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:25dc1cd91acb024a7824139f30a43cebf2cbd230480c655db8433d2bac545fe6
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 0d4371c3f95e63851f4e083718f3337bf9646345
> **Substantive Change SHA256**: `sha256:eb40de57270da0207fcc532908417567720dfef93fe7897ba9f82d864690dcd1`

## Human Review Card

- Verdict: pending current canonical and semantic acceptance.
- Scope: Windows fixture correction and original AKN-03 publication-time authorization requirement on PR #437.
- Root cause: real Windows job 106634890098 directory fsync EPERM in fixture bindEngineer.
- Development verification: Engineer OAuth E2E passes locally, 23 assertions.
- Remaining evidence: actual hosted Windows job after candidate publication.

## Independent review transcript

Subject: `sha256:d16a5e2e95c2976815da1a33db6c3284711e3b7d0dc885f223adbc4f42b7cdd5`. Provider result governs; the wrapper advisory PASS is not acceptance.

```json
{
  "verdict": "needs-attention",
  "summary": "Block on the publication-time authorization gap. All 58 pure protocol tests pass, but they do not cover expiry during synchronous validation or persistence.",
  "findings": [
    {
      "severity": "medium",
      "title": "Token expiry can occur after the final authorization check",
      "body": "The publication callback checks the token before running filesystem and canonical Git validation. Those synchronous operations consume wall-clock time, so revalidate() can return successfully after token expiry. A deterministic in-memory timing probe reproduced this. persistReplyRecord then links the intent or commit without another token check; event publication additionally performs staging and fsync after revalidation. Consequently, an expired request can publish a user-visible reply or complete its commit despite the promised publication-time fence.",
      "file": "src/effects/engineers/task-inbox.ts",
      "line_start": 41,
      "line_end": 54,
      "confidence": 0.99,
      "recommendation": "Recheck the request token after all expensive authority validation. Give event and receipt writers a final authorization callback after staging/fsync and immediately before link/rename, matching the reply-record publication boundary."
    }
  ],
  "next_steps": [
    "Add deterministic expiry tests during canonical validation and event staging; assert that no event, ACK, or commit publishes after expiry."
  ]
}
```

The original fixture-only scope was revised before production edits to include this unmet AKN-03 requirement. Five formal pre-fix regressions failed on the unfixed source; all five pass after the correction (17 assertions, 7.9 seconds). Evidence: `.ai/harness/runs/akn03b-windows-fixture/expiry-pre-fix.log`. The prior rejection remains recorded; no second independent review or owner waiver has been obtained for the corrected subject.

## Owner review response: encoded record size

The owner review on 2026-09-22 requires reacceptance of the corrected communication slice. Reproduced four failures before the size correction (five existing-compatible encoding cases already passed), then all nine focused cases pass (26 assertions, 2.24 seconds). Evidence: `.ai/harness/runs/akn03b-windows-fixture/size-pre-fix.log`; coverage includes control characters, quote/backslash escaping, multibyte UTF-8, total encoded boundary, metadata and same-ID recovery. The correction retains 64 KiB as an explicit core total-record contract; it does not invent a larger storage constant. The prior expiry candidate passed 26/26 canonical criteria before this new source change; final verification must bind the new combined subject.

## CI subject attribution

GitHub run 35693364932 belongs to head fdc2081f and checked out PR merge e2f74143c536d2eb29c317aafd0836e5889477f5 (base 749e9e92). Windows job 106634890098 failed directory fsync in Binding fixture setup; Ubuntu Test job 106634890110 failed only the two candidate Stop-timeout fixtures. The Test job did not reach npm pack or tarball-install smoke. Governance context checks, Ubuntu MCP and macOS MCP succeeded. No package/context-wiring failure appears in this run; the merged source forwards requestContext and engineerVerifyAuthorization.

Accepted fixture commit 8c7fd593 is now an ancestor of this candidate through the refreshed #435 branch. The installed smoke reuses the existing HTTP E2E against package runtime source and adds a successful mapped status call. Semantic acceptance remains pending on the new frozen subject.

## Current corrected candidate awaiting owner acceptance

- Candidate source commit: `e46cfe4e21a886bc39350bf8be8954e52146cff7`.
- Subject: `sha256:25dc1cd91acb024a7824139f30a43cebf2cbd230480c655db8433d2bac545fe6`.
- Canonical evidence: `.ai/harness/runs/run-20260922T150319-21443-20260922-1417-akn03b-windows-fixture.json`; 30/30 criteria passed.
- Installed-package check: execution `vx-c872ed06cf9e4e8d9d80`, exit 0, 23.9 seconds; includes successful mapped status plus authorization/context/session checks.
- External review request was rejected before provider invocation with `review_budget_exhausted`: this work-package already consumed its one semantic review and requires owner acceptance after repairs. No third provider attempt or substitute acceptance was used.
- Earlier `reject` remains historical; current corrected subject is pending owner acceptance. No main merge, real Host grant, Campaign, or global runtime installation.

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: ancienttwo
> **Reviewed Subject SHA256**: sha256:25dc1cd91acb024a7824139f30a43cebf2cbd230480c655db8433d2bac545fe6
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 0d4371c3f95e63851f4e083718f3337bf9646345
> **Verification Evidence SHA256**: sha256:61d1750ee93c2bc7c10b47e1592f5ae48b2602f7160fcaeadf4fae7ad45460c4
> **Issued At**: 2026-09-22T07:31:53.293Z

- Summary: Owner explicitly approved the corrected PR #437 candidate subject sha256:25dc1cd91acb024a7824139f30a43cebf2cbd230480c655db8433d2bac545fe6 after 30/30 canonical criteria and the one-review budget rejection. Accept the expiry publication fence, encoded 64 KiB total-record contract, Windows fixture and installed-package evidence; permit PR update and downstream integration. Main merge, global install, native Host admission, Campaign and real canary remain outside this approval.
- Findings: none

