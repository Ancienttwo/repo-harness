# Task Review: brc10-planning-lock-timeout

> **Status**: Pending
> **Plan**: plans/plan-20261002-1758-brc10-planning-lock-timeout.md
> **Contract**: tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md
> **Notes File**: tasks/notes/20261002-1758-brc10-planning-lock-timeout.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-10-02 17:58
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | frontend
- Intended files changed:
- Actual files changed:
- Check IDs and evidence disposition:
- Residual risks:
- Reviewer action required: inspect diff and card
- Rollback:

## Mode Evidence

- Selected route:
- P1/P2/P3 evidence:
- Root cause or plan evidence:

## Verification Evidence

Follow [Testing Policy and Artifact Standards](../../docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards).
Consume canonical evidence; do not rerun checks to populate this review or
copy the executable plan. Return missing/stale evidence to its execution owner.

- Waza `/check` review reference, when required:
- Check IDs and disposition (executed / exact reuse / baseline with delta / failed / missing / not run):
- Verified subject, relevant environment and immutable execution references:
- Historical baseline and current delta references, if applicable:
- Manual observations, failures and coverage limitations:
- Implementation notes reviewed, if present:
- Run snapshot:

## Manual Check Evidence

Copy each non-built-in contract `manual_checks` requirement exactly. Check it only after
the observation is complete and replace the placeholder with concrete command output,
screenshot/artifact path, or reviewer observation.

- [ ] Exact manual_checks requirement
  - Evidence: concrete observation, command output, screenshot path, or reviewer note

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
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

## Worker verification material (not an acceptance verdict)

- Root cause: recoverCampaignDispatch held planning.lock6092ms, including1514ms of final readback/settlement after durable recovered publication, beyond existing5000ms wait budget.
- Repair: keep exact recovery intent/generation/rebind/recovered publication and crash hooks under the group journal lock; existing live-authority and independently locked idempotent final settlement follows lock release. Single production source file,7insertions/3deletions.
- Regression: existing brc10 test unchanged. Pre-fix guard exit1; instrumented repaired guard exit0; final normal and low entire-file checks exit0; brc10 in4-file pool13pass/0fail/4skip.
- Canonical14/14 verification passed; full457files5737pass/0fail/81skip, typecheck/integrity exit0. Frozen target/report/source hashes and actual commands are in notes. Workflow-result metadata was added afterwards; no changed source/test input.
- Rollback: revert only local repair/artifacts; preserve existing journals/Lease evidence. Owner authorizes local commit only.
- Reviewer/AcceptanceReceipt/Recommendation/verdict are not filled by worker; no independent acceptance is claimed.
