# Sprint Contract: runtime-docs-user-level

> **Status**: Fulfilled
> **Plan**: plans/plan-20260613-0236-runtime-docs-user-level.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-13 03:18
> **Review File**: `tasks/reviews/20260613-0236-runtime-docs-user-level.review.md`
> **Notes File**: `tasks/notes/20260613-0236-runtime-docs-user-level.notes.md`

## Goal

Move generic repo-harness runtime reference docs to the user-level/package
authority while keeping repo-local `.ai/` runtime artifacts intact.

## Scope

- In scope:
  - Add `repo-harness docs list|path|show`.
  - Generate deterministic `docs/reference-configs/*.md` pointer stubs for
    downstream scaffold/migration targets.
  - Preserve user-authored project-specific reference docs.
  - Update workflow contract, policy, checks, tests, README, and changelog.
  - Retire obsolete `AGENTS.md`/`CLAUDE.md` reference-doc asset entries and the
    duplicate package `docs/reference-configs/` runtime-doc publish surface.
- Out of scope:
  - Do not move `.ai/harness/*`, `.ai/context/*`, checks, runs, handoff,
    security state, or helper runtime snapshots to user-level state.

## Workflow Inventory

- Source plan: `plans/plan-20260613-0236-runtime-docs-user-level.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260613-0236-runtime-docs-user-level.review.md`
- Notes file: `tasks/notes/20260613-0236-runtime-docs-user-level.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `.ai/harness/scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - README.md
  - docs/CHANGELOG.md
  - docs/reference-configs/
  - assets/reference-configs/
  - assets/templates/helpers/
  - assets/workflow-contract.v1.json
  - .ai/harness/workflow-contract.json
  - package.json
  - scripts/
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260613-0236-runtime-docs-user-level.contract.md
  - tasks/reviews/20260613-0236-runtime-docs-user-level.review.md
  - tasks/notes/20260613-0236-runtime-docs-user-level.notes.md
  - .ai/context/capabilities.json
  - src/
  - tests/
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent: narrate_and_gatekeep
    worker: implement_contract
    verifier: review_exit_criteria
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260613-0236-runtime-docs-user-level.notes.md
  tests_pass:
    - command: bun test tests/cli/docs.test.ts tests/workflow-contract.test.ts tests/bootstrap-files.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/readme-dx.test.ts
    - command: bun test
  commands_succeed:
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

- Functional behavior: CLI resolves package docs; downstream scaffolds and
  migrations install pointer stubs instead of copied prose; `.ai/` runtime
  artifacts remain repo-local.
- Edge cases: Unknown doc IDs exit 2; full doc profile still creates stubs;
  custom project-specific reference docs are preserved.
- Regression risks: Package consumers now rely on `assets/reference-configs/`
  through `repo-harness docs` instead of duplicate packaged `docs/reference-configs/`.

## Rollback Point

- Commit / checkpoint: branch `codex/runtime-docs-user-level`.
- Revert strategy: revert this branch; no external service or data rollback.
