> **Archived**: 2026-08-20 18:10
> **Related Plan**: plans/archive/plan-20260612-0318-arch-doc-loop-01-queue-engine-triage.md
> **Outcome**: Superseded
> **Lifecycle**: contract
> **Parent Run ID**: orphan-family-sweep

# Sprint Contract: arch-doc-loop-01-queue-engine-triage

> **Status**: Fulfilled
> **Plan**: plans/plan-20260612-0318-arch-doc-loop-01-queue-engine-triage.md
> **Owner**: chris
> **Capability ID**: root
> **Last Updated**: 2026-06-12 03:46
> **Review File**: `tasks/reviews/20260612-0318-arch-doc-loop-01-queue-engine-triage.review.md`
> **Notes File**: `tasks/notes/20260612-0318-arch-doc-loop-01-queue-engine-triage.notes.md`

## Goal

Complete the first architecture-doc-loop slice in this isolated worktree:
replace the one-shot architecture drift writer with a queue CLI that owns
record/status/reindex/triage/check, keeps PostToolUse advisory-only, and clears
the pre-2026-06-01 legacy architecture request backlog.

## Scope

- In scope:
- `scripts/architecture-queue.sh` and the `scripts/architecture-event.ts`
  request merge/render helpers it uses.
- Removing the old `scripts/architecture-drift.sh` runtime entrypoint from this
  self-host repo and replacing runtime/test/contract references with the queue.
- `.ai/hooks` and `assets/hooks` post-edit guard parity for queue record calls.
- Queue policy keys, self-host/template workflow required-file checks, helper
  inventory, and focused tests required so removing `architecture-drift.sh`
  does not break generated repos.
- Legacy request triage for requests before 2026-06-01 and the resolution pass
  needed to leave `docs/architecture/requests/` pending-only and empty.
- Out of scope:
- `loop-engine-01` files already committed on primary/main.
- Slice 2 strict finish gate surfaces and new `check-architecture-sync.sh`.
- Slice 3 full downstream migration/retired-removal rollout beyond the helper
  inventory and scaffold parity needed by this slice.
- Slice 4 research surface migration.

## Workflow Inventory

- Source plan: `plans/plan-20260612-0318-arch-doc-loop-01-queue-engine-triage.md`
- Deferred-goal ledger: `tasks/todo.md`
- Review file: `tasks/reviews/20260612-0318-arch-doc-loop-01-queue-engine-triage.review.md`
- Notes file: `tasks/notes/20260612-0318-arch-doc-loop-01-queue-engine-triage.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `scripts/verify-sprint.sh` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - .ai/hooks/post-edit-guard.sh
  - .ai/harness/policy.json
  - .ai/harness/workflow-contract.json
  - AGENTS.md
  - CLAUDE.md
  - assets/hooks/post-edit-guard.sh
  - assets/reference-configs/hook-operations.md
  - assets/templates/helpers/archive-architecture-request.sh
  - assets/templates/helpers/architecture-drift.sh
  - assets/templates/helpers/architecture-event.ts
  - assets/templates/helpers/architecture-queue.sh
  - assets/templates/helpers/check-task-workflow.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - assets/workflow-contract.v1.json
  - docs/architecture/index.md
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  - docs/architecture/modules/verification/evals-checks.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/architecture/requests/
  - docs/reference-configs/hook-operations.md
  - docs/researches/20260612-architecture-doc-truth-loop.md
  - plans/
  - scripts/archive-architecture-request.sh
  - scripts/architecture-queue.sh
  - scripts/architecture-event.ts
  - scripts/architecture-drift.sh
  - scripts/check-task-workflow.sh
  - scripts/context-contract-sync.sh
  - scripts/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - tasks/todo.md
  - tasks/research.md
  - tasks/lessons.md
  - tasks/sprints/20260612-0256-architecture-doc-loop.sprint.md
  - tasks/contracts/20260612-0318-arch-doc-loop-01-queue-engine-triage.contract.md
  - tasks/reviews/20260612-0318-arch-doc-loop-01-queue-engine-triage.review.md
  - tasks/notes/20260612-0318-arch-doc-loop-01-queue-engine-triage.notes.md
  - tests/architecture-queue.test.ts
  - tests/architecture-event.test.ts
  - tests/bootstrap-files.test.ts
  - tests/create-project-dirs.runtime.test.ts
  - tests/helper-scripts.test.ts
  - tests/hook-runtime.test.ts
  - tests/hook-contracts.test.ts
  - tests/migration-script.test.ts
  - tests/scaffold-parity.test.ts
  - tests/workflow-contract.test.ts
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - scripts/architecture-queue.sh
    - assets/templates/helpers/architecture-queue.sh
    - docs/researches/20260612-architecture-doc-truth-loop.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260612-0318-arch-doc-loop-01-queue-engine-triage.notes.md
  tests_pass:
    - path: tests/architecture-queue.test.ts
    - path: tests/architecture-event.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/hook-contracts.test.ts
  commands_succeed:
    - bun test tests/architecture-queue.test.ts tests/architecture-event.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts
    - bash scripts/architecture-queue.sh triage --before 2026-06-01
    - bash scripts/architecture-queue.sh reindex --check
    - bun test
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bash scripts/migrate-project-template.sh --repo . --dry-run
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- `architecture-queue.sh record` preserves the `[ArchitectureDrift] Request:`
  stdout prefix for existing PostToolUse orchestration.
- `architecture-queue.sh reindex --check` derives the pending block from
  `docs/architecture/requests/` instead of appending ad hoc lines.
- `architecture-queue.sh triage --before 2026-06-01` groups the historical
  backlog into capability cards and archives superseded legacy requests.
- The implementation completed the planned resolve pass after triage, so the
  root request directory is now empty and the controlled pending block renders
  `- (none)`.
- Edge cases:
- `record` is advisory if Bun is missing; strict queue/check behavior must fail
  closed when required dependencies are missing.
- Regression risks:
- Helper inventory tests and self-migration checks still reference old helper
  names; replace only the self-host surfaces required for this slice.

## Rollback Point

- Commit / checkpoint: branch `codex/arch-doc-loop-01-queue-engine-triage`
  before finish/merge.
- Revert strategy: revert the eventual queue-engine commit, restoring
  `architecture-drift.sh`, removing `architecture-queue.sh`, and moving archived
  request cards back only if a historical pending backlog needs to be replayed.
