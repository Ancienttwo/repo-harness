> **Archived**: 2026-09-04 22:39
> **Related Plan**: plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260904-2239
> **Archive Projection V1**: `plans/plan-20260904-1950-bounded-frontier-stress-test-eval.md` => `plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md`
> **Archive Projection V1**: `tasks/notes/20260904-1950-bounded-frontier-stress-test-eval.notes.md` => `tasks/archive/notes-20260904-2239-bounded-frontier-stress-test-eval.md`
> **Archive Projection V1**: `tasks/contracts/20260904-1950-bounded-frontier-stress-test-eval.contract.md` => `tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md`
> **Archive Projection V1**: `tasks/reviews/20260904-1950-bounded-frontier-stress-test-eval.review.md` => `tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md`

# Implementation Notes: bounded-frontier-stress-test-eval

> **Status**: Complete
> **Plan**: plans/archive/plan-20260904-1950-bounded-frontier-stress-test-eval.md
> **Contract**: tasks/archive/contract-20260904-2239-bounded-frontier-stress-test-eval.md
> **Review**: tasks/archive/review-20260904-2239-bounded-frontier-stress-test-eval.md
> **Last Updated**: 2026-09-04 19:50
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:6f26d9de1d8dfce7b80997da6f6123466d7e2db5a1582b6081d43e39e0ae8d30`

## Design Decisions

- Reused `runSkillEvals()` through its exported API instead of adding CLI flags.
  The experiment needs alternate inputs, but the product CLI has no second
  consumer for that surface.
- Wrote dry-run output below `.ai/harness/runs/`, the existing ignored runtime
  evidence cache, so wiring checks do not create tracked benchmark claims.
- Materialized the treatment inside each disposable workspace. The existing
  link mount grants only the treatment arm source-repository access, so it is a
  confound for this historical-case A/B.
- Added a live-run isolation requirement to the benchmark config and runner.
  Dry runs remain available in the source checkout; provider execution without
  a disposable repo/HOME now fails before the agent starts.
- Replaced the hand-copied baseline summary with the canonical `create.md`
  fixture and added a structural output validator plus a zero-workspace-diff
  grader. Semantic invented-answer review remains human-owned.

## Deviations From Plan Or Spec

- Review expanded the allowed paths to `scripts/run-skill-evals.ts` and its test.
  The original runner's link mount and optional live boundary made the two arms
  observably different and allowed an unsafe source-checkout live run.
- Acceptance materialization refreshed the tracked architecture projection
  manifest. The contract records that deterministic projection and binds the
  existing targeted tests plus dry-run readback as the strict change-assessment
  oracles; neither change expands runtime product behavior.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Modify managed `repo-harness-plan` before eval | Reject | Would make the treatment product authority before evidence exists |
| Add a dedicated eval runner | Reject | Existing runner already isolates fixtures, arms, graders, and provider metrics |
| Use one-shot prerequisite ordering as amendment proxy | Use with explicit limitation | Direct amendment/rework measurement requires a later longitudinal eval |

## Open Questions

- Whether the treatment improves outcomes is intentionally unresolved. The
  committed dry runs prove only fixture and command wiring; the research gate
  requires matched live trials before any managed-Skill promotion.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
