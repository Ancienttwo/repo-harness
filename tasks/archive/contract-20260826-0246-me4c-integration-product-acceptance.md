> **Archived**: 2026-08-26 02:46
> **Related Plan**: plans/archive/plan-20260826-0115-me4c-integration-product-acceptance.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260826-0246

# Task Contract: me4c-integration-product-acceptance

> **Status**: Fulfilled
> **Plan**: plans/plan-20260826-0115-me4c-integration-product-acceptance.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: runtime-harness-integration-acceptance
> **Last Updated**: 2026-08-26 01:16
> **Review File**: `tasks/reviews/20260826-0115-me4c-integration-product-acceptance.review.md`
> **Notes File**: `tasks/notes/20260826-0115-me4c-integration-product-acceptance.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Module-level Publication and green checks do not prove one Approved product requirement against one exact combined candidate. Without ME-4C, an integration controller can silently reuse stale publication evidence, skip a requirement row or create a second product-verdict authority beside the existing AcceptanceReceipt.

## Goal

Deliver the exact-subject ME-4C integration evidence plane: closed content-addressed IntegrationContract, IntegrationEnvelope, AcceptanceMatrix and ProductAcceptanceProjection schemas; strict Approved requirement, Git candidate, current Publication pointer/status and evidence revalidation; immutable storage; and local CLI reads/builds that only project an already-verified protocol-2 AcceptanceReceipt.

## Scope

- In scope: exact existing Git commit/tree carrier; current lease pointer plus immutable PublicationReceipt join; full lease-observation digest; exact constraint matrix; immutable git-common-dir evidence store; protocol-2 AcceptanceReceipt verification/projection; CLI JSON/text; ArchContext/workstream/evidence.
- Out of scope: merge construction/order, new Requirement or Acceptance authority, Task/Lease/Publication transitions, Provider/Worker runtime, ME-2C dependency, automatic Human merge/release, UI or daemon.
- Taste constraints: every datum is bound to exact bytes/digests; absent/stale/malformed authority fails closed; product output is named and validated as a projection, never a receipt or verdict.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a second Acceptance signer/verdict appears, if a selected publication can cease to be the current lease pointer without invalidating the envelope, or if a publication head not contained in the final Git candidate can pass. The cheapest proof is a two-publication pure/effect fixture that mutates one pointer/status/head fence at a time and expects typed refusal.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260826-0115-me4c-integration-product-acceptance.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260826-0115-me4c-integration-product-acceptance.review.md`
- Notes file: `tasks/notes/20260826-0115-me4c-integration-product-acceptance.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"carried-me1b-deterministic-contract","kind":"deterministic_test","paths":["src/core/engineers/engineering-overlay.ts","src/effects/engineers/engineering-overlay.ts","src/effects/engineers/module-inbox.ts"]},{"id":"me4c-integration-deterministic-contract","kind":"deterministic_test","paths":["src/core/integration/product-acceptance.ts","src/effects/integration/product-acceptance.ts","src/cli/commands/integration.ts","tests/unit/me4c-integration-product-acceptance.test.ts","tests/cli/integration.test.ts"]},{"id":"me4c-integration-runtime-readback","kind":"runtime_readback","paths":["src/effects/integration/product-acceptance.ts","src/cli/commands/integration.ts","tests/cli/integration.test.ts"]}]}
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
  - tasks/contracts/20260826-0115-me4c-integration-product-acceptance.contract.md
  - tasks/reviews/20260826-0115-me4c-integration-product-acceptance.review.md
  - tasks/notes/20260826-0115-me4c-integration-product-acceptance.notes.md
  - .ai/context/capabilities.json
  - .archcontext/
  - AGENTS.md
  - CLAUDE.md
  - .claude/templates/
  - docs/architecture/
  - docs/researches/20260824-persistent-module-engineer-organization.md
  - plans/prds/20260824-1653-integration-product-acceptance.prd.md
  - tasks/current.md
  - tasks/workstreams/runtime-harness/integration-acceptance/
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
    - src/core/integration/product-acceptance.ts
    - src/effects/integration/product-acceptance.ts
    - src/cli/commands/integration.ts
    - tests/unit/me4c-integration-product-acceptance.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260826-0115-me4c-integration-product-acceptance.notes.md
  tests_pass:
    - path: tests/unit/me4c-integration-product-acceptance.test.ts
    - path: tests/cli/integration.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior: two exact selected publications join one Approved requirement, complete matrix, exact Git candidate and existing verified AcceptanceReceipt.
- Edge cases: stale requirement bytes, pointer/lease status drift, publication/head mismatch, non-ancestor publication, candidate head/tree drift, mutable evidence and incomplete/extra matrix rows.
- Regression risks: accidentally creating a new product verdict, reading legacy/malformed authority as empty, or allowing CLI build/read paths to mutate Task/Lease/Publication.

## Rollback Point

- Commit / checkpoint: exact ME-4C candidate frozen by verify-sprint.
- Revert strategy: revert the ME-4C publication commit; immutable evidence files outside Git have no mutable pointer and existing authorities remain unchanged.
