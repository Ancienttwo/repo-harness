# Implementation Notes: task-inbox-portable-paths

> **Status**: Active
> **Plan**: plans/plan-20260922-1754-task-inbox-portable-paths.md
> **Contract**: tasks/contracts/20260922-1754-task-inbox-portable-paths.contract.md
> **Review**: tasks/reviews/20260922-1754-task-inbox-portable-paths.review.md
> **Last Updated**: 2026-09-22 18:01
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:66982e8d07e5277fe3e82c9585c54efa90fadbae116c737df3d06f878163c867`

## Design Decisions

- The journal is an immutable source/target manifest, published from a durable prepared file. Filesystem state plus exact inventory determines recovery; no phase counter can falsely admit a partial cutover. A separate immutable rollback journal preserves reversal intent across crashes.
- Source approval includes the resolved common-directory path and device/inode identity. A matching history copied into another repository cannot reuse approval.
- Existing canonical record validators remain the only record authority. Runtime reads v2 only; legacy parsing is confined to the explicit migration.
- Contract verification uses the approved source base12518117 through REPO_HARNESS_DIFF_BASE. The policy-owned review subject remains the complete candidate against its configured review base; do not override the external review base to a different subject.
- Interrupted canonical verification reached the outer helper hard timeout while owner-4 had no completed execution record. A bounded direct package test passed 33/33 in 75 seconds. The next canonical invocation reported an identical request running; subsequent readback found that request lock absent. Preserve those failures and require a new genuine canonical result; no execution receipt or cache entry is manually repaired.

- Completed rollback receipts are immutable history. New v1 writes require a fresh source approval; the next transaction archives the old receipt before clearing its pointer. A prepared forward journal is validated and published before rollback consumes it, preserving the normal recovery fence.
- Native follow-up in downstream PR444 (run 35756978653) exposed ten inventory link-count refusals on unchanged migration source. A public-API experiment reproduced the same refusal when distinct file IDs above Number's safe integer range collide after conversion. The selected correction keeps exact bigint stats at the existing inboxPathStat owner, covering inventory grouping, common-directory manifest/history identity and the runtime layout fence together. Link ownership checks remain mandatory; no Number fallback, stored-record translation or relaxed refusal is introduced. Native raw stat values were not logged, so that particular run's trigger remains unconfirmed until a native corrected-source observation.

## Deviations From Plan Or Spec

- A task-lock migration transaction cannot prove that every legacy binary has stopped. The explicit offline release contract remains mandatory. Windows file flushes do not imply POSIX directory-fsync power-loss guarantees.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Mutable phase journal | Rejected | Rewriting a phase adds a second state to reconcile; immutable manifest plus validated directory transitions suffices. |
| Case-only v1 fixture pair on default macOS | Rejected | The old layout already overwrites the first identity. Native fresh-v2 tests prove separate Alice/alice delivery and ACK; migration refuses mismatched historical paths. |

- The downstream #444 review returned a P2 for stale prepared forward receipts after rollback. This correction stays in the existing #443 migration ownership and allowed paths; no new work-package or real-data operation is introduced. Root cause: finishRollback removed only the published receipt. Repro: real rename interruption followed by rollback/new v1 history/reapply. Guard: the existing migration suite's complete/prefix and foreign/linked receipt cases. Pre-fix artifacts: `.ai/harness/runs/task-inbox-portable-paths/pending-receipt-pre-fix.log` and `pending-receipt-pre-fix-cleanup.log`. Current focused evidence: `pending-receipt-focused.log`, 48/48. The consumed reviews do not approve the corrected subject; final owner acceptance remains required.

## Open Questions

- None.

## Evidence Links

- Native follow-up correction relative to `49c5f9dc`: two real-filesystem regression guards failed before the exact-stat fix and pass afterward. Existing migration plus Inbox suites passed 44/44 with 350 assertions; after correcting the spy's optional-stat typing, both new cases passed again (2/2, 12 assertions) and typecheck passed. Canonical evidence and hosted native CI must be refreshed after downstream persistence integration; the prior review remains consumed.

> **Substantive Change SHA256**: `sha256:f4f6c60def7610a29820ee1cc3241d816572ea2fcaf28346ee2dc82b41c483ea`

- root_cause: Default Number-valued stat identities collapse adjacent file IDs above the safe integer range, both merging independent inventory entries and missing layout identity changes.
- repro: `bun test tests/effects/task-inbox-layout-migration.test.ts --test-name-pattern 'default inode numbers collide|adjacent exact inode values'` against pre-fix source.
- regression_guard: `tests/effects/task-inbox-layout-migration.test.ts`.
- pre_fix_failure_artifact: `.ai/harness/runs/task-inbox-portable-paths/rounded-inode-pre-fix.log` (`PRE_FIX_EXIT=1`, two failures).

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Accepted dependency integration

The owner approved #444 corrected subject `c21805db55803c9e4430b04ed63d788c55fd2d0bfe5684af7d6c2927c57c5770`. Its typed user-waiver receipt, canonical verification and provider-free seal completed, and lifecycle artifacts were archived at `daa05cbf`. This branch fast-forwarded to that accepted dependency, preserving this package's active contract and pinned verification base `12518117`. Allowed Paths now includes only the exact inherited dependency files and archived evidence. No persistence behavior changes during integration. `git diff 2948a041 HEAD -- src tests .github package.json bun.lock` was empty immediately after integration, so full CI35765127664 (Windows210 pass/6 skip/0 fail) remains valid source evidence. This package's 21-check Verification Plan is rerun for its own acceptance; the accepted dependency's unchanged unit checks are not independently repeated. This package's consumed review remains consumed and its own typed receipt is still pending.
