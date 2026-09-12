> **Archived**: 2026-09-12 14:22
> **Related Plan**: plans/archive/plan-20260911-0144-global-architecture-projection.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260912-1422
> **Archive Projection V1**: `plans/plan-20260911-0144-global-architecture-projection.md` => `plans/archive/plan-20260911-0144-global-architecture-projection.md`
> **Archive Projection V1**: `tasks/notes/20260911-0144-global-architecture-projection.notes.md` => `tasks/archive/notes-20260912-1422-global-architecture-projection.md`
> **Archive Projection V1**: `tasks/contracts/20260911-0144-global-architecture-projection.contract.md` => `tasks/archive/contract-20260912-1422-global-architecture-projection.md`
> **Archive Projection V1**: `tasks/reviews/20260911-0144-global-architecture-projection.review.md` => `tasks/archive/review-20260912-1422-global-architecture-projection.md`

# Task Contract: global-architecture-projection

> **Status**: Active
> **Plan**: plans/archive/plan-20260911-0144-global-architecture-projection.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-09-11 01:44
> **Review File**: `tasks/archive/review-20260912-1422-global-architecture-projection.md`
> **Notes File**: `tasks/archive/notes-20260912-1422-global-architecture-projection.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Projection is a host execution preference. Init omits it, repository loaders default it off, and each repository silently requires setup; one global authority removes that repeated setup and configuration drift.

## Goal

Global install/update seeds architecture projection once; repo init only reports readiness; status, Stop and shell gates consume it across repositories. Retire repository execution keys without dual reads. Verify and open a PR; no merge or publish.

## Scope

- In scope: global projection configuration/bootstrap, init readiness, adoption cleanup, affected readers/templates, tests and documentation.
- Out of scope: model semantics, provider implementation, downstream mutation, publication, merge, unrelated WIP.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A single disposable HOME fails to control two repository status/drain paths, or malformed configuration is silently replaced. First proof: a global-config regression against current CLI.

## Root Cause Evidence

- root_cause: src/effects/architecture/archctx-provider.ts loaded only repo policy; absent projection settings became disabled, while global install/update never seeded a host preference.
- repro: Configure archctx/automatic in an isolated HOME and run architecture-projection status in two fresh repositories.
- regression_guard: tests/unit/global-architecture-projection.test.ts
- pre_fix_failure_artifact: .ai/harness/checks/global-architecture-pre-fix.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260911-0144-global-architecture-projection.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260912-1422-global-architecture-projection.md`
- Notes file: `tasks/archive/notes-20260912-1422-global-architecture-projection.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"global-architecture-regression","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/archive/contract-20260912-1422-global-architecture-projection.md
  - tasks/archive/review-20260912-1422-global-architecture-projection.md
  - tasks/archive/notes-20260912-1422-global-architecture-projection.md
  - src/
  - tests/
  - scripts/
  - assets/templates/helpers/
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
  - .ai/harness/policy.json
  - .ai/harness/checks/global-architecture-pre-fix.log
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

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed.

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260912-1422-global-architecture-projection.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "focused-regression",
      "kind": "package_test",
      "path": "tests/unit/global-architecture-projection.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Proves one global configuration controls two repositories and malformed settings fail closed.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "references",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "deploy",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "inspector",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "init-dryrun",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "final-delta",
      "kind": "command",
      "command": "bun test tests/architecture-sync.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates the global authority cutover and required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "protected-readiness-regression",
      "kind": "command",
      "command": "bun test tests/cli/fleet-offer-acquire.test.ts tests/cli/status.test.ts tests/unit/windows-protected-helper-platform-contract.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers package-owned CLI binding in protected helper execution and global readiness diagnostics.",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

This is the sole executable verification authority. Use `baseline_with_delta`
only when a referenced immutable baseline plus named current delta checks prove
the intended coverage; do not infer that choice from paths or command text.

## Acceptance Notes (Human Review)

- Functional behavior: 141 focused development tests passed across global policy, init/adoption, uninstall, orchestration and shell publication. Later delta: 45 global/Stop tests passed; the actual global setup entrypoint, seeders and three affected helper tests passed.
- Delta coverage: final prepared baseline run run-20260911T020946-60764 passed all 25 criteria before the final Node malformed-readiness correction. Stop/global TypeScript source is unchanged since that run; the final executable delta is the shell architecture-sync suite plus required integrity checks. The earlier run could not bind acceptance because the contract was not committed.
- Edge cases: explicit disabled and unrelated global fields are preserved; null/unknown/malformed settings are rejected without writes; repo policies are ignored by runtime and cleaned during operator adoption.
- Regression risks: the provider process-tree timeout test fails on unmodified main too (missing descendant.pid); this task does not change its process implementation. No real global install or downstream migration performed.

## Rollback Point

- Commit / checkpoint: origin/main 8fc92c08d4e0c1bf771005e001e0fd254adc210b
- Revert strategy: revert the single configuration PR; do not rewrite unrelated user settings.
