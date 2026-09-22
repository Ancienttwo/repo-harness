# Implementation Notes: akn05-supervision-integration

> **Status**: Active
> **Plan**: plans/plan-20260923-0311-akn05-supervision-integration.md
> **Contract**: tasks/contracts/20260923-0311-akn05-supervision-integration.contract.md
> **Review**: tasks/reviews/20260923-0311-akn05-supervision-integration.review.md
> **Last Updated**: 2026-09-23 03:11
> **Lifecycle**: notes

## Design Decisions

- ...

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

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

## Integration decision

Read-only merge-tree against76f989cc shows only generated manifest conflict. The resulting product delta is seven UI/test files (472 insertions,1 deletion); the scoped automation decoder and source owners come entirely from upstream. Pin accepted dependency evidence before merge and final verification. Preserve task drafts, original unavailable states and the deferred Windows mutation-store entry.

## Dependency freeze

Automation-summary0e07d97f is archived with an exact external_pass receipt after24/24 canonical criteria and its single Codex plugin approve verdict. Source subject51cded6ae80f7e99bca5a548302915bae6fa1c3e233f030a363bc959138c13a2 is unchanged; full hosted CI is the remaining publication check. Pin0e07d97f as this package source/rollback base and enumerate its exact archive paths before integration.
