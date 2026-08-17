# Implementation Notes: minimal-change-v2-enforce

> **Status**: Active
> **Plan**: plans/plan-20260817-2101-minimal-change-v2-enforce.md
> **Contract**: tasks/contracts/20260817-2101-minimal-change-v2-enforce.contract.md
> **Review**: tasks/reviews/20260817-2101-minimal-change-v2-enforce.review.md
> **Last Updated**: 2026-08-17 21:38
> **Lifecycle**: notes

## Design Decisions

- `tests/state/loop-semantics-characterization.test.ts:703` pins the literal source marker `const minimal = minimalChangeReview(repoRoot);`; the v2 signature change broke it. Fixed the marker string only. The enforce gate was deliberately NOT added to that file's Stop-ordering list: doing so would rewrite another work-package's frozen golden fixture (`UPDATE_LOOP_SEMANTICS_GOLDEN=1`), which is outside this slice.
- Live smoke stubbed only `dependencies.drainArchitectureProjection` so the real `runStopHandler` entry could run without restamping the user's `docs/architecture/**` WIP; everything else went through the real path.
- Receipt reader is strict/fail-closed: missing, malformed, or fingerprint-mismatched receipts never release the gate. Breaker key (`progressToken`) is the report fingerprint, so a new edit that changes the report resets the block budget.
- Fingerprint-less report = lazy release, not fail-closed (`stop-handler.ts:552-561`, acceptance finding). A `review` report whose `fingerprint` is missing or non-string kills both release paths at once — the receipt check rejects an empty fingerprint and `recordCircuitAttempt` throws `fingerprint is required` — so blocking there is terminal, escapable only out of band. The sole writer (`collectMinimalChangeSignals`) always emits a fingerprint, so its absence means a corrupt report, and a truncated report already gets the lazy treatment via parse failure → `verdict: unknown`. Same corruption class, same behavior. Fail-closed stays for everything the gate can actually bound.

## Deviations From Plan Or Spec

- None from the plan. Gate state at handback, corrected: `check-task-sync` was already green once the orchestrator projected the contract/notes/review artifacts through plan-to-todo; `check-task-workflow --strict` stayed red after that, because the active-worktree marker was missing, and the orchestrator closed it by writing the marker. Neither was closed by widening this slice.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Remove `requestedMode` (now always equal to `mode`) | Kept | Plan decision 1 only ordered the type collapse; removing the field widens scope. Dead duplication, flagged for a follow-up cleanup. |
| Add enforce gate to loop-semantics ordering golden | Not done | Golden fixture is owned by another work-package; rewriting it here crosses a contract boundary. |

## Open Questions

- `requestedMode` dead duplication: remove in a later cleanup slice?

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
