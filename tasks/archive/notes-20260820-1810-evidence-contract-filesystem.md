> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Evidence Contract Filesystem Guard

> **Status**: Active
> **Lifecycle**: notes

## Design Decision

- The Evidence Contract is repo-owned rather than Waza-owned. Waza `/think` can still suggest the plan shape, but the durable source of truth is the plan artifact under `plans/` plus the generated templates and guards in this repo.
- `scripts/plan-to-todo.sh` is the hard transition from approved plan to execution, so it rejects Approved plans that do not fill `## Evidence Contract`.
- `prompt-guard.sh` repeats the same check for implementation and completion intent so agents cannot bypass `plan-to-todo.sh` by asking to implement or mark done from an incomplete Approved plan directly.

## Evidence Fields

- State/progress path
- Verification evidence
- Evaluator rubric
- Stop condition
- Rollback surface
