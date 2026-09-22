# Task Contract: akn04a-stack-refresh

> **Status**: Active
> **Plan**: plans/plan-20260922-1425-akn04a-stack-refresh.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 14:25
> **Review File**: `tasks/reviews/20260922-1425-akn04a-stack-refresh.review.md`
> **Notes File**: `tasks/notes/20260922-1425-akn04a-stack-refresh.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

PR #438 conflicts with its accepted upstream in the generated architecture manifest. The previous archived contract cannot authorize a new integration candidate.

## Goal

Integrate the accepted protected-reply branch and its post-review fixture correction, regenerate current projection proof and publish a verified update to PR #438.

## Scope

- In scope: accepted upstream source/tests and their workflow archive, current architecture manifest, and this integration package.
- Out of scope: new Fleet behavior, main merge, Host admission or runtime installation.
- Taste constraints: preserve upstream bytes and canonical projection ownership; no manual proof-digest combination.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The merged candidate changes existing Fleet placement behavior, fails Task reply regressions or retains a conflict with its published upstream.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260922-1425-akn04a-stack-refresh.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260922-1425-akn04a-stack-refresh.review.md`
- Notes file: `tasks/notes/20260922-1425-akn04a-stack-refresh.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "fleet-board-unit", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/architecture/.projection-manifest.json
  - docs/researches/20260922-task-reply-protocol.md
  - src/effects/fleet/task-inbox.ts
  - tests/effects/task-reply.test.ts
  - tests/cli/mcp-http.test.ts
  - plans/archive/plan-20260922-0204-akn03-protected-replies.md
  - plans/plan-20260922-0204-akn03-protected-replies.md
  - tasks/contracts/20260922-0204-akn03-protected-replies.contract.md
  - tasks/notes/20260922-0204-akn03-protected-replies.notes.md
  - tasks/reviews/20260922-0204-akn03-protected-replies.review.md
  - tasks/archive/
  - plans/plan-20260922-1417-akn03b-windows-fixture.md
  - plans/archive/plan-20260922-1417-akn03b-windows-fixture.md
  - tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md
  - tasks/reviews/20260922-1417-akn03b-windows-fixture.review.md
  - tasks/notes/20260922-1417-akn03b-windows-fixture.notes.md
  - plans/plan-20260922-1425-akn04a-stack-refresh.md
  - tasks/contracts/20260922-1425-akn04a-stack-refresh.contract.md
  - tasks/reviews/20260922-1425-akn04a-stack-refresh.review.md
  - tasks/notes/20260922-1425-akn04a-stack-refresh.notes.md
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

```yaml
exit_criteria:
  files_exist:
    - docs/researches/20260922-fleet-placement-contract.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "authority-inventory",
      "kind": "package_test",
      "path": "tests/unit/collaboration-authority-baseline.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Fleet protocol cutover must update its existing closed authority inventory and recorded digest",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "fleet-board-unit",
      "kind": "package_test",
      "path": "tests/unit/fleet-board.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "fleet-board-effects",
      "kind": "package_test",
      "path": "tests/effects/fleet-board.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "operator-fleet-snapshot-unit",
      "kind": "package_test",
      "path": "tests/unit/operator-fleet-snapshot.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "operator-web-types-unit",
      "kind": "package_test",
      "path": "tests/unit/operator-web-types.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "fleet-board-cli",
      "kind": "package_test",
      "path": "tests/cli/fleet-board.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "operator-serve-cli",
      "kind": "package_test",
      "path": "tests/cli/operator-serve.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "operator-write-boundary-effects",
      "kind": "package_test",
      "path": "tests/effects/operator-write-boundary.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "operator-interactions-operator-web",
      "kind": "package_test",
      "path": "tests/operator-web/operator-interactions.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "operator-ui-operator-web",
      "kind": "package_test",
      "path": "tests/operator-web/operator-ui.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "operator-collaboration-operator-web",
      "kind": "package_test",
      "path": "tests/operator-web/operator-collaboration.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "operator-task-diff-operator-web",
      "kind": "package_test",
      "path": "tests/operator-web/operator-task-diff.test.tsx",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Shared Fleet/Operator projection, decoder, failure containment and browser protocol cutover",
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
      "necessity": "Required repository integrity on the stacked stage candidate",
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
      "necessity": "Required repository integrity on the stacked stage candidate",
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
      "necessity": "Required repository integrity on the stacked stage candidate",
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
      "necessity": "Required repository integrity on the stacked stage candidate",
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
      "necessity": "Required repository integrity on the stacked stage candidate",
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
      "necessity": "Required repository integrity on the stacked stage candidate",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=4e5556d61ed2ed9a58e3ed9b5d25c6d670ee94d4 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity on the stacked stage candidate",
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
      "necessity": "Required repository integrity on the stacked stage candidate",
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
      "necessity": "Required repository integrity on the stacked stage candidate",
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
      "necessity": "Required repository integrity on the stacked stage candidate",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "browser-build",
      "kind": "command",
      "command": "bun run build:operator-web",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Fleet/Operator protocol cutover must produce a valid browser bundle",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "reply-pagination",
      "kind": "package_test",
      "path": "tests/effects/task-reply.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Accepted upstream correction in integrated stack",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "http-fixture",
      "kind": "package_test",
      "path": "tests/cli/mcp-http.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Accepted upstream correction in integrated stack",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

## Acceptance Notes (Human Review)

Use current canonical evidence for the merged stack. Existing Fleet/Operator checks and upstream reply/HTTP suites cover the changed integration surface. Preserve independent review and waiver history; no old receipt is claimed for this new contract. Hosted mergeability and CI remain separate readbacks.

## Rollback Point

Base 4e5556d61ed2ed9a58e3ed9b5d25c6d670ee94d4. Revert this integration as one unit.
