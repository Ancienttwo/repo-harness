# Notes: HE-06 Handoff and Current Snapshot UX

> **Status**: Complete
> **Plan**: `plans/plan-20260616-HE-06-handoff-current-ux.md`
> **Contract**: `tasks/contracts/20260616-HE-06-handoff-current-ux.contract.md`
> **Review**: `tasks/reviews/20260616-HE-06-handoff-current-ux.review.md`

## Decisions

- Handoff now has an `## Active Artifacts` section rather than requiring agents to infer paths from scattered source sections.
- `prepare-handoff.sh --status` is a read-only inventory command.
- `check-task-workflow.sh --strict` reports when `tasks/current.md` is newer than the resume packet.

## Tradeoffs

- Active sprint row extraction is best-effort and falls back to the active sprint file path when no row references the active plan.
- The freshness check does not auto-write resume packets; it reports the exact command because strict checks should not mutate runtime state.

## Open Questions

- HE-09 dogfood closeout should decide whether handoff status output belongs in the README quick path.
