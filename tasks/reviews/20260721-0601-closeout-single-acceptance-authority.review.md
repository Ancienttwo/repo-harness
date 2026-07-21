# Task Review: closeout-single-acceptance-authority

> **Status**: Pending
> **Plan**: plans/plan-20260721-0601-closeout-single-acceptance-authority.md
> **Contract**: tasks/contracts/20260721-0601-closeout-single-acceptance-authority.contract.md
> **Notes File**: tasks/notes/20260721-0601-closeout-single-acceptance-authority.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-21 07:28
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change
- Intended files changed: acceptance contract, closeout consumers, provider-free merge seal, CI guardrails, generated mirrors, docs, and focused fixtures
- Actual files changed: within the contract `allowed_paths`; no concurrent worktree files were absorbed
- Commands passed: focused acceptance/seal 7/7; hook runtime 71/71; affected doc/parity suites 31/31; type/helper/hook projections; mandatory repository checks via the source CLI
- Residual risks: semantic acceptance has not yet been recorded; PATH-installed CLI remains pre-cutover until this package is installed/released
- Reviewer action required: inspect the frozen semantic diff once and record the typed disposition
- Rollback: revert the single package before HRD-08 and discard host-owned receipt/seal state

## Mode Evidence

- Selected route: Waza `/think` -> approved work-package execution
- P1/P2/P3 evidence: captured in the source plan and reflected in the single-authority cutover
- Root cause or plan evidence: duplicate Claude authority in the old `merge-gate` path plus prose-only waiver handling

## Verification Evidence

- Waza `/check` run: pending semantic reviewer boundary
- Commands run: see implementation notes evidence links
- Manual checks: four deterministic acceptance conditions verified; typed semantic disposition pending
- Supporting artifacts: focused tests, full-suite transcript, source CLI workflow check
- Implementation notes reviewed: `tasks/notes/20260721-0601-closeout-single-acceptance-authority.notes.md`
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] A complete closeout fixture records exactly one provider invocation and no duplicate final verification for the same subject
  - Evidence: `tests/merge-gate.test.ts` keeps the fixture provider counter at exactly `1` across seal creation and verification.
- [x] user_waiver remains distinct from external_pass and succeeds only when the contract allows it
  - Evidence: `tests/acceptance-receipt.test.ts` covers allowed and forbidden policy branches.
- [x] review-only and lifecycle-only changes preserve acceptance; semantic changes and overlapping target movement invalidate it
  - Evidence: `tests/acceptance-receipt.test.ts` and `tests/merge-gate.test.ts` cover subject and overlap matrices.
- [x] one PR commit matches only the pull_request CI trigger, not a codex branch push trigger
  - Evidence: `tests/unit/closeout-runner-guardrails.test.ts` checks the CI trigger and concurrency contract.

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

- `merge-gate` no longer imports or invokes a provider; it consumes the receipt and emits an exact local seal.
- Review prose mutations are lifecycle-only projection changes; semantic source mutations invalidate the bound subject.
- Claude partial finding fixed: post-freeze verification now diffs from `seal.head_sha`, not an undefined `receipt` variable.
- Claude partial finding fixed: strict archive envelopes are normalized before plan/contract authority comparison.

## Residual Risks / Follow-ups

- The current PATH-installed CLI does not yet contain `acceptance-receipt.ts`; use the source CLI in this worktree until installation/release.
- External semantic acceptance remains pending: `fable` was quota-blocked and the one `opus` fallback timed out without a final disposition. Partial transcript findings were fixed but were not promoted to PASS.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- Typed acceptance disposition is still unavailable after the bounded Claude attempt.

## Retest Steps

- Re-run: `bun test tests/acceptance-receipt.test.ts tests/merge-gate.test.ts`
- Re-check: record one contract-frozen semantic disposition, then run final receipt verification and local seal.

## Summary

- Implementation and deterministic verification are complete after fixing both recovered Claude findings; a fresh semantic disposition is the remaining closeout boundary.
