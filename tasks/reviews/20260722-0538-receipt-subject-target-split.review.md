# Task Review: receipt-subject-target-split

> **Status**: Pending
> **Plan**: plans/plan-20260722-0538-receipt-subject-target-split.md
> **Contract**: tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md
> **Notes File**: tasks/notes/20260722-0538-receipt-subject-target-split.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-22 05:38
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: bugfix
- Intended files changed: assets/hooks/lib/workflow-state.sh, .ai/hooks/lib/workflow-state.sh, src/cli/hook/prompt-handler.ts, tests/workflow-state-lib.test.ts, tests/prompt-handler.test.ts, plus lifecycle docs
- Actual files changed: assets/hooks/lib/workflow-state.sh, .ai/hooks/lib/workflow-state.sh, src/cli/hook/prompt-handler.ts, tests/workflow-state-lib.test.ts, tests/prompt-handler.test.ts, plans/plan-20260722-0538-receipt-subject-target-split.md, tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md, tasks/reviews/20260722-0538-receipt-subject-target-split.review.md, tasks/notes/20260722-0538-receipt-subject-target-split.notes.md
- Commands passed: see Verification Evidence below
- Residual risks: none identified beyond those recorded in the plan's Risk Assessment
- Reviewer action required: inspect diff and card; no external acceptance review has run yet
- Rollback: revert branch codex/receipt-subject-target-split

## Mode Evidence

- Selected route: orchestrator-dispatched bugfix, decision-complete on arrival (root cause pre-proven by a prior diagnosis pass)
- P1/P2/P3 evidence: see plan Agentic Routing section
- Root cause or plan evidence: see this contract's Root Cause Evidence section and the plan's Callsite Sweep table

## Verification Evidence

- Waza `/check` run: not run (orchestrator will route acceptance separately)
- Commands run: `bun test tests/workflow-state-lib.test.ts` (red pre-fix, green post-fix), `bun test tests/prompt-handler.test.ts` (red pre-fix, green post-fix), full `bun test`, `bun run check:type`, `bun run check:hooks`, `bun run check:helpers`, `repo-harness run check-task-workflow --strict`, `contract-run preflight --json`, `repo-harness run verify-sprint --prepare-acceptance`
- Manual checks: re-verified the reported root cause directly against source before changing anything; swept every `workflow_target_branch`/`merge_back.target`/`review-subject --target` callsite in the repo
- Supporting artifacts: `.ai/harness/runs/receipt-subject-target-split-pre-fix.log`
- Implementation notes reviewed: tasks/notes/20260722-0538-receipt-subject-target-split.notes.md
- Run snapshot: .ai/harness/runs/

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:3a09d8b17395047d341b461a4d5fdba5f2af103b76b17c4d35e8d45ed7b46048
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 61b5ec5960bd5bd763a0c02ebadbe37cba5a2c5f
> **Verification Evidence SHA256**: sha256:f0476340034abbeff1537a4a429b81788c61e8d75abe9b0b58a60318218933a1
> **Issued At**: 2026-07-21T21:53:15.453Z

- Summary: Recorder now resolves the same review_base policy key the validator diffs against, fail-closed with no fallback; full callsite sweep keeps genuine merge-back mechanics on merge_back.target; red-then-green fixture with local main one commit behind origin/main proves recorder==validator; 22/22 exit criteria Fulfilled.
- Findings: none

## Behavior Diff Notes

- Recorder (`workflow_current_review_subject_json`) now resolves `.worktree_strategy.review_base` instead of `.worktree_strategy.merge_back.target`, fail-closed (no output) when unset/empty.
- `prompt-handler.ts`'s `[AcceptanceSubject]` advisory hint now names the same subject the real acceptance-receipt validator will require.
- No other callsite's behavior changed; the sweep confirmed every other `merge_back.target` read is genuine merge-back mechanics.

## Residual Risks / Follow-ups

- None identified. The one behavioral change (fail-closed instead of defaulting) only fires when `review_base` is missing/empty, which this repo's own policy.json and the adoption scaffolds already populate by default.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | Pending external review |
| Product depth | 0/10 | Pending external review |
| Design quality | 0/10 | Pending external review |
| Code quality | 0/10 | Pending external review |

## Failing Items

- ...

## Retest Steps

- Re-run: `bun test tests/workflow-state-lib.test.ts tests/prompt-handler.test.ts`, full `bun test`
- Re-check: `repo-harness run verify-sprint --prepare-acceptance`

## Summary

- Implementation complete and fully verified from the executor's side (red-then-green regression guards, full suite green, all named checks green); awaiting external acceptance review and AcceptanceReceipt recording, which is out of this task's scope.
