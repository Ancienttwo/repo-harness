# Task Review: herdr-generic-review-slice-e

> **Status**: Pending
> **Plan**: plans/plan-20260930-1827-herdr-generic-review-slice-e.md
> **Contract**: tasks/contracts/20260930-1827-herdr-generic-review-slice-e.contract.md
> **Notes File**: tasks/notes/20260930-1827-herdr-generic-review-slice-e.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-10-02 06:31
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change / Receipt schema migration
- Intended files changed: scripts/acceptance-receipt.ts, helper projection, existing Receipt consumers/tests and workflow artifacts.
- Actual files changed: bounded contract allowed paths; no source/test deletions, no default/main/user-config edits.
- Check IDs and evidence disposition: Gatekeeper FAIL corrections are implemented; current canonical cache is .ai/harness/runs/review-design/gate-fix-required-final/results.json. Focused final-tree verification: 229 pass / 0 fail / 2538 assertions, 17 existing files; check:type plus all nine Required Checks and CI-style task-sync pass; RUN3 both large cases collected, cap17/17, custom-profile zeroSandbox passed.
- Residual risks: staged Receipt source change intentionally rejects obsolete source callers; E2 replacement still pending inventory review; git --output hole, complete input ingestion, hooks/campaign/production sandbox and other UNVERIFIED facts are nonblocking follow-ups per user scope.
- Reviewer action required: inspect launcher-independent binding/verifier diff, tamper evidence and DELETE/EDIT/RETAIN inventory; this artifact remains Pending/fail until real review, not an invented PASS.
- Rollback: revert the Receipt schema/writer/verifier, helper and test delta together before new-source admission; retain observed runtime evidence. No commit/push/merge performed.

## Mode Evidence

- Selected route:
- P1/P2/P3 evidence:
- Root cause or plan evidence:

## Verification Evidence

Follow [Testing Policy and Artifact Standards](../../../../docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards).
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

## Gatekeeper FAIL correction disposition (zero-model)

- Recorded gate verdict: FAIL, not PASS. Named production source consumers and projections migrated to generic-review without alias; positive fixture consumers migrated with them.
- Six required binding tamper cases assert their own field-specific message; stored claude-review/codex-review Receipts fail the production readReceipt path with source is invalid.
- Removed the unused policy parameter; deep-reasoner is the single closed domain-role constant required by the approved plan, not a new fleet configuration. The verifier requires the owner-held domain Result for digest and metadata comparison; external CLI callers supply it via --review-result.
- CRITICAL interim ship blocker remains: legacy claude-review-session caller is intentionally unpatched and must be removed in the same PR as generic wiring before ship. Its exclusive suite is planned for deletion/replacement; no expensive legacy model test is enabled.
- No files deleted, committed or pushed; no provider/model process started in this correction pass. Gatekeeper must re-review; this review remains Pending/fail.
