# Landed task ledger closeout

Verified on 2026-09-05 against repo-harness main `9fd463844c221e9d8433ef1c73738fdec3b23dba` and the live GitHub PR records. Scope is historical ledger repair; #283, BRC5, review-boundary-repairs, and Refactor activation retain their existing owners.

## Delivery evidence

- Lite task synchronization landed in `7fe02beb` on main. Its plan records implementation complete and owner-authorized delivery with a known full-suite failure. The named contract, review and notes were absent, so this closeout does not create them or infer acceptance. The duplicate completed Task Breakdown is reduced to one copy.
- Acceptance redaction idempotence merged in [repo-harness PR #305](https://github.com/Ancienttwo/repo-harness/pull/305), commit `bacee3c66cab773dd18477b41cdb1e1a6636d3df`. The historical review records external_pass; its contract is still Active, so it does not satisfy the sealed-terminal archive triple.
- The dependent BYOK Step 4a publication merged in [byok-sdk PR #132](https://github.com/Ancienttwo/byok-sdk/pull/132), commit `c7c53357e138bd82f716243589157dd58cbaa038`, on 2026-09-04. The BYOK repository's `plans/archive/plan-20260904-0421-wp3b-step4-longpoll-cursor-stop.md` records Completed. Its main includes the merge commit. This closes the redaction plan's downstream publication tail without modifying BYOK.

## Disposition and preserved finding

Both repo-harness plans are archived as Superseded by their landed deliveries through archive-workflow. This retires stale execution records without claiming fresh semantic acceptance or promoting historical contract state. Archived plans retain detailed original verification evidence:

- `plans/archive/plan-20260905-0452-lite-task-sync.md`
- `plans/archive/plan-20260904-0517-acceptance-redaction-idempotence.md`

The lite delivery's full run recorded 4,173 pass, four skipped and one failure at `tests/unit/candidate-bound-global-runtime-reconciliation.test.ts:233`; its isolated rerun passed without a code change. The failure remains unexplained. Existing review-boundary-repairs owns the related runtime surface; its final evidence must be assessed before claiming the finding resolved. This closeout does not rerun or relabel that historical suite.

## Closeout verification

Only Markdown plans, archived workflow artifacts, this research disposition and the generated tasks/current.md change. No runtime, tests, dependency or machine contract semantics change. Use the six repository-integrity commands plus git diff --check and archive/readback assertions; a full suite would not add behavior evidence for this ledger-only change. No dependency or abstraction is added; this document is the human reading entrypoint for the archived dispositions and unresolved verification finding.

Closeout verification passed in the isolated `codex/task-ledger-closeout` worktree: `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh`, `bash scripts/check-task-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, and `bun src/cli/index.ts init --repo . --dry-run`. Architecture reported zero blocking items; inspection reported no drift; task-sync classified the diff as non-substantive. `git diff --check` passed. The two todo snapshots are deterministic archive-workflow outputs, not new deferred-goal authorities.

## Integration boundary

Main advanced to `ed6df3d5` when the #283 owner committed its independent archive family. The ledger branch integrates that commit; its only merge conflict is the generated `tasks/current.md`, rebuilt through refresh-current-status.

Before runtime publication, `bun run check:state-boundaries` was rerun in the separate review-boundary-repairs worktree at `2016393c` and failed with three EFFECTS_REVERSE_IMPORT findings in `src/effects/automation/gpt-pro-issue-authoring.ts` (imports from CLI binding, engine and types). AcceptanceReceipt verification also reported a stale change-assessment packet after target movement. That runtime delivery stays with its owner and is not merged by this ledger closeout. The recorded 4,219-pass full test run is not a passing state-boundaries check. No source correction or gate waiver is introduced here.
