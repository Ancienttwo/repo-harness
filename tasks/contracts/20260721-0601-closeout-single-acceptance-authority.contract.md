# Task Contract: closeout-single-acceptance-authority

> **Status**: Active
> **Plan**: plans/plan-20260721-0601-closeout-single-acceptance-authority.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-21 07:28
> **Review File**: `tasks/reviews/20260721-0601-closeout-single-acceptance-authority.review.md`
> **Notes File**: `tasks/notes/20260721-0601-closeout-single-acceptance-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Closeout currently treats the recorded external acceptance and `merge-gate`'s
second Claude invocation as two independent semantic authorities. That repeats
private-diff transfer and provider cost, makes a legitimate typed user waiver
impossible, and couples non-overlapping target movement to another semantic
review. If this ships wrong, closeout can either accept stale semantic work or
continue paying the same duplicate review/test/CI cost before HRD-08.

## Goal

Establish one structured `AcceptanceReceipt` for semantic acceptance and one
provider-free exact local merge seal. `external_pass`, `user_waiver`, and
`reject` remain distinct; reviewer identity is frozen in the contract; review
Markdown is projection only; semantic change or target overlap invalidates the
receipt; lifecycle-only change and non-overlapping target movement do not.

## Scope

- In scope: CI trigger/concurrency waste guardrails; base-fetch/freeze ordering;
  merge-gate timeout; strict acceptance policy/receipt helper; receipt
  projection; verify-sprint/finish/ship cutover; provider-free local seal;
  removal of obsolete merge-gate Claude runtime; helper/hook/template/docs and
  test projections.
- Out of scope: HRD-08/09 implementation; changing Codex safety approval;
  merging or editing the concurrent `solo-operator-acceptance-policy` worktree;
  legacy prose/receipt compatibility reads; automatic merge authorization.
- Taste constraints: one semantic authority, one subject authority, no fallback
  reviewer, no provider retry loop, and no silent waiver-to-pass translation.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if normalized review-subject exclusions allow a semantic path to escape
  invalidation, or if the same closeout fixture can invoke a provider twice.
- Stop if the concurrent solo-operator branch lands on `main`; rebase and remove
  the superseded authority before continuing rather than merge both.

## Falsifier

A fixture where a review-only change alters the normalized subject, a semantic
change leaves it unchanged, or target overlap remains zero after a reviewed path
changes falsifies the design. The cheapest proof is the focused
`tests/acceptance-receipt.test.ts` subject/overlap matrix.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260721-0601-closeout-single-acceptance-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260721-0601-closeout-single-acceptance-authority.review.md`
- Notes file: `tasks/notes/20260721-0601-closeout-single-acceptance-authority.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion uses the new cutover directly: `verify-sprint`, finish, and ship
  consume the same structured AcceptanceReceipt and never parse review prose as
  authority.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .github/workflows/ci.yml
  - .ai/harness/policy.json
  - .ai/harness/workflow-contract.json
  - .ai/hooks/.projection.json
  - .ai/hooks/lib/workflow-state.sh
  - .ai/hooks/prompt-guard.sh
  - assets/hooks/lib/workflow-state.sh
  - assets/hooks/prompt-guard.sh
  - assets/templates/contract.template.md
  - assets/templates/review.template.md
  - .claude/templates/contract.template.md
  - .claude/templates/review.template.md
  - assets/templates/helpers/
  - assets/workflow-contract.v1.json
  - assets/skills/merge-gate/
  - docs/reference-configs/agentic-development-flow.md
  - docs/reference-configs/contract-brief-example.md
  - docs/reference-configs/contract-brief-example-bugfix.md
  - docs/reference-configs/external-tooling.md
  - docs/reference-configs/hook-operations.md
  - docs/reference-configs/sprint-contracts.md
  - docs/architecture/modules/workflow-engine/contract-assets.md
  - assets/reference-configs/agentic-development-flow.md
  - assets/reference-configs/external-tooling.md
  - assets/reference-configs/hook-operations.md
  - assets/reference-configs/sprint-contracts.md
  - plans/plan-20260721-0601-closeout-single-acceptance-authority.md
  - tasks/todos.md
  - tasks/contracts/20260721-0601-closeout-single-acceptance-authority.contract.md
  - tasks/reviews/20260721-0601-closeout-single-acceptance-authority.review.md
  - tasks/notes/20260721-0601-closeout-single-acceptance-authority.notes.md
  - scripts/acceptance-receipt.ts
  - scripts/archive-workflow.sh
  - scripts/check-task-workflow.sh
  - scripts/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - scripts/plan-to-todo.sh
  - scripts/contract-worktree.sh
  - scripts/harness-trace-grade.sh
  - scripts/merge-gate.ts
  - scripts/ship-worktrees.sh
  - scripts/verify-contract.sh
  - scripts/verify-sprint.sh
  - src/cli/commands/init.ts
  - src/cli/commands/global-runtime.ts
  - src/cli/runtime/helper-runner.ts
  - src/core/state/project-effective-state.ts
  - src/effects/review/diff-fingerprint.ts
  - src/effects/state/resolve-effective-state.ts
  - tests/acceptance-receipt.test.ts
  - tests/merge-gate.test.ts
  - tests/state/project-effective-state.test.ts
  - tests/state/effective-state-fixture.ts
  - tests/state/fixtures/
  - tests/state/loop-semantics-characterization.test.ts
  - tests/state/project-effective-state.test.ts
  - tests/helper-scripts.test.ts
  - tests/workflow-state-lib.test.ts
  - tests/unit/closeout-runner-guardrails.test.ts
  - tests/cli/init.test.ts
  - tests/cli/global-runtime-init.test.ts
  - tests/contract-run.test.ts
  - tests/workflow-contract.test.ts
  - tests/bootstrap-files.test.ts
  - tests/hook-contracts.test.ts
  - tests/scaffold-parity.test.ts
  - tests/hook-runtime.test.ts
  - tests/archive-evidence-gates.test.ts
  - tests/fixtures/harness-traces/
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
    - docs/spec.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260721-0601-closeout-single-acceptance-authority.notes.md
  tests_pass:
    - path: tests/acceptance-receipt.test.ts
    - path: tests/merge-gate.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/workflow-state-lib.test.ts
    - path: tests/unit/closeout-runner-guardrails.test.ts
  commands_succeed:
    - bun run check:hooks
    - bun run check:helpers
    - bun run check:type
  manual_checks:
    - "A complete closeout fixture records exactly one provider invocation and no duplicate final verification for the same subject"
    - "user_waiver remains distinct from external_pass and succeeds only when the contract allows it"
    - "review-only and lifecycle-only changes preserve acceptance; semantic changes and overlapping target movement invalidate it"
    - "one PR commit matches only the pull_request CI trigger, not a codex branch push trigger"
```

## Acceptance Notes (Human Review)

- Functional behavior: one typed acceptance receipt plus one exact local seal.
- Edge cases: reject, forbidden waiver, malformed policy/receipt, review-only
  change, semantic change, target overlap zero/nonzero, lifecycle archive, base
  movement between finish and push.
- Regression risks: helper/source mirror drift; concurrent solo-operator work
  must not land.

## Rollback Point

- Commit / checkpoint: execution base `5e10ce8177e832978ad2bd42b49e5ed74e58342c`.
- Revert strategy: revert the single PR before HRD-08, delete host-state runtime
  receipts/seals, and recreate any downstream contract; do not add dual reads.
