# Plan: HE-03 Human Review Card

> **Status**: Approved
> **Created**: 2026-06-17
> **Slug**: HE-03-human-review-card
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260616-harness-engineering-frameworks.md`
> **Task Contract**: `tasks/contracts/20260616-HE-03-human-review-card.contract.md`
> **Task Review**: `tasks/reviews/20260616-HE-03-human-review-card.review.md`
> **Implementation Notes**: `tasks/notes/20260616-HE-03-human-review-card.notes.md`

## Agentic Routing

- Selected route: migration task contract
- Routing reason: HE-03 changes review templates, generated review files, verify-sprint evidence, and fixtures.
- Due diligence:
  - P1 map: review truth crosses `.claude/templates/review.template.md`, `assets/templates/review.template.md`, `plan-to-todo.sh`, `ensure-task-workflow.sh`, `verify-sprint.sh`, and helper/hook tests.
  - P2 trace: generated review -> Human Review Card fields -> `verify-sprint.sh` parses recommendation, card verdict, external acceptance -> `.ai/harness/checks/latest.json`.
  - P3 decision rationale: require card verdict for new verification, while external acceptance remains compatible with the existing review section and card text.

## Workflow Inventory

- Active plan: `plans/plan-20260616-HE-03-human-review-card.md`
- Task contract: `tasks/contracts/20260616-HE-03-human-review-card.contract.md`
- Task review: `tasks/reviews/20260616-HE-03-human-review-card.review.md`
- Implementation notes: `tasks/notes/20260616-HE-03-human-review-card.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260616-HE-03-human-review-card.contract.md` `allowed_paths`

## Approach

Add a card above mode evidence in all review templates and fallback generators.
Teach `verify-sprint.sh` to fail when a passing recommendation lacks a passing
card verdict, and surface card fields in checks JSON.

## Evidence Contract

- **State/progress path**: HE-03 row in `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md`
- **Verification evidence**: `bun test tests/helper-scripts.test.ts`; `bun test tests/bootstrap-files.test.ts tests/readme-dx.test.ts`; `bash scripts/check-task-workflow.sh --strict`; `bash scripts/verify-contract.sh --contract tasks/contracts/20260616-HE-03-human-review-card.contract.md --strict --read-only`
- **Evaluator rubric**: generated reviews start with Human Review Card, verify-sprint fails missing card, checks JSON includes card status, and template assets stay synced.
- **Stop condition**: HE-03 row checked, review recommends pass, and staged HE-03 batch contains no unrelated files.
- **Rollback surface**: revert HE-03 template/verifier/test edits and uncheck HE-03.

## Agent Progress Checklist

- [x] Add Human Review Card to review template above Mode Evidence.
- [x] Add fail-safe placeholders.
- [x] Update generated review rendering and fallback templates.
- [x] Update verify-sprint to parse recommendation, card verdict, and external acceptance.
- [x] Require recommendation pass plus card verdict pass.
- [x] Add missing-card failure test.
- [x] Document residual full-suite risk in review.
- [x] Stage HE-03 artifact batch.
