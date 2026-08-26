> **Archived**: 2026-08-27 02:53
> **Related Plan**: plans/archive/plan-20260827-0229-hrd09-fixture-home-isolation.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260827-0253

# Task Review: hrd09-fixture-home-isolation

> **Status**: Accepted
> **Plan**: plans/plan-20260827-0229-hrd09-fixture-home-isolation.md
> **Contract**: tasks/contracts/20260827-0229-hrd09-fixture-home-isolation.contract.md
> **Notes File**: tasks/notes/20260827-0229-hrd09-fixture-home-isolation.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-27 02:36
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:8a48a87d4183098e73ae4f89c74fed8f1767410bd1f5272e245d4ec977b74183
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 419fee31fdc034dd7985ff3c65fea4beb16b0213

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
> **Reviewed Subject SHA256**: sha256:8a48a87d4183098e73ae4f89c74fed8f1767410bd1f5272e245d4ec977b74183
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 419fee31fdc034dd7985ff3c65fea4beb16b0213
> **Verification Evidence SHA256**: sha256:36c5b025abf81773752c8a8a6cc2a780e489dc907f2b929aa1cf05590d18c2ce
> **Issued At**: 2026-08-26T18:53:22.977Z

- Summary: Claude review passed the HRD-09 fixture HOME isolation subject. Root cause proven before the fix: the fixture pointed HOME at the repo under test, so Bun's transpile cache under HOME/Library/Caches/bun (329 .pile files) entered the changed set that architecture-drift.ts:193 builds with git status --untracked-files=all; stop-handler.ts:713 then spawned one CLI per changed path at roughly 0.62s per path, driving the Stop.default route to 170-205s against the 120s budget declared at :189, a boundary coin-flip that also reproduces on 50a127ad. The fix gives the fixture its own mkdtemp HOME outside the repo and removes it in teardown, preserving the original intent of isolating the real ~/.claude and ~/.codex. Measured 120055.84ms timeout before versus 3.72s and 3.28s across two runs after; the contract gate re-ran the file at 3053ms with bun run check:type green and total=7 failed=0 Fulfilled.
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
