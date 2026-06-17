# Notes: HE-05 Trace/Eval Evidence Schema v1

> **Status**: Complete
> **Plan**: `plans/plan-20260616-HE-05-trace-eval-schema.md`
> **Contract**: `tasks/contracts/20260616-HE-05-trace-eval-schema.contract.md`
> **Review**: `tasks/reviews/20260616-HE-05-trace-eval-schema.review.md`

## Decisions

- `repo-harness-run-trace.v1` is emitted by `verify-sprint.sh` into both latest checks and immutable run snapshots.
- `check-task-workflow.sh --strict` validates only the non-empty latest trace shape.
- `scripts/harness-trace-grade.sh` owns the local scoring rubric so strict workflow checks stay lightweight.

## Tradeoffs

- v1 uses high-level command, guard, file, and allowed-path metadata. It does not model detailed agent spans.
- Fresh repos with `{}` latest checks remain valid; task contracts and graders decide when a real latest trace is required.
- The grader requires `jq`, matching the existing repo-harness shell tooling posture.
- The HE-05 contract allows the full staged sprint migration surface because this task is being verified after HE-01 through HE-04 were staged but not committed.

## Open Questions

- HE-09 strict exit can decide whether latest trace grading becomes mandatory before ship.
