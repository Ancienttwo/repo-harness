> **Archived**: 2026-08-27 00:08
> **Related Plan**: plans/archive/plan-20260826-1716-me2b-managed-parent-sandbox-canary.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260827-0008

# Task Contract: me2b-managed-parent-sandbox-canary

> **Status**: Fulfilled
> **Plan**: plans/plan-20260826-1716-me2b-managed-parent-sandbox-canary.md
> **Task Profile**: eval-only
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-26 17:16
> **Review File**: `tasks/reviews/20260826-1716-me2b-managed-parent-sandbox-canary.review.md`
> **Notes File**: `tasks/notes/20260826-1716-me2b-managed-parent-sandbox-canary.notes.md`

## Why

ME-2B is safe only if Host enforcement removes Parent mutation authority before a writable Worker becomes active and rechecks the exact runtime principal and epoch at every effect. Static sandbox configuration, prompt text and store state cannot prove this.

## Goal

Produce a reproducible, model-free managed-Parent/sandbox canary and use its exact evidence to admit ME-2B or close it as runtime-not-admitted without creating any writable grant surface.

## Scope

- In scope: disposable runtime probe, deterministic classification tests, installed Codex evidence, ME-2B PRD/umbrella/research decision and workflow closeout.
- Out of scope: writer-grant implementation, Agent runtime/daemon/supervisor, unmanaged Session fallback, Task/Lease/Publication/Acceptance or architecture mutation.
- Taste constraints: fail closed; no semantic inference from prose; no store/prompt substitute for OS enforcement.

## Stop Conditions

- Stop if the probe would target a non-disposable repository or persistent user file.
- Stop if passing would require treating process termination or a static launch sandbox as dynamic Parent freeze.
- Stop if Goal, Scope or Exit Criteria become contradictory.

## Falsifier

ME-2B is not admitted unless a version-pinned Host adapter can perform a real revocation, prove the already-running Parent cannot mutate afterward, preserve its non-mutating control role, and authenticate the child principal/epoch at the effect boundary. A neutral checkpoint only proves launch-scoped persistence and is never treated as revocation evidence.

## Workflow Inventory

- Source plan: `plans/plan-20260826-1716-me2b-managed-parent-sandbox-canary.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260826-1716-me2b-managed-parent-sandbox-canary.review.md`
- Notes file: `tasks/notes/20260826-1716-me2b-managed-parent-sandbox-canary.notes.md`
- Checks file: `.ai/harness/checks/latest.json`

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me2b-runtime-admission-canary","kind":"deterministic_test","paths":["scripts/me2b-runtime-admission-canary.ts","tests/me2b-runtime-admission-canary.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260826-1716-me2b-managed-parent-sandbox-canary.md
  - plans/prds/20260824-1653-writable-worker-grant.prd.md
  - plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md
  - docs/researches/20260826-me2b-managed-parent-sandbox-canary.md
  - docs/researches/20260824-persistent-module-engineer-organization.md
  - docs/architecture/modules/public-surface/action-commands.md
  - docs/architecture/modules/public-surface/adoption.md
  - docs/architecture/modules/public-surface/root-router.md
  - docs/architecture/modules/runtime-harness/bound-task-freezes.md
  - docs/architecture/modules/runtime-harness/delegated-runs.md
  - docs/architecture/modules/runtime-harness/engineer-bindings.md
  - docs/architecture/modules/runtime-harness/engineer-messages.md
  - docs/architecture/modules/runtime-harness/engineer-scheduling.md
  - docs/architecture/modules/runtime-harness/engineering-overlay.md
  - docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  - docs/architecture/modules/runtime-harness/integration-acceptance.md
  - docs/architecture/modules/runtime-harness/mcp-sidecar.md
  - docs/architecture/modules/runtime-harness/provider-thread-effects.md
  - docs/architecture/modules/runtime-harness/verified-context.md
  - docs/architecture/modules/runtime-mcp/general-repo-access.md
  - docs/architecture/modules/verification/codegraph-readiness.md
  - docs/architecture/modules/verification/evals-checks.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/architecture/modules/workflow-engine/inspection-migration.md
  - scripts/me2b-runtime-admission-canary.ts
  - tests/me2b-runtime-admission-canary.test.ts
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260826-1716-me2b-managed-parent-sandbox-canary.contract.md
  - tasks/reviews/20260826-1716-me2b-managed-parent-sandbox-canary.review.md
  - tasks/notes/20260826-1716-me2b-managed-parent-sandbox-canary.notes.md
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
      purpose: security_admission_owner
    explorer:
      mode: read_only
      purpose: runtime_surface_research
    worker:
      mode: edit_within_allowed_paths
      purpose: canary_implementation
    verifier:
      mode: read_only
      purpose: no_false_positive_review
  runner:
    preferred:
      - main-thread
    fallback: null
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/me2b-runtime-admission-canary.ts
    - tests/me2b-runtime-admission-canary.test.ts
    - docs/researches/20260826-me2b-managed-parent-sandbox-canary.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260826-1716-me2b-managed-parent-sandbox-canary.notes.md
  tests_pass:
    - path: tests/me2b-runtime-admission-canary.test.ts
  commands_succeed:
    - bun test tests/me2b-runtime-admission-canary.test.ts --timeout 60000
    - bun run check:type
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
  files_contain:
    - path: plans/prds/20260824-1653-writable-worker-grant.prd.md
      pattern: "Runtime Admission Decision"
```

## Acceptance Notes (Human Review)

- Passing requires dynamic Host denial after revocation with Parent control still alive; static profiles and process death are insufficient.
- A no-go result must leave no writer-grant product code or architecture node.

## Rollback Point

- Commit / checkpoint: exact canary decision publication.
- Revert strategy: revert canary/research/workflow artifacts; no runtime state migration exists.
