> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260612-0538-arch-doc-loop-04-research-surface-migration.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: arch-doc-loop-04-research-surface-migration

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-0538-arch-doc-loop-04-research-surface-migration.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 05:38
> **Review File**: `tasks/reviews/20260612-0538-arch-doc-loop-04-research-surface-migration.review.md`
> **Notes File**: `tasks/notes/20260612-0538-arch-doc-loop-04-research-surface-migration.notes.md`

## Goal

Move the durable research source of truth from the legacy singleton
`tasks/research.md` file to report files under `docs/researches/`, including
hook freshness checks, generated templates, migration behavior, and validation
tests.

## Scope

- In scope:
- ResearchGate freshness logic and prompt text.
- Self-host and asset hook parity for research freshness helpers.
- Generated repo policy, templates, root context, workflow contract, and
  migration/bootstrap behavior.
- Legacy `tasks/research.md` tombstone plus archived legacy content under
  `docs/researches/`.
- Tests for fresh/stale ResearchGate behavior, scaffold/migration parity, and
  active-reference cleanup.
- Out of scope:
- Changing the architecture queue/freshness gate delivered in rows 1-3.
- Rewriting historical archived plans/reviews/run snapshots.
- Moving `tasks/lessons.md`, `tasks/notes/`, or task contracts.

## Workflow Inventory

- Source plan: `plans/plan-20260612-0538-arch-doc-loop-04-research-surface-migration.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-0538-arch-doc-loop-04-research-surface-migration.review.md`
- Notes file: `tasks/notes/20260612-0538-arch-doc-loop-04-research-surface-migration.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/policy.json
  - .ai/harness/workflow-contract.json
  - .ai/hooks/lib/workflow-state.sh
  - .ai/hooks/prompt-guard.sh
  - .claude/templates/
  - AGENTS.md
  - CLAUDE.md
  - assets/hooks/lib/workflow-state.sh
  - assets/hooks/prompt-guard.sh
  - assets/partials/
  - assets/partials-agents/
  - assets/reference-configs/
  - assets/templates/
  - assets/workflow-contract.v1.json
  - docs/reference-configs/
  - docs/researches/
  - docs/spec.md
  - plans/
  - scripts/capture-plan.sh
  - scripts/check-task-sync.sh
  - scripts/check-task-workflow.sh
  - scripts/codex-handoff-resume.sh
  - scripts/create-project-dirs.sh
  - scripts/ensure-task-workflow.sh
  - scripts/init-project.sh
  - scripts/inspect-project-state.ts
  - scripts/lib/project-init-lib.sh
  - scripts/migrate-project-template.sh
  - scripts/migrate-workflow-docs.ts
  - scripts/new-plan.sh
  - scripts/plan-to-todo.sh
  - scripts/workflow-contract.ts
  - tasks/research.md
  - tasks/sprints/20260612-0256-architecture-doc-loop.sprint.md
  - tasks/todo.md
  - tasks/contracts/20260612-0538-arch-doc-loop-04-research-surface-migration.contract.md
  - tasks/reviews/20260612-0538-arch-doc-loop-04-research-surface-migration.review.md
  - tasks/notes/20260612-0538-arch-doc-loop-04-research-surface-migration.notes.md
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/researches/20260612-legacy-research-notes.md
    - docs/researches/README.md
    - tasks/research.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-0538-arch-doc-loop-04-research-surface-migration.notes.md
  tests_pass:
    - path: tests/hook-runtime.test.ts
    - path: tests/migration-script.test.ts
    - path: tests/create-project-dirs.runtime.test.ts
    - path: tests/workflow-contract.test.ts
  commands_succeed:
    - bun test tests/hook-runtime.test.ts tests/workflow-contract.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/scaffold-parity.test.ts tests/bootstrap-files.test.ts tests/check-task-sync.test.ts
    - cmp assets/workflow-contract.v1.json .ai/harness/workflow-contract.json
    - cmp .ai/hooks/lib/workflow-state.sh assets/hooks/lib/workflow-state.sh
    - cmp .ai/hooks/prompt-guard.sh assets/hooks/prompt-guard.sh
    - bash scripts/check-task-workflow.sh --strict
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - bash scripts/check-task-sync.sh
    - bash scripts/check-architecture-sync.sh
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - bash -lc "(rg -n 'tasks/research\\.md' AGENTS.md CLAUDE.md .ai assets docs scripts tests tasks --glob '!plans/archive/**' --glob '!tasks/archive/**' --glob '!docs/researches/**' --glob '!tasks/notes/**' --glob '!tasks/contracts/**' --glob '!tasks/reviews/**' --glob '!tasks/sprints/**' | rg -v '^(scripts/migrate-project-template\\.sh|scripts/migrate-workflow-docs\\.ts|assets/templates/helpers/migrate-project-template\\.sh|assets/templates/helpers/migrate-workflow-docs\\.ts|assets/workflow-contract\\.v1\\.json|\\.ai/harness/workflow-contract\\.json):' || true) >/tmp/arch-doc-loop-04-active-research-refs.txt; test ! -s /tmp/arch-doc-loop-04-active-research-refs.txt"
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
