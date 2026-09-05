# Task Review: fleet-board-card-containment

> **Status**: Complete
> **Plan**: plans/plan-20260905-1413-fleet-board-card-containment.md
> **Contract**: tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md
> **Notes File**: tasks/notes/20260905-1413-fleet-board-card-containment.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-05 17:50
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: e81390e1

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: `src/core/fleet/board.ts`, `src/core/operator/fleet-snapshot.ts`, `src/effects/fleet/board.ts`, `src/effects/fleet/task-inbox.ts`, `src/effects/fleet/task-message-request.ts`, the blocking type-level additions in `src/operator-web/types.ts` and `src/operator-web/fixture.ts`, plus their tests
- Actual files changed: source — `src/core/fleet/board.ts`, `src/core/operator/fleet-snapshot.ts`, `src/effects/fleet/board.ts`, `src/effects/fleet/task-inbox.ts`, `src/effects/fleet/task-message-request.ts`, `src/operator-web/types.ts`, `src/operator-web/fixture.ts`, `src/operator-web/i18n.ts`; tests — `tests/effects/fleet-board.test.ts`, `tests/unit/fleet-board.test.ts`, `tests/unit/operator-fleet-snapshot.test.ts`, `tests/unit/task-inbox-v1.test.ts`, `tests/effects/operator-task-message.test.ts`, `tests/cli/operator-serve.test.ts`, `tests/unit/operator-web-types.test.ts`, `tests/operator-web/operator-ui.test.tsx`, `tests/operator-web/operator-interactions.test.tsx`; workflow artifacts — `plans/plan-20260905-1413-fleet-board-card-containment.md`, `tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md`, `tasks/notes/20260905-1413-fleet-board-card-containment.notes.md`, `tasks/reviews/20260905-1413-fleet-board-card-containment.review.md`, `tasks/todos.md`
- Commands passed: focused fleet/inbox/operator suites, `bun run check:type`, `bun run build:operator-web`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh`, `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bun src/cli/index.ts init --repo . --dry-run`, full `bun test --timeout 60000`
- Residual risks: the operator write nests the registry authorization lock inside the task lock; the one-directional proof is recorded in the notes file
- Reviewer action required: inspect diff and card
- Rollback: revert the branch's commits on `codex/fleet-board-card-containment` together

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
  now wins instead of being serialized behind the send, including one that
  commits after the send has already taken the task lock: the authority re-check
  and `writeImmutableEvent` share one registry-lock critical section.
- A blocked canonical read no longer pins the machine-global registry lock.
- The browser transport decodes a nullable card `error` against the existing
  closed error allowlist and requires `counts.unclassified`.

## Residual Risks / Follow-ups

- Board chips, composer copy, and styling for the card `error` and
  `counts.unclassified` fields are still owned by the sibling browser work
  package; this branch only makes the transport decode them. The one i18n
  exception is the adopted `origin_required` copy.
- `assertRepositoryAuthority` now accepts a registered path under a symlinked
  ancestor by design; the leaf `lstat` is the invariant, so an operator who moves
  a parent directory behind a symlink keeps authority.
- `superseded_revision_count` is surfaced only on the `fleet inbox list` JSON
  output, not on the Fleet card summary, so a board-only operator cannot see how
  many events a scan skipped.
- A repository with exactly one damaged card also inherits the pre-existing
  repo-level `repo_board_unavailable` vocabulary, which reads as slightly more
  severe than the contained failure actually is.
- The CLI/MCP `sendTaskMessage` sibling writes without taking the registry
  authorization lock, by design: `access_mode` is the operator board's authority,
  not a gate on local agents acting in their own repository.
- Pre-fix evidence lives under gitignored `.ai/harness/runs/`, so it does not
  travel with the branch; the durable statements are the ones recorded in the
  contract's `## Root Cause Evidence` and in this review.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | All eight plan defects are fixed as specified. `tsc` reports 0 errors; 15 focused suites run 282 pass / 0 fail (the gate's own re-run of 6 of them: 210/210); the full suite is 4335 pass / 4 skip / 0 fail after the last product-source commit `043c1eeb`. A live probe of the board shows `counts.unclassified` = 8 = the number of cards with `column: null`, every card carrying `error`, protocol 3, and no absolute paths in the payload. |
| Product depth | 8/10 | The board now distinguishes "no work" from "one unreadable receipt" at the row an operator actually looks at, and the counts add up to the rows shown. Depth stops short of the browser surface: `superseded_revision_count` is reachable only through `fleet inbox list --json`, and a repository holding one damaged card still inherits the pre-existing repo-level `repo_board_unavailable` vocabulary. |
| Design quality | 9/10 | The failure unit moved from the repository to the card without widening the public error vocabulary, and round preemption is deliberately left uncontained at the card boundary because the deadline belongs to the round. The external reviewer's P1 revoke-after-check window is closed by a task-outer/registry-inner protocol that puts the authority re-check and `writeImmutableEvent` in one critical section; its repro fails closed post-merge. |
| Code quality | 9/10 | Six repository-integrity checks plus CI-mode `check-task-sync` exit 0; `verify-contract --strict` reports 30/30 Fulfilled; `merge-tree` against `origin/main` `73278205` is clean. Behavior changes carry deterministic guards, including a unit guard for the one-microtask limiter slot transfer that the provider fixture cannot reach. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test --timeout 60000 tests/effects/fleet-board.test.ts tests/unit/fleet-board.test.ts tests/unit/operator-fleet-snapshot.test.ts tests/unit/task-inbox-v1.test.ts tests/effects/task-inbox.test.ts tests/effects/operator-task-message.test.ts tests/cli/operator-serve.test.ts`
- Re-check: `bun run check:type`, `bun run build:operator-web`, and the repository-integrity checks in the contract exit criteria

## Summary

- Fleet board observation failures are contained at the card boundary, the board
  counts the rows it cannot classify, superseded inbox events are skipped instead
  of aborting every scan, the round deadline can preempt a synchronous card
  phase, and the operator write no longer holds the machine-global registry lock
  across the per-task lock while still publishing inside that lock's critical
  section.
