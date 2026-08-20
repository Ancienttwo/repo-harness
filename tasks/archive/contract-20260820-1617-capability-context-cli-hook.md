> **Archived**: 2026-08-20 16:17
> **Related Plan**: plans/archive/plan-20260529-0004-capability-context-cli-hook.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1617

# Sprint Contract: capability-context-cli-hook

> **Status**: Fulfilled
> **Plan**: plans/plan-20260529-0004-capability-context-cli-hook.md
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-05-29 00:04
> **Review File**: `tasks/reviews/capability-context-cli-hook.review.md`
> **Notes File**: `tasks/notes/capability-context-cli-hook.notes.md`

## Goal

Deliver a `repo-harness capability-context` CLI plus hook queue flow that creates and refreshes capability-local paired `AGENTS.md` and `CLAUDE.md` files from the explicit capability registry, without spawning LLM agents from `PostEdit`.

## Scope

- In scope: CLI `status`, `request`, and `sync`; controlled `CAPABILITY CONTEXT` block rendering; `.ai/context/capability-source-map.json` fallback manifest; ignored `.ai/harness/capability-context/` queue; `PostEdit` enqueue; `SessionStart` reminder; generated/self-host hook parity; tests and docs.
- Out of scope: background LLM spawning from hooks, broad physical-layout inference, replacing the existing architecture contract block, and authoring semantic architecture snapshots.

## Workflow Inventory

- Source plan: `plans/plan-20260529-0004-capability-context-cli-hook.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/capability-context-cli-hook.review.md`
- Notes file: `tasks/notes/capability-context-cli-hook.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass and the review recommend pass.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todo.md
  - tasks/contracts/capability-context-cli-hook.contract.md
  - tasks/reviews/capability-context-cli-hook.review.md
  - tasks/notes/capability-context-cli-hook.notes.md
  - .ai/context/capabilities.json
  - .ai/context/capability-source-map.json
  - .ai/hooks/
  - assets/hooks/
  - assets/templates/helpers/
  - assets/workflow-contract.v1.json
  - .ai/harness/workflow-contract.json
  - .gitignore
  - docs/reference-configs/
  - src/
  - scripts/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
    - src/cli/commands/capability-context.ts
    - tests/cli/capability-context.test.ts
    - .ai/context/capability-source-map.json
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/capability-context-cli-hook.notes.md
  tests_pass:
    - path: tests/cli/capability-context.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/capability-resolver.test.ts
    - path: tests/capability-config.test.ts
  commands_succeed:
    - bun test
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: `repo-harness capability-context sync --pending --apply` writes paired local context files, preserves manual content, normalizes registry contract files, and clears processed queue requests.
- Edge cases: file prefixes target their containing directory; root capability stays at root; dry-run does not write; missing manifest entries fall back to deterministic registry-derived content.
- Regression risks: hook output must stay advisory and synchronous; generated `assets/hooks` and self-host `.ai/hooks` must stay in parity.

## Rollback Point

- Commit / checkpoint: branch `codex/capability-context-cli-hook`.
- Revert strategy: revert this branch; runtime queue state under `.ai/harness/capability-context/` is ignored and can be deleted independently.
