# Sprint Contract: think-hook-routing

> **Status**: Complete
> **Plan**: plans/plan-20260602-0034-think-hook-routing.md
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-06-02 01:35 +0800
> **Review File**: `tasks/reviews/20260602-0034-think-hook-routing.review.md`
> **Notes File**: `tasks/notes/20260602-0034-think-hook-routing.notes.md`

## Goal

Explicit Waza `/think` planning prompts should enter the planning workflow before generic agent workflow health routing, while preserving the existing repo authority boundary: hook prompts may create Draft planning state and pending orchestration, but execution still requires an Approved captured plan and projection through `plan-to-todo.sh`.

## Scope

- In scope:
- `UserPromptSubmit` Waza route advisory ordering for `/think`, `$think`, and leading `[$think](...)` prompts.
- Pending planning completeness guidance for Stop hooks.
- Self-host hook files and generated `assets/hooks` mirrors.
- Focused regression coverage for the real prompt shape that mentions `hook workflow`.
- Out of scope:
- New hook routes or host adapter entries.
- Automatic execution of Waza, Claude, Codex, or external model commands from hooks.
- Treating Draft planning output as an Approved execution plan.
- Changes to unrelated README imagery or stack-family scaffold notes.

## Workflow Inventory

- Source plan: `plans/plan-20260602-0034-think-hook-routing.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260602-0034-think-hook-routing.review.md`
- Notes file: `tasks/notes/20260602-0034-think-hook-routing.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todo.md
  - tasks/contracts/20260602-0034-think-hook-routing.contract.md
  - tasks/reviews/20260602-0034-think-hook-routing.review.md
  - tasks/notes/20260602-0034-think-hook-routing.notes.md
  - .ai/hooks/prompt-guard.sh
  - .ai/hooks/stop-orchestrator.sh
  - assets/hooks/prompt-guard.sh
  - assets/hooks/stop-orchestrator.sh
  - tests/hook-contracts.test.ts
  - tests/hook-runtime.test.ts
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - .ai/hooks/prompt-guard.sh
    - .ai/hooks/stop-orchestrator.sh
    - assets/hooks/prompt-guard.sh
    - assets/hooks/stop-orchestrator.sh
    - tests/hook-contracts.test.ts
    - tests/hook-runtime.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260602-0034-think-hook-routing.notes.md
  tests_pass:
    - path: tests/hook-runtime.test.ts
    - path: tests/cli/prompt-guard-decision.test.ts
  commands_succeed:
    - bun test tests/hook-runtime.test.ts tests/cli/prompt-guard-decision.test.ts
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  files_contain:
    - path: .ai/hooks/prompt-guard.sh
      pattern: "Default route: Waza /think"
    - path: assets/hooks/prompt-guard.sh
      pattern: "Default route: Waza /think"
    - path: .ai/hooks/stop-orchestrator.sh
      pattern: "phase independence"
    - path: tests/hook-runtime.test.ts
      pattern: "routes explicit Waza think planning before generic workflow health"
  qa_scores:
    - dimension: functionality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: explicit think planning emits `/think` route guidance and still creates Draft plan plus pending orchestration.
- Edge cases: leading markdown skill links must not leak local file paths into slugs; generic hook workflow questions without explicit planning should still route to `/health`.
- Regression risks: ordering changes in `emit_waza_route_hint` could misclassify non-planning workflow prompts if `is_think_plan_start_intent` broadens later.
- Verification result: the hook slice was merged after the brain-root workflow WIP landed, and the required checks now pass on main.

## Rollback Point

- Commit / checkpoint: branch `codex/think-hook-routing`, merged into main after `58133cf`.
- Revert strategy: revert the hook/test/asset changes and this workflow closeout commit.
