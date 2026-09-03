# Implementation Notes: refactor-cutover-closure-gate

> **Status**: Active
> **Plan**: plans/plan-20260903-1713-refactor-cutover-closure-gate.md
> **Contract**: tasks/contracts/20260903-1713-refactor-cutover-closure-gate.contract.md
> **Review**: tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md
> **Last Updated**: 2026-09-04 00:00
> **Lifecycle**: notes

## Design Decisions

- Reuse only deterministic scanner mechanics from WIP `3fe8f4db02098d92b602868611b1bddde79894dc`; the PRD and upstream contract own all public semantics.
- Keep Module 1 independent of ArchContext package versions; the newly published 0.5.2 affects the later provider-stage readback and pin correction, not this evaluator.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Cherry-pick the old WIP | Reject | It carries obsolete protocol and unrelated workflow wiring. |
| Salvage bounded exact-scan mechanics | Adopt | It preserves verified deterministic work without creating dual authority. |

## Open Questions

- None for Module 1. Before Module 3, replace the stale 0.5.0/0.5.1 stage assumptions only after an `archctx@0.5.2 capabilities --json` readback.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote only durable, verified conclusions after the First Proof Point and acceptance review.

## Promotion Candidates

- None yet.
