> **Archived**: 2026-09-22 01:26
> **Related Plan**: plans/archive/plan-20260922-0113-akn03-reply-protocol.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260922-0126
> **Archive Projection V1**: `plans/plan-20260922-0113-akn03-reply-protocol.md` => `plans/archive/plan-20260922-0113-akn03-reply-protocol.md`
> **Archive Projection V1**: `tasks/notes/20260922-0113-akn03-reply-protocol.notes.md` => `tasks/archive/notes-20260922-0126-akn03-reply-protocol.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0113-akn03-reply-protocol.contract.md` => `tasks/archive/contract-20260922-0126-akn03-reply-protocol.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0113-akn03-reply-protocol.review.md` => `tasks/archive/review-20260922-0126-akn03-reply-protocol.md`

# Task Contract: akn03-reply-protocol

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260922-0113-akn03-reply-protocol.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 01:13
> **Review File**: `tasks/archive/review-20260922-0126-akn03-reply-protocol.md`
> **Notes File**: `tasks/archive/notes-20260922-0126-akn03-reply-protocol.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

An ACK is not a disposition. A partial reply must never become authenticated by event shape or best-effort MCP audit.

## Goal

Freeze and implement strict TaskReplyIntentV1/TaskReplyCommitV1 structural contracts, chain classification, original-ID retry and exact-fence resume checks. Pure data integrity only; no authenticated runtime claim.

## Scope

- In scope: roadmap AKN-03a pure reply protocol and fault oracle; named files below.
- Out of scope: protected effect writer, filesystem recovery reader, MCP, UI, real Host admission/canary, Campaign activation, merge.
- Taste constraints: source validators and body authority reused; no dual authority or fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A half-written, cross-task, wrong-recipient, changed-byte or rotated-fence chain accepted as complete/resumable falsifies the contract; pure fault tests are the cheapest proof.

## Workflow Inventory

- Source plan: `plans/archive/plan-20260922-0113-akn03-reply-protocol.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260922-0126-akn03-reply-protocol.md`
- Notes file: `tasks/archive/notes-20260922-0126-akn03-reply-protocol.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "reply-protocol-tests", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/fleet/task-reply.ts
  - tests/unit/task-reply.test.ts
  - docs/researches/20260922-task-reply-protocol.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260922-0113-akn03-reply-protocol.md
  - tasks/archive/contract-20260922-0126-akn03-reply-protocol.md
  - tasks/archive/review-20260922-0126-akn03-reply-protocol.md
  - tasks/archive/notes-20260922-0126-akn03-reply-protocol.md
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

This block contains only non-executable artifact requirements. Define every
executable check once in the canonical Verification Plan below. Each check must
state its phase, cost, evidence policy, necessity, and input environment; a
missing or malformed plan fails closed. Populate artifact requirements only
for deliverables this task actually owns; do not create a spec, notes or report
merely to fill this template.

```yaml
exit_criteria:
  files_exist:
    - src/core/fleet/task-reply.ts
    - tests/unit/task-reply.test.ts
    - docs/researches/20260922-task-reply-protocol.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "reply-protocol-tests",
      "kind": "package_test",
      "path": "tests/unit/task-reply.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Reply integrity and existing event behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "message-protocol-tests",
      "kind": "package_test",
      "path": "tests/unit/task-message-v1.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Reply integrity and existing event behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "type",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and shared contract type safety",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and shared contract type safety",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and shared contract type safety",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and shared contract type safety",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "deploy-sql",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and shared contract type safety",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "architecture-sync",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and shared contract type safety",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and shared contract type safety",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and shared contract type safety",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "project-state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and shared contract type safety",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "init-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity and shared contract type safety",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

Author the actual checks using [Testing Policy and Artifact Standards](../../docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards).
The empty array is not permission to omit required repository checks: retain it
only when no executable criterion applies and explain why in Acceptance Notes.
Prefer existing covering tests; creating a task-named test or adding typecheck
is not a template requirement. For each selected check declare `id`, `kind`,
`cwd`, `phase`, `cost`, `evidence_policy`, `necessity`, `inputs.env`, and its
`command` or `path`. Declare the same execution once, including checks nested
inside aggregate scripts. Use `baseline_with_delta` only with an immutable
baseline and named current delta checks; never infer it from paths or command text.

## Acceptance Notes (Human Review)

Existing task-message-v1 tests cover event/receipt shape, not multi-record reply integrity. New task-reply.test.ts owns the independently meaningful three-record contract. Pure fixtures exercise tamper, interrupted stages, response loss, closed parent set and current/historical fence separation. No runtime/provider or filesystem proof is claimed. Focused tests and type checks take seconds; root integrity commands remain mandatory, no new full suite.

AKN-03 remains incomplete until protected write/lock/fsync, recovery projection, authenticated MCP and real Host evidence land. Raw snapshots/digests alone cannot authenticate callers. Commit/readback before independent acceptance; per-stage PR only, no merge.

## Rollback Point

- Commit / checkpoint: main 0d4371c3f95e63851f4e083718f3337bf9646345.
- Revert strategy: revert named protocol/tests/docs; no production state migration.
