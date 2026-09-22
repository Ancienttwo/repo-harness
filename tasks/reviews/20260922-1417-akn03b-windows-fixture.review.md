# Task Review: akn03b-windows-fixture

> **Status**: Pending
> **Plan**: plans/plan-20260922-1417-akn03b-windows-fixture.md
> **Contract**: tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md
> **Notes File**: tasks/notes/20260922-1417-akn03b-windows-fixture.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-22 14:17
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Substantive Change SHA256**: `sha256:237b8a1dd5db2c8c73c9c4c9199f1eda15f36b2973a20e343f9763b170cf00dc`

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
