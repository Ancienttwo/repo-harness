> **Archived**: 2026-08-14 18:11
> **Related Plan**: plans/archive/plan-20260814-1629-contract-worktree-single-publication.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260814-1811

# Task Contract: contract-worktree-single-publication

> **Status**: Fulfilled
> **Plan**: plans/plan-20260814-1629-contract-worktree-single-publication.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-14 16:29
> **Review File**: `tasks/reviews/20260814-1629-contract-worktree-single-publication.review.md`
> **Notes File**: `tasks/notes/20260814-1629-contract-worktree-single-publication.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`contract-worktree finish --merge` currently publishes every checkpoint and lifecycle commit by fast-forwarding the target branch. The evidence workflow is correctly fail-closed, but its internal state transitions become permanent public history, making release archaeology and bisecting substantially noisier as work-package count grows.

## Goal

Publish one synthesized target commit per completed contract work-package while preserving the verified post-lifecycle tree, source-branch checkpoints, AcceptanceReceipt/merge-seal authority, target-base immutability, crash recovery, and dirty-target refusal.

## Scope

- In scope: `contract-worktree finish --merge` publication topology, closeout journal publication identity/recovery, helper projection, focused regression tests, workflow documentation and architecture/task projections.
- Out of scope: rewriting existing history, changing `ship-worktrees` PR-provider merge behavior, changing AcceptanceReceipt schemas or review subject semantics, line/file-count commit heuristics, and modifying `finish --no-merge` branch-local closeout behavior.
- Taste constraints: one publication authority and one public commit; no compatibility alias, heuristic classification, or silent fallback when target/base/tree identity is unavailable.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a synthesized commit cannot retain both exact tree equality and crash-safe landed-effect detection. Cheapest proof: a disposable primary + linked worktree fixture with two checkpoint commits, a lifecycle archive, a SIGKILL window before/after target mutation, and exact target first-parent/tree assertions.

## Root Cause Evidence

- root_cause: `scripts/contract-worktree.sh:1537-1585` creates a distinct lifecycle commit and then publishes the verified branch HEAD with `git merge --ff-only`, so every earlier checkpoint plus the lifecycle commit becomes first-parent history on the target instead of one work-package commit.
- repro: `bun test tests/contract-worktree-single-publication.test.ts` on the unfixed helper reports a target commit delta greater than one.
- regression_guard: tests/contract-worktree-single-publication.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/contract-worktree-single-publication-pre-fix.txt

## Workflow Inventory

- Source plan: `plans/plan-20260814-1629-contract-worktree-single-publication.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260814-1629-contract-worktree-single-publication.review.md`
- Notes file: `tasks/notes/20260814-1629-contract-worktree-single-publication.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - scripts/contract-worktree.sh
  - assets/templates/helpers/contract-worktree.sh
  - assets/reference-configs/sprint-contracts.md
  - assets/reference-configs/agentic-development-flow.md
  - docs/reference-configs/sprint-contracts.md
  - docs/reference-configs/agentic-development-flow.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - docs/architecture/.projection-manifest.json
  - docs/architecture/modules/public-surface/action-commands.md
  - docs/architecture/modules/public-surface/adoption.md
  - docs/architecture/modules/public-surface/root-router.md
  - docs/architecture/modules/runtime-harness/global-runtime-reconciliation.md
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  - docs/architecture/modules/runtime-harness/mcp-sidecar.md
  - docs/architecture/modules/runtime-mcp/general-repo-access.md
  - docs/architecture/modules/verification/codegraph-readiness.md
  - docs/architecture/modules/verification/evals-checks.md
  - docs/architecture/modules/workflow-engine/inspection-migration.md
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260814-1629-contract-worktree-single-publication.contract.md
  - tasks/reviews/20260814-1629-contract-worktree-single-publication.review.md
  - tasks/notes/20260814-1629-contract-worktree-single-publication.notes.md
  - tests/contract-worktree-single-publication.test.ts
  - tests/contract-worktree-closeout-journal.test.ts
  - tests/helper-scripts.test.ts
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
    - scripts/contract-worktree.sh
    - assets/templates/helpers/contract-worktree.sh
    - docs/reference-configs/sprint-contracts.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/contract-worktree-single-publication-pre-fix.txt
    - tasks/notes/20260814-1629-contract-worktree-single-publication.notes.md
  tests_pass:
    - path: tests/contract-worktree-single-publication.test.ts
    - path: tests/contract-worktree-closeout-journal.test.ts
    - path: tests/helper-scripts.test.ts
  commands_succeed:
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: merge-mode closeout adds exactly one target commit with a tree equal to the verified lifecycle HEAD; no-merge remains branch-local.
- Edge cases: target movement, dirty target, commit creation failure, crash before target mutation, crash after target mutation but before journal `merged` phase, and replay/reconcile.
- Regression risks: closeout journal may mistake an unreachable commit object for a landed target update; publication must be detected through the target ref, never object existence alone.

## Rollback Point

- Commit / checkpoint: `6d62d3b2` plus the pre-fix red artifact named above.
- Revert strategy: revert the single publication helper/test/doc projection; AcceptanceReceipt and evidence schemas remain unchanged.
