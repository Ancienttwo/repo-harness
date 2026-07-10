> **Archived**: 2026-07-11 04:50
> **Related Plan**: plans/archive/plan-20260711-0139-code-authority-foundation-v1.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260711-0450

# Task Contract: code-authority-foundation-v1

> **Status**: Fulfilled
> **Plan**: `plans/plan-20260711-0139-code-authority-foundation-v1.md`
> **Task Profile**: code-change
> **Owner**: kito
> **Capability ID**: root
> **Review File**: `tasks/reviews/20260711-0139-code-authority-foundation-v1.review.md`
> **Notes File**: `tasks/notes/20260711-0139-code-authority-foundation-v1.notes.md`

## Why

The repository has canonical hook projection but still duplicates helper implementations, synthesizes capability/helper authority when canonical inputs are missing, permits archive paths that bypass complete evidence, and concentrates MCP repo safety in one 3,504-line file. The user approved a bounded authority-first optimization program rather than a cosmetic directory rewrite.

## Goal

Implement CO-00 through CO-08 from the approved plan without changing public CLI/MCP schemas, switching ArchContext authority, creating a monorepo, or adding compatibility behavior.

## Scope

- In scope: exact tooling pins, global rule distribution, capability resolver hardening, adoption pure-core boundary, hook/helper projection, helper resolver hardening, archive gates, one MCP authority/path extraction, architecture/workflow closeout, and tests.
- Out of scope: B1 MCP rollout-flag removal, B2 TypeScript adoption apply cutover, release publication, ArchContext model/daemon writes, and any feature not listed in CO-00 through CO-08.

## Stop Conditions

- Stop if a public CLI command, MCP tool schema, hook route tuple, or workflow data format must change.
- Stop if a required change falls outside Allowed Paths.
- Stop if an existing user-authored dirty change cannot be preserved or isolated.
- Stop if helper projection cannot represent the existing intentional package delegate without a new compatibility path.

## Allowed Paths

```yaml
allowed_paths:
  - package.json
  - bun.lock
  - AGENTS.md
  - CLAUDE.md
  - .ai/context/
  - .ai/harness/workflow-contract.json
  - .ai/harness/policy.json
  - assets/AGENTS.md
  - assets/CLAUDE.md
  - assets/hooks/
  - assets/skill-commands/repo-harness-architecture/SKILL.md
  - assets/reference-configs/
  - assets/templates/helpers/
  - assets/workflow-contract.v1.json
  - docs/architecture/
  - docs/reference-configs/
  - docs/researches/20260705-archcontext-capability-filing-handover.md
  - plans/
  - scripts/AGENTS.md
  - scripts/CLAUDE.md
  - scripts/archive-architecture-request.sh
  - scripts/archive-workflow.sh
  - scripts/architecture-queue.sh
  - scripts/capability-config.ts
  - scripts/capability-resolver.ts
  - scripts/check-tarball-install-smoke.sh
  - scripts/check-ci.sh
  - scripts/check-npm-release.sh
  - scripts/contract-worktree.sh
  - scripts/ensure-codegraph.sh
  - scripts/lib/project-init-lib.sh
  - scripts/migrate-project-template.sh
  - scripts/refresh-current-status.sh
  - scripts/sync-hook-sources.ts
  - scripts/sync-helper-sources.ts
  - scripts/workflow-contract.ts
  - src/cli/commands/capability-context.ts
  - src/cli/hook/minimal-change-context.ts
  - src/cli/mcp/
  - src/cli/repo-adoption/reclaim-runtime.ts
  - src/cli/runtime/helper-runner.ts
  - src/core/
  - src/effects/
  - tasks/contracts/20260711-0139-code-authority-foundation-v1.contract.md
  - tasks/contracts/20260703-1405-no-fallback-distribution.contract.md
  - tasks/contracts/20260706-0211-archcontext-boundary-bridge.contract.md
  - tasks/archive/
  - tasks/current.md
  - tasks/notes/20260703-1405-no-fallback-distribution.notes.md
  - tasks/notes/20260706-0211-archcontext-boundary-bridge.notes.md
  - tasks/notes/20260711-0139-code-authority-foundation-v1.notes.md
  - tasks/reviews/20260703-1405-no-fallback-distribution.review.md
  - tasks/reviews/20260706-0211-archcontext-boundary-bridge.review.md
  - tasks/reviews/20260711-0139-code-authority-foundation-v1.review.md
  - tasks/todos.md
  - tests/
```

## Delegation Contract

```yaml
delegation:
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: integrate_and_gatekeep
      purpose: authority_owner
    explorer:
      mode: read_only
      purpose: current_source_mapping
    worker:
      mode: edit_within_non_overlapping_allowed_paths
      purpose: bounded_implementation
    reviewer:
      mode: read_only
      purpose: regression_security_and_scope_review
  runner:
    preferred:
      - subagent
      - codex-subagent
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/core/adoption/managed-block.ts
    - src/core/source-projection.ts
    - scripts/sync-helper-sources.ts
    - src/cli/mcp/general-repo-access/authority.ts
  tests_pass:
    - path: tests/global-working-rules-distribution.test.ts
    - path: tests/capability-resolver.test.ts
    - path: tests/capability-archcontext-export.test.ts
    - path: tests/cli/adoption-plan.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/workflow-contract.test.ts
    - path: tests/architecture-queue.test.ts
    - path: tests/cli/mcp-reader-tools.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:hooks
    - bun run check:helpers
    - bash scripts/check-tarball-install-smoke.sh
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
    - bun test
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Rollback Point

- Revert the contract commits in reverse order.
- Restore the previous exact CodeGraph pin and rebuild the ignored index.
- Workflow/archive moves remain Git-revertible; no external state is part of this contract.
