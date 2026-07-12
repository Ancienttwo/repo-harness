# Implementation Notes: harness-cost-baseline-slo

> **Status**: Active
> **Plan**: plans/plan-20260712-2151-harness-cost-baseline-slo.md
> **Contract**: tasks/contracts/20260712-2151-harness-cost-baseline-slo.contract.md
> **Review**: tasks/reviews/20260712-2151-harness-cost-baseline-slo.review.md
> **Last Updated**: 2026-07-12 21:51
> **Lifecycle**: notes

## Design Decisions

- Keep live hook runtime instrumentation out of this slice. Current tool trace
  records host tool duration, not hook wall time, so unavailable live metrics
  remain null instead of being mislabeled.
- Treat Claude JSON and Codex JSONL as provider-specific authorities. Preserve
  their raw token fields rather than synthesizing totals or request counts.
- Keep current `with_skill` / `without_skill` profile identifiers. The report
  labels `without_skill` as a skill-disabled baseline because it does not
  isolate global hooks, host config, or all user Skills.
- Extend existing files instead of creating a telemetry subsystem or parser
  module; there are only two provider consumers and no independent shared
  release boundary.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Instrument every hook route now | Reject | Changes the hot path before the baseline proves that cost is material. |
| Infer model/subagent calls from turns or tool names | Reject | Neither provider exposes a stable aggregate; inference would create false authority. |
| Rename profiles to No Harness / Adaptive Lite | Defer | Current baseline is not host-isolated and the candidate profile does not exist. |

## Open Questions

- A later contract may add hot-path runtime spans only if this baseline shows
  that synthetic probes and provider usage are insufficient for a concrete
  routing decision.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
