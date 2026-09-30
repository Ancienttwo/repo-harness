# Task Contract: e1-selected-receipt

> **Status**: Active
> **Plan**: plans/plan-20261001-0025-e1-selected-receipt.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-10-01 00:25
> **Review File**: `tasks/reviews/20261001-0025-e1-selected-receipt.review.md`
> **Notes File**: `tasks/notes/20261001-0025-e1-selected-receipt.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Existing v1 acquisition identities cannot safely preserve host choice, session, trusted observation and callback-policy evidence across replay. S2 must preserve unknown-effect fences and unchanged admission.

## Goal

After a safe frozen-time audit, add same-module shared C core and acquireSelectedEngineerTask, one-shot inner/outer identity cutover with no permanent v1 reader, R1 callback-policy identity, retained observation refs and typed observation errors/MCP mapping. No production selected transport wiring.

## Scope

- In scope: preflight frozen-time audit, S2 row and GAP2 identity cutover only, existing callback semantics R1, observation errors.
- Out of scope: GAP3/4 strengthening (S3), S4 selected entrypoints, lower admission/13-field assertion/offer_revision changes, quota/GC, scheduler, primary checkout, release/merge/Ready.
- Taste constraints: reuse existing modules/ports, locks, canonical primitives and stores; no permanent compatibility reader or invented metadata.

## Stop Conditions

- Stop immediately if any frozen-time consumer is unsafe; report the counterexample before production changes.
- Stop if migration cannot preserve all old logical keys/outer results without guessing or automatic replay.
- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A current-authority case admitted at old T1 but denied at T2 solely because frozen time relaxes safety falsifies the precondition. Old pending or completed keys executing again, or expired/missing observations resetting a known key, falsify the transaction design.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20261001-0025-e1-selected-receipt.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20261001-0025-e1-selected-receipt.review.md`
- Notes file: `tasks/notes/20261001-0025-e1-selected-receipt.notes.md`
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
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/engineers/scheduling-acquire-next.ts
  - src/effects/automation/campaign-acquisition.ts
  - src/cli/mcp/engineer-tools.ts
  - tests/unit/issue-280-acquire-next.test.ts
  - tests/effects/campaign-acquisition.test.ts
  - tests/unit/me1a-engineer-scheduling-acquire.test.ts
  - tests/unit/issue-287-automation-attempt.test.ts
  - tests/cli/mcp-engineer-tools.test.ts
  - tests/unit/issue-279-automation-controller-run.test.ts
  - plans/plan-20261001-0025-e1-selected-receipt.md
  - tasks/contracts/20261001-0025-e1-selected-receipt.contract.md
  - tasks/reviews/20261001-0025-e1-selected-receipt.review.md
  - tasks/notes/20261001-0025-e1-selected-receipt.notes.md
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
    - src/effects/automation/campaign-acquisition.ts
    - src/cli/mcp/engineer-tools.ts
    - plans/plan-20261001-0025-e1-selected-receipt.md
    - tasks/contracts/20261001-0025-e1-selected-receipt.contract.md
    - tasks/reviews/20261001-0025-e1-selected-receipt.review.md
    - tasks/notes/20261001-0025-e1-selected-receipt.notes.md

  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "issue-280-acquire-next.test",
      "kind": "package_test",
      "path": "tests/unit/issue-280-acquire-next.test.ts",
      "necessity": "Existing S2 acquisition/callback/replay and observation time/error fixtures; unchanged production auto/controller behavior",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "campaign-acquisition.test",
      "kind": "package_test",
      "path": "tests/effects/campaign-acquisition.test.ts",
      "necessity": "Existing S2 acquisition/callback/replay and observation time/error fixtures; unchanged production auto/controller behavior",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "me1a-engineer-scheduling-acquire.test",
      "kind": "package_test",
      "path": "tests/unit/me1a-engineer-scheduling-acquire.test.ts",
      "necessity": "Existing S2 acquisition/callback/replay and observation time/error fixtures; unchanged production auto/controller behavior",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "issue-287-automation-attempt.test",
      "kind": "package_test",
      "path": "tests/unit/issue-287-automation-attempt.test.ts",
      "necessity": "Existing S2 acquisition/callback/replay and observation time/error fixtures; unchanged production auto/controller behavior",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "mcp-engineer-tools.test",
      "kind": "package_test",
      "path": "tests/cli/mcp-engineer-tools.test.ts",
      "necessity": "Existing S2 acquisition/callback/replay and observation time/error fixtures; unchanged production auto/controller behavior",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "issue-279-automation-controller-run.test",
      "kind": "package_test",
      "path": "tests/unit/issue-279-automation-controller-run.test.ts",
      "necessity": "Existing S2 acquisition/callback/replay and observation time/error fixtures; unchanged production auto/controller behavior",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
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
        "env": []
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
        "env": []
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
        "env": []
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
        "env": []
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
        "env": []
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
        "env": []
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
        "env": []
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
        "env": []
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
        "env": []
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

- Changed behavior/boundary, existing covering tests and remaining gap:
- New test case/file rationale, or why existing coverage is sufficient:
- Selected check IDs and why their coverage is sufficient; omitted coverage:
- Full/expensive check justification and expected cost, if applicable:
- Execution/baseline references, subject, current delta and disposition:
- Residual risks and incomplete observations:

## Rollback Point

- Commit / checkpoint: origin/main 281e6555
- Revert strategy: preserve ledger/evidence; never restore v1 execution or erase fenced old keys. Rollback needs explicit closeout/reconciliation, not automatic replay.
