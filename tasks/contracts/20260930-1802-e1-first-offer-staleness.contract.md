# Task Contract: e1-first-offer-staleness

> **Status**: Active
> **Plan**: plans/plan-20260930-1802-e1-first-offer-staleness.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-09-30 18:02
> **Review File**: `tasks/reviews/20260930-1802-e1-first-offer-staleness.review.md`
> **Notes File**: `tasks/notes/20260930-1802-e1-first-offer-staleness.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

A first-offer clock change can invalidate the full offer assertion without changing Task authority. Capture the S0 counterexample before implementing any host observation transport.

## Goal

Add one passing expected-stale characterization to tests/unit/me1a-engineer-scheduling-acquire.test.ts using real observeRetryEligibility(current=null), buildEngineerOfferCandidate and acquireScheduledEngineerTask. Prove unchanged Task authority, different offer revision at T2, and zero mutation.

## Scope

- In scope: the existing ME-1A test fixture and this plan/contract/review/notes surface.
- Out of scope: production code, dependency/schema/TTL implementation, other docs, primary checkout, user dirty files, global configuration and merging.
- Task profile is code-change because this changes tests only and intentionally characterizes unfixed behavior; it is not a production bugfix claiming remediation.

## Stop Conditions

- Stop and return BLOCKED on a workflow command refusal.
- Stop if the fixture requires a production code edit or cannot exercise real observation/build/admission.
- Do not widen allowed paths, mutate the primary checkout, or merge.

## Falsifier

If changing only observed_at with current=null does not change the offer digest or does not trigger engineer_offer_stale before mutation, this characterization direction is false. The cheapest proof is the existing ME-1A fixture with fixed T1/T2.

## Root Cause Evidence

Not a bugfix contract: this slice documents existing behavior with expected-stale assertions, does not modify production source, and does not claim a fix. The concrete cause is observeRetryEligibility deriving eligible_since from observed_at for current=null, then the offer builder hashing it.

## Workflow Inventory

- Source plan: `plans/plan-20260930-1802-e1-first-offer-staleness.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260930-1802-e1-first-offer-staleness.review.md`
- Notes file: `tasks/notes/20260930-1802-e1-first-offer-staleness.notes.md`
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
  - tests/unit/me1a-engineer-scheduling-acquire.test.ts
  - plans/plan-20260930-1802-e1-first-offer-staleness.md
  - tasks/contracts/20260930-1802-e1-first-offer-staleness.contract.md
  - tasks/reviews/20260930-1802-e1-first-offer-staleness.review.md
  - tasks/notes/20260930-1802-e1-first-offer-staleness.notes.md
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
    - tests/unit/me1a-engineer-scheduling-acquire.test.ts
    - tasks/notes/20260930-1802-e1-first-offer-staleness.notes.md
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "me1a-characterization",
      "kind": "package_test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owns the production observation/builder/admission composition and existing lock branch cases.",
      "inputs": {
        "env": []
      },
      "path": "tests/unit/me1a-engineer-scheduling-acquire.test.ts"
    },
    {
      "id": "hooks",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required hook projection integrity.",
      "inputs": {
        "env": []
      },
      "command": "bun run check:hooks"
    },
    {
      "id": "task-sync",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required workflow source synchronization.",
      "inputs": {
        "env": []
      },
      "command": "bash scripts/check-task-sync.sh"
    },
    {
      "id": "workflow",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required strict workflow integrity.",
      "inputs": {
        "env": []
      },
      "command": "bash scripts/check-task-workflow.sh --strict"
    },
    {
      "id": "helpers",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md repository integrity requirement for substantive test/workflow changes.",
      "inputs": {
        "env": []
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
      "necessity": "Root AGENTS.md repository integrity requirement for substantive test/workflow changes.",
      "inputs": {
        "env": []
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
      "necessity": "Root AGENTS.md repository integrity requirement for substantive test/workflow changes.",
      "inputs": {
        "env": []
      },
      "command": "bash scripts/check-deploy-sql-order.sh"
    },
    {
      "id": "architecture",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md repository integrity requirement for substantive test/workflow changes.",
      "inputs": {
        "env": []
      },
      "command": "bash scripts/check-architecture-sync.sh"
    },
    {
      "id": "inspect",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md repository integrity requirement for substantive test/workflow changes.",
      "inputs": {
        "env": []
      },
      "command": "bun scripts/inspect-project-state.ts --repo . --format text"
    },
    {
      "id": "adoption-dry-run",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Root AGENTS.md repository integrity requirement for substantive test/workflow changes.",
      "inputs": {
        "env": []
      },
      "command": "bun src/cli/index.ts init --repo . --dry-run"
    }
  ]
}
```

## Acceptance Notes (Human Review)

- Boundary: fixed Task/Binding/dependency facts, first retry observation current=null at T1/T2, then the real scheduled admission function.
- Existing tests pin retry facts and cover deliberately stale fields; the new case covers time alone changing the assertion. Extend the owning file, no new test file/cache/process required.
- Expected-stale characterization keeps CI green and is explicitly not a regression test for a delivered fix.
- Checks are the touched file plus owner-requested hooks/task sync/strict workflow and root repository integrity; no full suite needed for this test-only change. 6A baseline is not relabeled as current-subject evidence.
- Existing eight-process lock test remains independent; expected focused cost under one minute.
- Observation receipt schema and 30-second admission-start semantics are comments/notes only. Runtime transport, expiry, locks and migration remain unimplemented/unverified.
- Draft PR handoff only; semantic acceptance and merge are separate. No merge authority is claimed.

## Rollback Point

- Base commit: e97684f6.
- Revert the isolated test/workflow artifact change; no production behavior or persistent Task effect exists.
