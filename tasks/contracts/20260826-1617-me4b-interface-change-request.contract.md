# Task Contract: me4b-interface-change-request

> **Status**: Active
> **Plan**: plans/plan-20260826-1617-me4b-interface-change-request.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-27 02:16
> **Review File**: `tasks/reviews/20260826-1617-me4b-interface-change-request.review.md`
> **Notes File**: `tasks/notes/20260826-1617-me4b-interface-change-request.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Cross-capability interface decisions currently exist only as untrusted message/prose. If the slice ships with a second Work Package authority, self-asserted actor identity or implicit message/code transitions, it can bypass delivered ME-1A scheduling, Binding fencing and Human acceptance boundaries.

## Goal

Deliver a closed ME-4B request/event/current authority with source Engineer, target Engineer and Human actor separation; immutable accepted Work Package projections; exact tracked Sprint/Work Graph materialization proof; separate implementation/integration evidence; deterministic reverse lookup; and no direct mutation of planning, Task, Lease, Publication, Acceptance or architecture-event authority. Engineer mutations are limited to the Human-approved authenticated MCP verbs `propose|submit|cancel|materialize|implemented`; Human alone owns `accept|reject|integrated`.

## Scope

- In scope: ME-4B core schemas and transition matrix; git-common immutable store and per-request CAS; exact current Binding validation; exact Git Work Graph materialization verification; restricted authenticated Engineer MCP surface; Human-only CLI transition and read surface; focused tests; ArchContext capability/module projection; PRD/research/workflow closeout.
- Out of scope: direct Sprint/Work Graph/code mutation; modifying ME-1A Work Package wire bytes; Provider runtime, daemon, generic Worker Host; ME-2B writable grants; Task/Lease/Publication/Acceptance transitions; architecture-event mutation; parsing message body as authority.
- Taste constraints: closed exact-key records, one datum/one authority, fail closed on missing/stale bytes, no compatibility fallback or generic state/payload extension; authorization IDs are lookup carriers only and never semantic identity or CLI payload.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if an accepted projection cannot be verified against the existing `projectWorkGraph` result without modifying `WorkPackageDefinitionV1`. Cheapest proof: build one exact Sprint/Work Graph fixture, accept a projection, and prove materialization by the existing scheduler before adding CLI or architecture surfaces.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260826-1617-me4b-interface-change-request.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260826-1617-me4b-interface-change-request.review.md`
- Notes file: `tasks/notes/20260826-1617-me4b-interface-change-request.notes.md`
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
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - AGENTS.md
  - CLAUDE.md
  - docs/spec.md
  - docs/researches/20260824-persistent-module-engineer-organization.md
  - docs/architecture/.projection-manifest.json
  - docs/architecture/modules/runtime-harness/interface-change.md
  - docs/architecture/modules/runtime-harness/engineer-bindings.md
  - docs/architecture/modules/runtime-harness/engineer-scheduling.md
  - docs/architecture/modules/runtime-harness/mcp-sidecar.md
  - docs/architecture/domains/runtime-harness.md
  - docs/architecture/index.md
  - docs/architecture/changelog.md
  - docs/architecture/decisions/index.md
  - docs/architecture/diagrams/architecture.likec4
  - docs/architecture/diagrams/architecture.mmd
  - docs/architecture/diagrams/architecture.structurizr.json
  - docs/architecture/requests/archive/2026/20260827-021452-runtime-harness-mcp-sidecar.md
  - plans/
  - tasks/current.md
  - tasks/todos.md
  - tasks/workstreams/runtime-harness/interface-change/me4b-interface-change-request.md
  - tasks/contracts/20260826-1617-me4b-interface-change-request.contract.md
  - tasks/reviews/20260826-1617-me4b-interface-change-request.review.md
  - tasks/notes/20260826-1617-me4b-interface-change-request.notes.md
  - .archcontext/model/nodes/capability.runtime-harness.interface-change.yaml
  - .archcontext/model/nodes/component.interface-change.primary.yaml
  - .archcontext/model/nodes/capability.runtime-harness.mcp-sidecar.yaml
  - .archcontext/model/relations/relation.interface-change.primary.yaml
  - .archcontext/model/relations/relation.interface-change.engineer-bindings.yaml
  - .archcontext/model/relations/relation.interface-change.engineer-scheduling.yaml
  - .archcontext/model/relations/relation.mcp-sidecar.interface-change.yaml
  - .archcontext/model/flows/flow.interface-change.transition.yaml
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
    - src/core/engineers/interface-change.ts
    - src/effects/engineers/interface-change-store.ts
    - src/cli/commands/interface-change.ts
    - docs/architecture/modules/runtime-harness/interface-change.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260826-1617-me4b-interface-change-request.notes.md
  tests_pass:
    - path: tests/unit/me4b-interface-change-request.test.ts
    - path: tests/cli/interface-change.test.ts
  commands_succeed:
    - bun test tests/unit/me4b-interface-change-request.test.ts tests/cli/interface-change.test.ts --timeout 60000
    - bun run check:type
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
    - bun test --timeout 60000
  files_contain:
    - path: src/effects/engineers/interface-change-store.ts
      pattern: projectWorkGraph
    - path: plans/prds/20260824-1653-interface-change-request.prd.md
      pattern: "Status**: Approved"
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: closed actor-fenced lifecycle and exact tracked materialization.
- Edge cases: stale concurrent transitions, crash after immutable event, mismatched Binding/capability/commit/work graph, repeated idempotency key with changed bytes.
- Regression risks: accidental ME-1A wire change or a second planning authority; both are explicit negative-test and review gates.

## Rollback Point

- Commit / checkpoint: exact final ME-4B subject recorded by verify-sprint.
- Revert strategy: revert the core/store/CLI/tests/capability projection and scheduling validator export as one unit; leave immutable git-common evidence unread.
