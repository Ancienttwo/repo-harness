# Task Contract: akn03b-windows-identity

> **Status**: Active
> **Plan**: plans/plan-20260922-1548-akn03b-windows-identity.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 15:48
> **Review File**: `tasks/reviews/20260922-1548-akn03b-windows-identity.review.md`
> **Notes File**: `tasks/notes/20260922-1548-akn03b-windows-identity.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Two Windows attempts at #437 head769c065c fail the successful mapped Engineer status call with engineer_principal_unmapped. Local HTTP and installed-package checks pass, so accepting the current fixture would hide an unresolved cross-platform identity failure.

## Goal

Isolate the exact parent/child mapping identity mismatch through the existing HTTP fixture, correct only a proven fixture cause, and obtain current Windows evidence.

## Scope

- In scope: existing HTTP fixture identity probes, a proven fixture-only correction, and exact validation evidence.
- Out of scope: production path/authorization semantics, main merge, runtime install, Host/Campaign/canary.
- Taste constraints: no platform skip, retry masking, invented mapping identity or new authority.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The child and parent canonical mapping identities match yet the live HTTP request remains unmapped. Then a fixture-path correction is falsified and the actual server context must be traced before editing.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260922-1548-akn03b-windows-identity.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260922-1548-akn03b-windows-identity.review.md`
- Notes file: `tasks/notes/20260922-1548-akn03b-windows-identity.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "http", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - tests/cli/mcp-http.test.ts
  - docs/researches/20260922-task-reply-protocol.md
  - plans/plan-20260922-1548-akn03b-windows-identity.md
  - tasks/contracts/20260922-1548-akn03b-windows-identity.contract.md
  - tasks/reviews/20260922-1548-akn03b-windows-identity.review.md
  - tasks/notes/20260922-1548-akn03b-windows-identity.notes.md
  - tasks/todos.md
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
  files_exist: []
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "http",
      "kind": "package_test",
      "path": "tests/cli/mcp-http.test.ts"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "type",
      "kind": "command",
      "command": "bun run check:type"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "deploy-sql",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=769c065c26567b97bff23115257503f4369eab4e REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "task-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "project-state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "init-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owner explicitly requires installed-package MCP registration, request context, permission rejection and successful authorized call; reuse the existing HTTP E2E against installed source",
      "inputs": {
        "env": []
      },
      "id": "installed-package",
      "kind": "command",
      "command": "bash scripts/check-tarball-install-smoke.sh"
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

- Changed behavior/boundary, existing covering tests and remaining gap:
- New test case/file rationale, or why existing coverage is sufficient:
- Selected check IDs and why their coverage is sufficient; omitted coverage:
- Full/expensive check justification and expected cost, if applicable:
- Execution/baseline references, subject, current delta and disposition:
- Residual risks and incomplete observations:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:

Test admission: add identity assertions to the existing failing Engineer OAuth E2E only. No new test file. The same real HTTP and installed-package test consumes them. The added diagnostic process uses disposable fixture identities, never live credentials or a real Host. Hosted Windows evidence is required before acceptance; local pass cannot substitute.
