> **Archived**: 2026-07-21 20:35
> **Related Plan**: plans/archive/plan-20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260721-2035

# Task Contract: hrd-09-legacy-retirement-and-adopted-migration

> **Status**: Fulfilled
> **Plan**: plans/plan-20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.md
> **Task Profile**: migration
> **Owner**: kito
> **Capability ID**: runtime-harness-hook-adapters
> **Last Updated**: 2026-07-21 20:13 +0800
> **Review File**: `tasks/reviews/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.review.md`
> **Notes File**: `tasks/notes/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

HRD-08 made the remaining seven Bash route steps observable as opaque legacy execution. Deleting only `run-hook.sh` would leave those state machines, non-empty route script references, hidden child work, and a reachable first-level Bash shim. Without an atomic adopted-repo migration, old project adapters can also fire beside the modern user-level adapter and exact generated files cannot be retired safely.

## Goal

Port all seven remaining route scripts and their route-only helpers to typed in-process handlers, remove every host-event Bash dispatcher/state machine, and prove through one canonical adoption transaction plus eleven-route telemetry that the public route contract is unchanged while legacy invocation and dual dispatch are zero.

## Scope

- In scope: typed prompt, command/trace, and subagent handlers; one exhaustive handler registry; a single cross-writer delegation-state transaction shared by Stop and SubagentStart; removal of the `Route.scripts` field; removal of route scripts, route-only helper shells, the Bash prototype, and `run-hook.sh`; shared managed-adapter detection; exact-fingerprint generated-file retirement in the canonical adoption transaction; adopted fixture, telemetry/report proof, projection/tarball checks, runtime docs, and workflow artifacts.
- Out of scope: changing public event/route/matcher/host tuples; changing prompt/readiness/acceptance semantics; rewriting `lib/workflow-state.sh` or non-hook workflow helpers; EPC/SSD work; caching or performance work beyond deleting dispatch duplication; provider-backed benchmark or review calls before final acceptance.
- Taste constraints: no runtime compatibility shim, dual read, dual dispatch, path-only destructive cleanup, heuristic semantic fallback, or second telemetry authority. Legacy recognition is allowed only inside an explicit operator-invoked one-shot migration and must fail closed on byte mismatch.

## Stop Conditions

- Stop if a route port requires a user-visible semantic change instead of parity.
- Stop if an existing generated legacy file cannot be distinguished safely from user-owned bytes.
- Stop if any public route tuple, host scope, timeout, decision, or durable effect must change.
- Stop and hand back if a required path is outside Allowed Paths; update this contract before widening.
- Stop if an Exit Criteria command cannot run or Goal/Scope/Exit Criteria become contradictory.

## Falsifier

The direction is wrong if the seeded adopted fixture cannot remove the old runtime in one atomic transaction while preserving a custom sibling hook, or if any of the eleven post-migration event records contains a subprocess/opaque step or a changed route result. The cheapest proof is the focused adopted-fixture test plus one representative fixture for each of the three typed handler groups before shared runtime integration.

## Root Cause Evidence

Not applicable: this is the planned terminal runtime migration, not a bugfix profile.

## Workflow Inventory

- Source plan: `plans/plan-20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.md`
- Source sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.review.md`
- Notes file: `tasks/notes/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: freeze code, run final verification once, record one typed AcceptanceReceipt, then use only the provider-free local merge seal for PR/merge closeout.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - AGENTS.md
  - CLAUDE.md
  - README.md
  - README.zh-CN.md
  - README.ja.md
  - README.es.md
  - README.fr.md
  - src/cli/hook/prompt-handler.ts
  - src/cli/hook/prompt-guard-decision.ts
  - src/cli/hook/prompt-intents.ts
  - src/cli/hook/command-observed.ts
  - src/cli/hook/trace-observer.ts
  - src/cli/hook/subagent-handler.ts
  - src/cli/hook/stop-handler.ts
  - src/cli/hook/hook-input.ts
  - src/cli/hook/handler-contract.ts
  - src/cli/hook/handler-registry.ts
  - src/cli/hook/delegation-state.ts
  - src/cli/hook/runtime.ts
  - src/cli/hook/route-registry.ts
  - src/cli/hook/mutation-observed.ts
  - src/cli/hook/session-context.ts
  - src/cli/commands/hook.ts
  - src/cli/index.ts
  - src/cli/commands/doctor.ts
  - src/cli/commands/migrate.ts
  - src/cli/installer/managed-entries.ts
  - src/cli/repo-adoption/reclaim-runtime.ts
  - src/core/adoption/managed-hook-config.ts
  - src/core/adoption/standard-plan.ts
  - assets/workflow-contract.v1.json
  - .ai/harness/workflow-contract.json
  - .ai/harness/policy.json
  - assets/hooks/
  - .ai/hooks/
  - scripts/hook-shim.sh
  - scripts/repo-harness.sh
  - scripts/check-tarball-install-smoke.sh
  - scripts/hook-dispatch-diet-report.ts
  - scripts/architecture-queue.sh
  - assets/templates/helpers/architecture-queue.sh
  - scripts/create-project-dirs.sh
  - scripts/init-project.sh
  - scripts/lib/project-init-lib.sh
  - tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts
  - tests/fixtures/hrd09-legacy-hook-runtime/
  - tests/fixtures/loop-runtime/characterization.json
  - tests/state/loop-semantics-characterization.test.ts
  - tests/state/fixtures/loop-semantics/characterization.json
  - tests/prompt-handler.test.ts
  - tests/command-observed.test.ts
  - tests/trace-observer.test.ts
  - tests/subagent-handler.test.ts
  - tests/stop-handler.test.ts
  - tests/delegation-state-concurrency.test.ts
  - tests/mutation-observed.test.ts
  - tests/hook-runtime.test.ts
  - tests/hook-runtime-characterization.test.ts
  - tests/hook-dispatch-diet-report.test.ts
  - tests/hook-contracts.test.ts
  - tests/hook-input-parse.test.ts
  - tests/hook-protocol.test.ts
  - tests/hook-shim-trust.test.ts
  - tests/hook-shim-resolution.test.ts
  - tests/harness-circuit-breakers.test.ts
  - tests/hook-source-projection.test.ts
  - tests/hook-recursive-copy.test.ts
  - tests/bootstrap-files.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/init-project.settings.runtime.test.ts
  - tests/scaffold-parity.test.ts
  - tests/workflow-contract.test.ts
  - tests/reclaim-runtime.test.ts
  - tests/migration-script.test.ts
  - tests/cli/adoption-plan.test.ts
  - tests/cli/hook.test.ts
  - tests/cli/install.test.ts
  - tests/cli/doctor.test.ts
  - tests/cli/migrate.test.ts
  - tests/cli/route-registry.test.ts
  - tests/harness-runtime-profiles.test.ts
  - tests/runtime-profile-enforcement.test.ts
  - tests/plan-status-gate.test.ts
  - tests/mutation-guard.test.ts
  - tests/architecture-queue.test.ts
  - tests/ux-feature-guardrail.test.ts
  - tests/readme-dx.test.ts
  - assets/reference-configs/hook-operations.md
  - assets/reference-configs/minimal-change-hooks.md
  - docs/reference-configs/hook-operations.md
  - docs/reference-configs/minimal-change-hooks.md
  - docs/reference-configs/harness-overview.md
  - references/hooks-guide.md
  - references/migration-guide.md
  - docs/architecture/global-hook-runtime.md
  - docs/architecture/transactional-adoption-planner.md
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  - docs/researches/20260721-hrd09-legacy-retirement-evidence.md
  - assets/skill-commands/repo-harness-repair/SKILL.md
  - plans/plan-20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.md
  - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.contract.md
  - tasks/reviews/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.review.md
  - tasks/notes/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.notes.md
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
    runner_invocations: 4
    wall_time_minutes: 90
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/cli/hook/prompt-handler.ts
    - src/cli/hook/command-observed.ts
    - src/cli/hook/trace-observer.ts
    - src/cli/hook/subagent-handler.ts
    - src/cli/hook/delegation-state.ts
    - src/core/adoption/managed-hook-config.ts
    - docs/researches/20260721-hrd09-legacy-retirement-evidence.md
  files_contain:
    - path: assets/workflow-contract.v1.json
      pattern: "legacy-hook-runtime-retirement"
    - path: docs/researches/20260721-hrd09-legacy-retirement-evidence.md
      pattern: "zero legacy invocations"
  tests_pass:
    - path: tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts
    - path: tests/prompt-handler.test.ts
    - path: tests/command-observed.test.ts
    - path: tests/trace-observer.test.ts
    - path: tests/subagent-handler.test.ts
    - path: tests/stop-handler.test.ts
    - path: tests/delegation-state-concurrency.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/hook-runtime-characterization.test.ts
    - path: tests/cli/adoption-plan.test.ts
    - path: tests/cli/route-registry.test.ts
    - path: tests/bootstrap-files.test.ts
    - path: tests/create-project-dirs.runtime.test.ts
    - path: tests/init-project.settings.runtime.test.ts
    - path: tests/scaffold-parity.test.ts
    - path: tests/workflow-contract.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:state-boundaries
    - bun run check:hooks
    - bash scripts/check-tarball-install-smoke.sh
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
  manual_checks:
    - "Full repository test suite passes once after code freeze"
    - "Self-host adoption dry-run reports zero operations after code freeze"
    - "One disposable adopted fixture migrates atomically and all eleven routes emit unique event records with zero legacy or opaque steps"
    - "A same-scope Stop/SubagentStart interleaving preserves monotonic spawned/fallback state and Stop blocks only after an in-lock fallback claim"
```

## Acceptance Notes (Human Review)

- Functional behavior: public route tuple/host scope/order and decisions remain stable; `Route` no longer exposes a dead `scripts` field; every route is dispatched in-process and finalizes one event record.
- Edge cases: invalid hook input preserves route-specific behavior; custom adapters and modified hook files survive; missing legacy files are no-ops; fingerprint mismatch fails closed.
- Regression risks: prompt/acceptance/worktree gates, subagent context injection, bash-output evidence, trace updates, and Codex stdout shaping must not drift.
- Migration boundary: legacy detection exists only in the operator-invoked adoption/migrate path; `reclaim-runtime.ts` and archive rollback are retired so host execution and mutation both have no fallback or compatibility window.
- Evidence boundary: the adopted fixture uses the real adoption operation model and filesystem transaction, not a test-only deletion implementation.

## Rollback Point

- Commit / checkpoint: pre-change branch base `49da8563a38e03ecca5288da55c71980b3830a74`.
- Revert strategy: revert the HRD-09 PR. For a migrated downstream fixture/repo, apply the rollback manifest emitted by its adoption transaction; never reinstall the retired dispatcher as a compatibility path.
