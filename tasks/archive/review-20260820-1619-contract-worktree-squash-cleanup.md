> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260731-0952-contract-worktree-squash-cleanup.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1619

# Task Review: contract-worktree-squash-cleanup

> **Status**: Pending
> **Plan**: plans/plan-20260731-0952-contract-worktree-squash-cleanup.md
> **Contract**: tasks/contracts/20260731-0952-contract-worktree-squash-cleanup.contract.md
> **Notes File**: tasks/notes/20260731-0952-contract-worktree-squash-cleanup.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-31 09:52
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
> **Reviewed Subject SHA256**: sha256:c064a8ad3614c05c06ec7c9ada51cb85d2c35449d7bb4f1dfaf5a5f8edd8a4b6
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 83792a815d0fca3eea1f9e73a4f8e4d6ea8cdd2b
> **Verification Evidence SHA256**: sha256:e3bf999e0b76c020638da45223c1379b43fa66eb99dcb29af2031faaaf44c726
> **Issued At**: 2026-07-31T02:43:55.631Z

- Summary: gatekeeper PASS. cleanup previously refused every squash-merged contract worktree because its merged check was ancestry-based, and squash merge makes the branch commits non-ancestors of main even though the content landed; with squash as this repo's standard ship path that left the safety gate permanently unusable. The fix keeps the original ancestry check and adds a content-absorption check alongside it, so a branch is accepted when either holds and is still refused when neither does. Both arms were verified fail-closed rather than one masking the other, the errexit trap around the new check was exercised so a failing probe cannot be read as absorbed, and the behavior was re-verified against all four real worktrees left over from this ship sequence. This run recorded 17/17 exit criteria green including the full Root Cause Evidence gate, allowed_paths clean at 9 files, and full suite green.
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
