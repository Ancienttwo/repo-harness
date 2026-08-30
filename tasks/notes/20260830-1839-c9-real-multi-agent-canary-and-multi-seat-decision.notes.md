# Implementation Notes: c9-real-multi-agent-canary-and-multi-seat-decision

> **Status**: Active
> **Plan**: plans/plan-20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.md
> **Contract**: tasks/contracts/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.contract.md
> **Review**: tasks/reviews/20260830-1839-c9-real-multi-agent-canary-and-multi-seat-decision.review.md
> **Last Updated**: 2026-08-30 18:39
> **Lifecycle**: notes

## Design Decisions

- Freeze three matched protocol traces and usefulness v1 in executable code before the accepted full run.
- Treat Codex JSONL as the only provider wire; raw markers are rejected rather than kept as a compatibility path.
- Hash Task/Lease/Publication/Acceptance store roots separately from the delegation evidence store, because a real delegated run must append its own immutable receipts.
- Gate tracked source bytes separately from gitignored Host evidence written under `.ai/harness/evidence/`.
- Keep `EngineerSeatV2`, Review marketplace and guarded merge inactive: treatment matched baseline usefulness at 2.58x input tokens, and handoff restart was only about 1.1 seconds.

## Deviations From Plan Or Spec

- The cheapest real-provider probe exposed a pre-existing JSONL/raw-marker mismatch and a 64 KiB terminal-event truncation risk. C9 corrected both before running the frozen three-case matrix; it did not add an alternate wire or provider fallback.
- Two early treatment attempts produced invalid authoritative drafts. The collector rejected them without synthesizing output. The prompt was narrowed to preserve the frozen schema and empty evidence-ref arrays; the accepted matrix is a fresh full run after that pre-run harness correction.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Native subagents only | Rejected | They cannot prove delegated-run receipts, C7 binding or contribution collection. |
| Deterministic shims only | Regression coverage | C4 already proves Host mechanics; C9 required a live provider. |
| Persistent same-capability seats | NO-GO | Repeated evidence did not show startup/handoff as the bottleneck. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Durable live report: `docs/researches/20260830-c9-real-multi-agent-canary.md`
- Release gate: `deploy/release-checklists/260830-collaboration-canary-decision.md`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
