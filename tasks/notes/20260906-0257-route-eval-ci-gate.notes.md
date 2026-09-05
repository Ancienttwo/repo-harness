# Implementation Notes: route-eval-ci-gate

> **Status**: Active
> **Plan**: plans/plan-20260906-0257-route-eval-ci-gate.md
> **Contract**: tasks/contracts/20260906-0257-route-eval-ci-gate.contract.md
> **Review**: tasks/reviews/20260906-0257-route-eval-ci-gate.review.md
> **Last Updated**: 2026-09-06 02:57
> **Lifecycle**: notes

## Design Decisions

- Coverage is computed from `expected.intent`/`expected.action` of scenarios that
  actually matched the TS arm, never from the raw expectation table. A mismatched
  scenario therefore fails twice (mismatch plus lost coverage) instead of
  silently claiming a branch it no longer reaches.
- `REQUIRED_INTENT_COVERAGE` / `REQUIRED_ACTION_COVERAGE` are literal arrays, not
  projections of `PROMPT_GUARD_INTENTS` / `PROMPT_GUARD_ACTIONS`. Deriving them
  would make a newly added vocabulary entry auto-required with no scenario, which
  turns the gate red for the wrong reason; a literal list forces the person who
  adds an action to decide whether the prompt layer can reach it.
- `checkTsArm(scenarios = ROUTE_SCENARIOS)` takes the corpus as a parameter only
  so the flipped-expectation test can prove the gate fails without mutating the
  shipped corpus or spawning a second process. It is not a second corpus
  authority: the CLI mode always calls it with the default.
- `bug-fix-ignores-pending-plan` deliberately sets `pending: "fresh"`. The
  interesting behavior is the carve-out in `decideNoActivePlanAction` where a
  bug-fix intent does *not* consume a pending design discussion, so the scenario
  would be worthless with `pending: "none"`.

## Deviations From Plan Or Spec

- The plan's P1 said `ROUTE_SCENARIOS` had 9 entries; the file had 8. Corpus grew
  8 -> 31, not 9 -> 31.
- The plan expected a `## Unreachable Actions` list. The Falsifier check found
  none: every action is selected by intent plus `PromptGuardState`, and the eval
  controls both. The section records that enumeration instead of a list.
- `tests/bootstrap-files.test.ts` needed no change: it asserts individual
  check-ci lines and their relative order, never an exhaustive step list, so the
  new step keeps it truthful as written.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Rewrite the alias test's hardcoded 8-entry decision list vs. keep it | Rewrite as `expectedNlDecisions()` plus an alias/intent override map | The hardcoded list made `nl_compliance == 1` a function of corpus size; every future scenario would have broken an unrelated normalization test |
| Append new scenarios vs. reorder the corpus by intent | Append after the original 8 | `NL arm mismatches are recorded as no-go evidence` indexes `decisions[0]` and `decisions[3]`; preserving the head order keeps that regression pointed at the same two scenarios |

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
