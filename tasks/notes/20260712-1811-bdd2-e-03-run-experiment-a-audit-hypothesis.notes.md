# Implementation Notes: bdd2-e-03-run-experiment-a-audit-hypothesis

> **Status**: Active
> **Plan**: plans/plan-20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.md
> **Contract**: tasks/contracts/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.contract.md
> **Review**: tasks/reviews/20260712-1811-bdd2-e-03-run-experiment-a-audit-hypothesis.review.md
> **Last Updated**: 2026-07-12 18:15
> **Lifecycle**: notes

## Design Decisions

- Cut `evaluation-manifest` directly to v3 with per-experiment adjudication
  authority. The old global Shape schema path is deleted; no v2 parser, alias, or
  fallback remains.
- Freeze six seeded and six clean held-out fixtures across web, CLI, and native UI
  behavior. Private truth is exhaustive for this synthetic fixture set so unmatched
  response findings count as false positives.
- Blind scores record reviewer finding boundaries and at most one matched truth issue
  per finding. Duplicate truth matches fail validation instead of inflating recall.
- Final Audit scoring is condition-blind and truth-aware: a scorer receives one
  response plus only that task's frozen issues, never condition/prompt/coordinate or
  sibling outputs. This supports exact matching but remains Agent-panel proxy evidence.
- `pass` with zero findings is the only correct no-findings outcome. `inconclusive`
  preserves uncertainty but does not earn clean-fixture credit.
- Reuse the source-commit coordinate envelope for both S and A. Extract shared code
  only where the exact same invariant has two real consumers.
- Audit score validation reconstructs every hashed authority path from the recorded
  source commit and compares it with the already validated current authority before
  accepting scores or projecting evidence.
- The shared ISO date-time assertion serves both existing Shape and new Audit locked
  scores so runtime validation matches both frozen JSON schemas.

## Deviations From Plan Or Spec

- The first execution attempt stopped on its first coordinate before producing a
  response because Codex reported an account usage limit with a 20:14 reset time.
  That partial ignored directory is excluded and removed; no model/profile/threshold
  change and no coordinate reuse is permitted on retry.
- A read-only authority review found two P1 blockers before execution: an
  unreconstructible Audit `source_commit` and duplicate primary truth for A-H-11.
  Both were corrected and covered before resealing; its P2 timestamp and Kill-gate
  test gaps were corrected in the same authority revision.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| One union score schema | Reject | Recreates shared authority and allows one experiment's evolution to drift the other. |
| Per-experiment schemas and metrics | Choose | Matches independent hypotheses and fails closed before A sealing. |
| Parse Agent output automatically | Reject | Free-text finding boundaries are semantic; blind adjudication records them explicitly. |
| Generic benchmark service/database | Reject | Forty-eight outputs and flat evidence do not justify a runtime or dependency. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-execution full CI on sealed authority: `bun run check:ci` passed with
  1,142 tests, one platform skip, zero failures, workflow checks, repository
  inspection, and packaged tarball smoke.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
