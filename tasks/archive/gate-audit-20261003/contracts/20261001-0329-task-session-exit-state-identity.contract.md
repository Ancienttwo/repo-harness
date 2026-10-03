# Task Contract: task-session-exit-state-identity

> **Status**: Active
> **Plan**: plans/plan-20261001-0329-task-session-exit-state-identity.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-10-01 03:29
> **Review File**: `tasks/reviews/20261001-0329-task-session-exit-state-identity.review.md`
> **Notes File**: `tasks/notes/20261001-0329-task-session-exit-state-identity.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

An owned process can exit but remain unreaped: kill(0) still succeeds and macOS comm changes. Normal cancel therefore throws identity_lost after signalling. Caller PID-reuse/ownership fences must remain intact.

## Goal

Prove the unreaped-child failure before changing production source, repair only processProofAlive exit-state classification, and verify identical real Codex/Claude8+8 lifecycle trials before/after with zero prompts.

## Scope

- In scope: processProofAlive, existing CLI/task-agent process-ownership regression, bounded isolated real-process measurements and this workflow package.
- Out of scope: E/canary files, other production functions, settings/config/install changes, default/mini sessions, unrelated checkouts, commit/push/PR/merge before advisor gate.

## Stop Conditions

- No real model request/prompt or approval response. Only created/proven process identities and private named sessions.
- No production change before deterministic pre-fix failure and pre-measurement.
- PID/start mismatch remains hard refusal. Unknown exit state remains unsupported until actually observed.
- Stop uncommitted after verification and send advisor evidence; external PASS precedes commit/PR, no push/merge authorized.

## Falsifier

Cheapest proof: a parent-held native zombie must return false, not identity_lost. If PID/birth differs, false is forbidden and the fix must reject. In-vivo absence of zombie observations limits causality claims for GO117.

## Root Cause Evidence

- root_cause: src/effects/terminal/task-session.ts:110 strict full ps identity comparison treats observed macOS ?E+ exiting and unreaped zombie comm changes as process reuse although PID/birth are unchanged.
- repro: bun test tests/cli/task-agent.test.ts -t "unreaped owned child"
- regression_guard: tests/cli/task-agent.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/exit-state-identity/pre-fix-regression.log

## Workflow Inventory

- Source plan: `plans/plan-20261001-0329-task-session-exit-state-identity.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20261001-0329-task-session-exit-state-identity.review.md`
- Notes file: `tasks/notes/20261001-0329-task-session-exit-state-identity.notes.md`
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
{"protocol":1,"reviewer":"Claude","user_waiver":"forbidden"}
```
No model review is invoked by this contract: designated external advisor/gatekeeper supplies acceptance before commit.

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/terminal/task-session.ts
  - tests/cli/task-agent.test.ts
  - plans/plan-20261001-0329-task-session-exit-state-identity.md
  - tasks/contracts/20261001-0329-task-session-exit-state-identity.contract.md
  - tasks/reviews/20261001-0329-task-session-exit-state-identity.review.md
  - tasks/notes/20261001-0329-task-session-exit-state-identity.notes.md
  - .ai/harness/runs/exit-state-identity/**
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
    runner_invocations: 0
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: edit_and_gatekeep
      purpose: isolated_repair_and_evidence
    verifier:
      mode: read_only
      purpose: designated_advisor_gate
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/effects/terminal/task-session.ts
    - tests/cli/task-agent.test.ts
  artifacts_exist:
    - .ai/harness/runs/exit-state-identity/pre-fix-regression.log
    - .ai/harness/runs/exit-state-identity/before-summary.json
    - .ai/harness/runs/exit-state-identity/after-summary.json
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "process-proof-and-cli",
      "kind": "package_test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owning CLI/task-agent ownership boundary plus native unreaped-child and birth-change guards.",
      "inputs": {
        "env": []
      },
      "path": "tests/cli/task-agent.test.ts"
    },
    {
      "id": "herdr-lifecycle",
      "kind": "package_test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing created/attached proof, close/cancel, TERM/KILL and real fixture composition uses the changed liveness predicate.",
      "inputs": {
        "env": []
      },
      "path": "tests/herdr-task-lifecycle.test.ts"
    },
    {
      "id": "claude-review-lifecycle",
      "kind": "package_test",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing review server/provider shutdown are independent consumers of processProofAlive.",
      "inputs": {
        "env": []
      },
      "path": "tests/claude-review.test.ts"
    },
    {
      "id": "hooks",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity, no global apply.",
      "inputs": {
        "env": []
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
      "necessity": "Required repository integrity, no global apply.",
      "inputs": {
        "env": []
      },
      "command": "bun run check:helpers"
    },
    {
      "id": "reference",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity, no global apply.",
      "inputs": {
        "env": []
      },
      "command": "bun run check:reference-configs"
    },
    {
      "id": "sql",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity, no global apply.",
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
      "necessity": "Required repository integrity, no global apply.",
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
      "necessity": "Required repository integrity, no global apply.",
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
      "necessity": "Required repository integrity, no global apply.",
      "inputs": {
        "env": []
      },
      "command": "bash scripts/check-task-workflow.sh --strict"
    },
    {
      "id": "state",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity, no global apply.",
      "inputs": {
        "env": []
      },
      "command": "bun scripts/inspect-project-state.ts --repo . --format text"
    },
    {
      "id": "dry-run",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity, no global apply.",
      "inputs": {
        "env": []
      },
      "command": "bun src/cli/index.ts init --repo . --dry-run"
    },
    {
      "id": "type",
      "kind": "command",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing CI TypeScript gate verifies changed shared liveness implementation and tests.",
      "inputs": {
        "env": []
      },
      "command": "bun run check:type"
    }
  ]
}
```

## Acceptance Notes (Human Review)

Owning existing CLI task-agent process-ownership suite gains two new tests: one native held-zombie guard and one fake-ps case covering inter-query birth mismatch plus Darwin ?E+ versus S+; no new file. Related Herdr lifecycle and Claude review callers plus repository-integrity checks will be declared before final verification. No full suite justified; Windows native zombie coverage unavailable, Linux/macOS evidence will be explicit.

## Rollback Point

Baseline origin/main281e6555. One processProofAlive predicate/source+existing test/workflow package; no persistent identity format migration. Changes stay uncommitted until external PASS.

## Acceptance policy re-freeze (E2)

Re-frozen by the user-approved generic review cutover on 2026-10-02. This invalidates old policy-bound acceptance; historical receipts remain read-only evidence and are not translated. A future closeout must obtain fresh generic-review acceptance against this contract hash.
