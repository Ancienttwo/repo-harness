# Task Contract: akn03-protected-replies

> **Status**: Active
> **Plan**: plans/plan-20260922-0204-akn03-protected-replies.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 02:04
> **Review File**: `tasks/reviews/20260922-0204-akn03-protected-replies.review.md`
> **Notes File**: `tasks/notes/20260922-0204-akn03-protected-replies.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ACKed steer currently disappears from delivery even when no reply exists. Raw agent-shaped events do not establish authenticated provenance or crash-safe completion.

## Goal

Implement the approved AKN-03b protected communication slice: durable original-ID reply, bounded pending disposition, and exact-authority Engineer MCP consume/ACK/reply.

## Scope

- In scope: captured plan P1/P2/P3 and exact paths below.
- Out of scope: Host activation/canary, notification effect reconciliation, browser writes, Task/Lease/Acceptance changes, main merge or runtime installation.
- Taste constraints: no dual WorkEnvelope authority, semantic prose parser, generic transaction framework or compatibility fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

A partial reply reports committed, revoked identity can commit, ACKed unanswered steer disappears, or recovery changes ID/body/fence. Physical crash and current-authority tests must reject each.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear as a `package_test` check in Verification Plan).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260922-0204-akn03-protected-replies.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260922-0204-akn03-protected-replies.review.md`
- Notes file: `tasks/notes/20260922-0204-akn03-protected-replies.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"reply-effects","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/effects/fleet/task-inbox.ts
  - src/effects/engineers/task-inbox.ts
  - src/effects/engineers/principal-store.ts
  - src/effects/repo-registry.ts
  - src/cli/mcp/oauth.ts
  - src/cli/mcp/server.ts
  - src/cli/mcp/tools.ts
  - src/cli/mcp/engineer-tools.ts
  - src/cli/mcp/transports/http.ts
  - tests/effects/task-reply.test.ts
  - tests/cli/mcp-engineer-tools.test.ts
  - tests/cli/mcp-http.test.ts
  - tests/cli/mcp-oauth.test.ts
  - tests/unit/collaboration-authority-baseline.test.ts
  - docs/researches/20260922-task-reply-protocol.md
  - docs/researches/20260829-c0-collaboration-two-plane-authority-freeze.md
  - docs/architecture/.projection-manifest.json
  - plans/plan-20260922-0204-akn03-protected-replies.md
  - tasks/contracts/20260922-0204-akn03-protected-replies.contract.md
  - tasks/reviews/20260922-0204-akn03-protected-replies.review.md
  - tasks/notes/20260922-0204-akn03-protected-replies.notes.md
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
    - src/effects/engineers/task-inbox.ts
    - tests/effects/task-reply.test.ts
  artifacts_exist: []
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "reply-effects",
      "kind": "package_test",
      "path": "tests/effects/task-reply.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Changed communication persistence, authentication and existing inbox/authorization invariants",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "reply-core",
      "kind": "package_test",
      "path": "tests/unit/task-reply.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Changed communication persistence, authentication and existing inbox/authorization invariants",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-inbox",
      "kind": "package_test",
      "path": "tests/effects/task-inbox.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Changed communication persistence, authentication and existing inbox/authorization invariants",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "engineer-mcp",
      "kind": "package_test",
      "path": "tests/cli/mcp-engineer-tools.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Changed communication persistence, authentication and existing inbox/authorization invariants",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "oauth",
      "kind": "package_test",
      "path": "tests/cli/mcp-oauth.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Changed communication persistence, authentication and existing inbox/authorization invariants",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "http",
      "kind": "package_test",
      "path": "tests/cli/mcp-http.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Changed communication persistence, authentication and existing inbox/authorization invariants",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "operator-write",
      "kind": "package_test",
      "path": "tests/effects/operator-task-message.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Changed communication persistence, authentication and existing inbox/authorization invariants",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "authority-inventory",
      "kind": "package_test",
      "path": "tests/unit/collaboration-authority-baseline.test.ts",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Task reply now has a protected consumer; preserve closed delivery-plane inventory and frozen identities",
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
      "command": "REPO_HARNESS_DIFF_BASE=749e9e92cc0f3da384dfca4e24ebb20f39b98277 REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh",
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
    }
  ]
}
```

## Acceptance Notes (Human Review)

New effects test is admitted because pure protocol tests do not exercise physical fsync/link boundaries, authority composition or recovery reads. Existing MCP/OAuth/HTTP and inbox/operator suites are extended/reused. These fixtures prove local contract behavior only, not H0 protected-store isolation or native Host/campaign acceptance. The stage is based on published PR #435 at 749e9e92. Source and automatic projection must be frozen and committed before one final independent review.

## Rollback Point

- Base: 749e9e92cc0f3da384dfca4e24ebb20f39b98277.
- Revert entrypoints/writer; preserve original event/receipt bytes and incomplete reply evidence for explicit reconciliation.
