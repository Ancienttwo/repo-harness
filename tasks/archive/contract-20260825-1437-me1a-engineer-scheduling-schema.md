> **Archived**: 2026-08-25 14:37
> **Related Plan**: plans/archive/plan-20260825-1149-me1a-engineer-scheduling-schema.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260825-1437

# Task Contract: me1a-engineer-scheduling-schema

> **Status**: Fulfilled
> **Plan**: plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-engineer-scheduling
> **Last Updated**: 2026-08-25 11:49
> **Review File**: `tasks/reviews/20260825-1149-me1a-engineer-scheduling-schema.review.md`
> **Notes File**: `tasks/notes/20260825-1149-me1a-engineer-scheduling-schema.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ME-0A and ME-0B establish a persistent Profile/Binding and authenticated Claim actor, but they still consume generic Fleet offers that have no stable Work Package identity, dependency graph, capability qualification, or cross-task concurrency fence. Implementing routing from prose or task paths would create a second, heuristic authority; implementing only offer-time concurrency filtering would race across different task locks. ME-1A must add a separate canonical scheduling authority while preserving existing Task/Lease/Fleet identities and mutation paths.

## Goal

Deliver the Approved ME-1A boundary: an explicit same-commit Work Package Graph carrier, closed validation and independent revisions, deterministic exact-capability `EngineerOfferV1` projection, repository-scoped concurrency election, and authenticated stale-fenced acquire that delegates to the existing ME-0B/Fleet path.

## Scope

- In scope: ME-1A PRD promotion；closed Work Graph/Engineer Offer protocols；same-commit graph/reference reads；exact Sprint-row projection；dependency/capability/concurrency/active-claim classification；repo-key lock；restricted MCP offers/acquire；read-only CLI inspection；architecture/workstream evidence；focused and full verification。
- Out of scope: Provider/Session lifecycle；Worker Host；delegation/messages/writer grants/handoff/interface requests/Human Board；Task/Lease/Fleet/Publication/Acceptance schema replacement；generic Fleet semantic changes；capability/fleet concurrency；multi-capability qualification；automatic migration；prose/path inference；future product-acceptance implementation。
- Taste constraints: one authority per datum；exact-key schemas；missing carrier is unclassified；generic-v1 is explicit and excluded；no acquire fallback from EngineerOffer to bare FleetOffer；no new dependency/database/daemon/cache；reuse ME-0B receipt/compensation and Fleet claim/worktree/WorkEnvelope effects unchanged。

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a separate sibling graph cannot preserve existing task identities, or if repository-scoped concurrency cannot elect one winner without changing Lease semantics. Cheapest proof: pure fixture shows identical Sprint rows retain `task_id/task_revision` while graph metadata revisions change, followed by an injected N-way acquire test in which the concurrency lock allows exactly one call to the ME-0B acquire dependency.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260825-1149-me1a-engineer-scheduling-schema.review.md`
- Notes file: `tasks/notes/20260825-1149-me1a-engineer-scheduling-schema.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me1a-full-repository-verification","kind":"deterministic_test","paths":["*"]},{"id":"me1a-engineer-mcp-runtime-readback","kind":"runtime_readback","paths":["src/effects/engineers/scheduling.ts","src/effects/engineers/scheduling-acquire.ts","src/cli/mcp/engineer-tools.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - AGENTS.md
  - CLAUDE.md
  - plans/prds/20260824-1653-engineer-scheduling-schema.prd.md
  - plans/plan-20260825-1149-me1a-engineer-scheduling-schema.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260825-1149-me1a-engineer-scheduling-schema.contract.md
  - tasks/reviews/20260825-1149-me1a-engineer-scheduling-schema.review.md
  - tasks/notes/20260825-1149-me1a-engineer-scheduling-schema.notes.md
  - tasks/workstreams/runtime-harness/engineer-scheduling/me1a-scheduling-schema.md
  - .archcontext/model/nodes/capability.runtime-harness.engineer-scheduling.yaml
  - .archcontext/model/nodes/component.engineer-scheduling.primary.yaml
  - .archcontext/model/nodes/capability.runtime-harness.mcp-sidecar.yaml
  - .archcontext/model/relations/relation.mcp-sidecar.engineer-scheduling.yaml
  - .archcontext/model/relations/relation.engineer-scheduling.engineer-bindings.yaml
  - .archcontext/model/flows/flow.engineer-scheduling.acquire.yaml
  - .archcontext/model/flows/flow.mcp-sidecar.engineer-acquire.yaml
  - docs/architecture/.projection-manifest.json
  - docs/architecture/changelog.md
  - docs/architecture/decisions/index.md
  - docs/architecture/diagrams/architecture.likec4
  - docs/architecture/diagrams/architecture.mmd
  - docs/architecture/diagrams/architecture.structurizr.json
  - docs/architecture/index.md
  - docs/architecture/modules/runtime-harness/engineer-scheduling.md
  - docs/architecture/modules/runtime-harness/engineer-bindings.md
  - docs/architecture/modules/runtime-harness/mcp-sidecar.md
  - docs/architecture/requests/archive/2026/runtime-harness-mcp-sidecar.md
  - docs/architecture/requests/archive/2026/20260825-121934-runtime-harness-mcp-sidecar.md
  - docs/architecture/requests/archive/2026/runtime-harness-engineer-scheduling.md
  - src/core/engineers/scheduling.ts
  - src/effects/engineers/scheduling.ts
  - src/effects/engineers/scheduling-acquire.ts
  - src/effects/engineers/claim-actor-store.ts
  - src/cli/commands/engineer.ts
  - src/cli/mcp/engineer-tools.ts
  - src/cli/mcp/instructions.ts
  - tests/unit/me1a-engineer-scheduling-schema.test.ts
  - tests/unit/me1a-engineer-scheduling.test.ts
  - tests/unit/me1a-engineer-scheduling-acquire.test.ts
  - tests/unit/me0b-engineer-principal-claim-actor.test.ts
  - tests/cli/engineer.test.ts
  - tests/cli/mcp-engineer-tools.test.ts
  - tests/cli/mcp-http.test.ts
  - tests/architecture-projection-e2e.test.ts
  - tests/capability-archcontext-export.test.ts
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260825-1149-me1a-engineer-scheduling-schema.notes.md
  tests_pass:
    - path: tests/unit/me1a-engineer-scheduling-schema.test.ts
    - path: tests/unit/me1a-engineer-scheduling.test.ts
    - path: tests/unit/me1a-engineer-scheduling-acquire.test.ts
    - path: tests/cli/mcp-engineer-tools.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
    - bun test --timeout 60000
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: exact graph carrier and Engineer offers only; authenticated acquire delegates to the existing ME-0B/Fleet path.
- Edge cases: missing/generic/malformed/cyclic graph, moved refs, unavailable dependency authority, capability mismatch, active-claim limit, same-key races, stale graph/task/Binding/Fleet fences.
- Regression risks: generic Fleet offer/acquire, Sprint row identity, ME-0A Binding and ME-0B principal/receipt behavior must remain unchanged.

## Rollback Point

- Commit / checkpoint: isolated `codex/me1a-engineer-scheduling-schema` worktree from `main@6879a5229e5c6591b9fb72b22acf362f4b03ed14`.
- Revert strategy: revert this work-package's code/schema/MCP/tests/architecture/workflow files; no existing Task, Lease, Fleet, Publication or Acceptance store migration is performed.
