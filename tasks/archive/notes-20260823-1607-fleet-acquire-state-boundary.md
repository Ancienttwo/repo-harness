> **Archived**: 2026-08-23 16:07
> **Related Plan**: plans/archive/plan-20260823-1452-fleet-acquire-state-boundary.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260823-1607

# Implementation Notes: fleet-acquire-state-boundary

> **Status**: Active
> **Plan**: plans/plan-20260823-1452-fleet-acquire-state-boundary.md
> **Contract**: tasks/contracts/20260823-1452-fleet-acquire-state-boundary.contract.md
> **Review**: tasks/reviews/20260823-1452-fleet-acquire-state-boundary.review.md
> **Last Updated**: 2026-08-23 14:52
> **Lifecycle**: notes

## Design Decisions

- Preserve `coordination-identity.ts`, the lease store, and `COORDINATION_PROTOCOL`; this slice changes dependency ownership only, not state semantics or digest domains.
- Put reusable sprint verb orchestration under `src/effects/state/` because both the CLI adapter and fleet acquisition are real consumers. Keep Commander registration, output writes, and process behavior in the CLI module.
- Keep one `CommandOutcome` definition in a lower shared state type module if extraction requires it; duplicating or importing it from a CLI adapter would preserve the boundary bug.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Shell out from fleet acquisition to the CLI | Reject | Adds a process boundary and weakens typed rollback behavior. |
| Duplicate claim/bind/release logic in fleet acquisition | Reject | Creates two state-machine authorities. |
| Extract one effect-owned coordination module | Use | Removes the reverse import while preserving one implementation for both consumers. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
