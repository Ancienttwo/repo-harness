# Implementation Notes: receipt-subject-target-split

> **Status**: Active
> **Plan**: plans/plan-20260722-0538-receipt-subject-target-split.md
> **Contract**: tasks/contracts/20260722-0538-receipt-subject-target-split.contract.md
> **Review**: tasks/reviews/20260722-0538-receipt-subject-target-split.review.md
> **Last Updated**: 2026-07-22 05:38
> **Lifecycle**: notes

## Design Decisions

- Kept both `worktree_strategy.review_base` and `worktree_strategy.merge_back.target` as distinct, legitimate keys (per the dispatch's decided fix) rather than merging them into one: `merge_back.target` is genuinely a different concept (where finished work lands after merge) from `review_base` (what a review/acceptance subject diffs against). The defect was one function reading the wrong one, not the existence of two keys.
- `workflow_current_review_subject_json`'s fail-closed shape returns success with empty stdout (not a nonzero exit) when `review_base` is missing, matching the function's pre-existing contract (every caller already treats it as `2>/dev/null || true` / JSON-status-checked, never checks its raw exit code) -- this avoids introducing a new failure mode under `set -e` callers while still refusing to silently fall back to `base_branch`/`main`.
- `src/cli/hook/prompt-handler.ts`'s `currentTargetBranch` was renamed to `currentReviewBaseRef` rather than keeping the old name with new behavior: it has exactly one caller (the `[AcceptanceSubject]` advisory hint), so the old name was actively misleading once its resolution target changed from the merge destination to the review base. Fail-closed here means throwing (caught by the caller's pre-existing `/* advisory only */` try/catch), matching `reviewBase()`'s hard-error shape rather than a silent default.
- Full callsite sweep (grep `workflow_target_branch`, `.worktree_strategy.merge_back.target`, `review-subject --target`) is recorded in the plan's Callsite Sweep table; `src/effects/state/resolve-effective-state.ts` was found already correct (prioritizes `review_base`, falls back to `merge_back.target` then `base_branch` then `main`) and `scripts/merge-gate.ts` was found unaffected (takes `--base` as an explicit CLI argument, no policy-key resolution of its own for base-ref selection).
- Added one regression test per site: `tests/workflow-state-lib.test.ts` (the contract's formal `regression_guard`, a control-clone fixture with local `main` one commit behind `origin/main`) and `tests/prompt-handler.test.ts` (the `prompt-handler.ts` sibling, a two-diverged-local-branches fixture). Both captured red pre-fix, green post-fix.

## Deviations From Plan Or Spec

- PreToolUse Edit/Write-tool guard trap (as anticipated by the dispatch): every Edit-tool and Write-tool call in this worktree failed with `[WorkflowProfileGuard] Deterministic workflow profile resolution failed for <path>` / `No stderr output`, even for a Write targeting a path completely outside any git repository (the session scratchpad). Running the equivalent `repo-harness state resolve --json --target-path <path> --operation edit` directly in a plain shell succeeded cleanly (profile `lite`, no blockers), so the failure is specific to the wrapped hook invocation context, not the underlying state resolution -- consistent with the dispatch's documented "repoRoot resolution defect" in sibling worktrees. Worked around exactly as instructed: all file creation and editing in this worktree went through Bash (heredocs for new files; a small exact-match `apply-patch.ts` script, modeled on the Edit tool's own old_string/new_string contract, for modifying existing files). Did not attempt to fix the guard itself -- out of scope for this defect.
- No other deviations from the dispatched plan.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Also harden `resolve-effective-state.ts`'s `review_base` resolution to fail-closed (matching the recorder's new fail-closed shape) instead of its existing default-chain fallback | Rejected | It is not exhibiting the reported bug (already prioritizes `review_base` correctly); changing its fallback semantics would be an unrequested design change outside this defect's scope |
| Add a dedicated regression test for `prompt-handler.ts`'s fix vs. relying only on the mandated `workflow-state-lib.test.ts` guard | Added the extra test | The sibling fix would otherwise ship with zero coverage; a small, self-contained, additive test (own fixture, no shared-helper edits) proportionate to the fix, not scope creep |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix red evidence: `.ai/harness/runs/receipt-subject-target-split-pre-fix.log`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- The PreToolUse Edit/Write-tool guard trap in sibling worktrees is already a documented, known issue (per the dispatch); not promoted here as a new finding, only recorded as encountered-and-worked-around for this package.
