# Plan: HE-05 Trace/Eval Evidence Schema v1

> **Status**: Approved
> **Created**: 2026-06-17
> **Slug**: HE-05-trace-eval-schema
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260616-harness-engineering-frameworks.md`
> **Task Contract**: `tasks/contracts/20260616-HE-05-trace-eval-schema.contract.md`
> **Task Review**: `tasks/reviews/20260616-HE-05-trace-eval-schema.review.md`
> **Implementation Notes**: `tasks/notes/20260616-HE-05-trace-eval-schema.notes.md`

## Agentic Routing

- Selected route: migration task contract
- Routing reason: HE-05 changes the verifier evidence schema, workflow checks, helper manifest, reference docs, and eval fixtures.
- Due diligence:
  - P1 map: `verify-sprint.sh` owns latest checks and run snapshots; `check-task-workflow.sh --strict` owns repo workflow shape; `harness-trace-grade.sh` owns local eval scoring.
  - P2 trace: active contract -> `verify-sprint.sh` runs `verify-contract` -> writes `.ai/harness/checks/latest.json` and `.ai/harness/runs/*.json` -> strict workflow validates schema -> grader scores the trace.
  - P3 decision rationale: keep v1 minimal and local-only, with full graders in a separate script so strict workflow remains a shape check.

## Evidence Contract

- **State/progress path**: HE-05 row in `plans/sprints/20260617-Sprint: Harness Engineering Optimization - State, Review, Eval, Delegation.md`
- **Verification evidence**: `bash scripts/verify-sprint.sh`; `jq '.schema' .ai/harness/checks/latest.json`; `bash scripts/harness-trace-grade.sh --run .ai/harness/checks/latest.json --strict`; `bun test tests/helper-scripts.test.ts`
- **Evaluator rubric**: latest checks conforms to `repo-harness-run-trace.v1`, five local fixtures grade pass, strict workflow rejects malformed non-empty latest traces, and no external service is required.
- **Stop condition**: HE-05 row checked and staged diff contains trace schema, grader, fixtures, docs, manifest, and task filing only.
- **Rollback surface**: restore `verify-sprint` output shape, remove grader/fixtures/schema docs, and uncheck HE-05.

## Agent Progress Checklist

- [x] Define trace schema in `docs/reference-configs/harness-overview.md`.
- [x] Add schema, task profile, command, guard, handoff, file, allowed-path, and next-step fields to `verify-sprint.sh`.
- [x] Add strict latest-trace shape validation to `check-task-workflow.sh`.
- [x] Add `scripts/harness-trace-grade.sh` with local graders.
- [x] Add at least five trace fixtures under `tests/fixtures/harness-traces/`.
- [ ] Stage HE-05 artifact batch.
