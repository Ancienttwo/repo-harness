# Implementation Notes: architecture-agent-guidance

> **Status**: Active
> **Plan**: plans/plan-20260913-1843-architecture-agent-guidance.md
> **Contract**: tasks/contracts/20260913-1843-architecture-agent-guidance.contract.md
> **Review**: tasks/reviews/20260913-1843-architecture-agent-guidance.review.md
> **Last Updated**: 2026-09-13 18:43
> **Lifecycle**: notes

## Design Decisions

- Reuse SessionStart and canonical capability matching. Only tracked package manifest paths are inventory evidence; the Agent owns semantic boundaries. No new dependency, source file, configuration surface or queue.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Automatic directory-to-node generation | Rejected | Directory names do not establish architecture ownership. |
| Existing public archctx plan/apply | Selected for new nodes | ChangeSet validates authority and worktree digest; existing node updates require a supported typed surface. |

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

> **Substantive Change SHA256**: `sha256:13bf24891049e3e022018bf965b176ebfb86a4745be1bd43e7d01fb921141aff`
