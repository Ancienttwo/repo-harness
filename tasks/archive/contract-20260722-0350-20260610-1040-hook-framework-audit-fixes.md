# Sprint Contract: hook-framework-audit-fixes

> **Status**: Fulfilled
> **Plan**: plans/plan-20260610-1040-hook-framework-audit-fixes.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-10 13:25 +0800
> **Review File**: `tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md`
> **Notes File**: `tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md`

## Goal

Land the verified hook framework audit merge batch: trust-gate repo-local hook execution, harden architecture contract block rewrites, tighten prompt-guard review/bug-fix routing, add lock/rotation safeguards for hook state, triage dead hooks into deleted or rewired paths, harden the downstream sync/performance chain, and cover the changes with focused and full-suite verification.

## Scope

- In scope:
- `scripts/hook-shim.sh` trust allowlist and `scripts/repo-harness.sh trust|untrust|trust-list` install/migrate integration.
- Contract block marker balance guards in shell and TypeScript sync helpers.
- Prompt-guard bug-fix/review routing regressions and hook state lock/rotation hardening.
- Dead-hook retirement/rewiring across `.ai/hooks`, `assets/hooks`, templates, docs, runtime tests, and route-script drift checks.
- Workflow helper fixes needed by this closeout: preserve deferred ledger rows and avoid false no-active-plan matches.
- Slice 5 downstream-chain/performance work: `[SyncChain] WARN` observability, stale pending lifecycle, resolver stderr separation, generated hook timeouts, symlink-realpath containment in `sync-brain-docs.sh`, and measured prompt-guard/brain-sync optimization.
- Out of scope:
- None remaining for the captured hook-framework audit plan.

## Workflow Inventory

- Source plan: `plans/plan-20260610-1040-hook-framework-audit-fixes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md`
- Notes file: `tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todo.md
  - tasks/contracts/20260610-1040-hook-framework-audit-fixes.contract.md
  - tasks/reviews/20260610-1040-hook-framework-audit-fixes.review.md
  - tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md
  - .ai/context/capabilities.json
  - .ai/hooks/
  - assets/hooks/
  - assets/reference-configs/
  - assets/templates/helpers/
  - docs/reference-configs/
  - scripts/
  - src/
  - tests/
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/hook-shim.sh
    - scripts/repo-harness.sh
    - .ai/hooks/prompt-guard.sh
    - assets/hooks/prompt-guard.sh
    - tests/hook-shim-trust.test.ts
    - tests/contract-block-rewrite.test.ts
    - tests/workflow-state-lock.test.ts
    - tests/helper-scripts.test.ts
    - tests/hook-runtime.test.ts
    - tests/cli/install.test.ts
  artifacts_exist:
    - tasks/notes/20260610-1040-hook-framework-audit-fixes.notes.md
  tests_pass:
    - path: tests/hook-shim-trust.test.ts
    - path: tests/contract-block-rewrite.test.ts
    - path: tests/workflow-state-lock.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/cli/install.test.ts
  commands_succeed:
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - git diff --check
  qa_scores:
    - dimension: functionality
      min: 8
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior: untrusted opt-in repos skip repo-local hooks until trusted; review/audit prompts mentioning bugs route to `/check` without TDD/CrossReview false positives; missing advisory SessionStart/Stop scripts warn and skip instead of blocking stale repos; downstream post-edit sync failures now warn without blocking.
- Edge cases: linked worktrees inherit primary-root trust; malformed contract markers abort instead of swallowing user content; concurrent event/counter writes are lock-protected; stale handoff resume packets were refreshed before strict workflow verification; stale architecture pending rows are deduped and archived requests reset local contract pointers.
- Regression risks: host-hook timeout metadata must be reinstalled into user-level settings to affect already-installed hosts; no remaining plan item is deferred in `tasks/todo.md`.

## Rollback Point

- Commit / checkpoint: merge batch to be committed on `main` with branch ancestry from `codex/hook-framework-audit-fixes`.
- Revert strategy: revert the merge commit and re-run the required checks before reinstalling user-level hooks.
