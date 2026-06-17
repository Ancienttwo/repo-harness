# Plan: HE-06 Handoff and Current Snapshot UX

> **Status**: Approved
> **Created**: 2026-06-17
> **Slug**: HE-06-handoff-current-ux
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260616-harness-engineering-frameworks.md`
> **Task Contract**: `tasks/contracts/20260616-HE-06-handoff-current-ux.contract.md`
> **Task Review**: `tasks/reviews/20260616-HE-06-handoff-current-ux.review.md`
> **Implementation Notes**: `tasks/notes/20260616-HE-06-handoff-current-ux.notes.md`

## Agentic Routing

- Selected route: migration task contract
- Routing reason: HE-06 changes handoff rendering, CLI status output, strict workflow freshness checks, docs, and tests.
- Due diligence:
  - P1 map: `.ai/hooks/lib/workflow-state.sh` owns handoff content; `prepare-handoff.sh` is the user-facing wrapper; `check-task-workflow.sh` owns freshness gates; `refresh-current-status.sh` keeps `tasks/current.md` as a generated read model.
  - P2 trace: active marker -> handoff active artifacts -> resume packet refresh -> strict workflow compares handoff/resume/current mtimes.
  - P3 decision rationale: strengthen recovery artifacts without turning `tasks/current.md` into an execution source.

## Evidence Contract

- **State/progress path**: HE-06 row in `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md`
- **Verification evidence**: `bash scripts/prepare-handoff.sh --reason "HE-06 verification"`; `bash scripts/check-task-workflow.sh --strict`; `bun test tests/helper-scripts.test.ts`
- **Evaluator rubric**: handoff includes active artifacts, resume refresh status is visible, stale current/resume state fails strict workflow, and current snapshot remains checklist-free.
- **Stop condition**: HE-06 row checked and staged diff contains handoff/current UX surfaces only.
- **Rollback surface**: revert handoff/check/docs/tests changes and uncheck HE-06.

## Agent Progress Checklist

- [x] Add active artifacts and latest trace to handoff output.
- [x] Add `prepare-handoff.sh --status` and `--reason`.
- [x] Add strict workflow gate for `tasks/current.md` newer than resume.
- [x] Add source-artifacts-first handoff protocol rule.
- [x] Add helper tests for active artifacts, status output, stale resume, and active-marker current snapshot behavior.
- [ ] Stage HE-06 artifact batch.
