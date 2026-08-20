> **Archived**: 2026-08-20 14:48
> **Related Plan**: plans/archive/plan-20260820-1245-finish-abort-recovery.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-1448

# Task Contract: finish-abort-recovery

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-1245-finish-abort-recovery.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: workflow-engine-contract-assets
> **Last Updated**: 2026-08-20 12:46
> **Review File**: `tasks/reviews/20260820-1245-finish-abort-recovery.review.md`
> **Notes File**: `tasks/notes/20260820-1245-finish-abort-recovery.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`contract-worktree finish` moves a claimed Sprint lease to `completing` before verification. A failed pre-publication finish restores or abandons the closeout transaction but leaves that lease in `completing`; the same owner can retry, but `steal` and `release` reject the state, so another Agent cannot take over the task. The deferred WP1 ledger trigger is already satisfied because WP2 and WP3 have landed.

## Goal

Make every proven pre-publication finish abort restore the same fenced Sprint lease from `completing` to `bound`, while preserving the existing refusal to reopen a task whose canonical row is completed or whose publication has landed.

## Scope

- In scope: a pure idempotent abort transition; one `sprint abort-completion` CLI verb; automatic normal-failure rollback; explicit pre-journal and journal `recover abort`; focused tests; byte-identical helper mirror; architecture and Todo closeout for this clause only.
- Out of scope: contract-row Mode policy; no-lease completion behavior; orphan cleanup; audit events; finish-journal reconcile; key-nulling semantics; bind/steal topology validation; task-ID/schema changes; any compatibility alias.
- Taste constraints: Keep publication proof in `contract-worktree.sh`, lease mutation under the existing per-task lock, and canonical completion authority in the target-ref Sprint row. No second journal parser or semantic fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a SIGKILLed, not-published finish followed by explicit `recover abort` still leaves the Lease `completing`, or if an abort can turn a canonical completed row back into a stealable `bound` lease. Cheapest proof: extend the existing whole-loop crash/recovery test and run it against the unfixed code before editing production source.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/contract-worktree.sh` enters `completing` before verification, while both `finish_transaction_abort` and `recover_worktree abort` restore closeout state without invoking any `completing -> bound` lease transition.
- repro: run the existing `tests/continuation-conformance.test.ts` SIGKILL-at-`lifecycle_applied` scenario, then inspect the row-one lease after `contract-worktree recover abort`.
- regression_guard: tests/continuation-conformance.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/finish-abort-recovery.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260820-1245-finish-abort-recovery.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-1245-finish-abort-recovery.review.md`
- Notes file: `tasks/notes/20260820-1245-finish-abort-recovery.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"finish-abort-deterministic","kind":"deterministic_test","paths":["*"]},{"id":"finish-abort-runtime","kind":"runtime_readback","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260820-1245-finish-abort-recovery.md
  - tasks/todos.md
  - tasks/contracts/20260820-1245-finish-abort-recovery.contract.md
  - tasks/reviews/20260820-1245-finish-abort-recovery.review.md
  - tasks/notes/20260820-1245-finish-abort-recovery.notes.md
  - .ai/harness/runs/finish-abort-recovery.pre-fix.log
  - src/core/state/coordination-identity.ts
  - src/cli/commands/sprint.ts
  - scripts/contract-worktree.sh
  - assets/templates/helpers/contract-worktree.sh
  - tests/coordination-identity.test.ts
  - tests/coordination-lease-store.test.ts
  - tests/continuation-conformance.test.ts
  - tests/contract-worktree-closeout-journal.test.ts
  - docs/architecture/shared-coordination-plane.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/finish-abort-recovery.pre-fix.log
    - tasks/notes/20260820-1245-finish-abort-recovery.notes.md
  tests_pass:
    - path: tests/coordination-identity.test.ts
    - path: tests/coordination-lease-store.test.ts
    - path: tests/continuation-conformance.test.ts
    - path: tests/contract-worktree-closeout-journal.test.ts
  commands_succeed:
    - bun run check:type
    - cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: normal failures and explicit crash recovery restore the original lease to `bound`; existing `steal` can then transfer it.
- Edge cases: wrong claim/worktree/target ref, absent or renamed task, canonical `[x]`, and landed publication all refuse without mutating the lease.
- Regression risks: transaction/lease cross-store ordering and EXIT-trap recursion; tests must cover normal pre-journal abort, journal abort, SIGKILL recovery, and landed-publication refusal.

## Rollback Point

- Commit / checkpoint: the single `codex/finish-abort-recovery` publication commit.
- Revert strategy: revert that commit; the change adds no schema or migration and existing `completing` records remain readable.
