# Task Contract: me0b-engineer-principal-claim-actor

> **Status**: Active
> **Plan**: plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-engineer-bindings
> **Last Updated**: 2026-08-25 02:29
> **Review File**: `tasks/reviews/20260825-0029-me0b-engineer-principal-claim-actor.review.md`
> **Notes File**: `tasks/notes/20260825-0029-me0b-engineer-principal-claim-actor.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ME-0A can persist one current Module Engineer Binding, but every mutation caller can still self-report the Binding fields. Without a server-derived principal and claim provenance, a retired Session can replay stale identity and downstream scheduling/delegation would build on a false authorization boundary. Shipping the wrong carrier is worse than skipping the feature: reusing Provider Thread IDs, hook session IDs or the open-shell coding profile would label caller-controlled or locally mutable state as authentication.

## Goal

Deliver the Approved ME-0B boundary: an OAuth-only no-shell Engineer MCP profile, server-derived authorization principal mapped to and revalidated against the live ME-0A Binding, immutable ClaimActorReceipt publication, and engineer-scoped acquire that reuses canonical Fleet/Lease/WorkEnvelope effects and compensates only its own Claim when receipt persistence fails.

## Scope

- In scope: closed principal/mapping/receipt protocols；restricted Engineer MCP profile/scope/tool inventory；operator mapping enrollment/revocation/readback；live Binding revalidation；Fleet acquire wrapper；immutable receipt/live Lease validation；own-Claim compensation；focused E2E/security regression tests；architecture/workstream evidence。
- Out of scope: Provider Thread authentication；Codex/Claude adapters；Worker Host；Work Package Graph/EngineerOffer；delegation/messaging/writer grant/handoff/Human Board；Task/Lease/WorkEnvelope/Publication/Acceptance schema changes；generic CLI engineer acquire；bearer-token CLI fields；worktree deletion on failure。
- Taste constraints: one authority per datum；exact-key schemas；no fallback identity；no coding-shell reuse；command identity fields are fences only；keep generic Fleet behavior unchanged。

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the existing OAuth boundary cannot provide a stable server-derived authorization ID without also granting coding shell, or if engineer acquire cannot compensate its exact returned Claim without changing Lease semantics. Cheapest proof: policy/OAuth/HTTP tool-inventory fixture plus an injected receipt-write failure over the existing Fleet dependency seam.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260825-0029-me0b-engineer-principal-claim-actor.review.md`
- Notes file: `tasks/notes/20260825-0029-me0b-engineer-principal-claim-actor.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"me0b-principal-claim-deterministic-tests","kind":"deterministic_test","paths":["src/core/engineers/principal-claim.ts","src/effects/engineers/principal-store.ts","src/effects/engineers/principal.ts","src/effects/engineers/claim-actor-store.ts","src/effects/engineers/acquire.ts","src/cli/mcp/engineer-tools.ts"]},{"id":"me0b-engineer-mcp-runtime-readback","kind":"runtime_readback","paths":["src/core/engineers/principal-claim.ts","src/effects/engineers/principal-store.ts","src/effects/engineers/principal.ts","src/effects/engineers/claim-actor-store.ts","src/effects/engineers/acquire.ts","src/cli/mcp/engineer-tools.ts"]}]}
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
  - plans/plan-20260825-0029-me0b-engineer-principal-claim-actor.md
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260825-0029-me0b-engineer-principal-claim-actor.contract.md
  - tasks/reviews/20260825-0029-me0b-engineer-principal-claim-actor.review.md
  - tasks/notes/20260825-0029-me0b-engineer-principal-claim-actor.notes.md
  - tasks/workstreams/runtime-harness/engineer-bindings/me0b-principal-claim-actor.md
  - .archcontext/model/nodes/capability.runtime-harness.engineer-bindings.yaml
  - .archcontext/model/nodes/capability.runtime-harness.mcp-sidecar.yaml
  - .archcontext/model/relations/
  - .archcontext/model/flows/
  - docs/architecture/.projection-manifest.json
  - docs/architecture/changelog.md
  - docs/architecture/decisions/index.md
  - docs/architecture/diagrams/architecture.likec4
  - docs/architecture/diagrams/architecture.mmd
  - docs/architecture/diagrams/architecture.structurizr.json
  - docs/architecture/index.md
  - docs/architecture/modules/runtime-harness/engineer-bindings.md
  - docs/architecture/modules/runtime-harness/mcp-sidecar.md
  - docs/architecture/requests/archive/2026/runtime-harness-mcp-sidecar.md
  - src/core/engineers/principal-claim.ts
  - src/effects/engineers/principal-store.ts
  - src/effects/engineers/principal.ts
  - src/effects/engineers/claim-actor-store.ts
  - src/effects/engineers/acquire.ts
  - src/cli/commands/engineer.ts
  - src/cli/commands/mcp.ts
  - src/cli/mcp/
  - tests/unit/me0b-engineer-principal-claim-actor.test.ts
  - tests/unit/me0b-principal-store.test.ts
  - tests/unit/me0b-engineer-acquire.test.ts
  - tests/cli/engineer.test.ts
  - tests/cli/mcp-setup.test.ts
  - tests/cli/mcp-oauth.test.ts
  - tests/cli/mcp-http.test.ts
  - tests/cli/mcp-engineer-tools.test.ts
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
    - tasks/notes/20260825-0029-me0b-engineer-principal-claim-actor.notes.md
  tests_pass:
    - path: tests/unit/me0b-engineer-principal-claim-actor.test.ts
    - path: tests/unit/me0b-principal-store.test.ts
    - path: tests/unit/me0b-engineer-acquire.test.ts
    - path: tests/cli/mcp-engineer-tools.test.ts
  commands_succeed:
    - bun run check:type
    - bun test tests/unit/me0b-engineer-principal-claim-actor.test.ts tests/unit/me0b-principal-store.test.ts tests/unit/me0b-engineer-acquire.test.ts tests/cli/mcp-engineer-tools.test.ts tests/cli/engineer.test.ts tests/cli/mcp-setup.test.ts tests/cli/mcp-oauth.test.ts tests/cli/mcp-http.test.ts --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: exact OAuth subject → mapping → current Binding → Fleet Claim → immutable actor receipt path.
- Edge cases: cross-authorization hijack；revoked/stale mapping；rotated Binding；payload spoof；receipt idempotency/conflict；receipt failure after Fleet success；foreign Claim replacement；compensation failure。
- Regression risks: exhaustive MCP profile lists/config setup；OAuth scope/profile refresh；public tool inventory；generic Fleet acquire behavior。

## Rollback Point

- Commit / checkpoint: one isolated `codex/me0b-engineer-principal-claim-actor` work-package.
- Revert strategy: revert new Engineer MCP/profile/principal/receipt/acquire modules and projections；existing Binding/Fleet/Lease data remains valid and unchanged。
