> **Archived**: 2026-07-12 23:21
> **Related Plan**: plans/archive/plan-20260712-2151-harness-cost-baseline-slo.md
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: run-20260712-2321

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

- The first independent review found that the documented phase SLO named p95
  while the implementation gated on max, SessionStart SLO failure did not fail
  the CLI, Claude cache-creation tokens were omitted, an inert empty
  SessionStart response was treated as unavailable, and the captured plan had a
  duplicate Task Breakdown. All five were corrected before closeout; the final
  rereview reported no remaining findings.
- Strict workflow verification exposed that `harness-overview.md` is also a
  brain-manifest product-source projection. The contract was widened only to
  mirror the same bytes into `assets/reference-configs/harness-overview.md`;
  no additional behavior or runtime surface was added.

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
- Final external-acceptance binding is blocked by local repository state rather
  than the implementation: the shared local `main` is dirty and behind
  `origin/main`, while `verify-sprint` resolves its fingerprint against local
  `main`. Claude reviewed the intended `origin/main` diff with P2 advisories
  only, but the second review against the gate's 89-file stale-main diff hit the
  Claude session limit. Do not substitute the reviewed `origin/main`
  fingerprint for the unreviewed local-main fingerprint.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Synthetic 20-iteration baseline: state-snapshot p95 72.51 ms,
  prompt-guard decision p95 38.29 ms, SessionStart 1,883 bytes / estimated
  471 tokens; all configured SLOs passed.
- Provider schema smoke: Claude exposed input, cache-read, cache-creation,
  output, cost, turns, and session fields; Codex JSONL exposed thread/session
  and input, cached-input, and output usage while preserving final output.
- Repository suite: 1,152 passed, one platform skip, zero failed after rebase
  onto `origin/main` `4c3612a`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
