# Task Contract: issue-283-immutable-task-id

> **Status**: Fulfilled
> **Plan**: plans/plan-20260902-2101-issue-283-immutable-task-id.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-02 21:01
> **Review File**: `tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md`
> **Notes File**: `tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Task identity is derived from the exact Task cell text today, so a harmless
title clarification reads as "delete one task, create another": live Leases are
orphaned, claim-scoped messages lose their subject, the Work Graph carrier stops
mapping its Work Package, external-source provenance edges break, attempt
history hides under a new id, and a renamed row becomes freshly claimable. If
this ships wrong, every coordination consumer keeps two different meanings in
one field (display text and identity) and autonomous agents silently duplicate
or steal work.

## Goal

Persist an immutable Task ID column in the canonical Sprint schema (schema v2)
so `task_id` is a read value, not a digest of the Task text, while
`task_revision` still moves when the Task text, Mode, or Acceptance cell
changes. Deliver: schema v2 parsing and validation shared by the bash authority
and the TypeScript projection, v2 identity/revision derivation in
`src/core/state/coordination-identity.ts` without touching
`COORDINATION_PROTOCOL`, a Work Graph carrier that joins by `task_id`, every
identity consumer moved to the persisted id, and a one-shot migration command
that preserves each row's pre-migration v1 derived id exactly, refuses live
non-released Leases, and emits a byte-bound migration receipt.

## Scope

- In scope:
  - Sprint backlog schema v2 (`> **Backlog Schema**: 2` header plus a persisted
    `ID` column) in `src/core/state/sprint-backlog-rows.ts`,
    `scripts/sprint-backlog.sh`, and `assets/templates/helpers/sprint-backlog.sh`.
  - v2 `task_id` (validated persisted 64-hex) and `task_revision`
    (`protocol-v2` domain + task_id + Task + Mode + Acceptance) in
    `src/core/state/coordination-identity.ts`.
  - v1 derivation isolated into a single migration-only compatibility module.
  - `WorkPackageDefinitionV1` joining by `task_id`, with `task_ref` demoted to a
    derived display projection.
  - Consumers: CLI sprint commands, Fleet board/acquire/task messages, Engineer
    scheduling offers, external-source bindings, operator board projections.
  - `repo-harness sprint migrate-schema` one-shot migration command plus its
    effect, receipt, and golden tests.
  - Repo-local sprint template, sprint file, docs, architecture module doc, and
    the `tasks/todos.md` compatibility-owner row.
- Out of scope:
  - The collaboration dispatch fence (issue #278) and the dependency-authority
    resolver semantics in `src/effects/engineers/scheduling.ts` (issue #284)
    beyond the minimal `task_id` join-key change.
  - Any external task-ID registry, mutable id database, slug/row-number derived
    id, or indefinite dual-read of v1 for identity-minting paths.
  - Changing the plan `Source Ref` grammar (`sprint:<path>#<task cell>`).
- Taste constraints: fail closed on every malformed, duplicate, or absent id; do
  not add a compatibility path that lets a v1 sprint mint identity.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a persisted ID column cannot preserve every
pre-migration identity value. Cheapest proof point: run the migration over the
repo-local sprint fixture, re-read the migrated file, and compare each row's
persisted id against `deriveLegacyTaskId` on the pre-migration bytes. Any
mismatch, or any pre-migration duplicate Task cell that makes the mapping
ambiguous, falsifies the "populate with the current derived id" migration.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260902-2101-issue-283-immutable-task-id.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md`
- Notes file: `tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"issue-283-task-identity","kind":"deterministic_test","paths":["*"]},{"id":"issue-283-migrate-schema-live-lease-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/
  - tests/
  - scripts/
  - assets/templates/
  - assets/reference-configs/
  - assets/skills/repo-harness-product/references/
  - .claude/templates/
  - plans/
  - docs/
  - .archcontext/model/
  - AGENTS.md
  - CLAUDE.md
  - tasks/todos.md
  - tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md
  - tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md
  - tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md
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
    - plans/plan-20260902-2101-issue-283-immutable-task-id.md
  artifacts_exist:
    - tasks/contracts/20260902-2101-issue-283-immutable-task-id.contract.md
    - tasks/reviews/20260902-2101-issue-283-immutable-task-id.review.md
    - tasks/notes/20260902-2101-issue-283-immutable-task-id.notes.md
  tests_pass:
    - path: tests/unit/sprint-schema-v2-identity.test.ts
    - path: tests/unit/sprint-schema-migrate.test.ts
    - path: tests/sprint-backlog-grammar-drift.test.ts
    - path: tests/coordination-identity.test.ts
    - path: tests/unit/me1a-engineer-scheduling-schema.test.ts
  commands_succeed:
    - bun run check:type
    - bun test --timeout 60000
    - bun run check:state-boundaries
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
