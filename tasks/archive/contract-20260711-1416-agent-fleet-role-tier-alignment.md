> **Archived**: 2026-07-11 14:16
> **Related Plan**: plans/archive/plan-20260711-1402-agent-fleet-role-tier-alignment.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260711-1416

# Task Contract: agent-fleet-role-tier-alignment

> **Status**: Complete
> **Plan**: plans/plan-20260711-1402-agent-fleet-role-tier-alignment.md
> **Task Profile**: code-change
> **Owner**: codex
> **Capability ID**: workflow-engine-delegation
> **Last Updated**: 2026-07-11 14:16 +0800
> **Review File**: `tasks/reviews/20260711-1402-agent-fleet-role-tier-alignment.review.md`
> **Notes File**: `tasks/notes/20260711-1402-agent-fleet-role-tier-alignment.notes.md`

## Why

The installed `fast-worker` was intentionally moved to Sol/high, but the repo generator still projects upstream `sonnet/max` to Terra/medium. A forced fleet reinstall would restore the rejected execution tier.

## Goal

Make repo-harness deterministically generate and install the Codex `fast-worker` as `gpt-5.6-sol` with `high` reasoning and `workspace-write` sandboxing, while preserving the existing Claude source and explicitly leaving native V2 runtime role selection out of scope.

## Scope

- In scope:
  - Generator and mirrored template mapping.
  - Golden Codex `fast-worker` TOML.
  - Exact tests and operator docs that project the mapping.
  - Workflow artifacts and local installed-host verification.
- Out of scope:
  - Native V2 `agent_type`/model routing or claims that this change fixes it.
  - Managing a fourth explorer file through the Fable fleet.
  - Claude source edits, delegation triggers, CLI upgrades, provider/auth changes, or aliases.

## Stop Conditions

- Stop if the change requires altering Claude agent semantics.
- Stop if script/template parity cannot remain exact.
- Stop if a required edit falls outside Allowed Paths.
- Stop if generated output differs from the committed golden after the focused test.

## Runtime Boundary

This contract changes the desired installed fleet artifact only. The separate blocked contract `tasks/contracts/20260711-0219-codex-native-role-model-override.contract.md` remains authoritative for the unresolved GPT-5.6 V2 runtime role-selection limitation.

## Workflow Inventory

- Source plan: `plans/plan-20260711-1402-agent-fleet-role-tier-alignment.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260711-1402-agent-fleet-role-tier-alignment.review.md`
- Notes file: `tasks/notes/20260711-1402-agent-fleet-role-tier-alignment.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed below.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260711-1402-agent-fleet-role-tier-alignment.md
  - tasks/contracts/20260711-1402-agent-fleet-role-tier-alignment.contract.md
  - tasks/reviews/20260711-1402-agent-fleet-role-tier-alignment.review.md
  - tasks/notes/20260711-1402-agent-fleet-role-tier-alignment.notes.md
  - tasks/current.md
  - tasks/todos.md
  - plans/archive/
  - tasks/archive/
  - .ai/harness/checks/
  - .ai/harness/handoff/
  - .codex/agents/fast-worker.toml
  - scripts/install-agent-fleet.sh
  - assets/templates/helpers/install-agent-fleet.sh
  - tests/install-agent-fleet.test.ts
  - tests/bootstrap-files.test.ts
  - docs/reference-configs/external-tooling.md
  - assets/reference-configs/external-tooling.md
  - docs/CHANGELOG.md
```

## Delegation Contract

```yaml
delegation:
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: implementation_and_closeout
  runner:
    preferred:
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_contain:
    - path: scripts/install-agent-fleet.sh
      pattern: 'model: "gpt-5.6-sol"'
    - path: .codex/agents/fast-worker.toml
      pattern: 'model_reasoning_effort = "high"'
    - path: .codex/agents/fast-worker.toml
      pattern: 'sandbox_mode = "workspace-write"'
    - path: tests/install-agent-fleet.test.ts
      pattern: 'descriptionLabel: "GPT-5.6 Sol at high reasoning"'
  commands_succeed:
    - bun test tests/install-agent-fleet.test.ts tests/bootstrap-files.test.ts
    - cmp scripts/install-agent-fleet.sh assets/templates/helpers/install-agent-fleet.sh
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  manual_checks:
    - "Forced local fleet install yields Sol/high fast-worker and leaves explorer Terra/medium"
    - "Review does not claim native V2 per-role runtime selection is fixed"
```

## Rollback Point

- Commit / checkpoint: `d25bc6dbdaf1124799f876357c90b5c96534c950`
- Revert strategy: revert this work package and rerun the previous fleet installer with `--force`.
