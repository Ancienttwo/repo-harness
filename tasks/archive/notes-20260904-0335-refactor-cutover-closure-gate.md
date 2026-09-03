> **Archived**: 2026-09-04 03:35
> **Related Plan**: plans/archive/plan-20260903-1713-refactor-cutover-closure-gate.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260904-0335
> **Archive Projection V1**: `plans/plan-20260903-1713-refactor-cutover-closure-gate.md` => `plans/archive/plan-20260903-1713-refactor-cutover-closure-gate.md`
> **Archive Projection V1**: `tasks/notes/20260903-1713-refactor-cutover-closure-gate.notes.md` => `tasks/archive/notes-20260904-0335-refactor-cutover-closure-gate.md`
> **Archive Projection V1**: `tasks/contracts/20260903-1713-refactor-cutover-closure-gate.contract.md` => `tasks/archive/contract-20260904-0335-refactor-cutover-closure-gate.md`
> **Archive Projection V1**: `tasks/reviews/20260903-1713-refactor-cutover-closure-gate.review.md` => `tasks/archive/review-20260904-0335-refactor-cutover-closure-gate.md`

# Implementation Notes: refactor-cutover-closure-gate

> **Status**: Active
> **Plan**: plans/archive/plan-20260903-1713-refactor-cutover-closure-gate.md
> **Contract**: tasks/archive/contract-20260904-0335-refactor-cutover-closure-gate.md
> **Review**: tasks/archive/review-20260904-0335-refactor-cutover-closure-gate.md
> **Last Updated**: 2026-09-04 01:19
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:e8bd9366460e458cc0bb5116f2bdef97a788bac0bc3a9f03ab37de3461cc88db`

## Design Decisions

- Reuse only deterministic scanner mechanics from WIP `3fe8f4db02098d92b602868611b1bddde79894dc`; the PRD and upstream contract own all public semantics.
- Keep Module 1 independent of ArchContext package versions; published 0.5.2 affects the later provider-stage readback and pin correction, not this evaluator.
- Treat each selector as one repository-wide exact match set. The contract author must place that whole set in one category/disposition; the evaluator does not infer path classes or subtract docs. For PR #230, the two deleted implementation paths prove implementation removal, while `symbol:ProviderThreadEffectIntentV1` is explicitly `docs_and_projections:migrated` because its surviving exact occurrence is the historical PRD.
- Constrain CLI report writes to `.ai/harness/checks/`, reject contract/output symlink escapes, and open the final report with `O_NOFOLLOW`; the original WIP's string-only path validation was not sufficient at this trust boundary.

## Deviations From Plan Or Spec

- The initial PR #230 inventory triggered the plan's falsifier: exact-tree symbol scanning found `ProviderThreadEffectIntentV1` in `plans/prds/20260825-1551-provider-thread-effect-adapter.prd.md:115`. Reconciliation changed only the handwritten inventory: the selector now belongs to `docs_and_projections:migrated`; exact-tree scanning remains repository-wide and unchanged. Work remained unwired and policy stayed off/false during reconciliation.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Cherry-pick the old WIP | Reject | It carries obsolete protocol and unrelated workflow wiring. |
| Salvage bounded exact-scan mechanics | Adopt | It preserves verified deterministic work without creating dual authority. |

## Open Questions

- Before Module 3, replace stale 0.5.0/0.5.1 assumptions only after an `archctx@0.5.2 capabilities --json` readback.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
