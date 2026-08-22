# Task Contract: publication-receipt

> **Status**: Active
> **Plan**: plans/plan-20260822-1222-publication-receipt.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-22 12:23
> **Review File**: `tasks/reviews/20260822-1222-publication-receipt.review.md`
> **Notes File**: `tasks/notes/20260822-1222-publication-receipt.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Every later publication lifecycle, readiness, feedback, and fleet join depends on one durable PR-to-task identity. Today `ship-worktrees.sh` only echoes a PR URL and records the candidate SHA, so retries, branch cleanup, duplicate PRs, or cache loss can sever that join. WP0-A establishes the rebuildable immutable identity without touching lease semantics.

## Goal

Deliver `PublicationReceiptV1` as a strict canonical model with deterministic identity, atomic git-common-dir cache, full-payload PR marker, field-equivalent rebuild, typed partial-failure behavior, and enriched ship-journal evidence. Normal ship and explicit journal reconcile must converge on the same publication identity.

## Scope

- In scope: pure receipt/marker model; provider and cache effects; minimal CLI/helper rebuild surface; task-backed linked-worktree normal ship and ship-journal reconcile integration; receipt-specific Acceptance Script 2 tests; packaged helper sync.
- Coverage boundary: primary dirty-worktree maintenance closeout is out of scope because it has no authoritative task/claim lease to populate the mandatory receipt fields; it must not fabricate one.
- Out of scope: lease protocol/state changes; reviewing/reopen/takeover/abandon; publication integration reconcile; readiness; acquire/offers; feedback; MCP; UI/daemon; auto-merge; remote publication refs.
- Taste constraints: TypeScript owns validation and canonicalization; shell only orchestrates. Marker input is untrusted and cannot mutate leases. Missing authority fails closed; do not infer or add compatibility fallbacks. `COORDINATION_PROTOCOL` is immutable in this package.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if ship time cannot obtain authoritative task/claim/generation or evidence digests without inventing them. Cheapest proof: trace the existing active contract, coordination lease, acceptance/verification evidence, and merge-gate outputs before implementing the ship hook; if a required value has no authoritative source, stop rather than synthesize it.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260822-1222-publication-receipt.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260822-1222-publication-receipt.review.md`
- Notes file: `tasks/notes/20260822-1222-publication-receipt.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"publication-receipt-deterministic-contract","kind":"deterministic_test","paths":["src/core/publication/publication-receipt.ts","src/effects/publication/publication-receipt.ts","tests/unit/publication-receipt.test.ts"]},{"id":"publication-receipt-runtime-readback","kind":"runtime_readback","paths":["src/core/publication/publication-receipt.ts","src/effects/publication/publication-receipt.ts","tests/unit/publication-receipt.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260822-1222-publication-receipt.contract.md
  - tasks/reviews/20260822-1222-publication-receipt.review.md
  - tasks/notes/20260822-1222-publication-receipt.notes.md
  - .ai/context/capabilities.json
  - .archcontext/
  - .claude/templates/
  - assets/templates/helpers/ship-worktrees.sh
  - docs/architecture/
  - scripts/
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
    - docs/spec.md
    - src/core/publication/publication-receipt.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260822-1222-publication-receipt.notes.md
  tests_pass:
    - path: tests/unit/publication-receipt.test.ts
    - path: tests/contract-worktree-closeout-journal.test.ts
  commands_succeed:
    - bun test tests/unit/publication-receipt.test.ts --timeout 60000
    - bun test tests/contract-worktree-closeout-journal.test.ts --timeout 60000
    - bun run check:type
    - bun test --timeout 60000
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior: receipt/head/marker/cache/journal agree; deletion followed by rebuild is field-equivalent; retry is idempotent.
- Edge cases: existing PR adoption, duplicate/malformed marker, head mismatch, claim/generation mismatch, receipt write failure, marker update failure, crash before enriched journal phase.
- Regression risks: ship recovery phase compatibility and packaged helper drift; verify both authoritative and packaged helpers plus existing closeout-journal fixtures.

## Rollback Point

- Commit / checkpoint: branch `codex/publication-receipt` before WP0-B begins.
- Revert strategy: revert the WP0-A commit as one unit; receipt cache is rebuildable and may be deleted, while the prior PR body can be restored. No lease or task digest migration is involved.
