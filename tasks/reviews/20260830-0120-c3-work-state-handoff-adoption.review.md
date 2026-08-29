# Task Review: c3-work-state-handoff-adoption

> **Status**: Accepted
> **Plan**: plans/plan-20260830-0120-c3-work-state-handoff-adoption.md
> **Contract**: tasks/contracts/20260830-0120-c3-work-state-handoff-adoption.contract.md
> **Notes File**: tasks/notes/20260830-0120-c3-work-state-handoff-adoption.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-30 01:20
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:3bd2cedb7c7223e2f6f8d54ac6de603acd4309ea87c8440cdf62b305e977afea
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: cd3feff24aaf555e12f4434d4d2358011220807a

## Human Review Card

- Verdict: pending
- Change type: code-change
- Intended files changed: the two C3 protocols, their two stores, the store
  mechanics and actor derivation extracted out of `signal-store.ts`, four test
  files, the shared store fixture, and this row's workflow artifacts.
- Actual files changed: `src/core/collaboration/handoff.ts`,
  `src/core/collaboration/adoption.ts`,
  `src/effects/collaboration/handoff-store.ts`,
  `src/effects/collaboration/adoption-store.ts`,
  `src/effects/collaboration/record-store.ts`,
  `src/effects/collaboration/actor.ts`,
  `src/effects/collaboration/signal-store.ts`,
  `tests/unit/collaboration-handoff.test.ts`,
  `tests/unit/collaboration-adoption.test.ts`,
  `tests/effects/collaboration-handoff-store.test.ts`,
  `tests/effects/collaboration-adoption-store.test.ts`,
  `tests/effects/collaboration-signal-store.test.ts`,
  `tests/helpers/collaboration-store-fixture.ts`, plus the plan, contract,
  review, notes and the capability workstream ledger.
- Commands passed: `bun test --timeout 60000`;
  `node node_modules/typescript/bin/tsc --noEmit`;
  `bash scripts/check-task-sync.sh`;
  `repo-harness run check-task-workflow --strict`;
  `bash scripts/check-architecture-sync.sh`.
- Residual risks: `signal-store.ts` was rewired onto the extracted mechanics.
  `tests/effects/collaboration-signal-store.test.ts` is the guard and passes
  15/15; the staging-name lookalike case in it proves the shared builder and
  matcher still move together.
- Reviewer action required: inspect diff and card
- Rollback: revert the branch commit set; `collaboration.mode` is `off`, so no
  consumer path is live and no persisted collaboration state needs migration.

## Mode Evidence

- Selected route: planning -> contract worktree `codex/c3-work-state-handoff-adoption`
- P1/P2/P3 evidence: `plans/plan-20260830-0120-c3-work-state-handoff-adoption.md`
- Root cause or plan evidence: not a bugfix; the plan's P2 traces
  `adoptWorkStateHandoff()` from feature flag to persisted receipt.

## Verification Evidence

- Waza `/check` run: not run; the five contract gates below were run directly.
- Commands run:
  - `bun test --timeout 60000` -> 3332 pass, 2 skip, 0 fail across 270 files
  - `node node_modules/typescript/bin/tsc --noEmit` -> exit 0
  - `bash scripts/check-task-sync.sh` -> exit 0
  - `repo-harness run check-task-workflow --strict` -> exit 0
  - `bash scripts/check-architecture-sync.sh` -> exit 0, blocking=0, pending=0
- Manual checks: no new `*_PROTOCOL` export, so the C1 closed inclusion scan is
  true unchanged and the freeze record's `DELIBERATELY_EXCLUDED` list needs no
  new row; asserted in `C3 protocol ownership and vocabulary`.
- Supporting artifacts: `.ai/harness/checks/latest.json`
- Implementation notes reviewed: `tasks/notes/20260830-0120-c3-work-state-handoff-adoption.notes.md`
- Run snapshot: `.ai/harness/runs/`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:3bd2cedb7c7223e2f6f8d54ac6de603acd4309ea87c8440cdf62b305e977afea
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: cd3feff24aaf555e12f4434d4d2358011220807a
> **Verification Evidence SHA256**: sha256:4f63a2fb706811aa4095ca44e26a114059a3e8c8f4b34a923711821d738fb350
> **Issued At**: 2026-08-29T20:49:49.198Z

- Summary: C3 WorkStateHandoffV1 and non-exclusive adoption receipts accepted after two external review rounds. Extracts C1's signal store into a shared record-store.ts/actor.ts substrate for C4-C9, preserving C1's atomicity invariants verbatim: staged write, fsync, link rather than rename so first-writer-wins survives, a single staging-segment list driving both builder and matcher, and 64-hex record-id validation before every join. Adds handoff and adoption stores plus an archcontext model realignment that re-anchors selectors the extraction had deleted. The round-1 P1 is closed: assertReceiptBindsItsHandoff resolves handoff_id and requires the persisted handoff's handoff_sha256 to match, failing closed on both a digest mismatch and a missing handoff across readHandoffAdoptionReceipt, listHandoffAdoptionReceipts and transitively listAdoptersOfWorkStateHandoff, so a forged receipt can no longer be counted as an adopter; the list path resolves the handoff shard once into a Map without weakening the check. Write and read paths keep deliberately distinct typed errors: a conflicting persisted record on adopt is a conflict, corrupt data on read is unavailable. C0's freeze is intact with the authority inventory and digest untouched, no delivery-plane write and no reverse import, and C1's closed protocol scan stays satisfied because handoff.ts and adoption.ts consume COLLABORATION_PROTOCOL without exporting one. Residual accepted as non-blocking: handoff publish locks per-thread where D9 specifies per-handoff, functionally safe but needing either a split or a recorded deviation.
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
