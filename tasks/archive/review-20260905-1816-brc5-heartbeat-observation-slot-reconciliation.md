> **Archived**: 2026-09-05 18:16
> **Related Plan**: plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260905-1816
> **Archive Projection V1**: `plans/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md` => `plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/notes/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.notes.md` => `tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.contract.md` => `tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1156-brc5-heartbeat-observation-slot-reconciliation.review.md` => `tasks/archive/review-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md`

# Task Review: brc5-heartbeat-observation-slot-reconciliation

> **Status**: Accepted
> **Plan**: plans/archive/plan-20260905-1156-brc5-heartbeat-observation-slot-reconciliation.md
> **Contract**: tasks/archive/contract-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md
> **Notes File**: tasks/archive/notes-20260905-1816-brc5-heartbeat-observation-slot-reconciliation.md
> **Checks File**: .ai/harness/checks/latest.json
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:b382c8b493ae1cc35a0d26e0a9d3526d4ae3d92f31cc50a5bb25a3bfd28b5ac7
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 0ca0cffb3512bb3e0dcd7b9fe6fce8764f8f31d7

## Human Review Card

- Verdict: FAIL; one P1 and one P2 from the contract's codex-plugin reviewer.
- Frozen reviewed source: `d425a23d2b94618e387957a9fb6e3ad225c0ce44`.
- Functional goal: deterministic slot reconciliation, immutable observation evidence, persist-first heartbeat, and at most one external mutation per step.
- Prepared verification: `run-20260905T175020-87760`, all 21 criteria passed on this source/goal/contract/target.
- Historical full baseline: source `3958ce3f`, 4363 pass, 0 fail, 4 skip; not relabelled as a current-source pass.
- AcceptanceReceipt: unavailable. No merge or finish has been authorized by evidence yet.
- Required repairs: align metadata repair validity with allowed issue kinds; bind journal decisions and reservation CAS to the same snapshot so concurrent steps cannot duplicate one-shot edits.

## Independent Review Transcript

```json
{
  "verdict": "needs-attention",
  "summary": "Do not ship yet: authorized metadata repairs can permanently fail reconciliation, and concurrent steps can bypass the one-shot repair limit.",
  "findings": [
    {
      "severity": "medium",
      "title": "Use campaign-aware validity when accepting metadata repairs",
      "body": "For a bugfix-only intent, syntactically valid test_gap metadata is classified as slot_invalid and triggers edit_issue. After the authorized edit changes it to bugfix, this check treats the previous metadata as valid and throws issue_source_drift. A read-only reproduction confirmed this failure even with repaired_issue_ids supplied. Subsequent observations remain blocked by the persisted prior body.",
      "file": "src/core/automation/issue-batch-reconcile.ts",
      "line_start": 155,
      "line_end": 158,
      "confidence": 1,
      "recommendation": "Use the same campaign-aware metadata validity predicate for slot classification and repair exceptions, including allowed_issue_kinds. Add a regression covering repair from a forbidden kind to an allowed kind."
    },
    {
      "severity": "high",
      "title": "Bind the journal fingerprint to the state used for decisions",
      "body": "storedReservations and storedResults are read at line 347, but the expected journal fingerprint is independently reread here. Across processes, another step can complete an unsuccessful metadata edit between those reads. This step then captures the updated fingerprint while retaining results that omit that edit, selects edit_issue again, and passes the reservation CAS. The same issue can therefore receive a second external edit despite the explicit one-shot limit.",
      "file": "src/effects/automation/campaign-step.ts",
      "line_start": 402,
      "line_end": 407,
      "confidence": 0.96,
      "recommendation": "Capture the decision records and their fingerprint together under the campaign lock, then compare that exact fingerprint when reserving. Also enforce the per-issue repair limit from current records inside the reservation lock. Test two processes interleaving before fingerprint capture."
    }
  ],
  "next_steps": [
    "Fix both invariants and run focused metadata-repair and concurrent-reservation regressions."
  ]
}
```

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: ancienttwo
> **Reviewed Subject SHA256**: sha256:b382c8b493ae1cc35a0d26e0a9d3526d4ae3d92f31cc50a5bb25a3bfd28b5ac7
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 0ca0cffb3512bb3e0dcd7b9fe6fce8764f8f31d7
> **Verification Evidence SHA256**: sha256:8b3a8a79bdba2956e3f1cca8a510f30fac3b619679bed388174948e95f0c42ae
> **Issued At**: 2026-09-05T10:16:06.032Z

- Summary: User explicitly approved Owner Acceptance for repaired BRC5 candidate 553e679e after both review findings were fixed and all 21 final verification criteria passed; merge to main authorized.
- Findings: none

## Failing Items

- P1: stale decision records can be admitted against a freshly re-read journal fingerprint.
- P2: a forbidden issue kind is slot-invalid but incorrectly treated as valid prior metadata during authorized repair.

## Retest Steps

- Prove both fixes using targeted regression guards before and after changes.
- Refresh canonical current-subject acceptance with focused BRC5 and integration delta criteria; preserve previous full-suite evidence as baseline only.

## Finding resolution

Both findings are repaired in the candidate source. P2 shares campaign-aware metadata validity between classification and repair authorization (12 focused tests pass). P1 binds decision records and fingerprint to one locked snapshot and rechecks the one-shot edit limit at reservation (19 focused tests pass). Both regression guards failed before their respective production fixes. Canonical final verification passed all 21 criteria in `run-20260905T180128-36253` after both repairs; owner acceptance remains pending; the external verdict above is unchanged.
