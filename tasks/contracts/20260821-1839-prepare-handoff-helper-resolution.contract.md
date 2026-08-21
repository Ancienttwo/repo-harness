# Prepare Handoff Helper Resolution Contract

> **Status**: Active
> **Plan**: plans/plan-20260821-1839-prepare-handoff-helper-resolution.md
> **Task Profile**: code-change
> **Workflow Profile**: strict
> **Capability ID**: runtime-harness-hook-adapters

## Allowed Paths

```yaml
allowed_paths:
  - .ai/hooks/.projection.json
  - .ai/hooks/lib/workflow-state.sh
  - assets/hooks/lib/workflow-state.sh
  - assets/templates/helpers/prepare-handoff.sh
  - scripts/prepare-handoff.sh
  - src/cli/runtime/helper-runner.ts
  - tests/cli/run.test.ts
  - tests/helper-scripts.test.ts
  - plans/plan-20260821-1839-prepare-handoff-helper-resolution.md
  - tasks/contracts/20260821-1839-prepare-handoff-helper-resolution.contract.md
  - tasks/notes/20260821-1839-prepare-handoff-helper-resolution.notes.md
exit_criteria:
  tests_pass:
    - bun test tests/helper-scripts.test.ts --timeout 60000
    - bun test tests/cli/run.test.ts --timeout 60000
  commands_succeed:
    - bun scripts/sync-hook-sources.ts --check
    - repo-harness run check-task-workflow --strict
```

## Boundary

Repair packaged helper resolution only. Do not change recovery-view semantics, target adoption contents, host hooks, release versioning, or downstream product code.
