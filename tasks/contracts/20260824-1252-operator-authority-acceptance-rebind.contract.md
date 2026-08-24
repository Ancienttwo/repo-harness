# Task Contract: operator-authority-acceptance-rebind

> **Status**: Active
> **Plan**: plans/plan-20260824-1252-operator-authority-acceptance-rebind.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-24 12:52
> **Review File**: `tasks/reviews/20260824-1252-operator-authority-acceptance-rebind.review.md`
> **Notes File**: `tasks/notes/20260824-1252-operator-authority-acceptance-rebind.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The localhost Human Control Board bound its TCP listener to loopback but did not
pin the browser-visible HTTP authority. A hostile DNS name resolving to
loopback could therefore send an attacker-controlled Host or Origin to the
local API and trigger Fleet collection. The post-review correction changed the
normalized PR subject, so the prior AcceptanceReceipt and merge seal are
intentionally stale and must be rebound only after fresh verification.

## Goal

Bind every Operator request to the exact configured loopback address and actual
listener port, reject hostile Host and supplied Origin values before route
dispatch or Fleet collection, preserve valid read-only behavior, and produce a
fresh Codex external-pass receipt plus installed merge-gate seal for the exact
PR #218 candidate.

## Scope

- In scope: exact Host/Origin authority pinning, focused regression coverage,
  durable security lesson, full final-subject verification, semantic
  re-acceptance, and exact local merge-gate evidence.
- Out of scope:
  - remote serving, auth/RBAC, mutation routes, UI redesign, provider merge, and compatibility aliases such as `localhost` for an IP-bound server.
- Taste constraints: preserve the existing read-only Operator UI and API
  contract; fail closed rather than accepting authority aliases.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if an invalid Host or Origin can reach Fleet collection,
or if the exact authority printed by the CLI cannot load the API. The cheapest
proof is the focused server test plus runtime readback of 421, 403, 200, and one
collector call.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/effects/operator/server.ts` routed requests after loopback bind without validating `Host` or supplied `Origin`, so DNS rebinding could cross the browser-to-localhost authority boundary.
- repro: send `/api/v1/fleet/snapshot` with `Host: attacker.example` or `Origin: https://attacker.example`; the unfixed server returns 200 and invokes the collector.
- regression_guard: tests/cli/operator-serve.test.ts
- pre_fix_failure_artifact: .ai/harness/failures/operator-authority-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260824-1252-operator-authority-acceptance-rebind.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260824-1252-operator-authority-acceptance-rebind.review.md`
- Notes file: `tasks/notes/20260824-1252-operator-authority-acceptance-rebind.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"operator-authority-regression","kind":"deterministic_test","paths":["src/effects/operator/server.ts","tests/cli/operator-serve.test.ts"]},{"id":"repository-contract-suite","kind":"deterministic_test","paths":["*"]},{"id":"operator-authority-runtime","kind":"runtime_readback","paths":["src/effects/operator/server.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/failures/operator-authority-pre-fix.log
  - README.md
  - bun.lock
  - docs/architecture/.projection-manifest.json
  - docs/design/DESIGN-local-human-control-board-v1.md
  - package.json
  - plans/
  - scripts/check-tarball-install-smoke.sh
  - src/cli/commands/operator.ts
  - src/cli/index.ts
  - src/core/operator/fleet-snapshot.ts
  - src/effects/operator/server.ts
  - src/operator-web/
  - tasks/archive/
  - tasks/current.md
  - tasks/lessons.md
  - tasks/todos.md
  - tasks/contracts/20260824-1252-operator-authority-acceptance-rebind.contract.md
  - tasks/reviews/20260824-1252-operator-authority-acceptance-rebind.review.md
  - tasks/notes/20260824-1252-operator-authority-acceptance-rebind.notes.md
  - tests/cli/operator-serve.test.ts
  - tests/effects/fleet-board.test.ts
  - tests/operator-web/
  - tests/unit/hook-entry-single-file-bundle.test.ts
  - tests/unit/operator-fleet-snapshot.test.ts
  - tsconfig.json
  - vite.operator.config.ts
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
    - src/effects/operator/server.ts
    - tests/cli/operator-serve.test.ts
    - tasks/lessons.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260824-1252-operator-authority-acceptance-rebind.notes.md
    - .ai/harness/failures/operator-authority-pre-fix.log
  tests_pass:
    - path: tests/cli/operator-serve.test.ts
    - path: tests/unit/operator-fleet-snapshot.test.ts
    - path: tests/effects/fleet-board.test.ts
    - path: tests/operator-web/operator-ui.test.tsx
    - path: tests/operator-web/operator-interactions.test.tsx
  commands_succeed:
    - bun run check:type
    - bash scripts/check-tarball-install-smoke.sh
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: hostile Host returns 421, hostile supplied Origin returns
  403, and the configured exact authority continues to return 200.
- Edge cases: port 0 binds to the actual socket port; IPv6 authority remains
  bracketed; missing Host fails closed; absent Origin remains valid for direct
  same-authority navigation.
- Regression risks: strict authority intentionally excludes aliases such as
  `localhost`; the CLI prints the accepted IP authority.

## Rollback Point

- Commit / checkpoint: `24ed0178727b7d35a1b42449a25798466fe304c8`
- Revert strategy: revert the authority-pin commit and this bounded acceptance
  workflow package before marking the PR Ready.
