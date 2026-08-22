> **Archived**: 2026-08-23 00:48
> **Related Plan**: plans/archive/plan-20260822-2346-issue-216-bun-runtime-floor.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260823-0048

# Task Contract: issue-216-bun-runtime-floor

> **Status**: Fulfilled
> **Plan**: plans/plan-20260822-2346-issue-216-bun-runtime-floor.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-22 23:47
> **Review File**: `tasks/reviews/20260822-2346-issue-216-bun-runtime-floor.review.md`
> **Notes File**: `tasks/notes/20260822-2346-issue-216-bun-runtime-floor.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Bun 1.4.0 is already the repository's CI/runtime baseline, but the published package and installers still accept Bun 1.3.14. That unsupported runtime loses `process.env` values across implicit `spawnSync` inheritance and breaks publication receipt provider observation after installation has already succeeded.

## Goal

Make Bun 1.4.0 the single supported minimum across the package contract, bootstrap/runtime checks, packaged helper, current documentation, and their drift tests so Bun 1.3.14 fails closed before publication execution.

## Scope

- In scope: package engine metadata; Unix/Windows installers; global runtime bootstrap; agent-fleet helper and generated mirror; current English/localized runtime documentation; regression and projection checks.
- Out of scope: publication receipt semantics; explicit provider subprocess environment compatibility; dependency upgrades; release/publish/issue-close actions.
- Taste constraints: keep the existing version-comparison implementation and projection workflow; add no fallback, dependency, or file; share the TypeScript floor predicate only across the bootstrap and CLI-entry consumers.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the focused publication receipt suite fails on Bun 1.4.0, or if Bun 1.3.14 remains accepted by any installer/runtime gate after the version-floor change, the direction is wrong. The cheapest proof is the focused installer/global-runtime tests plus `bun test tests/unit/publication-receipt.test.ts` under the current Bun 1.4.0 runtime.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `package.json:34`, `install.sh:8`, `install.ps1:5`, `src/cli/commands/global-runtime.ts:66`, and `scripts/install-agent-fleet.sh:4` still declare/accept Bun 1.1.35 after `.github/workflows/ci.yml` moved the verified runtime to 1.4.0, allowing affected Bun 1.3.14 installations to reach publication provider subprocesses.
- repro: On Bun 1.3.14, run `bun test tests/unit/publication-receipt.test.ts`; issue #216 records four provider-observation failures because fixture `process.env` values are absent from implicit `spawnSync` children.
- regression_guard: tests/install-scripts.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/issue-216-bun-runtime-floor-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260822-2346-issue-216-bun-runtime-floor.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260822-2346-issue-216-bun-runtime-floor.review.md`
- Notes file: `tasks/notes/20260822-2346-issue-216-bun-runtime-floor.notes.md`
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
  - package.json
  - install.sh
  - install.ps1
  - README.md
  - README.zh-CN.md
  - README.es.md
  - README.fr.md
  - README.ja.md
  - assets/reference-configs/external-tooling.md
  - assets/templates/helpers/install-agent-fleet.sh
  - docs/spec.md
  - docs/reference-configs/external-tooling.md
  - plans/
  - scripts/install-agent-fleet.sh
  - tasks/current.md
  - tasks/lessons.md
  - tasks/todos.md
  - tasks/contracts/20260822-2346-issue-216-bun-runtime-floor.contract.md
  - tasks/reviews/20260822-2346-issue-216-bun-runtime-floor.review.md
  - tasks/notes/20260822-2346-issue-216-bun-runtime-floor.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - src/
  - tests/
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
    - package.json
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260822-2346-issue-216-bun-runtime-floor.notes.md
    - .ai/harness/runs/issue-216-bun-runtime-floor-pre-fix.log
  tests_pass:
    - path: tests/install-scripts.test.ts
    - path: tests/install-agent-fleet.test.ts
    - path: tests/cli/global-runtime-init.test.ts
    - path: tests/unit/publication-receipt.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:helpers
    - bun run check:reference-configs
```

## Acceptance Notes (Human Review)

- Functional behavior: Bun 1.3.14 is rejected before CLI command dispatch or install/runtime mutation; Bun 1.4.0 is accepted.
- Edge cases: self-managed Bun upgrades to 1.4.0; package-manager-owned old Bun fails closed with its existing actionable instruction.
- Regression risks: drift between package metadata, installers, helper projection, and localized documentation.

## Rollback Point

- Commit / checkpoint: branch base `183e6910945f19126ba3c6eade1e4e3fdd73359c`.
- Revert strategy: revert the final branch commit; no migration or persisted product state is involved.
