> **Archived**: 2026-08-23 04:42
> **Related Plan**: plans/archive/plan-20260823-0202-fleet-offer-acquire.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260823-0442

# Task Contract: fleet-offer-acquire

> **Status**: Fulfilled
> **Plan**: plans/plan-20260823-0202-fleet-offer-acquire.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-23 02:02
> **Review File**: `tasks/reviews/20260823-0202-fleet-offer-acquire.review.md`
> **Notes File**: `tasks/notes/20260823-0202-fleet-offer-acquire.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

WP1 can prove publication merge readiness, but the fleet still cannot enumerate executable task work or atomically turn one eligible row into a bound worktree. If offers infer plans, ignore registry authorization drift, or return before claim/worktree/bind/token converge, concurrent agents can receive false or duplicate execution authority. WP2 establishes that acquisition boundary before feedback/inbox and board consumers depend on it.

## Goal

Implement PRD v3 Module 5: deterministic `TaskOfferV1` classification, `fleet offers --json`, execution-ready-only `fleet acquire`, `WorkEnvelopeV1`, and MCP mirrors for fleet offers/acquire plus publication readiness/reopen/takeover. A successful acquire must return exactly one fresh bound worktree whose claim, token, contract, authorization revision, canonical task revision, and plan proof agree; every stale or partial path fails closed and compensates only its own claim.

## Scope

- In scope: closed offer/envelope contracts; four-way execution-readiness classification; atomic registry/canonical-plan proof; deterministic offers; claim/start/bind/token acquisition; optimistic authorization and offer fences; typed compensation; structured worktree-start output; CLI and MCP mirrors; race, rollback, authorization, helper parity, and transport tests.
- Out of scope: RepairOffer, feedback/inbox, remote claims/CAS, daemon/wake/session transport, automatic steal, PlanningOffer, sprint schema extension, auto-merge, compatibility aliases, or any change to `COORDINATION_PROTOCOL` and task digest domains.
- Taste constraints: offers and envelopes are projections/capabilities, never persisted authority; require an exact Approved work-package plan with canonical Source Ref; never parse human helper output, infer plans from filenames/Plan cells, or duplicate claim/bind/worktree algorithms.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if existing claim/bind/worktree/token authorities cannot be composed without either returning an envelope before all bound state exists or holding a global registry/worktree lock. Cheapest proof: an injected acquire effect test must demonstrate successful claim -> fresh worktree -> bind -> token convergence and own-claim-only rollback, while a real N-process test proves at most one envelope for one task.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260823-0202-fleet-offer-acquire.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260823-0202-fleet-offer-acquire.review.md`
- Notes file: `tasks/notes/20260823-0202-fleet-offer-acquire.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"fleet-acquire-deterministic-contract","kind":"deterministic_test","paths":["src/cli/commands/sprint.ts","src/cli/mcp/fleet-tools.ts","src/core/fleet/task-offer.ts","src/effects/fleet/acquire.ts","src/effects/repo-registry.ts","src/effects/state/coordination-canonical-source.ts","src/effects/state/coordination-claim-token.ts","tests/cli/fleet-offer-acquire.test.ts","tests/fleet-acquire-concurrency.test.ts"]},{"id":"fleet-acquire-runtime-readback","kind":"runtime_readback","paths":["src/cli/commands/sprint.ts","src/cli/mcp/fleet-tools.ts","src/effects/fleet/acquire.ts","src/effects/repo-registry.ts","src/effects/state/coordination-canonical-source.ts","src/effects/state/coordination-claim-token.ts","tests/cli/fleet-offer-acquire.test.ts","tests/fleet-acquire-concurrency.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260823-0202-fleet-offer-acquire.contract.md
  - tasks/reviews/20260823-0202-fleet-offer-acquire.review.md
  - tasks/notes/20260823-0202-fleet-offer-acquire.notes.md
  - docs/architecture/.projection-manifest.json
  - src/core/fleet/task-offer.ts
  - src/effects/fleet/acquire.ts
  - src/effects/repo-registry.ts
  - src/effects/state/coordination-canonical-source.ts
  - src/effects/state/coordination-claim-token.ts
  - src/effects/publication/publication-lifecycle.ts
  - src/cli/commands/fleet.ts
  - src/cli/commands/sprint.ts
  - src/cli/mcp/fleet-tools.ts
  - src/cli/mcp/tools.ts
  - scripts/contract-worktree.sh
  - assets/templates/helpers/contract-worktree.sh
  - scripts/sprint-backlog.sh
  - assets/templates/helpers/sprint-backlog.sh
  - tests/unit/fleet-offer-acquire.test.ts
  - tests/unit/fleet-acquire-effect.test.ts
  - tests/unit/publication-lifecycle.test.ts
  - tests/unit/contract-worktree-runtime-bootstrap.test.ts
  - tests/cli/fleet-offer-acquire.test.ts
  - tests/cli/mcp-fleet-publication.test.ts
  - tests/cli/mcp-policy.test.ts
  - tests/fleet-acquire-concurrency.test.ts
  - tests/sprint-backlog.test.ts
  - tests/helper-scripts.test.ts
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
    - src/core/fleet/task-offer.ts
    - src/effects/fleet/acquire.ts
    - tests/unit/fleet-offer-acquire.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260823-0202-fleet-offer-acquire.notes.md
  tests_pass:
    - path: tests/unit/fleet-offer-acquire.test.ts
    - path: tests/unit/fleet-acquire-effect.test.ts
    - path: tests/cli/fleet-offer-acquire.test.ts
    - path: tests/cli/mcp-fleet-publication.test.ts
    - path: tests/fleet-acquire-concurrency.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:helpers
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: offers are deterministic read projections; acquire returns only a fully bound `WorkEnvelopeV1`; MCP returns the same contracts through existing policy gates.
- Edge cases: four readiness classes, duplicate/missing plan, dirty/stale source checkout, read-only or changed authorization, changed offer/task/target, concurrent claim, provisioning/bind/token/projection failure, rollback failure, residual topology.
- Regression risks: helper source/template drift, a second claim-token writer, mutation exposed to planner/read-only MCP, or a worktree returned before bind/token convergence.

## Rollback Point

- Commit / checkpoint: pre-WP2 `8b8c4dbc`.
- Revert strategy: revert the single WP2 publication unit; WP0 publication lifecycle/reconcile and WP1 readiness remain intact.
