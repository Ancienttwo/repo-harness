> **Archived**: 2026-09-22 15:32
> **Related Plan**: plans/archive/plan-20260922-1417-akn03b-windows-fixture.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260922-1532
> **Archive Projection V1**: `plans/plan-20260922-1417-akn03b-windows-fixture.md` => `plans/archive/plan-20260922-1417-akn03b-windows-fixture.md`
> **Archive Projection V1**: `tasks/notes/20260922-1417-akn03b-windows-fixture.notes.md` => `tasks/archive/notes-20260922-1532-akn03b-windows-fixture.md`
> **Archive Projection V1**: `tasks/contracts/20260922-1417-akn03b-windows-fixture.contract.md` => `tasks/archive/contract-20260922-1532-akn03b-windows-fixture.md`
> **Archive Projection V1**: `tasks/reviews/20260922-1417-akn03b-windows-fixture.review.md` => `tasks/archive/review-20260922-1532-akn03b-windows-fixture.md`

# Task Contract: AKN-03b acceptance fixes

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260922-1417-akn03b-windows-fixture.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-22 14:17
> **Review File**: `tasks/archive/review-20260922-1532-akn03b-windows-fixture.md`
> **Notes File**: `tasks/archive/notes-20260922-1532-akn03b-windows-fixture.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

PR #437 requires correction of a Windows setup failure, request expiry during publication and an inconsistent encoded reply size boundary; its failed CI also needs the accepted #436 fixture integration before packaging can run.

## Goal

Correct the Windows HTTP fixture, publication-time authorization expiry and encoded reply record size findings on PR #437. Preserve canonical readers, authenticated transport assertions, immutable reply identity and crash recovery; prevent expired requests publishing delivery, ACK, intent, event or commit records.

## Scope

- In scope: existing HTTP fixture setup, authenticated Engineer Task communication publication fences, existing reply regression suite and this package evidence.
- Scope revision: the owner review dated 2026-09-22 additionally requires encoded size boundaries, exact CI subject attribution and downstream stack alignment. This package owns the first two for PR #437; downstream integration retains its own package.
- Earlier scope revision: the original AKN-03 authorization-at-publication requirement covers the confirmed semantic finding. The prior rejection is retained; widening this contract does not waive acceptance. The owner now explicitly requests reacceptance after fixes.
- Out of scope: changes to filesystem durability policy, Host admission, main merge and runtime installation.
- Taste constraints: no Windows skip, no product fallback, no replacement protocol or helper abstraction.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The Windows job still fails before the HTTP assertion, or the canonical readers reject the seeded Binding/current/mapping records. The existing Engineer OAuth E2E is the guard.

## Root Cause Evidence

- root_cause: Engineer revalidation checked the token before expensive canonical validation; ACK and event writers then staged and fsynced without a final publication callback. The independent fixture issue called directory-fsync writers on Windows before HTTP assertions.
- repro: Deterministic expiry during canonical validation and real staging fsync, plus GitHub Windows run 35693364932 job 106634890098.
- regression_guard: tests/effects/task-reply.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/akn03b-windows-fixture/expiry-pre-fix.log

## Workflow Inventory

- Source plan: `plans/archive/plan-20260922-1417-akn03b-windows-fixture.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260922-1532-akn03b-windows-fixture.md`
- Notes file: `tasks/archive/notes-20260922-1532-akn03b-windows-fixture.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol": 1, "oracles": [{"id": "http", "kind": "deterministic_test", "paths": ["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - scripts/check-tarball-install-smoke.sh
  - src/core/fleet/task-reply.ts
  - tests/unit/task-reply.test.ts
  - src/effects/engineers/task-inbox.ts
  - src/effects/fleet/task-inbox.ts
  - tests/effects/task-reply.test.ts
  - tests/cli/mcp-http.test.ts
  - docs/researches/20260922-task-reply-protocol.md
  - docs/architecture/.projection-manifest.json
  - plans/archive/plan-20260922-1417-akn03b-windows-fixture.md
  - tasks/archive/contract-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/review-20260922-1532-akn03b-windows-fixture.md
  - tasks/archive/notes-20260922-1532-akn03b-windows-fixture.md
  - tasks/todos.md
  - docs/researches/20260922-candidate-runtime-fixture-authority.md
  - plans/archive/plan-20260922-0132-candidate-runtime-fixture-authority.md
  - plans/plan-20260922-1452-akn03a-fixture-integration.md
  - tasks/archive/contract-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/notes-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/review-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/archive/todo-20260922-0148-candidate-runtime-fixture-authority.md
  - tasks/contracts/20260922-1452-akn03a-fixture-integration.contract.md
  - tasks/notes/20260922-1452-akn03a-fixture-integration.notes.md
  - tasks/reviews/20260922-1452-akn03a-fixture-integration.review.md
  - tests/unit/candidate-bound-global-runtime-reconciliation.test.ts
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
    - tests/cli/mcp-http.test.ts
  artifacts_exist:
    - .ai/harness/runs/akn03b-windows-fixture/windows-pre-fix.log
    - .ai/harness/runs/akn03b-windows-fixture/expiry-pre-fix.log
    - .ai/harness/runs/akn03b-windows-fixture/size-pre-fix.log
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Encoded byte boundary and pure validator agreement for legal UTF-8 bodies",
      "inputs": {
        "env": []
      },
      "id": "reply-contract",
      "kind": "package_test",
      "path": "tests/unit/task-reply.test.ts"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Accepted #436 fixture integrated from #435; confirm the failed Ubuntu prerequisite is corrected",
      "inputs": {
        "env": []
      },
      "id": "baseline-fixture",
      "kind": "package_test",
      "path": "tests/unit/candidate-bound-global-runtime-reconciliation.test.ts"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Publication-time expiry and existing authenticated reply/crash recovery invariants",
      "inputs": {
        "env": []
      },
      "id": "reply-expiry",
      "kind": "package_test",
      "path": "tests/effects/task-reply.test.ts"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing generic inbox persistence callers share the changed event and receipt writer and must retain storage error and retry behavior",
      "inputs": {
        "env": []
      },
      "id": "inbox-storage",
      "kind": "package_test",
      "path": "tests/effects/task-inbox.test.ts"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "http",
      "kind": "package_test",
      "path": "tests/cli/mcp-http.test.ts"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "type",
      "kind": "command",
      "command": "bun run check:type"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "hooks",
      "kind": "command",
      "command": "bun run check:hooks"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "helpers",
      "kind": "command",
      "command": "bun run check:helpers"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "reference-configs",
      "kind": "command",
      "command": "bun run check:reference-configs"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "deploy-sql",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "task-sync",
      "kind": "command",
      "command": "REPO_HARNESS_DIFF_BASE=fdc2081f165ea495da9852ba057ca939dc44d95e REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "task-workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "project-state",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Existing HTTP fixture boundary and mandatory repository integrity",
      "inputs": {
        "env": []
      },
      "id": "init-dry-run",
      "kind": "command",
      "command": "bun src/cli/index.ts init --repo . --dry-run"
    },
    {
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Owner explicitly requires installed-package MCP registration, request context, permission rejection and successful authorized call; reuse the existing HTTP E2E against installed source",
      "inputs": {
        "env": []
      },
      "id": "installed-package",
      "kind": "command",
      "command": "bash scripts/check-tarball-install-smoke.sh"
    }
  ]
}
```

## Acceptance Notes (Human Review)

The existing HTTP suite covers authenticated SDK token propagation, tool inventory, session isolation and permission revocation. Add focused regressions in the existing reply suite for expiry during validation and staging. No new test file or full suite is required. Local passing evidence does not establish Windows acceptance; read back the hosted Windows job after push. The one semantic review rejected the earlier candidate; preserve that evidence. Corrected canonical evidence does not itself create semantic acceptance.

Test admission: existing revocation tests revoke before validation, leaving expiry during canonical validation and staging uncovered. Five parameterized cases in the existing effects suite expire inside the actual filesystem/composition boundary and assert the durable record remains unpublished. Real fixture Git and filesystem operations are necessary to expose this ordering; focused command `bun test tests/effects/task-reply.test.ts --test-name-pattern "expiry during"` takes about 8 seconds.

Size test admission: the existing byte test covers individual message bodies, not complete JSON records. Extend the existing unit suite for control characters, escaped quotes/backslashes, multibyte UTF-8 and exact encoded limits; add one effects test proving rejected oversize replies leave no intent and retry with the original ID. Unit probes cost under 1 second; the real Git/filesystem recovery fixture costs about 3 seconds.

Installed test admission: reuse the existing Engineer OAuth E2E from the installed package root, with only test/architecture fixture inputs copied. Runtime src and agents must come from the tarball. This closes the source-versus-package evidence gap without another authentication authority or a real Host canary.

## Rollback Point

Base fdc2081f165ea495da9852ba057ca939dc44d95e; revert only the fixture correction.
