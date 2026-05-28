# Sprint Contract: hook-auto-archive-on-done

> **Status**: Fulfilled
> **Plan**: plans/plan-20260528-1443-hook-auto-archive-on-done.md
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-hook-adapters
> **Last Updated**: 2026-05-28 14:43
> **Review File**: `tasks/reviews/hook-auto-archive-on-done.review.md`
> **Notes File**: `tasks/notes/hook-auto-archive-on-done.notes.md`

## Goal

让 `.ai/hooks/prompt-guard.sh` 在 done intent + 全套 quality gate 通过 + tasks/todo.md 无未勾选项时，自动调用 `scripts/archive-workflow.sh` 完成 plan 归档；outcome 通过 prompt 关键字推断（默认 Completed），保留显式调用 escape hatch。

## Scope

- In scope:
  - 在 `.ai/hooks/prompt-guard.sh` 新增 `derive_done_outcome()` 函数
  - 在 done_intent 分支末尾（所有 quality gate 通过后）新增 ArchiveGuard + AutoArchive 块
- Out of scope:
  - 修改 `.claude/settings.json` 的 hook matcher
  - 修改 `scripts/archive-workflow.sh` 接口
  - 修改 PostToolUse / Stop hook 的归档行为

## Workflow Inventory

- Source plan: `plans/plan-20260528-1443-hook-auto-archive-on-done.md`
- Todo projection: `tasks/todo.md`
- Review file: `tasks/reviews/hook-auto-archive-on-done.review.md`
- Notes file: `tasks/notes/hook-auto-archive-on-done.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass and the review recommend pass.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/hooks/prompt-guard.sh
  - assets/hooks/prompt-guard.sh
  - scripts/check-task-workflow.sh
  - tests/hook-runtime.test.ts
  - plans/
  - tasks/todo.md
  - tasks/contracts/hook-auto-archive-on-done.contract.md
  - tasks/reviews/hook-auto-archive-on-done.review.md
  - tasks/notes/hook-auto-archive-on-done.notes.md
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - .ai/hooks/prompt-guard.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/hook-auto-archive-on-done.notes.md
  commands_succeed:
    - bash -n .ai/hooks/prompt-guard.sh
    - bash scripts/check-task-workflow.sh --strict
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
