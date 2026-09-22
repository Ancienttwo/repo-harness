# Task Contract: accepted fixture integration

> **Status**: Active
> **Plan**: plans/plan-20260922-1452-akn00-fixture-integration.md
> **Task Profile**: code-change
> **Owner**: ancienttwo
> **Review File**: `tasks/reviews/20260922-1452-akn00-fixture-integration.review.md`
> **Notes File**: `tasks/notes/20260922-1452-akn00-fixture-integration.notes.md`

## Why

The stage CI fails on a baseline fixture already corrected and accepted in PR #436.

## Goal

Integrate exact accepted fixture commit 8c7fd593, preserve current stage production semantics, verify and update this stage PR with exact-head CI evidence.

## Scope

Merge only the accepted fixture branch and generated proof/evidence into the existing isolated stage branch. No main merge, native admission, Campaign or runtime installation.

## Falsifier

Any production diff relative to e0c032d18fcf826d1fe08334f4fab5f91060a4ba, fixture bytes differing from #436, or a failed stage check disproves safe integration.

## Allowed Paths

```yaml
allowed_paths:
  - tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
  - docs/researches/20260922-candidate-runtime-fixture-authority.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
  - tasks/archive/
  - plans/plan-20260922-1452-akn00-fixture-integration.md
  - tasks/contracts/20260922-1452-akn00-fixture-integration.contract.md
  - tasks/reviews/20260922-1452-akn00-fixture-integration.review.md
  - tasks/notes/20260922-1452-akn00-fixture-integration.notes.md
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
      "id": "admission-tests",
      "kind": "command",
      "command": "bun test tests/me2b-runtime-admission-canary.test.ts tests/akn00-native-execution-admission.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "H0\u7248\u672c/subject\u9519\u914d\u3001\u7f3a\u5931\u80fd\u529b\u3001\u6d4b\u8bd5\u6ce8\u5165\u3001\u7ec8\u6b62\u672a\u77e5\u4e0eCLI\u65e0\u526f\u4f5c\u7528",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-40e483b1aeb3499bae0a.json",
        "execution_id": "vx-40e483b1aeb3499bae0a"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "native-readback",
      "kind": "command",
      "command": "bun -e 'import {readFileSync} from \"node:fs\"; import {createHash} from \"node:crypto\"; const root=\".ai/harness/runs/akn00/\"; const r=JSON.parse(readFileSync(root+\"host-report.json\",\"utf8\")); if(readFileSync(root+\"host-report.exit.txt\",\"utf8\").trim()!==\"2\" || readFileSync(root+\"host-report.stderr.txt\").length || r.evidence_kind!==\"live_host\" || r.decision.status!==\"runtime_not_admitted\" || !r.decision.reasons.includes(\"host_probe_not_registered\") || r.me2b_ref!==null || r.campaign_integration!==\"not_evaluated\") throw Error(\"invalid native refusal readback\"); const actual=\"sha256:\"+createHash(\"sha256\").update(readFileSync(r.subject.runtime.executable_realpath)).digest(\"hex\"); if(actual!==r.subject.runtime.executable_sha256) throw Error(\"runtime changed\"); if(JSON.parse(readFileSync(\".ai/harness/policy.json\",\"utf8\")).development_campaign.mode!==\"off\") throw Error(\"policy changed\"); console.log(\"Native refusal readback valid; Campaign not evaluated\");'",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "\u9a8c\u8bc1\u5df2\u5728\u9694\u79bbHOME\u91c7\u96c6\u7684\u771f\u5b9e\u7248\u672c\u62d2\u7edd\u62a5\u544a\u3001\u5165\u53e3\u6458\u8981\u4e0epolicy\u672a\u542f\u7528\uff1b\u4e0d\u91cd\u590dHost\u8c03\u7528",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "check-type",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "\u8de8\u811a\u672c\u5171\u4eabtyped discovery\u4e0e\u6d4b\u8bd5\u7c7b\u578b\u9a8c\u8bc1",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-16352de65ea949f89a6b.json",
        "execution_id": "vx-16352de65ea949f89a6b"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "check-hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-dd326c7a319d409891d6.json",
        "execution_id": "vx-dd326c7a319d409891d6"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "check-helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-3977eebfbbde48f7a8b0.json",
        "execution_id": "vx-3977eebfbbde48f7a8b0"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "check-reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-8d6c666258af4650acad.json",
        "execution_id": "vx-8d6c666258af4650acad"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "deploy-sql-order",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "baseline_with_delta",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-e2b0d80313164ac28132.json",
        "execution_id": "vx-e2b0d80313164ac28132"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
    },
    {
      "id": "architecture-sync",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=e0c032d18fcf826d1fe08334f4fab5f91060a4ba REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "required repository integrity",
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
      "necessity": "required repository integrity",
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
      "necessity": "required repository integrity",
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
      "evidence_policy": "baseline_with_delta",
      "necessity": "required repository integrity",
      "inputs": {
        "env": []
      },
      "baseline": {
        "run_file": ".ai/harness/runs/verification-vx-b6693f9ee01c47e597ac.json",
        "execution_id": "vx-b6693f9ee01c47e597ac"
      },
      "delta_checks": [
        "workflow-delta",
        "task-sync",
        "task-workflow",
        "architecture-sync"
      ]
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
      "command": "git diff --exit-code e0c032d18fcf826d1fe08334f4fab5f91060a4ba -- src assets scripts"
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

e0c032d18fcf826d1fe08334f4fab5f91060a4ba; revert only the integration merge and associated package artifacts.
