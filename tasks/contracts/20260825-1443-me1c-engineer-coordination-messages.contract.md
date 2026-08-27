# Task Contract: me1c-engineer-coordination-messages

> **Status**: Active
> **Plan**: plans/plan-20260825-1443-me1c-engineer-coordination-messages.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-engineer-messages
> **Last Updated**: 2026-08-25 14:43
> **Review File**: `tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md`
> **Notes File**: `tasks/notes/20260825-1443-me1c-engineer-coordination-messages.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ME-3A persistent-thread delivery and every later Module Engineer coordination flow require durable module/assignment communication. Reusing Task Inbox as an open payload would collapse task/claim and engineer/binding identity; duplicating every store mechanic would create drift. ME-1C must preserve Task Inbox bytes while adding a closed Engineer message authority whose Provider delivery is strictly persist-first and non-authoritative.

## Goal

Deliver Approved ME-1C: shared closed message mechanics with byte-identical TaskMessageV1 behavior, strict ModuleMessage event/receipt/observation schemas, git-common-dir durable inbox, current-Binding and assignment fences, resource-digest-gated acknowledgement, optional bounded-summary transport, and authenticated CLI/MCP consumption without any Task/Lease/Decision/Interface/Publication/Acceptance mutation.

## Scope

- In scope: ME-1C PRD promotion; closed shared mechanics; Module message/event/receipt/observation schemas; durable store; module/assignment scope; Binding rotation handling; resource digest checks; CLI/MCP send/list/ack; optional transport interface; architecture/workstream evidence; focused and full verification.
- Out of scope: TaskMessage wire changes; Decision/Interface state; Lease/Task/Publication/Acceptance mutation; Session wake or lifecycle; ME-3 concrete Provider transport; raw transcript or full resource copies; generic payloads; remote delivery; databases/daemons.
- Taste constraints: one authority per datum; exact-key schemas; sender derived at invocation boundary; persist event and pending receipt before transport; error observations never synthesize delivery; unknown/stale/mismatched state fails closed; no Provider or payload fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if extracting mechanics changes one canonical Task Inbox byte or if a transport can run before immutable event plus pending receipt persistence. Cheapest proof: freeze existing Task event/receipt golden bytes and inject an event-store failure into one Module send while asserting transport call count remains zero.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260825-1443-me1c-engineer-coordination-messages.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md`
- Notes file: `tasks/notes/20260825-1443-me1c-engineer-coordination-messages.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me1c-full-repository-verification","kind":"deterministic_test","paths":["*"]},{"id":"me1c-module-inbox-runtime-readback","kind":"runtime_readback","paths":["src/effects/engineers/module-inbox.ts","src/cli/commands/engineer.ts","src/cli/mcp/engineer-tools.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/prds/20260824-1653-engineer-coordination-messages.prd.md
  - plans/plan-20260825-1443-me1c-engineer-coordination-messages.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260825-1443-me1c-engineer-coordination-messages.contract.md
  - tasks/reviews/20260825-1443-me1c-engineer-coordination-messages.review.md
  - tasks/notes/20260825-1443-me1c-engineer-coordination-messages.notes.md
  - tasks/workstreams/runtime-harness/engineer-messages/me1c-engineer-coordination-messages.md
  - .archcontext/model/nodes/capability.runtime-harness.engineer-messages.yaml
  - .archcontext/model/nodes/component.engineer-messages.primary.yaml
  - .archcontext/model/nodes/capability.runtime-harness.mcp-sidecar.yaml
  - .archcontext/model/relations/relation.engineer-messages.engineer-bindings.yaml
  - .archcontext/model/relations/relation.mcp-sidecar.engineer-messages.yaml
  - .archcontext/model/flows/flow.engineer-messages.lifecycle.yaml
  - .archcontext/model/flows/flow.mcp-sidecar.engineer-messages.yaml
  - docs/architecture/.projection-manifest.json
  - docs/architecture/changelog.md
  - docs/architecture/decisions/index.md
  - docs/architecture/diagrams/architecture.likec4
  - docs/architecture/diagrams/architecture.mmd
  - docs/architecture/diagrams/architecture.structurizr.json
  - docs/architecture/index.md
  - docs/architecture/modules/runtime-harness/engineer-messages.md
  - docs/architecture/modules/runtime-harness/engineer-bindings.md
  - docs/architecture/modules/runtime-harness/mcp-sidecar.md
  - docs/architecture/requests/archive/2026/
  - docs/architecture/
  - docs/researches/20260825-runtime-admission-canary.md
  - src/core/messages/mechanics.ts
  - src/core/fleet/task-message.ts
  - src/core/engineers/module-message.ts
  - src/effects/engineers/module-inbox.ts
  - src/cli/commands/engineer.ts
  - src/cli/mcp/engineer-tools.ts
  - src/cli/mcp/instructions.ts
  - tests/unit/task-message-v1.test.ts
  - tests/unit/task-inbox-v1.test.ts
  - tests/unit/me1c-module-message.test.ts
  - tests/unit/me1c-module-inbox.test.ts
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
    - tasks/notes/20260825-1443-me1c-engineer-coordination-messages.notes.md
  tests_pass:
    - path: tests/unit/task-message-v1.test.ts
    - path: tests/unit/task-inbox-v1.test.ts
    - path: tests/unit/me1c-module-message.test.ts
    - path: tests/unit/me1c-module-inbox.test.ts
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
criterion_reuse:
  commands_succeed:
    - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: immutable module/assignment messages persist before optional transport and remain separate from every task/decision/acceptance authority.
- Edge cases: event conflict, persistence failure, stale Binding, rotation, adapter failure, later delivery, resource digest mismatch, invalid transition, unknown sender/subject/resource kind and bounded rendering.
- Regression risks: TaskMessage canonical bytes/store behavior, existing Engineer status/offers/acquire MCP tools, Binding rotation semantics and MCP restricted-profile boundaries.

## Rollback Point

- Commit / checkpoint: isolated `codex/me1c-engineer-inbox` from `main@a8a0c983bd93a2d75a2a64135d09f33aa6b95d8d`.
- Revert strategy: revert the ME-1C schema/store/CLI/MCP/tests/architecture/workflow files; no existing TaskMessage bytes or persisted stores are migrated.
