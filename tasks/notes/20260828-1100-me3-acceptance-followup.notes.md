# Implementation Notes: me3-acceptance-followup

> **Status**: Active
> **Plan**: plans/plan-20260828-1100-me3-acceptance-followup.md
> **Contract**: tasks/contracts/20260828-1100-me3-acceptance-followup.contract.md
> **Review**: tasks/reviews/20260828-1100-me3-acceptance-followup.review.md
> **Last Updated**: 2026-08-28 11:00
> **Lifecycle**: notes

## Design Decisions

- The pure-read MCP list path fails closed for every Engineer when any one Engineer's effect has a missing or skewed `current.json`; the old path silently repaired and kept listing. Cross-Engineer availability coupling on the shared store is accepted in exchange for a read that never mutates disk.
- The operator CLI path (`src/cli/commands/engineer.ts:537,541`) intentionally keeps the repairing read: it has no principal, does not advertise `readOnlyHint`, and crash-window repair responsibility stays on the command path.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Repair-on-read in MCP vs fail-closed pure read | Fail-closed pure read | `readOnlyHint: true` must be literally true; repair stays an operator CLI authority |

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
