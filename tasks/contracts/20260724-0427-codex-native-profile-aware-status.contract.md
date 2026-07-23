# Task Contract: codex-native-profile-aware-status

> **Status**: Fulfilled
> **Plan**: plans/plan-20260724-0427-codex-native-profile-aware-status.md
> **Task Profile**: migration
> **Workflow Profile**: strict
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-24 06:24
> **Review File**: `tasks/reviews/20260724-0427-codex-native-profile-aware-status.review.md`
> **Notes File**: `tasks/notes/20260724-0427-codex-native-profile-aware-status.notes.md`

## Why

The host install surface has four names but only three hook sizes. The approved
contract is now exactly two profiles: `minimal` is 7 hooks, `full` is 11 hooks,
the old 5-hook tier is retired, and `full` is the default. Because protocol-1
`minimal` means 5 hooks, changing its meaning without a schema boundary would
silently reinterpret installed state.

## Goal

Ship a protocol-2, two-profile host runtime. Fresh and adapter-only installs
default to full. Minimal projects the former standard baseline and 7 Codex
hooks; full projects the union of former product-planning and strict surfaces
and 11 hooks. Legacy protocol-1 state is rejected by normal paths and can be
replaced only through an explicit, transactional migration action.

## Scope

- Replace install and skill-surface profile vocabularies with `minimal|full`.
- Remove the 5-hook managed projection.
- Make status/setup health profile-relative at 7/7 and 11/11.
- Merge the former product and strict components/facades/provider skills into full.
- Bump persisted installed state to protocol 2.
- Add explicit protocol-1 migration, with ownership validation, rollback, and
  no protocol-1 rollback history in the new state.
- Update current source tests and current operator/architecture/audit docs.

Out of scope:

- Repository workflow profiles (`lite|standard|strict`), adoption modes,
  historical/frozen eval output, archived workflow artifacts, and actual
  operator HOME mutation.
- ChatGPT integration remains explicit-only.
- No aliases or fallback parsing in steady-state paths.

## Stop Conditions

- Stop if implementation requires changing workflow-profile semantics.
- Stop if a migration would delete unowned files or entire shared host config.
- Stop if a required path is outside `allowed_paths`; amend this contract first.
- Stop after three fix/reverify rounds for the same issue.

## Falsifier

The direction is wrong if full cannot deterministically contain both former
product-planning and strict surfaces. The cheapest proof is catalog/profile
projection tests plus a disposable-HOME full install and state readback.

## Workflow Inventory

- Source plan: `plans/plan-20260724-0427-codex-native-profile-aware-status.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review: `tasks/reviews/20260724-0427-codex-native-profile-aware-status.review.md`
- Notes: `tasks/notes/20260724-0427-codex-native-profile-aware-status.notes.md`
- Checks: `.ai/harness/checks/latest.json`
- Runtime evidence: `.ai/harness/runs/`
- Completion gate: verify contract, record typed acceptance or allowed waiver,
  and finish through the contract worktree lifecycle.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/cli/installer/install-profile.ts
  - src/cli/installer/managed-entries.ts
  - src/cli/commands/global-runtime.ts
  - src/cli/commands/status.ts
  - src/cli/commands/init-hook.ts
  - src/cli/index.ts
  - src/core/skill-surface/catalog.ts
  - src/core/skill-surface/profile-components.ts
  - scripts/sync-codex-installed-copies.sh
  - scripts/run-skill-routing-eval.ts
  - scripts/run-harness-profile-benchmark.ts
  - assets/skill-commands/manifest.json
  - assets/skills/repo-harness-chatgpt/SKILL.md
  - assets/reference-configs/agentic-development-flow.md
  - assets/reference-configs/external-tooling.md
  - tests/cli/install.test.ts
  - tests/cli/global-runtime-init.test.ts
  - tests/cli/status.test.ts
  - tests/cli/init-hook.test.ts
  - tests/install-profiles.test.ts
  - tests/installed-copy-sync.test.ts
  - tests/skill-routing-eval.test.ts
  - tests/harness-benchmark-matrix.test.ts
  - tests/skill-surface/catalog.test.ts
  - tests/skill-surface/canonical-packages.test.ts
  - tests/skill-surface/chatgpt-package.test.ts
  - tests/skill-surface/cross-review-package.test.ts
  - tests/skill-surface/mutation-path-coverage.test.ts
  - tests/skill-surface/retired-names-scan.test.ts
  - README.md
  - docs/CHANGELOG.md
  - docs/reference-configs/install-profiles.md
  - docs/reference-configs/external-tooling.md
  - docs/reference-configs/agentic-development-flow.md
  - docs/architecture/modules/public-surface/action-commands.md
  - docs/architecture/modules/public-surface/root-router.md
  - docs/researches/20260715-skill-surface-discovery-audit.md
  - docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md
  - plans/plan-20260724-0427-codex-native-profile-aware-status.md
  - tasks/current.md
  - tasks/contracts/20260724-0427-codex-native-profile-aware-status.contract.md
  - tasks/reviews/20260724-0427-codex-native-profile-aware-status.review.md
  - tasks/notes/20260724-0427-codex-native-profile-aware-status.notes.md
  - .ai/harness/checks/
  - .ai/harness/runs/
```

## Evidence Requirements

```yaml
evidence_requirements:
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: migration_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - docs/reference-configs/install-profiles.md
    - docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/20260724-0427-codex-native-profile-aware-status/profile-migration-red.txt
    - .ai/harness/runs/20260724-0427-codex-native-profile-aware-status/profile-migration-characterization.txt
    - tasks/notes/20260724-0427-codex-native-profile-aware-status.notes.md
  tests_pass:
    - path: tests/install-profiles.test.ts
    - path: tests/cli/install.test.ts
    - path: tests/cli/global-runtime-init.test.ts
    - path: tests/cli/status.test.ts
    - path: tests/cli/init-hook.test.ts
    - path: tests/installed-copy-sync.test.ts
    - path: tests/skill-surface/catalog.test.ts
    - path: tests/skill-surface/canonical-packages.test.ts
    - path: tests/skill-surface/chatgpt-package.test.ts
    - path: tests/skill-surface/cross-review-package.test.ts
    - path: tests/skill-routing-eval.test.ts
    - path: tests/harness-benchmark-matrix.test.ts
    - path: tests/skill-surface/mutation-path-coverage.test.ts
    - path: tests/skill-surface/retired-names-scan.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
```

## Acceptance Notes (Human Review)

- Exact steady-state vocabulary is `minimal|full`.
- Exact Codex hook counts are 7 and 11.
- Full is default and is the union profile; minimal is intentionally bounded.
- Protocol 1 fails closed outside explicit migration.
- Migration touches only transaction-owned surfaces and compensates failure.
- Actual operator host state is read-only during this slice.

## Rollback Point

- Commit / checkpoint: `71a52dde`
- Revert strategy: revert the entire protocol/profile migration as one unit;
  do not partially restore old names under protocol 2.
