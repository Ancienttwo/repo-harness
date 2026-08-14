# Task Review: contract-worktree-single-publication

> **Status**: Pending
> **Plan**: plans/plan-20260814-1629-contract-worktree-single-publication.md
> **Contract**: tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md
> **Notes File**: tasks/notes/20260814-1629-contract-worktree-single-publication.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-14 16:29
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change
- Intended files changed: contract-worktree merge publication, journal recovery, helper projections, focused tests, reference and architecture projections, workflow artifacts
- Actual files changed: within the contract `allowed_paths`; `git diff --check` passes
- Commands passed: focused 142-test closeout suite; `bun run check:type`; deploy SQL, architecture sync, task sync, strict workflow, state inspection, init dry-run; strict contract verification (20/20)
- Residual risks: full suite remains red on six environment-sensitive ArchContext/global-runtime bootstrap tests outside the changed paths; external semantic acceptance is pending authorization
- Reviewer action required: authorize external Claude review or provide the contract-allowed typed user waiver
- Rollback: revert the single work-package publication commit; receipt schemas and no-merge behavior are unchanged

## Mode Evidence

- Selected route: hunt / bugfix
- P1/P2/P3 evidence: helper publication boundary mapped; finish path traced from verified lifecycle HEAD through merge seal, synthesized commit, target update, and crash recovery; decision preserves source recovery authority while reducing public history to one work-package commit
- Root cause or plan evidence: contract Root Cause Evidence plus pre-fix red artifact

## Verification Evidence

- Waza `/check` run: equivalent focused and strict contract checks passed; external acceptance not recorded
- Commands run: see Human Review Card and contract verifier output
- Manual checks: target parent equals frozen base; target tree equals verified lifecycle tree; source HEAD is not target ancestor; target movement and wrong-tree injection fail closed
- Supporting artifacts: `.ai/harness/runs/contract-worktree-single-publication-pre-fix.txt`
- Implementation notes reviewed: yes
- Run snapshot: `.ai/harness/checks/latest.json` pending final AcceptanceReceipt projection

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

- `finish --merge` now publishes one synthesized target commit instead of fast-forwarding checkpoint and lifecycle topology.
- `finish --no-merge`, AcceptanceReceipt semantics, merge-seal source authority, and source branch history remain unchanged.

## Residual Risks / Follow-ups

- Final external semantic disposition is not yet authorized.
- Six unrelated environment-sensitive full-suite cases remain red; all tests on the changed publication path pass.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Positive and negative publication paths are covered; external acceptance pending. |
| Product depth | 9/10 | Public-history rule is semantic, not line-count heuristic. |
| Design quality | 9/10 | One publication authority; source recovery topology remains intact. |
| Code quality | 9/10 | Focused suites, crash windows, projections, and strict contract checks pass. |

## Failing Items

- AcceptanceReceipt unavailable until external review is authorized or the user explicitly grants a typed waiver.
- Full `bun test`: six ArchContext/global-runtime bootstrap cases fail outside the changed paths.

## Retest Steps

- Re-run: `bun test tests/contract-worktree-single-publication.test.ts tests/contract-worktree-closeout-journal.test.ts tests/helper-scripts.test.ts`
- Re-check: `repo-harness run verify-contract --contract tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md --strict`

## Summary

- Implementation is locally verified and ready for the contract-frozen independent acceptance step; merge remains blocked until that receipt exists.
