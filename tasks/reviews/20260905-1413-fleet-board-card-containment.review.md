# Task Review: fleet-board-card-containment

> **Status**: Pending
> **Plan**: plans/plan-20260905-1413-fleet-board-card-containment.md
> **Contract**: tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md
> **Notes File**: tasks/notes/20260905-1413-fleet-board-card-containment.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-05 16:20
> **Recommendation**: pending
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change
- Intended files changed: `src/core/fleet/board.ts`, `src/core/operator/fleet-snapshot.ts`, `src/effects/fleet/board.ts`, `src/effects/fleet/task-inbox.ts`, `src/effects/fleet/task-message-request.ts`, plus their tests
- Actual files changed: the five source files above, `tests/effects/fleet-board.test.ts`, `tests/unit/fleet-board.test.ts`, `tests/unit/operator-fleet-snapshot.test.ts`, `tests/unit/task-inbox-v1.test.ts`, `tests/effects/operator-task-message.test.ts`, `tests/cli/operator-serve.test.ts`, `tests/operator-web/operator-ui.test.tsx`, `tests/operator-web/operator-interactions.test.tsx`
- Commands passed: focused fleet/inbox/operator suites, `bun run build:operator-web`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh`, `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bun src/cli/index.ts init --repo . --dry-run`, full `bun test --timeout 60000`
- Residual risks: `bun run check:type` reports six errors inside `src/operator-web/**`, which this contract may not edit; the browser decoder and its demo fixture must accept the additive card `error` and `counts.unclassified` fields in the sibling work package
- Reviewer action required: inspect diff and card, and decide whether the sibling browser package lands before merge
- Rollback: revert the two commits on `codex/fleet-board-card-containment`

## Mode Evidence

- Selected route: planning (captured `repo-harness-plan` output)
- P1/P2/P3 evidence: `plans/plan-20260905-1413-fleet-board-card-containment.md` `## Captured Planning Output`
- Root cause or plan evidence: `tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md` `## Root Cause Evidence`

## Verification Evidence

- Waza `/check` run: not run; this slice used the contract exit criteria directly
- Commands run: see Human Review Card
- Manual checks: none
- Supporting artifacts: `.ai/harness/runs/pre-fix-*.log`
- Implementation notes reviewed: yes
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

- A card whose own observation throws no longer erases its repository: the
  repository stays `status: 'ok'` with `snapshot_consistency: 'degraded'`, and the
  card carries a closed-vocabulary `error` with `column: null` and empty
  observation-derived fields.
- `counts.unclassified` is new in `FleetBoardCountsV1`, the snapshot digest
  basis, and `OperatorFleetSnapshotV1`; `FLEET_BOARD_PROTOCOL` stays 3.
- Inbox scans skip superseded-revision events; `TaskInboxListResult` gains
  `superseded_revision_count`. Callers naming one exact event still fail closed.
- A revocation that lands while an operator publication waits for the task lock
  now wins instead of being serialized behind the send.
- A blocked canonical read no longer pins the machine-global registry lock.

## Residual Risks / Follow-ups

- `bun run check:type`: six errors in `src/operator-web/types.ts` (`decodeCard`,
  `decodeSnapshot` counts) and `src/operator-web/fixture.ts` (card override and
  three counts literals). Owned by the sibling browser work package together with
  the board chips for the new fields.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | pending reviewer |
| Product depth | 0/10 | pending reviewer |
| Design quality | 0/10 | pending reviewer |
| Code quality | 0/10 | pending reviewer |

## Failing Items

- `bun run check:type` (out of contract scope; see Residual Risks)

## Retest Steps

- Re-run: `bun test --timeout 60000 tests/effects/fleet-board.test.ts tests/unit/fleet-board.test.ts tests/unit/operator-fleet-snapshot.test.ts tests/unit/task-inbox-v1.test.ts tests/effects/task-inbox.test.ts tests/effects/operator-task-message.test.ts tests/cli/operator-serve.test.ts`
- Re-check: `bun run build:operator-web` and the repository-integrity checks in the contract exit criteria

## Summary

- Fleet board observation failures are contained at the card boundary, the board
  counts the rows it cannot classify, superseded inbox events are skipped instead
  of aborting every scan, the round deadline can preempt a synchronous card
  phase, and the operator write no longer holds the machine-global registry lock
  across the per-task lock.
