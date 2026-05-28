# Sprint Contract: init-cli-external-skills

> **Status**: Fulfilled
> **Plan**: plans/plan-20260528-1906-init-cli-external-skills.md
> **Owner**: Codex
> **Capability ID**: public-surface-root-router
> **Last Updated**: 2026-05-28 21:52
> **Review File**: `tasks/reviews/init-cli-external-skills.review.md`
> **Notes File**: `tasks/notes/init-cli-external-skills.notes.md`

## Goal

Ship a first-class `agentic-dev init` path that refreshes the local runtime setup for existing repos, retires `project-initializer` installed aliases, and keeps generated workflow verification intact.

## Scope

- In scope: CLI init command, installed-copy sync behavior, migration helper fallout, docs/architecture copy, version/eval wording, workflow metadata, and tests.
- Out of scope: CodeGraph MCP installation, gstack/gbrain installation, and a broad rename of historical internal environment variables.

## Workflow Inventory

- Source plan: `plans/plan-20260528-1906-init-cli-external-skills.md`
- Todo projection: `tasks/todo.md`
- Review file: `tasks/reviews/init-cli-external-skills.review.md`
- Notes file: `tasks/notes/init-cli-external-skills.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: root required checks pass and the review recommends pass.

## Allowed Paths

```yaml
allowed_paths:
  - README.md
  - SKILL.md
  - AGENTS.md
  - CLAUDE.md
  - .gitignore
  - package.json
  - bun.lock
  - assets/
  - docs/
  - scripts/
  - src/
  - tests/
  - .ai/context/context-map.json
  - .ai/harness/policy.json
  - .ai/harness/workflow-contract.json
  - .ai/hooks/
  - .codex/hooks.json
  - tasks/todo.md
  - tasks/research.md
  - tasks/notes/init-cli-external-skills.notes.md
  - tasks/contracts/init-cli-external-skills.contract.md
  - tasks/reviews/init-cli-external-skills.review.md
  - plans/plan-20260528-1906-init-cli-external-skills.md
  - .ai/harness/active-plan
  - .ai/harness/active-worktree
  - .claude/.active-plan
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/cli/commands/init.ts
    - tasks/notes/init-cli-external-skills.notes.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/reviews/init-cli-external-skills.review.md
  tests_pass:
    - path: tests/cli/init.test.ts
    - path: tests/readme-dx.test.ts
  commands_succeed:
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Completion Evidence

- `bun test`: 422 pass, 6 skip, 0 fail.
- `bash scripts/check-deploy-sql-order.sh`: OK.
- `bash scripts/check-task-sync.sh`: OK.
- `bash scripts/check-task-workflow.sh --strict`: OK.
- `bun scripts/inspect-project-state.ts --repo . --format text`: `mode: audit`, no drift signals.
- `bash scripts/migrate-project-template.sh --repo . --dry-run`: OK.
- `bun src/cli/index.ts init --target codex`: OK after rerun with an isolated npm cache.
- `bash scripts/verify-sprint.sh`: first rerun exposed this contract's stale YAML fence/manual-check evidence; after the contract fix and post-bash evidence-preservation fix, rerun passed and wrote `.ai/harness/runs/run-20260528T214702-70935-init-cli-external-skills.json`.

## Acceptance Notes (Human Review)

- Functional behavior: `agentic-dev init` is the primary existing-repo setup command.
- Edge cases: dry-run and opt-out flags bound host-level side effects.
- Regression risks: host adapter trust and installed skill alias cleanup.
- Manual review evidence: installed-copy sync and local init command were run in the original init slice; this correction slice revalidated workflow semantics and did not rerun host mutation commands.

## Rollback Point

- Commit / checkpoint: pre-commit dirty tree before this plan lands.
- Revert strategy: revert the init command, installed-copy sync changes, docs/tests, and generated workflow artifacts for this slice.
