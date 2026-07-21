# Task Review: acceptance-waiver-grant

> **Status**: Review
> **Plan**: plans/plan-20260721-1531-acceptance-waiver-grant.md
> **Contract**: tasks/contracts/20260721-1531-acceptance-waiver-grant.contract.md
> **Notes File**: tasks/notes/20260721-1531-acceptance-waiver-grant.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-21 15:31
> **Recommendation**: pass
> **Review Rubric Version**: 2

## Human Review Card

- Verdict: pass. UserWaiverGrant separates the durable owner decision from exact receipt evidence without weakening subject invalidation.
- Boundary: one owner grant per stable contract/goal authority; exact receipts remain subject/evidence-bound.
- Full suite: 1766 pass / 1 skip / 2 transient `state-concurrency` fixture failures; immediate isolated rerun passed 11/11. Changed-surface and focused suites are green.

## Manual Check Evidence

- [x] A semantic change invalidates the old receipt before fresh verification
  - Evidence: `tests/acceptance-receipt.test.ts` test `reuses one owner grant after semantic correction while every receipt stays exact` asserts stale receipt and stale evidence failures before rematerialization.
- [x] The same valid contract/goal-bound grant can materialize the new exact receipt without another owner decision
  - Evidence: the same fixture asserts two distinct subject hashes share one unchanged `waiver_grant_sha256` after fresh checks are written.
- [x] Contract or goal authority changes invalidate the grant
  - Evidence: `tests/acceptance-receipt.test.ts` test `contract or goal authority changes invalidate the owner grant` covers both authority fingerprints.
- [x] user_waiver remains distinct from external_pass and merge authorization
  - Evidence: typed-waiver and revocation fixtures assert user disposition, grant fingerprint, direct-authoring rejection, and null grant binding for external pass; merge authorization is absent from the grant schema and commands.

## Acceptance Receipt Projection

> **Disposition**: user_waiver
> **Reviewer**: User
> **Source**: user-waiver
> **Actor**: kito
> **Reviewed Subject SHA256**: sha256:90df920736498ad9dd44847165fb0bc3d2819a7d4c2b53355083a8d26ecedeb7
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7581e4cfc6f16ddc113855e615d8af460afa8369
> **Verification Evidence SHA256**: sha256:34c57c9fb4df11d76a66ec8b12cc64cc2862d4f2d8fc5f225458bd07abf9c689
> **Issued At**: 2026-07-21T08:02:48.671Z

- Summary: Owner kito standing corrective-fix waiver covers this bounded authorization repair; accepts remaining risk without per-subject repetition.
- Findings: none
