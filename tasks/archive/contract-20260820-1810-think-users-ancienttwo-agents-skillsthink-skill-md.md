> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260530-0142-think-users-ancienttwo-agents-skillsthink-skill-md.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: think-users-ancienttwo-agents-skillsthink-skill-md

> **Status**: Fulfilled
> **Plan**: plans/plan-20260530-1529-think-users-ancienttwo-agents-skillsthink-skill-md.md
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-05-30 15:31
> **Review File**: `tasks/reviews/think-users-ancienttwo-agents-skillsthink-skill-md.review.md`
> **Notes File**: `tasks/notes/think-users-ancienttwo-agents-skillsthink-skill-md.notes.md`

## Goal

Implement a stateful, advisory-only CodeGraph structural discovery nudge and
Bash scope evidence layer in the existing repo-harness hook runtime, without
changing route registry or host adapter shape.

## Scope

- In scope:
  - Session-local CodeGraph used/nudged markers under ignored `.claude/`.
  - Mark CodeGraph usage from the existing `trace-event.sh` PostToolUse path.
  - Upgrade the existing `prompt-guard.sh` CodeGraph hint into a one-shot nudge.
  - Add broad Bash command metadata to `post-bash.sh` evidence.
  - Keep `.ai/hooks` and `assets/hooks` mirrors aligned.
  - Focused hook/runtime/parity tests and required repo checks.
- Out of scope:
  - Any route registry or user-level host adapter changes.
  - Hard-blocking shell tools.
  - Headroom, Caveman, RTK, context-mode, or other new runtime dependencies.
  - Token reduction as a success metric.

## Workflow Inventory

- Source plan: `plans/plan-20260530-1529-think-users-ancienttwo-agents-skillsthink-skill-md.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/think-users-ancienttwo-agents-skillsthink-skill-md.review.md`
- Notes file: `tasks/notes/think-users-ancienttwo-agents-skillsthink-skill-md.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass and the review recommend pass.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todo.md
  - tasks/contracts/think-users-ancienttwo-agents-skillsthink-skill-md.contract.md
  - tasks/reviews/think-users-ancienttwo-agents-skillsthink-skill-md.review.md
  - tasks/notes/think-users-ancienttwo-agents-skillsthink-skill-md.notes.md
  - .ai/hooks/lib/session-state.sh
  - .ai/hooks/trace-event.sh
  - .ai/hooks/prompt-guard.sh
  - .ai/hooks/post-bash.sh
  - assets/hooks/lib/session-state.sh
  - assets/hooks/trace-event.sh
  - assets/hooks/prompt-guard.sh
  - assets/hooks/post-bash.sh
  - tests/hook-runtime.test.ts
  - tests/hook-contracts.test.ts
  - tests/hook-protocol.test.ts
  - tests/scaffold-parity.test.ts
  - tests/output-parity.test.ts
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - .ai/hooks/lib/session-state.sh
    - assets/hooks/lib/session-state.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/think-users-ancienttwo-agents-skillsthink-skill-md.notes.md
  tests_pass:
    - path: tests/hook-runtime.test.ts
    - path: tests/hook-contracts.test.ts
    - path: tests/hook-protocol.test.ts
    - path: tests/scaffold-parity.test.ts
    - path: tests/output-parity.test.ts
  commands_succeed:
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: non-trivial code prompts emit at most one CodeGraph nudge
  per session; observed CodeGraph tool usage silences further nudges.
- Edge cases: plan discussion, diagnostic questions, pure git/status, and small
  prose tasks stay silent.
- Regression risks: Codex non-SessionStart stdout protocol and hook hot-path
  runtime cost must remain stable.

## Rollback Point

- Commit / checkpoint: branch `codex/think-users-ancienttwo-agents-skillsthink-skill-md`.
- Revert strategy: revert the hook script pairs and focused tests; ignored
  `.claude/.codegraph-state/` can be deleted without data migration.
