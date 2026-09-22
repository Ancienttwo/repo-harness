# Implementation Notes: windows-task-persistence

> **Status**: Active
> **Plan**: plans/plan-20260923-0031-windows-task-persistence.md
> **Contract**: tasks/contracts/20260923-0031-windows-task-persistence.contract.md
> **Review**: tasks/reviews/20260923-0031-windows-task-persistence.review.md
> **Last Updated**: 2026-09-23 00:31
> **Lifecycle**: notes

> **Substantive Change SHA256**: `sha256:6fd0101d5bcd964a27e1013b580d3ed4ae8b893ee69a51391f864bd712f03f60`

## Design Decisions

- Repair the four observed authority stores through the existing low-level durable-write module; retain the already compliant Inbox/checkpoint boundaries. Principal retains its original writable descriptor through fsync.
- Source verification is bound to49c5f9dc; independent review remains on the policy-selected origin/main subject.
- Real native Windows evidence is mandatory; simulated syscall restrictions only establish the deterministic local regression.

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
