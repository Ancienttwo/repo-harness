> **Archived**: 2026-08-25 14:37
> **Related Plan**: plans/archive/plan-20260825-1149-me1a-engineer-scheduling-schema.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260825-1437

# Implementation Notes: me1a-engineer-scheduling-schema

> **Status**: Active
> **Plan**: plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md
> **Contract**: tasks/contracts/20260825-1149-me1a-engineer-scheduling-schema.contract.md
> **Review**: tasks/reviews/20260825-1149-me1a-engineer-scheduling-schema.review.md
> **Last Updated**: 2026-08-25 13:05
> **Lifecycle**: notes

## Design Decisions

- Scheduling authority is a deterministic same-commit JSON sibling, not extra Sprint columns. This preserves the existing six-cell Backlog grammar and task digest contract.
- Missing carrier is `unclassified`; explicit `generic-v1` is accepted only with zero nodes and never module-routed; `engineering-v2` requires exact full row coverage.
- Authored graph bytes omit derived Work Package/graph revisions. The parser validates semantic input, and the pure projector derives canonical revisions.
- `task_ref` is the exact Task cell and only maps a stable Work Package to the existing canonical Task; it never replaces or re-derives `task_id`.
- Required policy and rollback authorities use safe same-commit file refs plus digests. A stale ref fails before offer projection.
- Offer matching is exact Profile capability equality. Cross-capability prerequisites are dependency edges, not a synthesized multi-capability requirement.
- Repo-scoped concurrency uses one Git-common-dir exclusive key lock across final scheduling revalidation and the synchronous ME-0B/Fleet acquire call. It does not extend Lease or introduce a second permit record.
- The restricted MCP inventory expands to three exact tools. `engineer_acquire` becomes EngineerOffer-only with no bare FleetOffer compatibility path.
- The accepted ArchContext change set is `changeset.plan-20260825-1149-me1a-engineer-scheduling-schema`, bound to `event.review-20260825-1149-me1a-engineer-scheduling-schema-approval`; an explicit `delegateScheduledEngineerAcquire` boundary gives CodeGraph a non-truncated exact selector while dependency injection stays outside the production delegation authority.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add Sprint columns | Reject | Changes a shared grammar and risks moving task revision semantics with scheduling metadata. |
| Same-commit sibling graph | Use | Independent revision and explicit migration boundary with no shadow row parser. |
| Treat missing graph as legacy | Reject | Omission would become an implicit semantic default. |
| Offer-time concurrency filter only | Reject | Two different task locks can race and both win. |
| Extend Lease with concurrency key | Reject | Pollutes generic Fleet task authority with Module Engineer scheduling semantics. |
| Reuse ME-0B acquire under scheduling lock | Use | Preserves one Claim/WorkEnvelope/receipt/compensation path. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused ME-1A/ME-0B/CLI/MCP suite: 30 pass, 0 fail.
- Architecture consumer/export suite: 7 pass, 0 fail.
- Full repository suite: 3079 pass, 2 platform skips, 0 fail across 247 files.
- `bun run check:type` and every repository Required Check passed.
- ArchContext `repo-harness/v1` projection: 19 targets, zero drift, receipt `sha256:c69a652b827b60f2817c8fb634386c33f9d975c00f59f8f28fdc5f3ac3aa9d31`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
