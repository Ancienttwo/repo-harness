# Plan: Downstream legacy helper cleanup policy

> **Status**: Archived
> **Created**: 2026-06-12 23:51:16+0800
> **Slug**: downstream-legacy-cleanup-policy
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Sprint**: `plans/sprints/20260612-2346-prd-sprint-runtime-isolation.sprint.md`
> **Sprint Task**: `downstream-legacy-cleanup-policy`
> **Sprint Review**: (not used; inline dirty-tree slice)
> **Implementation Notes**: (not used; inline dirty-tree slice)

## Agentic Routing

- Selected route: Sprint backlog row expanded into this bounded plan following the `$think` rule, then implemented in the current dirty self-host worktree.
- Routing reason: the Sprint row is intentionally coarse and must become a decision-complete plan before code edits; this slice is part of the same uncommitted PRD/Sprint/helper-runtime change set.
- Due diligence:
  - P1 map: self-host source helpers live in root `scripts/`; generated repo runtime helpers now live under `.ai/harness/scripts/`; migration owns cleanup through workflow-contract `migrations.upgrade.actions`.
  - P2 trace: migration reads workflow-contract actions through `pi_workflow_contract_upgrade_action_entries`, calls `cleanup_removed_workflow_assets`, and removes or preserves paths according to `cleanupMode`.
  - P3 decision rationale: delete only paths that are either legacy-retired singleton helpers or byte/header-identifiable repo-harness generated helpers; report ambiguous root `scripts/*` paths instead of deleting them.

## Workflow Inventory

- Active plan: `plans/plan-20260612-2351-downstream-legacy-cleanup-policy.md`
- Sprint contract: (not used; inline dirty-tree slice)
- Sprint review: (not used; inline dirty-tree slice)
- Implementation notes: (not used; inline dirty-tree slice)
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: current dirty self-host change set plus files named in this plan.
- Concurrency rule: do not start a fresh linked worktree for this slice; the prior helper-runtime changes are uncommitted and required for a coherent diff.
- Execution isolation: current primary worktree only.

## Approach

### Strategy

Add a conservative migration cleanup policy for legacy root helper files:

- Workflow contract declares the legacy root helper paths with `cleanupMode: generated_helper`, not unconditional delete.
- Migration removes a root helper only when it can prove repo-harness ownership by matching an installed helper source/template or a known repo-harness marker.
- Migration reports ambiguous root `scripts/*` paths and leaves them untouched.
- Tests cover delete-safe, preserve-ambiguous, and generated-repo no-root-scripts behavior.

### Trade-offs

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Delete every legacy helper path | Fast cleanup | Can delete app-owned scripts with same names | Reject |
| Never delete legacy root helpers | Safest for apps | Leaves repo-harness collision residue forever | Reject |
| Delete only generated-identifiable helpers | Removes owned residue while preserving app scripts | Needs content checks and tests | Choose |

## Detailed Design

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `assets/workflow-contract.v1.json` | Modify | Add migration action for legacy root helper cleanup with conservative ownership metadata. |
| `.ai/harness/workflow-contract.json` | Modify | Mirror asset contract. |
| `scripts/lib/project-init-lib.sh` | Modify | Expose upgrade actions with mode metadata if needed. |
| `scripts/migrate-project-template.sh` | Modify | Implement generated-helper detection and ambiguous report path. |
| `tests/migration-script.test.ts` | Modify | Add safe delete/preserve coverage. |
| `docs/reference-configs/*` and asset mirrors | Modify if needed | Document that root `scripts/*` cleanup is conservative and does not touch app-owned scripts. |
| `tasks/current.md` | Refresh | Derived status snapshot after implementation. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Business script deleted by migration | Medium | High | Delete only when content proves repo-harness ownership; otherwise report. |
| Legacy helper remains because content drifted | Medium | Low | Report ambiguous path with manual command context. |
| Self-host source fallback confused with downstream cleanup | Low | Medium | Scope cleanup to migration target and keep self-host root `scripts/` source intact. |

## Evidence Contract

- **State/progress path**: `plans/sprints/20260612-2346-prd-sprint-runtime-isolation.sprint.md` row `downstream-legacy-cleanup-policy`.
- **Verification evidence**: focused migration tests, generated-repo smoke, `bash scripts/check-task-workflow.sh --strict`, and `bash scripts/migrate-project-template.sh --repo . --dry-run`.
- **Evaluator rubric**: migration deletes only generated-identifiable legacy root helpers and preserves ambiguous app-owned root scripts.
- **Stop condition**: docs/tests/migration behavior demonstrate safe cleanup policy and required checks pass.
- **Rollback surface**: revert migration cleanup action and tests; generated helper runtime path remains independent.

## Task Breakdown

- [x] Add workflow-contract action for legacy root helper cleanup with conservative semantics.
- [x] Implement generated-helper detection in migration.
- [x] Add tests for generated deletion and app-owned preservation.
- [x] Document the cleanup policy in migration/reference docs.
- [x] Run focused tests, generated-repo smoke, and required workflow gates.
