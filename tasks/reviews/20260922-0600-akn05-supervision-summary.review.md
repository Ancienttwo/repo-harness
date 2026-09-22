# Task Review: AKN-05a repository automation supervision

> **Status**: Accepted
> **Plan**: plans/plan-20260922-0600-akn05-supervision-summary.md
> **Contract**: tasks/contracts/20260922-0600-akn05-supervision-summary.contract.md
> **Notes File**: tasks/notes/20260922-0600-akn05-supervision-summary.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Recommendation**: pass
> **Substantive Change SHA256**: `sha256:b96e1395cb28a4b34ca0a773df7590727794470e199ddbc1904bdef1c82c85cd`

## Local evidence

Original automation observations are displayed through the strict scoped endpoint. The existing Task worklist, Composer fences, drafts and ACK behaviour remain under their previous authority. UI regressions, type/browser build and integrity evidence are recorded under `.ai/harness/runs/akn05-supervision-summary/`.

Read-only production-bundle fixture preview verified wide/narrow English/Chinese and expanded original budget evidence, with no page overflow. This is local verification only. The user authorized local indexing for this worktree. CodeGraph indexed 1,189 files; deterministic projection updates only the manifest, with no human actions or refresh signals. Canonical verification, semantic acceptance and PR remain pending. The one independent review returned needs-attention and is recorded as reject; no advisory PASS overrides its verdict.

Final targeted result:125 tests passed,0 failed,700 assertions across the four owning UI suites. Typecheck and production browser build passed. All nine root integrity checks passed after binding the final substantive digest in this review; the initial task-sync refusal is preserved in its log.

## Independent review transcript

```json
{
  "verdict": "needs-attention",
  "summary": "Do not ship yet: pagination can silently omit steers, and valid message bodies can break activity reads. 86 pure tests passed; web decoder tests were blocked by missing React.",
  "findings": [
    {
      "severity": "medium",
      "title": "Pagination uses incompatible UUID orderings",
      "body": "Steers are sorted with localeCompare but filtered against the cursor using code-point ordering. Both uppercase and lowercase UUIDs are accepted. With valid IDs starting with lowercase 'a' and uppercase 'B', a one-item page returns 'a' first, then the next page excludes 'B' and reports complete coverage. This silently hides an unprocessed steer.",
      "file": "src/effects/fleet/task-inbox.ts",
      "line_start": 1221,
      "line_end": 1223,
      "confidence": 1,
      "recommendation": "Use the same code-point comparator for sorting and cursor filtering. Add a pagination regression with mixed-case UUIDs that verifies every stored steer appears exactly once."
    },
    {
      "severity": "medium",
      "title": "Activity decoding rejects bodies accepted by the write protocol",
      "body": "validEvent applies text(), which requires a nonempty string, to the message body. The canonical TaskMessage validator and engineer_task_reply accept an empty body. A successfully persisted empty reply therefore makes any activity page containing it fail decoding; readOperatorTaskActivity converts that failure into unavailable, producing HTTP 503 instead of returning the history. The source-accepts/reader-rejects mismatch was reproduced.",
      "file": "src/core/operator/task-activity.ts",
      "line_start": 78,
      "line_end": 84,
      "confidence": 1,
      "recommendation": "Validate bodies using the canonical protocol's string and UTF-8 byte constraints, including empty strings. Add coverage that reads a persisted empty reply through the activity endpoint."
    }
  ],
  "next_steps": [
    "Fix both reader inconsistencies and add focused regression coverage."
  ]
}
```

The findings belong to the AKN-03b inbox reader and AKN-04b activity protocol. Preserve this rejection and correct those owning scopes before rebinding the candidate. This contract has consumed its independent review.

## Corrected candidate

The two findings were reproduced before production edits, with PRE_FIX_EXIT=1. Owning commits bd557f81 (steer pagination) and07c5ea0a (empty activity bodies) are integrated. The owning suites passed23/23 and11/11 respectively; final canonical verification also includes both suites. The original reject disposition remains immutable. Corrected-subject owner acceptance is still required; no second independent review is performed.

## Corrected canonical verification

Candidate ef70e8d7; normalized subject `sha256:dd37050e8aa4b370cad2d1195491f7620844dea0cd4a024a733d0623f2fbfc19`. Final canonical run `.ai/harness/runs/run-20260922T064358-47626-20260922-0600-akn05-supervision-summary.json` passes21/21 criteria, zero failures, including both corrected dependency suites and all required integrity checks. Architecture materialization is noop and the source stayed frozen. Semantic acceptance remains pending; the previous reject receipt is retained.

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: ancienttwo
> **Reviewed Subject SHA256**: sha256:dd37050e8aa4b370cad2d1195491f7620844dea0cd4a024a733d0623f2fbfc19
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 0d4371c3f95e63851f4e083718f3337bf9646345
> **Verification Evidence SHA256**: sha256:ecce2f4aa9674102ee143e84b7c916cc1c164582a470c7fb8341687606792399
> **Issued At**: 2026-09-22T06:02:06.299Z

- Summary: Contract owner approved the pending AKN-03b, AKN-04a and AKN-05a owner acceptance requests on 2026-09-22 after corrected canonical verification. No merge or runtime installation authorization.
- Findings: none
