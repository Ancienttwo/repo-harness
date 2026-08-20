> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260731-1056-contract-worktree-branch-delete.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1619

# Task Review: contract-worktree-branch-delete

> **Status**: Pending
> **Plan**: plans/plan-20260731-1056-contract-worktree-branch-delete.md
> **Contract**: tasks/contracts/20260731-1056-contract-worktree-branch-delete.contract.md
> **Notes File**: tasks/notes/20260731-1056-contract-worktree-branch-delete.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-31 10:56
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

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:80bc2f28eaba1dde5b268d28c8ed86a0a61e14cac20d7fe170ac51f8b82f4b90
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: a37c16e4393c374877b9472bd3d771c0862fab12
> **Verification Evidence SHA256**: sha256:06f5d71d65690f15b38b1ecdaf09b12f8fc743fbf099fd5c2bb920699ce48524
> **Issued At**: 2026-07-31T08:12:14.356Z

- Summary: gatekeeper PASS. The sibling squash-cleanup package taught the merge check to accept absorbed branches, but the deletion step still called git branch -d, which is itself ancestry-based, so cleanup half-completed on every squash-merged worktree: the worktree and metadata were removed and the branch was left orphaned, forcing a manual git branch -D that trains the operator to bypass the safety gate. The fix keeps -d for genuine ancestors and uses -D only on the branches the merge check already proved absorbed, so force is scoped to the case where safety was independently established rather than applied blanket. Force-boundary verified: an unmerged branch still takes -d and is still refused. Two adversarial cases were exercised, and the flag-unreachable analysis confirms no path reaches -D without a prior absorbed determination. This run recorded 17/17 exit criteria green including the full Root Cause Evidence gate, allowed_paths clean at 9 files, and full suite green.
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
