# Implementation Notes: harness-kernel-reduction

> **Status**: Active
> **Plan**: plans/plan-20260712-2327-harness-kernel-reduction.md
> **Contract**: tasks/contracts/20260712-2327-harness-kernel-reduction.contract.md
> **Review**: tasks/reviews/20260712-2327-harness-kernel-reduction.review.md
> **Last Updated**: 2026-07-12 23:28
> **Lifecycle**: notes

## Design Decisions

- Keep Risk Profile separate from existing Task Profile.
- Upgrade the existing state-snapshot owner into the single effective-state
  resolver; do not introduce a third parser.
- Resolve safety floor at PreToolUse from real path/action/capability inputs;
  natural language is not a security authority.
- Enforce SessionStart budget at the runtime aggregation point across all producers.
- Treat the partial synthetic reporter as micro/SLO evidence only.
- Make InstallProfile host-level authority with one transaction/ownership model;
  repo policy may hold an explicit override, not competing installed state.
- Use package-owned hash proof before deleting legacy host paths; modified or
  unknown content fails closed.
- Live Codex benchmark evidence showed `apply_patch` sends the freeform patch as
  `tool_input.command`, not `tool_input.file_path`. The edit guard now expands
  every Add/Update/Delete/Move target and checks each path; `.ai/harness/state/`
  is excluded from implementation fingerprints so the resolver cannot raise its
  own next invocation's risk floor.
- The benchmark runner accepts an explicit `--provider codex|claude`; profile
  comparisons never mix providers inside one report. Codex exhausted its live
  account quota after repeated real matrix attempts, so Claude is the bounded
  same-matrix fallback rather than synthetic evidence.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add parallel effective-state engine | Reject | Would preserve duplicate parsers and violate one-authority invariant. |
| Rename without_skill to No Harness | Reject | It inherits host hooks/config and cannot prove isolation. |
| Truncate only session-start-context.sh | Reject | Other SessionStart producers would remain outside the budget. |
| Delete facades before transaction authority | Reject | Cannot safely prove ownership or rollback host state. |

## Open Questions

- None requiring user input. Detailed file ownership is narrowed per ordered
  work package under this parent contract.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
