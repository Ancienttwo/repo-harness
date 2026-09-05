> **Archived**: 2026-09-05 23:07
> **Related Plan**: plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260905-2307
> **Archive Projection V1**: `plans/plan-20260905-1841-campaign-authoring-budget-prerequisite.md` => `plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/notes/20260905-1841-campaign-authoring-budget-prerequisite.notes.md` => `tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1841-campaign-authoring-budget-prerequisite.contract.md` => `tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1841-campaign-authoring-budget-prerequisite.review.md` => `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md`

# Task Review: campaign-authoring-budget-prerequisite

> **Status**: Accepted
> **Plan**: plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md
> **Contract**: tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md
> **Notes File**: tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-05 18:42
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:5256b1ab309c03ff3817e407b51f9c6f41c7855adc3803701dbe2db4c12688f8
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 8fc36ca1ec86bc52449855ead960aafcc711ab1b

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
> **Reviewed Subject SHA256**: sha256:5256b1ab309c03ff3817e407b51f9c6f41c7855adc3803701dbe2db4c12688f8
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 8fc36ca1ec86bc52449855ead960aafcc711ab1b
> **Verification Evidence SHA256**: sha256:f2c8aa958846899c4616e5f4006813df79505602cb1c8b208d12286d80ccae93
> **Issued At**: 2026-09-05T15:07:28.286Z

- Summary: User approved Owner Acceptance of repaired P1/P2 and merge to main. Full suite passed on frozen implementation; current-main integration and final focused criteria passed. Goal checklist finalized without changing product scope.
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

## Formal review transcript (verbatim)

```json
{
  "verdict": "needs-attention",
  "summary": "Do not ship yet: existing reservations become unreadable, and confirmed not-started authoring attempts cannot be retried through the effect.",
  "findings": [
    {
      "severity": "high",
      "title": "Required campaign context breaks existing non-campaign reservations",
      "body": "Reservations written by the pinned base omit campaign_context. The new validator passes that undefined value into validateCampaignAutomationReservationContext and throws; a read-only reproduction confirmed this. This also affects non-campaign runs: outstanding reservations cannot be reconciled, and ledger reconstruction fails when it encounters historical records. The documented replacement policy addresses old campaign grants, not all existing automation reservations.",
      "file": "src/core/automation/budget.ts",
      "line_start": 1068,
      "line_end": 1070,
      "confidence": 0.99,
      "recommendation": "Provide an explicit versioned cutover or one-shot migration for existing reservation ledgers, preserving digest-linked evidence. Add coverage for reading and reconciling a reservation produced by the pinned base."
    },
    {
      "severity": "medium",
      "title": "Not-started reconciliation cannot unblock the authoring effect",
      "body": "The effect derives its reservation key solely from immutable request content and rejects every replay. If budget admission succeeds but campaign-step's subsequent journal CAS fails before browser invocation, explicit reconciled_not_started settlement releases the round, yet retrying the same follow-up generates the same key and is rejected forever. Changing the heartbeat idempotency key does not help because it is absent here. The new unit test avoids this failure by manually supplying a different replacement key, which the effect API cannot do.",
      "file": "src/effects/automation/gpt-pro-issue-authoring.ts",
      "line_start": 170,
      "line_end": 174,
      "confidence": 0.98,
      "recommendation": "Support a durable replacement attempt keyed to verified not-started reconciliation while retaining replay refusal for unknown or completed calls. Test admission followed by journal CAS failure, reconciliation, and successful effect retry."
    }
  ],
  "next_steps": []
}
```

## Parent post-fix evidence

- P1 fixed: original generic reservation kind has exact original fields/digest; distinct campaign kind requires context. The store verifies kind against anchored grant on reads and admission. Pinned-base identity and negative discriminator tests pass.
- P2 fixed: under the existing run lock, only a validated not-started settlement authorizes a derived replacement attempt. Same-key race admits one replacement; campaign-step journal refusal -> explicit not-started reconciliation -> same-key retry executes the provider once. Completed/unknown attempts remain non-executable replays.
- Full suite passed at c2ed377a in canonical `run-20260905T210102-90177`; final contract evidence prepared successfully in `run-20260905T212755-54698`. Typecheck, boundary check, focused recovery/inclusion/state suites, and six integrity checks pass.
- The external review above remains its original FAIL. This is parent verification of the fixes, not a second external review or an acceptance receipt. Owner Acceptance is pending.
