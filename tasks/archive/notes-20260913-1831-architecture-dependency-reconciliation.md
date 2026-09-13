> **Archived**: 2026-09-13 18:31
> **Related Plan**: plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260913-1831
> **Archive Projection V1**: `plans/plan-20260913-1807-architecture-dependency-reconciliation.md` => `plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md`
> **Archive Projection V1**: `tasks/notes/20260913-1807-architecture-dependency-reconciliation.notes.md` => `tasks/archive/notes-20260913-1831-architecture-dependency-reconciliation.md`
> **Archive Projection V1**: `tasks/contracts/20260913-1807-architecture-dependency-reconciliation.contract.md` => `tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md`
> **Archive Projection V1**: `tasks/reviews/20260913-1807-architecture-dependency-reconciliation.review.md` => `tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md`

# Implementation Notes: architecture-dependency-reconciliation

> **Status**: Active
> **Plan**: plans/archive/plan-20260913-1807-architecture-dependency-reconciliation.md
> **Contract**: tasks/archive/contract-20260913-1831-architecture-dependency-reconciliation.md
> **Review**: tasks/archive/review-20260913-1831-architecture-dependency-reconciliation.md
> **Last Updated**: 2026-09-13 18:07
> **Lifecycle**: notes

## Design Decisions

- Runtime package owns archctx resolution; target repository supplies model and cwd only.

## Deviations From Plan Or Spec

- User clarified that archctx belongs to global runtime. The earlier init-install candidate was withdrawn; the final diff removes target override instead.

- One pre-existing test blocker was reproduced on unchanged primary f1596f09: the 500 ms provider fixture budget left 14 ms after Node selection, so no descendant.pid existed. This task makes the single permitted blocking fixture repair: allow 2 s for startup and timeout, preserving the 4 s outer bound, the descendant-death assertion, and the separate Node deadline test. No production timeout changes.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Install target dependencies during init | Rejected | Would preserve target executable override and add repository mutation to a global-runtime issue. |
| Resolve from the running package | Selected | Global update already owns and verifies these exact dependencies. |

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

> **Substantive Change SHA256**: `sha256:a56e89c975a6b948f5401baca52ced025945b29f4d4418e215b37e6c994803a1`
