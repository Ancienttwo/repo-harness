# Task Contract: lease-protocol-2-lifecycle

> **Status**: Active
> **Plan**: plans/plan-20260822-1538-lease-protocol-2-lifecycle.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-22 15:38
> **Review File**: `tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md`
> **Notes File**: `tasks/notes/20260822-1538-lease-protocol-2-lifecycle.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The default linked-PR ship leaves the task lease in `completing`, a short crash-ambiguity state that cannot represent days of review. Without a schema-versioned `reviewing` state and exact publication pointer, takeover, feedback, readiness, and provider-driven reconcile either strand ownership or bypass claim/generation fencing.

## Goal

Ship Lease Owner Record Schema 2 and the explicit PR review lifecycle. A successful task-backed linked-PR ship enters `reviewing` only after marker-backed receipt plus `pr_observed` durability; reopen, takeover, abandon, and verified-only legacy migration are task-locked and pointer-fenced; ordinary steal/release/reconcile cannot bypass the lifecycle; `COORDINATION_PROTOCOL` remains `1`.

## Scope

- In scope: strict V1/V2 lease parsing/serialization; `reviewing` and `current_publication`; pure and task-locked enter/reopen/takeover/abandon transitions; immutable lineage; linked-PR journal wiring; board projection; legacy inspect and fully revalidated per-lease migration; focused and full verification.
- Out of scope: WP0-C recovery/provider reconcile, readiness, fleet acquire, feedback, Task Inbox V1, MCP, remote claims, liveness, auto-merge, and any task digest-domain change.
- Taste constraints: Fail closed. Reuse the canonical row parser, task lock, receipt validators, worktree topology reader, and bind sequence. No inferred identity, ref/worktree fallback, marker synthesis, or second authority.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if schema-1 owner fixtures no longer parse byte-equivalently, `COORDINATION_PROTOCOL` or digest vectors change, a markerless legacy PR can become reviewing, raw `contract-worktree finish --no-merge` enters reviewing before PR facts exist, or any command other than bind creates fresh bound execution fields. Check the pure transition/parser tests before shell integration.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260822-1538-lease-protocol-2-lifecycle.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md`
- Notes file: `tasks/notes/20260822-1538-lease-protocol-2-lifecycle.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"lease-protocol-2-deterministic-transitions","kind":"deterministic_test","paths":["src/core/state/coordination-identity.ts","src/core/publication/publication-lifecycle.ts","tests/coordination-identity.test.ts","tests/unit/publication-lifecycle.test.ts"]},{"id":"publication-reviewing-runtime-readback","kind":"runtime_readback","paths":["src/effects/publication/publication-lifecycle.ts","src/cli/commands/publication.ts","scripts/ship-worktrees.sh","tests/contract-worktree-closeout-journal.test.ts"]}]}
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
  - tasks/current.md
  - tasks/contracts/20260822-1538-lease-protocol-2-lifecycle.contract.md
  - tasks/reviews/20260822-1538-lease-protocol-2-lifecycle.review.md
  - tasks/notes/20260822-1538-lease-protocol-2-lifecycle.notes.md
  - .ai/context/capabilities.json
  - .archcontext/
  - .claude/templates/
  - assets/templates/helpers/ship-worktrees.sh
  - docs/architecture/
  - plans/prds/20260822-0405-fleet-acquire-publication-readiness.prd.md
  - scripts/ship-worktrees.sh
  - src/cli/commands/publication.ts
  - src/cli/commands/sprint.ts
  - src/cli/index.ts
  - src/core/publication/publication-lifecycle.ts
  - src/core/state/coordination-identity.ts
  - src/core/state/project-board.ts
  - src/core/state/types.ts
  - src/effects/publication/publication-lifecycle.ts
  - src/effects/publication/publication-receipt.ts
  - src/effects/state/coordination-lease-store.ts
  - tests/board-projection.test.ts
  - tests/board-slice.test.ts
  - tests/contract-worktree-closeout-journal.test.ts
  - tests/coordination-identity.test.ts
  - tests/coordination-lease-store.test.ts
  - tests/helper-scripts.test.ts
  - tests/sprint-claim-concurrency.test.ts
  - tests/unit/closeout-runner-guardrails.test.ts
  - tests/unit/publication-lifecycle.test.ts
  - tests/unit/publication-receipt.test.ts
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
    - src/core/publication/publication-lifecycle.ts
    - src/effects/publication/publication-lifecycle.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260822-1538-lease-protocol-2-lifecycle.notes.md
  tests_pass:
    - path: tests/coordination-identity.test.ts
    - path: tests/coordination-lease-store.test.ts
    - path: tests/sprint-claim-concurrency.test.ts
    - path: tests/board-projection.test.ts
    - path: tests/unit/publication-lifecycle.test.ts
    - path: tests/contract-worktree-closeout-journal.test.ts
  commands_succeed:
    - env -u CODEX_SESSION_ID bun test tests/coordination-identity.test.ts --timeout 60000
    - env -u CODEX_SESSION_ID bun test tests/coordination-lease-store.test.ts --timeout 60000
    - env -u CODEX_SESSION_ID bun test tests/sprint-claim-concurrency.test.ts --timeout 60000
    - env -u CODEX_SESSION_ID bun test tests/board-projection.test.ts --timeout 60000
    - env -u CODEX_SESSION_ID bun test tests/unit/publication-lifecycle.test.ts --timeout 60000
    - env -u CODEX_SESSION_ID bun test tests/contract-worktree-closeout-journal.test.ts --timeout 60000
    - env -u CODEX_SESSION_ID bun test tests/helper-scripts.test.ts --timeout 60000
    - cmp -s scripts/ship-worktrees.sh assets/templates/helpers/ship-worktrees.sh
    - bun run check:type
    - env -u CODEX_SESSION_ID bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
