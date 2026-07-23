> **Archived**: 2026-07-24 00:32
> **Related Plan**: plans/archive/plan-20260723-2258-evidence-ledger-genesis-authority.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260724-0032

# Task Contract: evidence-ledger-genesis-authority

> **Status**: Fulfilled
> **Plan**: plans/plan-20260723-2258-evidence-ledger-genesis-authority.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-23 22:58
> **Review File**: `tasks/reviews/20260723-2258-evidence-ledger-genesis-authority.review.md`
> **Notes File**: `tasks/notes/20260723-2258-evidence-ledger-genesis-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

When PostBash creates the immutable evidence genesis before `verify-sprint`, the
valid authoritative verify event is stamped with that genesis identity but
`checks-materializer` re-derives a different contract-slug identity. The event
is then invisible to `.ai/harness/checks/latest.json`, permanently blocking
acceptance in that worktree.

## Goal

Make checks materialization use the accepted genesis record as the sole
worktree identity authority while preserving exact active-contract isolation
through the existing `subject_identity.contract_hash` and
`run_trace.contract.file`.

## Scope

- In scope: checks materializer identity selection, exact contract byte-and-path
  filtering, deterministic regression tests, workflow evidence for this
  package, and the directly blocking archive prediction bug discovered during
  `contract-worktree finish`.
- Out of scope: evidence schema changes, producer identity changes, ledger
  rewriting or deletion, recovery views, and unrelated evidence consumers.
- Taste constraints: one identity authority per datum; fail closed without
  genesis; archive prediction may validate only against its exact source
  repository; no fallback identities, dual-format matching, or compatibility
  shim.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if `readAcceptedEvents` does not return the immutable
genesis that governed accepted event stamping, or if accepted events lack the
existing exact contract hash. The cheapest proof is the focused regression
fixture in `tests/evidence-checks-materializer.test.ts`.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: src/effects/evidence/checks-materializer.ts:191-199 re-derives `worktree_id` from the contract slug even though src/effects/evidence/event-log.ts:54-64 makes an existing genesis authoritative and PostBash legitimately initializes it with a workspace hash.
- repro: bun test tests/evidence-checks-materializer.test.ts -t "uses PostBash-first genesis identity" on the unfixed source.
- regression_guard: tests/evidence-checks-materializer.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/evidence-ledger-genesis-authority.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260723-2258-evidence-ledger-genesis-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260723-2258-evidence-ledger-genesis-authority.review.md`
- Notes file: `tasks/notes/20260723-2258-evidence-ledger-genesis-authority.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260723-2258-evidence-ledger-genesis-authority.md
  - tasks/todos.md
  - tasks/contracts/20260723-2258-evidence-ledger-genesis-authority.contract.md
  - tasks/reviews/20260723-2258-evidence-ledger-genesis-authority.review.md
  - tasks/notes/20260723-2258-evidence-ledger-genesis-authority.notes.md
  - src/effects/evidence/checks-materializer.ts
  - scripts/archive-workflow.sh
  - assets/templates/helpers/archive-workflow.sh
  - tests/evidence-checks-materializer.test.ts
  - tests/evidence-projection-drift.test.ts
  - tests/archive-evidence-gates.test.ts
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
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/effects/evidence/checks-materializer.ts
    - tests/evidence-checks-materializer.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260723-2258-evidence-ledger-genesis-authority.notes.md
  tests_pass:
    - path: tests/evidence-checks-materializer.test.ts
  commands_succeed:
    - bun test tests/evidence-checks-materializer.test.ts
    - bun test tests/archive-evidence-gates.test.ts
    - bun run check:type
```

## Acceptance Notes (Human Review)

- Functional behavior: PostBash-first genesis events materialize normally.
- Edge cases: sibling-contract events in one worktree remain excluded; missing
  genesis fails closed before any checks projection is written.
- Regression risks: identity filtering affects the sole checks projection
  writer, so focused producer-materializer end-to-end coverage is mandatory.
- Closeout regression: manifest prediction must validate the receipt in the
  exact source repository while applying lifecycle mutation only in its
  scratch clone.

## Rollback Point

- Commit / checkpoint: isolated `codex/evidence-ledger-genesis-authority` branch.
- Revert strategy: revert this package; no schema or ledger migration requires
  data rollback.
