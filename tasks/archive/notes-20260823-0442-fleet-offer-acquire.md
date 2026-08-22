> **Archived**: 2026-08-23 04:42
> **Related Plan**: plans/archive/plan-20260823-0202-fleet-offer-acquire.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260823-0442

# Implementation Notes: fleet-offer-acquire

> **Status**: Active
> **Plan**: plans/plan-20260823-0202-fleet-offer-acquire.md
> **Contract**: tasks/contracts/20260823-0202-fleet-offer-acquire.contract.md
> **Review**: tasks/reviews/20260823-0202-fleet-offer-acquire.review.md
> **Last Updated**: 2026-08-23 02:02
> **Lifecycle**: notes

## Design Decisions

- `TaskOfferV1` is a read-time projection over one atomic registry snapshot and a stable canonical board snapshot. Four execution-readiness values are exhaustive; only `execution_ready` enters acquire.
- Plan proof requires one Approved/projectable work-package whose `Source Ref` exactly names the canonical sprint task cell. Plan filenames and the sprint Plan cell never become authority.
- Acquire reuses the existing claim/bind task locks, provisions only a fresh structured worktree, and returns `WorkEnvelopeV1` only after bind, atomic claim token, plan projection, topology, authorization, and lease all revalidate.
- Registry authorization is an optimistic fence. Fleet acquire checks it across the effect; MCP publication mutations inject a final fence inside the lifecycle task lock before any lease write.
- `sprint write-claim-token` is the only token writer. Contract `start-task` without a worktree intentionally remains reserving and tokenless until bind; inline and provisioned paths write only after bound.

## Deviations From Plan Or Spec

- No product-scope deviation. The existing contract `start-task` path required preserving a tokenless reserving state; forcing the new bound-only token writer there caused a caught regression and was removed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Parse human `contract-worktree start` output | Reject | Added `--fresh --json` at the owning helper boundary so acquire consumes a stable machine contract. |
| Hold a global registry/worktree lock | Reject | Existing per-task locks plus repeated authorization/offer fences preserve task concurrency without inventing cross-repo authority. |
| Adopt residual branch/worktree metadata | Reject | Fresh acquisition fails closed instead of binding a new claim to an old execution environment. |
| Let MCP copy CLI logic | Reject | CLI and MCP both call the same fleet/publication effects; MCP owns only schema, target resolution, and authorization gates. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused verification: 71 WP2/publication/sprint tests, 0 failures; real three-process acquire race produced at most one bound envelope/token.
- Independent gate on frozen `d59d304b`: PASS; full suite 2,907 pass, 2 skip, 0 fail with 22,013 assertions, plus typecheck, helper parity, and every root required check.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
