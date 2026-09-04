> **Archived**: 2026-09-05 03:14
> **Related Plan**: plans/archive/plan-20260821-2226-package-owned-test-runner.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-0314
> **Archive Projection V1**: `plans/plan-20260821-2226-package-owned-test-runner.md` => `plans/archive/plan-20260821-2226-package-owned-test-runner.md`
> **Archive Projection V1**: `tasks/notes/20260821-2226-package-owned-test-runner.notes.md` => `tasks/archive/notes-20260905-0314-package-owned-test-runner.md`
> **Archive Projection V1**: `tasks/contracts/20260821-2226-package-owned-test-runner.contract.md` => `tasks/archive/contract-20260905-0314-package-owned-test-runner.md`
> **Archive Projection V1**: `tasks/reviews/20260821-2226-package-owned-test-runner.review.md` => `tasks/archive/review-20260905-0314-package-owned-test-runner.md`

# Task Contract: package-owned-test-runner

> **Status**: Active
> **Plan**: plans/archive/plan-20260821-2226-package-owned-test-runner.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-21 22:26
> **Review File**: `tasks/archive/review-20260905-0314-package-owned-test-runner.md`
> **Notes File**: `tasks/archive/notes-20260905-0314-package-owned-test-runner.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`tests_pass` currently bypasses each package's declared test runner and configuration by invoking bare `bun test <path>`. In BYOK this drops the client package's Vitest `define` authority, so a valid release-identity suite fails only inside repo-harness verification. Leaving this unfixed makes the contract gate disagree with the package's canonical test command and encourages duplicate verification under `commands_succeed`.

## Goal

Resolve every `tests_pass` path to one repository-owned package and execute it through that package's declared `scripts.test`, while preserving bounded execution, result evidence, failure-log retention, and read-only behavior. Resolution failures and missing test scripts must fail closed; no bare-Bun compatibility path may remain.

## Scope

- In scope: package-owner resolution in `scripts/verify-contract.sh`; byte-synced packaged helper projection; disposable monorepo and single-package regressions; exact resolved-command diagnostics; workflow evidence.
- Out of scope: contract schema changes, package-manager abstraction, inferred test commands, npm publication, main merge, installed runtime refresh, and the separate prepare-handoff helper-resolution branch.
- Taste constraints: one declared package test authority; deterministic fail-closed ownership; no fallback or duplicate suite under `commands_succeed`.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If `bun run --cwd <owner> test -- <relative-path>` cannot preserve both a package-local Vitest configuration and a root Bun-native script, the chosen dispatch shape is wrong. The cheapest proof is the disposable focused regression before touching the production helper.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/verify-contract.sh` unconditionally dispatches every `tests_pass` criterion as `bun test <path>`, bypassing the owning package's `scripts.test` and its Vitest/Bun configuration.
- repro: `repo-harness run verify-contract --contract tasks/contracts/20260821-1806-local-agent-release-identity.contract.md --strict --read-only` in `/Users/kito/Projects/byok-sdk-wt-local-agent-release-identity` fails release-identity tests that pass via `bun run --cwd packages/client test -- <relative paths>`.
- regression_guard: tests/unit/package-owned-test-runner.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/20260821-2226-package-owned-test-runner-pre-fix.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260821-2226-package-owned-test-runner.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-0314-package-owned-test-runner.md`
- Notes file: `tasks/archive/notes-20260905-0314-package-owned-test-runner.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/archive/contract-20260905-0314-package-owned-test-runner.md
  - tasks/archive/review-20260905-0314-package-owned-test-runner.md
  - tasks/archive/notes-20260905-0314-package-owned-test-runner.md
  - scripts/verify-contract.sh
  - assets/templates/helpers/verify-contract.sh
  - tests/helper-scripts.test.ts
  - tests/unit/package-owned-test-runner.test.ts
  - .ai/harness/runs/
  - .ai/harness/checks/
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
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
      purpose: approval_checkpoint_owner
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
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/verify-contract.sh
    - assets/templates/helpers/verify-contract.sh
    - tests/unit/package-owned-test-runner.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260905-0314-package-owned-test-runner.md
    - .ai/harness/runs/20260821-2226-package-owned-test-runner-pre-fix.log
  tests_pass:
    - path: tests/unit/package-owned-test-runner.test.ts
  commands_succeed:
    - bun run check:helpers
    - bun run check:type
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: package-local configuration is preserved and exact package-owned commands are reported.
- Edge cases: root package, nested package, missing script, malformed manifest, and repository-escaping symlink are covered.
- Regression risks: consumer fixtures without a declared `scripts.test` now fail closed by design; they must declare their runner authority rather than receive bare-Bun compatibility behavior.

## Rollback Point

- Commit / checkpoint: `origin/main@69c95991` in worktree `/Users/kito/Projects/repo-harness-wt-package-test-runner`.
- Revert strategy: revert the package-test-runner implementation commit and its byte-synced helper projection together; discard workflow artifacts only if the entire approved work-package is abandoned.
