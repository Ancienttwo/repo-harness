# Task Contract: archctx-projection-profile

> **Status**: Partial
> **Plan**: plans/plan-20260926-0007-archctx-projection-profile.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-09-26 00:11
> **Review File**: `tasks/reviews/20260926-0007-archctx-projection-profile.review.md`
> **Notes File**: `tasks/notes/20260926-0007-archctx-projection-profile.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ArchContext #225 cannot prepare acceptance because projection target discovery applies the unrelated ownership-registry contract before invoking the producer.

## Goal

Resolve explicit repo-harness/v1 projection targets independently of ownership metadata, preserving fail-closed identity/path checks and source glob semantics.

## Scope

- In scope: projection provider target discovery, existing provider tests, paired ArchContext candidate validation and this work-package artifacts.
- Owner-approved closeout: worktree-local CodeGraph indexing, supported daemon/runtime alignment, proof-only reconciliation, and the daemon-generated projection manifest required by normal acceptance. Publication and adoption are part of the requested ArchContext issue closeout; no package registry release is inferred.
- Owner-approved CI repair (2026-09-26): diagnose and repair only the campaign-closeout fixture snapshot failure, including its shared adoption-repository builder and a deterministic regression in the existing closeout test. Other unrelated repairs remain excluded.
- Out of scope: ownership registry behavior, dependency versions, global installation, release, merge and unrelated repairs.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A valid projection-profile node with source globs/exclusions must yield its declared contract targets; unsafe paths and malformed identities must still fail before provider execution.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260926-0007-archctx-projection-profile.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260926-0007-archctx-projection-profile.review.md`
- Notes file: `tasks/notes/20260926-0007-archctx-projection-profile.notes.md`
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
  - src/effects/architecture/archctx-provider.ts
  - tests/architecture-projection-provider.test.ts
  - tests/helpers/campaign-adoption-repository.ts
  - tests/effects/campaign-closeout.test.ts
  - docs/architecture/.projection-manifest.json
  - plans/plan-20260926-0007-archctx-projection-profile.md
  - tasks/contracts/20260926-0007-archctx-projection-profile.contract.md
  - tasks/notes/20260926-0007-archctx-projection-profile.notes.md
  - tasks/reviews/20260926-0007-archctx-projection-profile.review.md
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
      "id": "campaign-closeout", "kind": "command", "cwd": ".",
      "phase": "verification", "cost": "normal", "evidence_policy": "current_exact",
      "necessity": "Owner-approved CI fixture race repair and existing closeout behavior",
      "inputs": { "env": ["PATH", "TMPDIR"] },
      "command": "bun test tests/effects/campaign-closeout.test.ts"
    },
    {
      "id": "projection-provider",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Boundary regression and snapshot/result authority",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bun test tests/architecture-projection-provider.test.ts tests/architecture-projection-orchestration.test.ts"
    },
    {
      "id": "typecheck",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Changed TypeScript boundary",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bun run check:type"
    },
    {
      "id": "hooks",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bun run check:hooks"
    },
    {
      "id": "helpers",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bun run check:helpers"
    },
    {
      "id": "reference-configs",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bun run check:reference-configs"
    },
    {
      "id": "deploy-sql",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bash scripts/check-deploy-sql-order.sh"
    },
    {
      "id": "architecture-sync",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bash scripts/check-architecture-sync.sh"
    },
    {
      "id": "task-sync",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bash scripts/check-task-sync.sh"
    },
    {
      "id": "task-workflow",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bash scripts/check-task-workflow.sh --strict"
    },
    {
      "id": "project-state",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bun scripts/inspect-project-state.ts --repo . --format text"
    },
    {
      "id": "init-dry-run",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity",
      "inputs": {
        "env": [
          "PATH",
          "TMPDIR"
        ]
      },
      "command": "bun src/cli/index.ts init --repo . --dry-run"
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
