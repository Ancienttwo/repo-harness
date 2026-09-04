> **Archived**: 2026-09-05 01:15
> **Related Plan**: plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260905-0115
> **Archive Projection V1**: `plans/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md` => `plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md`
> **Archive Projection V1**: `tasks/notes/20260905-0109-exclude-codegraph-from-runtime-fixtures.notes.md` => `tasks/archive/notes-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0109-exclude-codegraph-from-runtime-fixtures.contract.md` => `tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0109-exclude-codegraph-from-runtime-fixtures.review.md` => `tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md`

# Implementation Notes: exclude-codegraph-from-runtime-fixtures

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-0109-exclude-codegraph-from-runtime-fixtures.md
> **Contract**: tasks/archive/contract-20260905-0115-exclude-codegraph-from-runtime-fixtures.md
> **Review**: tasks/archive/review-20260905-0115-exclude-codegraph-from-runtime-fixtures.md
> **Last Updated**: 2026-09-05 01:09
> **Lifecycle**: notes

> **Substantive Change SHA256**: `sha256:d825a718c5dbd55db583401fcaace04fa4342e02d72f6472a4288d274282fa8d`

## Design Decisions

- `.codegraph/` is ignored local runtime evidence, not an input to either fixture. Exclude it at the existing whole-repository copy boundary so source coverage stays unchanged while sockets and the index are not copied into temporary runtimes.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Remove the local socket before tests | Reject | Mutates operator-owned runtime state and leaves the fixture coupled to ignored files. |
| Exclude `.codegraph/` from fixture copies | Use | Matches the existing exclusions for `.git`, `node_modules`, and `_ops`; no production behavior changes. |

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
