> **Archived**: 2026-08-20 23:32
> **Related Plan**: plans/archive/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-2332

# Task Contract: mcp-workspace-cleanup-target-binding

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 23:04
> **Review File**: `tasks/reviews/20260820-2054-mcp-workspace-cleanup-target-binding.review.md`
> **Notes File**: `tasks/notes/20260820-2054-mcp-workspace-cleanup-target-binding.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Managed MCP cleanup currently authorizes destructive worktree and branch removal against the source checkout's incidental `HEAD`. If that checkout happens to be on another branch containing the workspace branch, cleanup can delete work that is still absent from the intended integration target.

## Goal

Bind every new managed MCP workspace to a stable integration target at creation and require cleanup to prove the workspace branch is directly merged or squash-absorbed into that exact target before any filesystem or branch mutation.

## Scope

- In scope: target normalization and persistence in `src/cli/mcp/coding-workspaces.ts`; target-bound cleanup classification; focused MCP coding workspace tests; required workflow artifacts.
- Out of scope: MCP session lease repair, health caching, stale-list isolation, native Windows portability, or semantic inference for legacy workspace rows.
- Taste constraints: One merge-state authority; deletion remains fail-closed; no compatibility fallback for rows lacking a stable target.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a stable symbolic integration target cannot distinguish the intended branch from an incidental source `HEAD`, or if the shared merge classifier reports an unmerged branch as `ancestor`/`absorbed`. The cheapest proof is the focused Git fixture covering source `HEAD=other`, intended target `main`, and feature absent from `main`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/cli/mcp/coding-workspaces.ts:487` tests `<workspace.branch>` against cleanup-time `HEAD`, so an unrelated checked-out branch can authorize deletion from the wrong integration target.
- repro: Open a managed workspace from `main`, commit a feature, create and check out `other` containing that feature while `main` does not, then call `cleanupManagedCodingWorkspace`; the unfixed code removes the worktree and branch.
- regression_guard: tests/cli/mcp-coding-tools.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/mcp-workspace-cleanup-target-binding/pre-fix-regression.txt

## Workflow Inventory

- Source plan: `plans/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-2054-mcp-workspace-cleanup-target-binding.review.md`
- Notes file: `tasks/notes/20260820-2054-mcp-workspace-cleanup-target-binding.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"focused-regression","kind":"deterministic_test","paths":["*"]},{"id":"cleanup-runtime-readback","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260820-2054-mcp-workspace-cleanup-target-binding.contract.md
  - tasks/reviews/20260820-2054-mcp-workspace-cleanup-target-binding.review.md
  - tasks/notes/20260820-2054-mcp-workspace-cleanup-target-binding.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/runs/mcp-workspace-cleanup-target-binding/
  - .claude/templates/
  - src/
  - tests/
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
    - src/cli/mcp/coding-workspaces.ts
    - tests/cli/mcp-coding-tools.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/mcp-workspace-cleanup-target-binding/pre-fix-regression.txt
    - tasks/notes/20260820-2054-mcp-workspace-cleanup-target-binding.notes.md
  tests_pass:
    - path: tests/cli/mcp-coding-tools.test.ts
  commands_succeed:
    - bun test tests/cli/mcp-coding-tools.test.ts --timeout 60000
    - bun test --timeout 60000
    - bun run check:type
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: cleanup deletes only after the recorded target proves `ancestor` or `absorbed`.
- Edge cases: incidental source `HEAD`, detached managed creation, unmanaged checkout from detached HEAD, missing/floating/unresolvable persisted target, direct merge, squash absorption, unmerged extra commit, and ref movement after classification.
- Regression risks: persisted state shape and installed helper resolution; failures must retain the worktree, branch, and state row.

## Rollback Point

- Commit / checkpoint: branch `codex/mcp-workspace-cleanup-target-binding` before implementation.
- Revert strategy: revert the target field, resolver, classifier call, and focused tests as one unit; legacy state remains untouched because cleanup rejects it before mutation.
