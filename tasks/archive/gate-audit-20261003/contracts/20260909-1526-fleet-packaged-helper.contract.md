# Task Contract: Fleet packaged helper dispatch

> **Status**: Active
> **Plan**: plans/plan-20260909-1526-fleet-packaged-helper.md
> **Task Profile**: bugfix
> **Owner**: ancienttwo
> **Capability ID**: root
> **Review File**: tasks/reviews/20260909-1526-fleet-packaged-helper.review.md
> **Notes File**: tasks/notes/20260909-1526-fleet-packaged-helper.notes.md

## Why

Current installed targets do not vendor scripts/contract-worktree.sh or scripts/plan-to-todo.sh; fleet default dispatch still requires them.

## Goal

Acquire and project real fleet worktrees using the existing trusted packaged helper runtime.

## Scope

The two default helper calls, relocation of the existing helper runner/platform into effects/runtime, direct caller and architecture path updates, real CLI regression and required evidence. Keep claims, budgets, admission, Docker and Oracle unchanged. No compatibility fallback or new configuration.

## Falsifier

A valid package-only target fails provisioning because a target-local helper is missing, or a repeated acquisition yields a second envelope.

## Root Cause Evidence

- root_cause: src/effects/fleet/acquire.ts defaultStart/defaultProject construct target-local script paths although installed targets use package-owned helpers.
- repro: bun test tests/cli/fleet-offer-acquire.test.ts --test-name-pattern package-helper-only
- regression_guard: tests/cli/fleet-offer-acquire.test.ts
- pre_fix_failure_artifact: tasks/evidence/fleet-packaged-helper-pre-fix.log

## Allowed Paths

```yaml
allowed_paths:
  - .archcontext/model/nodes/capability.workflow-engine.contract-assets.yaml
  - assets/templates/helpers/acceptance-receipt.ts
  - scripts/acceptance-receipt.ts
  - src/cli/commands/campaign.ts
  - src/cli/commands/global-runtime.ts
  - src/cli/commands/run.ts
  - src/cli/index.ts
  - src/cli/mcp/tools.ts
  - src/cli/runtime/helper-runner.ts
  - src/cli/runtime/protected-helper-platform.ts
  - src/effects/runtime/node-candidates.ts
  - tests/characterization/repair-campaign-authority-freeze.test.ts
  - tests/cli/run.test.ts
  - tests/cli/windows-protected-helper-runtime-smoke.test.ts
  - tests/unit/closeout-runner-guardrails.test.ts
  - tests/unit/windows-protected-helper-platform-contract.test.ts
  - src/effects/runtime/helper-runner.ts
  - src/effects/runtime/protected-helper-platform.ts
  - src/effects/fleet/acquire.ts
  - tests/cli/fleet-offer-acquire.test.ts
  - docs/researches/20260909-fleet-packaged-helper.md
  - tasks/evidence/fleet-packaged-helper-pre-fix.log
  - docs/architecture/
  - plans/plan-20260909-1526-fleet-packaged-helper.md
  - tasks/contracts/20260909-1526-fleet-packaged-helper.contract.md
  - tasks/notes/20260909-1526-fleet-packaged-helper.notes.md
  - tasks/reviews/20260909-1526-fleet-packaged-helper.review.md
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "package-only-acquire", "kind": "deterministic_test", "paths": [".archcontext/model/nodes/capability.workflow-engine.contract-assets.yaml", "assets/templates/helpers/acceptance-receipt.ts", "docs/architecture/.projection-manifest.json", "docs/architecture/changelog.md", "docs/architecture/decisions/index.md", "docs/architecture/diagrams/architecture.likec4", "docs/architecture/diagrams/architecture.mmd", "docs/architecture/diagrams/architecture.structurizr.json", "docs/architecture/index.md", "docs/architecture/modules/workflow-engine/contract-assets.md", "docs/researches/20260909-fleet-packaged-helper.md", "scripts/acceptance-receipt.ts", "src/cli/commands/campaign.ts", "src/cli/commands/global-runtime.ts", "src/cli/commands/run.ts", "src/cli/index.ts", "src/cli/mcp/tools.ts", "src/cli/runtime/helper-runner.ts", "src/cli/runtime/protected-helper-platform.ts", "src/effects/fleet/acquire.ts", "src/effects/runtime/helper-runner.ts", "src/effects/runtime/node-candidates.ts", "src/effects/runtime/protected-helper-platform.ts", "tasks/evidence/fleet-packaged-helper-pre-fix.log", "tests/characterization/repair-campaign-authority-freeze.test.ts", "tests/cli/fleet-offer-acquire.test.ts", "tests/cli/run.test.ts", "tests/cli/windows-protected-helper-runtime-smoke.test.ts", "tests/unit/closeout-runner-guardrails.test.ts", "tests/unit/windows-protected-helper-platform-contract.test.ts"]}]}
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
    - docs/researches/20260909-fleet-packaged-helper.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "package-only-acquire",
      "kind": "package_test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Real default acquisition with no target-local helper, exact bound token and duplicate-acquire refusal.",
      "inputs": {
        "env": []
      },
      "path": "tests/cli/fleet-offer-acquire.test.ts"
    },
    {
      "id": "acquire-regression",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Preserve claim compensation, concurrency, optimistic assertions and state boundaries.",
      "inputs": {
        "env": []
      },
      "command": "bun test --timeout 60000 tests/unit/fleet-acquire-effect.test.ts tests/unit/fleet-offer-acquire.test.ts tests/fleet-acquire-concurrency.test.ts tests/fleet-acquire-state-boundary.test.ts"
    },
    {
      "id": "trusted-helper-regression",
      "kind": "command",
      "command": "bun test --timeout 60000 tests/cli/run.test.ts tests/unit/closeout-runner-guardrails.test.ts tests/unit/windows-protected-helper-platform-contract.test.ts tests/cli/windows-protected-helper-runtime-smoke.test.ts tests/characterization/repair-campaign-authority-freeze.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Relocated runtime must preserve packaged resolution, protected environment and platform contracts.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required type or repository-integrity check for the bounded fix.",
      "inputs": {
        "env": []
      },
      "command": "bun run check:type"
    },
    {
      "id": "deploy-order",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required type or repository-integrity check for the bounded fix.",
      "inputs": {
        "env": []
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
      "necessity": "Required type or repository-integrity check for the bounded fix.",
      "inputs": {
        "env": []
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
      "necessity": "Required type or repository-integrity check for the bounded fix.",
      "inputs": {
        "env": []
      },
      "command": "REPO_HARNESS_DIFF_BASE=22303134 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh"
    },
    {
      "id": "workflow",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required type or repository-integrity check for the bounded fix.",
      "inputs": {
        "env": []
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
      "necessity": "Required type or repository-integrity check for the bounded fix.",
      "inputs": {
        "env": []
      },
      "command": "bun scripts/inspect-project-state.ts --repo . --format text"
    },
    {
      "id": "adopt-dry-run",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required type or repository-integrity check for the bounded fix.",
      "inputs": {
        "env": []
      },
      "command": "bun src/cli/index.ts init --repo . --dry-run"
    }
  ]
}
```

## Acceptance Notes

The real canary and pre-fix CLI regression failed before provision; the post-fix development regression passed. Final frozen checks remain pending. Required CI follows the final candidate. No full local suite is needed: named acquisition checks cover the changed default dispatch and its persistent boundaries.
