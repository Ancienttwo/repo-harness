> **Archived**: 2026-08-23 01:45
> **Related Plan**: plans/archive/plan-20260822-2240-merge-readiness-v1.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260823-0145

# Task Contract: merge-readiness-v1

> **Status**: Fulfilled
> **Plan**: plans/plan-20260822-2240-merge-readiness-v1.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-22 22:40
> **Review File**: `tasks/reviews/20260822-2240-merge-readiness-v1.review.md`
> **Notes File**: `tasks/notes/20260822-2240-merge-readiness-v1.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

WP0-A/B/C now establish immutable publication identity, one current reviewing pointer, and provider-fetched integration closeout, but there is no fenced answer to whether a current publication is safe for a human to merge. If readiness guesses from a stale local ref, a draft PR, moved head/base, or incomplete review/check evidence, WP2 offers and the later board would amplify a false merge recommendation. WP1 must create the read-only proof boundary before any acquisition or MCP transport consumes it.

## Goal

Implement PRD v3 Module 4 `MergeReadinessV1`: a deterministic, non-persisted verdict keyed by `publication_id` that joins the exact receipt/current pointer, canonical task revision, local effective verification/acceptance evidence, integration mode, and stable live GitHub PR/check/review/thread facts. Emit `ready:true` only when every required predicate passes; otherwise emit typed blockers with `attention_owner`, always carrying the expected head and base fences.

The blocker vocabulary is closed: user-owned `receipt_unavailable | publication_claim_mismatch | publication_pointer_mismatch | lease_not_reviewing | pr_not_open | draft | base_moved_since_verification | already_integrated`; agent-owned `review_subject_mismatch | verification_evidence_stale | acceptance_missing | checks_failed | task_revision_mismatch | head_moved | not_mergeable | changes_requested | unresolved_threads`; external-owned `required_reviews_missing | checks_pending | provider_unavailable | provider_data_incomplete | changed_during_read`. The top-level `attention_owner` reduces blockers in `user > agent > external` order and is `none` only when ready.

## Scope

- In scope: pure readiness schema/projection; bounded GitHub `identity -> facts -> identity` observation with one whole-round retry; receipt/pointer/canonical/effective-state/integration join; exact-publication and aggregate read-only JSON CLI; the PRD-required bare `--pr <n>` adoption entry that decodes and validates the live full-payload marker in memory and then enters the same publication-id path; focused fencing and provider-failure tests.
- Out of scope: WP2 offers/acquire/worktree/bind/MCP; feedback or Task Inbox; board columns; daemon/cache; auto-merge; lease/task/provider mutation; persisted readiness; merge-queue base-proof delegation without an existing explicit policy authority.
- Taste constraints: fail closed with a closed blocker vocabulary; reuse existing receipt, pointer, effective-state, canonical sprint, and merge-mode authorities; do not add compatibility aliases or a second provider/verification parser.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

Direction is wrong if GitHub cannot expose head-specific checks, review decision, unresolved review threads, draft/base/head identity, and mergeability without a write or unbounded pagination. Cheapest proof: a fixture `gh` adapter test must demonstrate the exact bounded response shapes before effect orchestration is accepted; missing authoritative fields become typed blockers rather than locally inferred replacements.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260822-2240-merge-readiness-v1.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260822-2240-merge-readiness-v1.review.md`
- Notes file: `tasks/notes/20260822-2240-merge-readiness-v1.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"merge-readiness-deterministic-contract","kind":"deterministic_test","paths":["src/core/publication/merge-readiness.ts","src/effects/publication/merge-readiness.ts","tests/unit/merge-readiness-v1.test.ts","tests/unit/merge-readiness-v1-effect.test.ts"]},{"id":"merge-readiness-runtime-readback","kind":"runtime_readback","paths":["src/effects/publication/merge-readiness.ts","src/cli/commands/publication.ts","src/cli/commands/fleet.ts","src/cli/index.ts","tests/unit/merge-readiness-v1-effect.test.ts"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260822-2240-merge-readiness-v1.contract.md
  - tasks/reviews/20260822-2240-merge-readiness-v1.review.md
  - tasks/notes/20260822-2240-merge-readiness-v1.notes.md
  - tasks/current.md
  - docs/architecture/.projection-manifest.json
  - src/core/publication/merge-readiness.ts
  - src/effects/publication/merge-readiness.ts
  - src/cli/commands/publication.ts
  - src/cli/commands/fleet.ts
  - src/cli/index.ts
  - tests/unit/merge-readiness-v1.test.ts
  - tests/unit/merge-readiness-v1-effect.test.ts
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
    - src/core/publication/merge-readiness.ts
    - src/effects/publication/merge-readiness.ts
    - tests/unit/merge-readiness-v1.test.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260822-2240-merge-readiness-v1.notes.md
  tests_pass:
    - path: tests/unit/merge-readiness-v1.test.ts
    - path: tests/unit/merge-readiness-v1-effect.test.ts
  commands_succeed:
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

- Functional behavior: exact publication and aggregate readiness are read-only projections; no `ready` authority is stored.
- Edge cases: draft, moved head/base, provider torn read/unavailable, stale local evidence, review/check/thread/mergeability blockers, revision and pointer drift.
- Regression risks: GitHub response shape drift and accidental reuse of post-merge reconciliation validation; both must fail closed and remain independently tested.

## Rollback Point

- Commit / checkpoint: pre-WP1 `183e6910`.
- Revert strategy: revert the WP1 merge unit; WP0 receipt/lifecycle/reconcile contracts remain valid.
