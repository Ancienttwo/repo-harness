# Task Contract: e1-campaign-membership

> **Status**: Active
> **Plan**: plans/plan-20261002-0033-e1-campaign-membership.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-10-02 00:33
> **Review File**: `tasks/reviews/20261002-0033-e1-campaign-membership.review.md`
> **Notes File**: `tasks/notes/20261002-0033-e1-campaign-membership.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Campaign selector filtering does not prove that a caller-chosen offer belongs to the current intent/group or that callback context remains current. S3 keeps owner authority, unknown-effect fences and exact compensation while preventing R1 success from impersonating new R2 semantics.

## Goal

Implement owner-computed R2 membership/context guards before acquisition and before callback completion/replay, preserve plain acquisition and durable budget/receipt ordering, and type ledger cutover-required refusal with existing MCP mapping. Deliver a verified Draft PR only.

## Scope

- In scope: approved GAP3/GAP4/S3 row; campaign R2 and same-key R1 conflict, trusted owner guard, exact own-claim compensation, callback/pending/outer replay/budget ordering, typed ledger cutover-required error and existing regression tests; document actual lock coverage/limits.
- Out of scope: S4 production selected transports; lower admission, 13-field assertion, offer revision; new compatibility/schema migration, benchmarks/test files/test docs, dependencies, scheduler, GC, primary checkout edits, merge/Ready/finish and fabricated Receipt.
- Taste constraints: existing stores, context keys and callback/coordination ports; no compatibility alias or new authority registry.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Any off-manifest Task invoking A, R1 completed key executing or replaying as R2, context drift releasing a foreign Lease, or unknown/pending replay invoking effects again falsifies the design. Existing exact receipt/campaign fixtures are the cheapest proof points.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20261002-0033-e1-campaign-membership.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20261002-0033-e1-campaign-membership.review.md`
- Notes file: `tasks/notes/20261002-0033-e1-campaign-membership.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"s3-campaign-transaction-fixtures","kind":"deterministic_test","paths":["src/effects/automation/campaign-acquisition.ts","src/effects/engineers/scheduling-acquire-next.ts","tests/effects/campaign-acquisition.test.ts","tests/unit/issue-280-acquire-next.test.ts","tests/cli/mcp-engineer-tools.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/automation/campaign-acquisition.ts
  - src/effects/engineers/scheduling-acquire-next.ts
  - tests/effects/campaign-acquisition.test.ts
  - tests/unit/issue-280-acquire-next.test.ts
  - tests/cli/mcp-engineer-tools.test.ts
  - docs/reference-configs/engineer-acquisition-cutover.md
  - plans/plan-20261002-0033-e1-campaign-membership.md
  - tasks/contracts/20261002-0033-e1-campaign-membership.contract.md
  - tasks/reviews/20261002-0033-e1-campaign-membership.review.md
  - tasks/notes/20261002-0033-e1-campaign-membership.notes.md
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
    - src/effects/automation/campaign-acquisition.ts
    - src/effects/engineers/scheduling-acquire-next.ts
    - tests/effects/campaign-acquisition.test.ts
    - tests/unit/issue-280-acquire-next.test.ts
    - tests/cli/mcp-engineer-tools.test.ts
    - docs/reference-configs/engineer-acquisition-cutover.md
    - plans/plan-20261002-0033-e1-campaign-membership.md
    - tasks/contracts/20261002-0033-e1-campaign-membership.contract.md
    - tasks/reviews/20261002-0033-e1-campaign-membership.review.md
    - tasks/notes/20261002-0033-e1-campaign-membership.notes.md
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
      "necessity": "Existing S3 owner membership/context, R1/R2 replay, precise compensation and unknown/pending/budget guards; plain/current admission and controller regression baseline",
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
      "necessity": "Existing real historical campaign fixtures prove S3 membership/context, R1/R2 conflicts, exact compensation and unknown/replay ordering; about 5 minutes, no full suite or parallel benchmark",
      "cwd": ".",
      "phase": "verification",
      "cost": "expensive",
      "evidence_policy": "current_exact",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "me1a-engineer-scheduling-acquire.test",
      "kind": "package_test",
      "path": "tests/unit/me1a-engineer-scheduling-acquire.test.ts",
      "necessity": "Existing S3 owner membership/context, R1/R2 replay, precise compensation and unknown/pending/budget guards; plain/current admission and controller regression baseline",
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
      "necessity": "Existing S3 owner membership/context, R1/R2 replay, precise compensation and unknown/pending/budget guards; plain/current admission and controller regression baseline",
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
      "necessity": "Existing S3 owner membership/context, R1/R2 replay, precise compensation and unknown/pending/budget guards; plain/current admission and controller regression baseline",
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

Author the actual checks using [Testing Policy and Artifact Standards](../../../../docs/reference-configs/sprint-contracts.md#testing-policy-and-artifact-standards).
The empty array is not permission to omit required repository checks: retain it
only when no executable criterion applies and explain why in Acceptance Notes.
Prefer existing covering tests; creating a task-named test or adding typecheck
is not a template requirement. For each selected check declare `id`, `kind`,
`cwd`, `phase`, `cost`, `evidence_policy`, `necessity`, `inputs.env`, and its
`command` or `path`. Declare the same execution once, including checks nested
inside aggregate scripts. Use `baseline_with_delta` only with an immutable
baseline and named current delta checks; never infer it from paths or command text.

## Acceptance Notes (Human Review)

- Changed behavior/boundary, existing covering tests and remaining gap: campaign R2 owner guard and precise callback compensation; existing campaign/issue-280/MCP fixtures cover the change. Full publication/Git writer serialization is not asserted.
- New test case/file rationale, or why existing coverage is sufficient: extend existing fixtures only; no new test file or benchmark.
- Selected check IDs and why their coverage is sufficient; omitted coverage: five existing test files plus typecheck and nine required integrity/state/adoption gates; full suite is unnecessary outside this bounded slice.
- Full/expensive check justification and expected cost, if applicable: existing historical campaign fixtures use package timeout 60000 per test; canonical executor uses a 600000 aggregate helper timeout, without bypass.
- Execution/baseline references, subject, current delta and disposition: baseline dba184d9; .ai/harness/checks/e1-s3-verification.latest.json binds actual final tree and per-command runs.
- Residual risks and incomplete observations: authority sampled before/after, separate publication/Git writers; multiple stores have no global atomic commit; no live canary or typed semantic acceptance is claimed.

## Rollback Point

- Commit / checkpoint: origin/main dba184d9
- Revert strategy: revert this reviewed branch diff; preserve pending/completed/fence and claim/outer-budget evidence, never erase unknown transactions or restore transparent R1 replay.
