# Task Review: campaign-preparation-retry

> **Status**: Pending
> **Plan**: plans/plan-20260910-2258-campaign-preparation-retry.md
> **Contract**: tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md
> **Notes File**: tasks/notes/20260910-2258-campaign-preparation-retry.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-11 03:30
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change
- Intended files changed: `src/effects/automation/campaign-worker.ts`, `src/effects/automation/campaign-runtime.ts`, `tests/effects/campaign-worker.test.ts`, plus this task's plan/contract/notes/review and `tasks/evidence/campaign-preparation-retry-pre-fix.log`
- Actual files changed: exactly that set — `plans/plan-20260910-2258-campaign-preparation-retry.md`, `src/effects/automation/campaign-runtime.ts`, `src/effects/automation/campaign-worker.ts`, `tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md`, `tasks/evidence/campaign-preparation-retry-pre-fix.log`, `tasks/notes/20260910-2258-campaign-preparation-retry.notes.md`, `tasks/reviews/20260910-2258-campaign-preparation-retry.review.md`, `tests/effects/campaign-worker.test.ts`. No path outside `allowed_paths`.
- Commands passed: see Verification Evidence below.
- Residual risks: the retry widens a previously single-shot admission window; a missed effect signal would let a second provider call through. Pinned by the journal-blocked cases asserting `prepareCampaignCodexInvocation` was called exactly once and the pre-created directory is untouched.
- Reviewer action required: inspect diff and card
- Rollback: revert the single commit on top of `09e4a4d0`; no data migration, live immutable preparation/grant/counter/journal state untouched either way.

## Mode Evidence

- Selected route: planning — captured Codex Plan output in `plans/plan-20260910-2258-campaign-preparation-retry.md`.
- P1/P2/P3 evidence: recorded in that plan's `## Captured Planning Output`. P2 names the pressure point: `prepareChild` persists the preparation record before `prepareCampaignCodexInvocation`, and re-entry rejected that record unconditionally.
- Root cause or plan evidence: `## Root Cause Evidence` in the contract — `src/effects/automation/campaign-worker.ts:182` on `origin/main`, with the pre-fix failure captured in `tasks/evidence/campaign-preparation-retry-pre-fix.log` (`PRE_FIX_EXIT=1`, 3 fail / 0 pass).

## Verification Evidence

- Waza `/check` run: not run; this contract's acceptance policy routes review to Codex via AcceptanceReceipt.
- Commands run:
  - `bun test tests/effects/campaign-worker.test.ts tests/effects/brc10-lifecycle.test.ts tests/effects/campaign-containment.test.ts --timeout 60000` → 40 pass, 4 skip, 0 fail, 239 assertions, 151.44s
  - `bun run check:type` → clean (fixed two untyped `readPlanningRecord` call sites in the new test)
  - `bun run check:hooks` → projection OK, 3 files
  - `bun run check:helpers` → projection OK, 58 helpers
  - `bash scripts/check-task-workflow.sh --strict` → OK
  - `bash scripts/check-task-sync.sh` → no changes detected
  - `bash scripts/check-deploy-sql-order.sh` → OK
  - `bash scripts/check-architecture-sync.sh` → OK after `bun install` (see Manual checks)
  - `repo-harness run contract-run preflight --contract tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md` → preflight_pass
- Manual checks: `check-architecture-sync.sh` failed strict in this worktree with `state=mismatch` until `bun install` raised its `node_modules` archctx from 0.5.9 to the 0.5.10 pinned by the rebased `package.json`. The same check was green on the `main` checkout throughout, confirming stale worktree install rather than a repository defect.
- Supporting artifacts: `tasks/evidence/campaign-preparation-retry-pre-fix.log`
- Implementation notes reviewed: `tasks/notes/20260910-2258-campaign-preparation-retry.notes.md`
- Run snapshot: `.ai/harness/runs/`

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

- Before: any second `prepareChild` call with an existing preparation record threw `campaign preparation already admitted; reconciliation required`.
- After: that message is reserved for cases with real later evidence — non-worker role, a launch/final/child/verifier-preparation/downstream-phase record, or an attempt reservation. A worker retry with none of those proceeds against the stored record.
- New refusals with distinct messages: `campaign preparation identity differs` (identity or record shape changed), `campaign original preparation deadline is expired or outside the caller bound` (stored deadline expired, non-safe-integer, or wider than the caller's bound), and `campaign preparation has a container journal; reconciliation required` (journal exists for the version probe or the workload identity).
- `prepareChild` now uses the record returned from `withCampaignPlanningLock` rather than the locally built candidate, so a retry runs against the stored deadline instead of the one it was invoked with.

## Residual Risks / Follow-ups

- The stranded dispatch this fix unblocks still needs the controller's Docker PATH repaired before it can resume through normal `contract-run`. The fix removes the wedge, not the environment fault.
- Long-lived worktrees can fail `check-architecture-sync.sh` strict after an archctx pin bump until `bun install` runs there. Not caused by this change; worth watching if it recurs.

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

- Re-run: `bun test tests/effects/campaign-worker.test.ts tests/effects/brc10-lifecycle.test.ts tests/effects/campaign-containment.test.ts --timeout 60000`, then `bun run check:type`.
- Re-check: `repo-harness run contract-run preflight --contract tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md` and `bash scripts/check-task-workflow.sh --strict`. If `check-architecture-sync.sh` reports `state=mismatch`, run `bun install` in the worktree before treating it as a finding.

## Summary

- Implementation and evidence are complete; the verdict is not. Contract, notes and this card were authored by the implementer, so `Status` stays `Pending` and `Recommendation` stays `fail` until an AcceptanceReceipt is recorded under this contract's acceptance policy (`reviewer: Codex`, `source: codex-plugin`).
- What a reviewer should attack first: whether container-journal absence really implies no runtime effect. That is the load-bearing assumption; the contract's `## Falsifier` names it and the journal-blocked cases are the cheapest place to disprove it.
