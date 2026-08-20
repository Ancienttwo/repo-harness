> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: arch-doc-loop-02-freshness-gate-surfaces

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 04:10
> **Review File**: `tasks/reviews/20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.review.md`
> **Notes File**: `tasks/notes/20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.notes.md`

## Goal

Deliver the architecture freshness gate surfaces: a root check command that
validates architecture queue index integrity and gates only changed capabilities
with pending request cards, plus finish/session-start/package/docs wiring.

## Scope

- In scope:
- `scripts/check-architecture-sync.sh` and its template copy.
- `scripts/capability-resolver.ts` batch `match --paths-from <file|->` support.
- `scripts/contract-worktree.sh finish` orchestration before `verify-sprint`.
- SessionStart architecture queue summary in `.ai/hooks` and `assets/hooks`.
- Root required-check/docs/package surfaces and focused tests.
- Out of scope:
- Enabling strict freshness by default; policy remains advisory unless explicitly changed.
- Slice 3 downstream retired-removal rollout beyond the helper/template parity required for this slice.
- Automatic architecture prose/diagram generation.

## Workflow Inventory

- Source plan: `plans/plan-20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.review.md`
- Notes file: `tasks/notes/20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/hooks/session-start-context.sh
  - .ai/harness/workflow-contract.json
  - AGENTS.md
  - CLAUDE.md
  - assets/hooks/session-start-context.sh
  - assets/skill-commands/repo-harness-architecture/SKILL.md
  - assets/reference-configs/harness-overview.md
  - assets/templates/helpers/capability-resolver.ts
  - assets/templates/helpers/check-architecture-sync.sh
  - assets/templates/helpers/check-task-workflow.sh
  - assets/templates/helpers/contract-worktree.sh
  - assets/workflow-contract.v1.json
  - docs/reference-configs/harness-overview.md
  - package.json
  - plans/
  - scripts/capability-resolver.ts
  - scripts/check-architecture-sync.sh
  - scripts/check-task-workflow.sh
  - scripts/contract-worktree.sh
  - scripts/lib/project-init-lib.sh
  - tasks/todo.md
  - tasks/contracts/20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.contract.md
  - tasks/reviews/20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.review.md
  - tasks/notes/20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.notes.md
  - tasks/sprints/20260612-0256-architecture-doc-loop.sprint.md
  - tests/architecture-sync.test.ts
  - tests/bootstrap-files.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/helper-scripts.test.ts
  - tests/hook-runtime.test.ts
  - tests/migration-script.test.ts
  - tests/scaffold-parity.test.ts
  - tests/workflow-contract.test.ts
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/check-architecture-sync.sh
    - assets/templates/helpers/check-architecture-sync.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-0410-arch-doc-loop-02-freshness-gate-surfaces.notes.md
  tests_pass:
    - path: tests/architecture-sync.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - bun test tests/architecture-sync.test.ts tests/hook-runtime.test.ts tests/helper-scripts.test.ts
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-architecture-sync.sh --mode strict --changed-files /dev/null
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- `contract-worktree.sh finish` calls `check_architecture_freshness` before
  `verify-sprint`.
- `check-architecture-sync.sh` always fails stale derived index state, even when
  freshness mode is off.
- `off`, `advisory`, and `strict` modes are deterministic and tested.
- SessionStart reports pending architecture drift count and oldest age.
- Edge cases:
- Missing resolver/queue dependencies are advisory in advisory mode and
  fail-closed in strict mode.
- Regression risks:
- `verify-sprint` and migration/scaffold helpers must keep passing after the new
  required check is added.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
