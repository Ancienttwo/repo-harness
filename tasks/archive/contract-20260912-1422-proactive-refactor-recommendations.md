> **Archived**: 2026-09-12 14:22
> **Related Plan**: plans/archive/plan-20260911-0238-proactive-refactor-recommendations.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: run-20260912-1422
> **Archive Projection V1**: `plans/plan-20260911-0238-proactive-refactor-recommendations.md` => `plans/archive/plan-20260911-0238-proactive-refactor-recommendations.md`
> **Archive Projection V1**: `tasks/notes/20260911-0238-proactive-refactor-recommendations.notes.md` => `tasks/archive/notes-20260912-1422-proactive-refactor-recommendations.md`
> **Archive Projection V1**: `tasks/contracts/20260911-0238-proactive-refactor-recommendations.contract.md` => `tasks/archive/contract-20260912-1422-proactive-refactor-recommendations.md`
> **Archive Projection V1**: `tasks/reviews/20260911-0238-proactive-refactor-recommendations.review.md` => `tasks/archive/review-20260912-1422-proactive-refactor-recommendations.md`

# Task Contract: proactive-refactor-recommendations

> **Status**: Active
> **Plan**: plans/archive/plan-20260911-0238-proactive-refactor-recommendations.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-09-11 02:38
> **Review File**: `tasks/archive/review-20260912-1422-proactive-refactor-recommendations.md`
> **Notes File**: `tasks/archive/notes-20260912-1422-proactive-refactor-recommendations.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Measured opportunities should reach the Agent proactively; execution remains a user investment decision. Existing shadow discovery combines observation with author activation and has no automatic delivery entry.

## Goal

Deliver bounded, deduplicated refactor recommendations at normal Stop, with a shared explicit CLI and one global enable setting. Agent presents evidence, expected benefit and risk, asks the user, and starts no execution absent approval.

## Scope

- In scope: shared global config reader, recommendation setting/observer/CLI, Stop delivery, install/uninstall ownership, focused tests, documentation.
- Out of scope: model/index authoring, LLM proposal author, activation promotion, recommendation acceptance, program/work-package creation, execution, merge and release.

## Stop Conditions

- Stop if observation requires changing model or execution authority.
- Fail closed on malformed or incomplete authoritative evidence; do not invent an opportunity.

## Falsifier

Execution remains off while a complete provider observation produces exactly one Stop instruction for user choice; repeat delivery is suppressed and no author/materializer runs.

## Workflow Inventory

- Source plan: `plans/archive/plan-20260911-0238-proactive-refactor-recommendations.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260912-1422-proactive-refactor-recommendations.md`
- Notes file: `tasks/archive/notes-20260912-1422-proactive-refactor-recommendations.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"focused-regression","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/
  - tests/
  - assets/reference-configs/external-tooling.md
  - docs/reference-configs/external-tooling.md
  - docs/spec.md
  - plans/archive/plan-20260911-0238-proactive-refactor-recommendations.md
  - tasks/todos.md
  - tasks/archive/contract-20260912-1422-proactive-refactor-recommendations.md
  - tasks/archive/review-20260912-1422-proactive-refactor-recommendations.md
  - tasks/archive/notes-20260912-1422-proactive-refactor-recommendations.md
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
missing or malformed plan fails closed.

```yaml
exit_criteria:
  files_exist:
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260912-1422-proactive-refactor-recommendations.md
```

## Verification Plan

```json
{
  "protocol": 1,
  "checks": [
    {
      "id": "focused-regression",
      "kind": "command",
      "command": "bun test tests/unit/refactor-recommendations.test.ts tests/unit/global-architecture-projection.test.ts tests/stop-handler.test.ts tests/cli/uninstall.test.ts --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Covers global preferences, delivery and capacity boundaries, Stop recursion and uninstall ownership.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "global-bootstrap",
      "kind": "command",
      "command": "bun test tests/cli/global-runtime-init.test.ts -t 'upgrades an old Bun runtime' --timeout 60000",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Exercises the real global setup entrypoint with seeded preferences.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "typecheck",
      "kind": "command",
      "command": "bun run check:type",
      "cwd": ".",
      "phase": "preflight",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Validates shared configuration and observer types.",
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
      "necessity": "Required hook projection integrity.",
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
      "necessity": "Required helper projection integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "references",
      "kind": "command",
      "command": "bun run check:reference-configs",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Canonical reference documentation mirror integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "deploy",
      "kind": "command",
      "command": "bash scripts/check-deploy-sql-order.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required repository integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "architecture",
      "kind": "command",
      "command": "bash scripts/check-architecture-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required architecture integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "task-sync",
      "kind": "command",
      "command": "bash scripts/check-task-sync.sh",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required substantive-change digest binding.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "workflow",
      "kind": "command",
      "command": "bash scripts/check-task-workflow.sh --strict",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required workflow integrity.",
      "inputs": {
        "env": []
      }
    },
    {
      "id": "inspector",
      "kind": "command",
      "command": "bun scripts/inspect-project-state.ts --repo . --format text",
      "cwd": ".",
      "phase": "verification",
      "cost": "normal",
      "evidence_policy": "current_exact",
      "necessity": "Required adoption state inventory.",
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
      "necessity": "Required adoption dry-run without mutation.",
      "inputs": {
        "env": []
      }
    }
  ]
}
```

This is the sole executable verification authority. Use `baseline_with_delta`
only when a referenced immutable baseline plus named current delta checks prove
the intended coverage; do not infer that choice from paths or command text.

## Acceptance Notes (Human Review)

- Functional behavior: Global defaults drive read-only observation while execution stays off.
- Edge cases: Deadline, partial proof, symlink state, cooldown and ledger capacity fail closed.
- Regression risks: Focused Stop/global setup coverage is sufficient; no full-suite claim. External acceptance remains pending.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
