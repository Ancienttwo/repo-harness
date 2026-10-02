# Task Contract: e1-selected-entrypoints

> **Status**: Active
> **Plan**: plans/plan-20261002-1401-e1-selected-entrypoints.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-10-02 14:01
> **Review File**: `tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md`
> **Notes File**: `tasks/notes/20261002-1401-e1-selected-entrypoints.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Four selected entrypoints must share the observation-bound transaction owner. Raw MCP acquisition and missing routes bypass durable choice/replay invariants; ambiguous inputs must never become auto PICK.

## Goal

Wire CLI/MCP/controller/campaign selected inputs through acquireSelectedEngineerTask to unchanged admission, migrate closed schemas/consumers and inventories, prove no auto fallback/policy mixing and preserve original auto behavior; full local tests/typecheck and coordinator review before local commit, authorized branch push and Draft PR; no Ready/merge.

## Scope

- In scope: approved GAP1/S4 four entrypoints, shared closed choice validation, required MCP key/ref schema and consumers, controller/campaign owner-preserving selected routing, fixtures/inventories and local full verification.
- Out of scope: lower A/13 assertion fields/offer revision, scheduler/FleetRuntimeAdapter/host picker/retention/GC, new benchmark/test files/test docs, dependencies/version/assets/manifest, primary checkout, Ready/merge/S5/fabricated Receipt or verdict.
- Taste constraints: existing C/owner ports/stores, no schema fallback or second authority.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Missing/malformed selected input invoking auto, a selected Task/ref changing before C, direct MCP bypassing C, or campaign crossing plain policy/budget boundaries falsifies this design. Existing transport/controller/campaign fixtures are cheapest proof points.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20261002-1401-e1-selected-entrypoints.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md`
- Notes file: `tasks/notes/20261002-1401-e1-selected-entrypoints.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"s4-complete-local-suite","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/engineers/scheduling-acquire-next.ts
  - src/cli/commands/engineer.ts
  - src/cli/mcp/engineer-tools.ts
  - src/cli/mcp/instructions.ts
  - src/effects/automation/controller-run.ts
  - src/cli/commands/automation.ts
  - src/effects/automation/campaign-acquisition.ts
  - src/cli/commands/campaign.ts
  - tests/cli/engineer.test.ts
  - tests/cli/mcp-engineer-tools.test.ts
  - tests/cli/mcp-http.test.ts
  - tests/unit/issue-279-automation-controller-run.test.ts
  - tests/effects/campaign-acquisition.test.ts
  - docs/reference-configs/engineer-acquisition-cutover.md
  - plans/plan-20261002-1401-e1-selected-entrypoints.md
  - tasks/contracts/20261002-1401-e1-selected-entrypoints.contract.md
  - tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md
  - tasks/notes/20261002-1401-e1-selected-entrypoints.notes.md
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
    - src/effects/engineers/scheduling-acquire-next.ts
    - src/cli/commands/engineer.ts
    - src/cli/mcp/engineer-tools.ts
    - src/cli/mcp/instructions.ts
    - src/effects/automation/controller-run.ts
    - src/cli/commands/automation.ts
    - src/effects/automation/campaign-acquisition.ts
    - src/cli/commands/campaign.ts
    - tests/cli/engineer.test.ts
    - tests/cli/mcp-engineer-tools.test.ts
    - tests/cli/mcp-http.test.ts
    - tests/unit/issue-279-automation-controller-run.test.ts
    - tests/effects/campaign-acquisition.test.ts
    - docs/reference-configs/engineer-acquisition-cutover.md
    - plans/plan-20261002-1401-e1-selected-entrypoints.md
    - tasks/contracts/20261002-1401-e1-selected-entrypoints.contract.md
    - tasks/reviews/20261002-1401-e1-selected-entrypoints.review.md
    - tasks/notes/20261002-1401-e1-selected-entrypoints.notes.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "full-local-suite",
      "kind": "command",
      "command": "BUN_TEST_ISOLATE_FILES=1 BUN_TEST_JOBS=4 BUN_TEST_MAX_CONCURRENCY=1 BUN_TEST_TIMEOUT_MS=180000 bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests'",
      "necessity": "Owner explicitly requires local complete tests for four-entrypoint behavior/schema cutover; existing CI file runner covers whole test inventory, no new benchmark/test document",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
      }
    },
    {
      "id": "type",
      "kind": "command",
      "command": "bun run check:type",
      "necessity": "Owner-required typecheck / required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
      }
    },
    {
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks",
      "necessity": "Owner-required typecheck / required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
      }
    },
    {
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers",
      "necessity": "Owner-required typecheck / required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
      }
    },
    {
      "id": "reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "necessity": "Owner-required typecheck / required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
      }
    },
    {
      "id": "deploy-sql",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "necessity": "Owner-required typecheck / required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
      }
    },
    {
      "id": "architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "necessity": "Owner-required typecheck / required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "necessity": "Owner-required typecheck / required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
      }
    },
    {
      "id": "task-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "necessity": "Owner-required typecheck / required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
      }
    },
    {
      "id": "state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "necessity": "Owner-required typecheck / required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
      }
    },
    {
      "id": "adoption-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run",
      "necessity": "Owner-required typecheck / required repository-integrity gate",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": ["PATH"]
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

- Changed behavior/boundary, existing covering tests and remaining gap: four selected transports/shared C; original auto and lower admission remain; no S5/live canary.
- New test case/file rationale, or why existing coverage is sufficient:
- Selected check IDs and why their coverage is sufficient; omitted coverage:
- Full/expensive check justification and expected cost, if applicable: local full suite explicitly authorized by owner; existing isolated4-job CI runner, 180s per-test timeout; may take 20+ minutes. Other gates are declared once; no duplicate typecheck aggregate.
- Execution/baseline references, subject, current delta and disposition:
- Residual risks and incomplete observations:

## Rollback Point

- Commit / checkpoint: origin/main9aef6693
- Revert strategy: revert reviewed feature diff, keep stored observation/key/controller/campaign evidence; no expiry deletion or transparent replay.

## Latest coordinator/owner boundary

Continue this existing worktree and one active plan; preserve existing artifacts and do not scaffold additional contract/notes/todos. This earlier local-only remote boundary is superseded by the 14:33 correction below. Skip GitHub CI; no Ready/merge/delete/S5 or fabricated Receipt/verdict/independent review pass. Aimpact reviews actual local diff/evidence before any remote action. The unrelated untracked coordinator handoff is preserved and excluded from this worker commit. This supersedes prior remote delivery wording.

## Aimpact remote authorization correction (14:33)

After actual local full suite, typecheck, applicable integrity checks and coordinator independent review, push feat/e1-selected-entrypoints and create a Draft PR for Aimpact are authorized. These are the only remote writes. Do not Ready, merge, delete branches/worktrees, modify main or run GitHub CI. Preserve all existing artifacts; no new scaffolding. This supersedes earlier local-only remote-delivery wording.

## Aimpact Draft closeout authorization (18:18)

Aimpact explicitly authorizes both scoped CodeGraph index rebuild/reconciliation and local S4 commit, push of feat/e1-selected-entrypoints, and a Draft PR against main. Draft delivery may proceed with the recorded full-suite brc10 failure reproduced on unchanged 9aef6693 and an unresolved architecture gate, provided both are disclosed accurately. This is a delivery authorization, not a passing Verification Plan result or AcceptanceReceipt. The Verification Plan and gate policies remain unchanged. Reconciliation may record a receipt only for a completely empty noop; any actual delta stops architecture changes without accept/apply/retry. Exclude the coordinator handoff and the separate 1756 investigation note from staging/commit. No Ready, merge, deletion or main mutation is authorized.
