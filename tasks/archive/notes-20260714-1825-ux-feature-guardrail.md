> **Archived**: 2026-07-14 18:25
> **Related Plan**: plans/archive/plan-20260714-1710-ux-feature-guardrail.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260714-1825

# Implementation Notes: ux-feature-guardrail

> **Status**: Active
> **Plan**: plans/plan-20260714-1710-ux-feature-guardrail.md
> **Contract**: tasks/contracts/20260714-1710-ux-feature-guardrail.contract.md
> **Review**: tasks/reviews/20260714-1710-ux-feature-guardrail.review.md
> **Last Updated**: 2026-07-14 17:10
> **Lifecycle**: notes

## Design Decisions

- Kept `assets/reference-configs/ux-feature-guard.md` as the packaged authority,
  with the self-host `docs/reference-configs/` mirror and `repo-harness docs show`
  projection. The external `ux-writing` skill was adapted and cited, not vendored.
- Extended the existing human-confirmed design brief and BDD advisory instead of
  creating a UX ledger, validator, sidecar, semantic classifier, or second artifact.
- Treated “instruction versus payload” as an explicit semantic boundary; the
  carrier sentence is never a fallback payload.
- Adapted the external diagnostic fallback rule to repo fail-closed posture:
  only verified state explicitly labeled partial may be displayed alongside the
  load failure; otherwise the diagnostic aborts instead of substituting defaults.
- Architecture specialist review found three authority-drift risks. The follow-up
  cutover now makes the design-brief template the only Guard Card field-schema
  authority, defines a one-way PRD/spec/user-evidence -> confirmed design brief
  -> contract -> BDD test/review projection chain with stable scenario IDs, and
  leaves only one parser-visible `## Task Breakdown` in the active plan.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Vendor the third-party skill as a new public skill | Reject | It covers UX writing/docs, not the four product-authority failures, and would create another routing/authority surface. |
| Add deterministic UX/BDD validation machinery | Reject | Recent sealed BDD2/BDD3 evaluations rejected validator/ledger machinery; the existing human-confirmed brief is the correct front fence. |
| Extend design brief + BDD and add one canonical convention | Use | Reuses the existing pre-execution boundary and keeps detailed rules in one runtime document. |

## Open Questions

- Cross-model external acceptance is unavailable in this run: both Claude
  `fable` and the one allowed `opus` fallback failed before review with
  `You've hit your monthly spend limit`.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- External source: `https://github.com/FogMoe/agents/blob/main/skills/ux-writing/SKILL.md`
- Focused test: `tests/ux-feature-guardrail.test.ts`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
