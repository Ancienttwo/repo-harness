> **Archived**: 2026-09-06 01:16
> **Related Plan**: plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260906-0116
> **Archive Projection V1**: `plans/plan-20260905-1835-brc6-adoption-atomic-materialization.md` => `plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/notes/20260905-1835-brc6-adoption-atomic-materialization.notes.md` => `tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1835-brc6-adoption-atomic-materialization.contract.md` => `tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1835-brc6-adoption-atomic-materialization.review.md` => `tasks/archive/review-20260906-0116-brc6-adoption-atomic-materialization.md`

# Task Review: brc6-adoption-atomic-materialization

> **Status**: Accepted
> **Plan**: plans/archive/plan-20260905-1835-brc6-adoption-atomic-materialization.md
> **Contract**: tasks/archive/contract-20260906-0116-brc6-adoption-atomic-materialization.md
> **Notes File**: tasks/archive/notes-20260906-0116-brc6-adoption-atomic-materialization.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-05 23:22
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:a257ccae789261dd27787f40af34bbb5943fe36f12861d427ba74e7042b339f9
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 5a6a2121a76e2da9b286359d786cc9938ddeae83

## Human Review Card

- Verdict: pending
- Change type: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | frontend
- Intended files changed:
- Actual files changed:
- Commands passed:
- Residual risks:
- Reviewer action required: inspect diff and card
- Rollback:

## Mode Evidence

- Selected route:
- P1/P2/P3 evidence:
- Root cause or plan evidence:

## Verification Evidence

- Waza `/check` run:
- Commands run:
- Manual checks:
- Supporting artifacts:
- Implementation notes reviewed:
- Run snapshot:

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: ancienttwo
> **Reviewed Subject SHA256**: sha256:a257ccae789261dd27787f40af34bbb5943fe36f12861d427ba74e7042b339f9
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 5a6a2121a76e2da9b286359d786cc9938ddeae83
> **Verification Evidence SHA256**: sha256:e594fcbc9e493a32d1d24f0ca7fc4ed92b074fc50d947bf156cade58cc859cbe
> **Issued At**: 2026-09-05T17:14:16.030Z

- Summary: Owner explicitly approved merging repaired BRC6 candidate 5865ca14 after full baseline PASS and final canonical prepare 15/15 PASS; formal review finding fixed with passing recovery tests.
- Findings: none

## Behavior Diff Notes

- ...

## Residual Risks / Follow-ups

- ...

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- ...

## Retest Steps

- Re-run:
- Re-check:

## Summary

- ...

## Independent Review Transcript

Provider: codex-plugin. Reviewed HEAD d5586e2f; target 5a6a2121. Original verdict is FAIL; later fixes are not relabeled as an external pass.

```json
{
  "verdict": "needs-attention",
  "summary": "Do not ship: a premature adoption attempt can permanently block an otherwise recoverable campaign group.",
  "findings": [
    {
      "severity": "high",
      "title": "Freeze source revisions only when the group can actually seal",
      "body": "The immutable seal-sources artifact is persisted before sealCampaignAuthoringBudget checks exhaustion or unresolved invocations. For example, adopting a partial batch after round 1 of 3 writes its source revisions, then rejects because rounds remain. Further authorized authoring can fill the missing slots, but retrying adoption now attempts to overwrite seal-sources with different bytes and fails with issue_batch_conflict. Thus an expected premature-adoption rejection permanently poisons subsequent adoption for that intent. The existing partial-batch test checks only the first rejection and misses recovery.",
      "file": "src/effects/automation/issue-batch-adoption.ts",
      "line_start": 201,
      "line_end": 203,
      "confidence": 0.99,
      "recommendation": "Coordinate seal eligibility, source-baseline persistence, and terminal creation so a rejected seal leaves no immutable baseline, while preserving crash recovery and post-seal drift checks. Add a regression covering partial adoption rejection, subsequent authorized slot creation, and successful retry."
    }
  ],
  "next_steps": [
    "Fix the failed-seal recovery path and add its effect-level regression. The 15 focused unit tests passed but do not cover this transition."
  ]
}
```
