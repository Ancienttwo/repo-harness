# Task Contract: accepted fixture integration

> **Status**: Active
> **Plan**: plans/plan-20260922-1452-akn03a-fixture-integration.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Capability ID**: root
> **Review File**: `tasks/reviews/20260922-1452-akn03a-fixture-integration.review.md`
> **Notes File**: `tasks/notes/20260922-1452-akn03a-fixture-integration.notes.md`

## Why

The stage CI fails on a baseline fixture already corrected and accepted in PR #436.

## Goal

Integrate exact accepted fixture commit 8c7fd593, preserve current stage production semantics, verify and update this stage PR with exact-head CI evidence.

## Scope

Merge only the accepted fixture branch and generated proof/evidence into the existing isolated stage branch. No main merge, native admission, Campaign or runtime installation.

## Falsifier

Any production diff relative to 749e9e92cc0f3da384dfca4e24ebb20f39b98277, fixture bytes differing from #436, or a failed stage check disproves safe integration.

## Allowed Paths

```yaml
allowed_paths:
  - tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
  - docs/researches/20260922-candidate-runtime-fixture-authority.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
  - tasks/archive/
  - plans/plan-20260922-1452-akn03a-fixture-integration.md
  - tasks/contracts/20260922-1452-akn03a-fixture-integration.contract.md
  - tasks/reviews/20260922-1452-akn03a-fixture-integration.review.md
  - tasks/notes/20260922-1452-akn03a-fixture-integration.notes.md
  - tasks/todos.md
```

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"fixture-integration","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Evidence Requirements

```yaml
evidence_requirements:
  benchmark: not_applicable
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "inventory",
      "kind": "package_test",
      "path": "tests/unit/collaboration-authority-baseline.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Closed inventory integration and unchanged reply behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "reply",
      "kind": "package_test",
      "path": "tests/unit/task-reply.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Closed inventory integration and unchanged reply behavior",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "message",
      "kind": "package_test",
      "path": "tests/unit/task-message-v1.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Closed inventory integration and unchanged reply behavior",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=749e9e92cc0f3da384dfca4e24ebb20f39b98277 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
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
      "necessity": "Required repository integrity on final PR subject",
      "inputs": {
        "env": []
      }
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Accepted fixture integration must preserve the stage production source and exact fixture bytes",
      "inputs": {
        "env": []
      },
      "id": "candidate-fixture",
      "kind": "package_test",
      "path": "tests/unit/candidate-bound-global-runtime-reconciliation.test.ts"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Accepted fixture integration must preserve the stage production source and exact fixture bytes",
      "inputs": {
        "env": []
      },
      "id": "production-unchanged",
      "kind": "command",
      "command": "git diff --exit-code 749e9e92cc0f3da384dfca4e24ebb20f39b98277 -- src assets scripts"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Accepted fixture integration must preserve the stage production source and exact fixture bytes",
      "inputs": {
        "env": []
      },
      "id": "accepted-fixture-bytes",
      "kind": "command",
      "command": "git diff --exit-code 8c7fd593ac6d41a103de610a23c309e88fe08110 -- tests/unit/candidate-bound-global-runtime-reconciliation.test.ts"
    }
  ]
}
```

## Acceptance Notes

The owner review accepts #436 and conditionally accepts the existing stage scope; canonical checks and CI must be bound to the integrated head. No new tests or local full suite.

## Rollback Point

749e9e92cc0f3da384dfca4e24ebb20f39b98277; revert only the integration merge and associated package artifacts.
