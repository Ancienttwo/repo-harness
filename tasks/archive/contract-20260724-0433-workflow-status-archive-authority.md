> **Archived**: 2026-07-24 04:33
> **Related Plan**: plans/archive/plan-20260724-0324-workflow-status-archive-authority.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260724-0433

# Task Contract: workflow-status-archive-authority

> **Status**: Fulfilled
> **Plan**: plans/plan-20260724-0324-workflow-status-archive-authority.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-24 03:24
> **Review File**: `tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md`
> **Notes File**: `tasks/notes/20260724-0324-workflow-status-archive-authority.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Plan lifecycle semantics are split across one policy-owned known-status array
and three handwritten consumer lists. Separately, historical Completed
archives can only consume the current `checks/latest.json`, so frozen plans
cannot be closed using their own durable terminal evidence. The result is a
drift-prone status gate and 61 root plans that overstate active work.

## Goal

Make `.ai/harness/policy.json#active_plan` the sole plan-lifecycle authority,
project the mutation guard, transition validator, and terminal classifier from
it, add an explicit sealed-terminal historical archive mode requiring exactly
`contract=Fulfilled + review=pass + typed receipt projection`, classify all 61
current root plans, and archive only exact matches.

## Scope

- In scope:
  - policy lifecycle metadata plus packaged/generated mirrors;
  - the three named status consumers and their focused tests;
  - `archive-workflow` sealed-terminal mode plus template parity;
  - one deterministic historical-plan classifier and its audit output;
  - evidence-backed moves of exact AUTO rows only;
  - this package's plan, contract, review, notes, and deferred-ledger update.
- Out of scope:
  - rewriting frozen historical contracts/reviews, treating `Done`/`Active` as `Fulfilled`, accepting legacy prose as a typed receipt, changing PRD/sprint status semantics, or archiving active/blocked/user-owned/ambiguous work.
- Taste constraints: fail closed; no implicit historical fallback, schema
  translator, synthesized receipt, or second code-owned status union.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if a missing/malformed policy allows an edit or terminal
classification, if sealed mode accepts any artifact without the exact triple,
if default live Completed behavior changes, or if any AUTO classification
cannot name the exact contract, review, and typed receipt fields that prove it.
Cheapest proof: focused scratch-repo tests before any historical move.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260724-0324-workflow-status-archive-authority.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md`
- Notes file: `tasks/notes/20260724-0324-workflow-status-archive-authority.notes.md`
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
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/
  - tasks/reviews/
  - tasks/notes/
  - tasks/archive/
  - tasks/contracts/20260724-0324-workflow-status-archive-authority.contract.md
  - tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md
  - tasks/notes/20260724-0324-workflow-status-archive-authority.notes.md
  - .ai/harness/policy.json
  - .ai/harness/workflow-contract.json
  - .ai/hooks/.projection.json
  - .ai/hooks/lib/workflow-state.sh
  - assets/workflow-contract.v1.json
  - assets/hooks/lib/workflow-state.sh
  - assets/templates/helpers/archive-workflow.sh
  - assets/templates/helpers/check-task-workflow.sh
  - assets/templates/helpers/classify-historical-plans.ts
  - assets/templates/helpers/ensure-task-workflow.sh
  - scripts/archive-workflow.sh
  - scripts/check-task-workflow.sh
  - scripts/classify-historical-plans.ts
  - scripts/ensure-task-workflow.sh
  - scripts/lib/project-init-lib.sh
  - src/cli/hook/mutation-guard.ts
  - src/core/adoption/standard-plan.ts
  - tests/archive-evidence-gates.test.ts
  - tests/historical-plan-classifier.test.ts
  - tests/mutation-guard.test.ts
  - tests/plan-status-gate.test.ts
  - tests/runtime-profile-enforcement.test.ts
  - tests/skill-surface/retired-names-scan.test.ts
  - tests/state/loop-semantics-characterization.test.ts
  - tests/workflow-state-lib.test.ts
  - tests/helper-scripts.test.ts
  - .ai/harness/runs/20260724-0324-workflow-status-archive-authority/
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
    - scripts/classify-historical-plans.ts
    - tasks/notes/20260724-0324-workflow-status-archive-authority.notes.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/20260724-0324-workflow-status-archive-authority/full-test-third.log
  commands_succeed:
    - bun run check:type
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - repo-harness run check-task-workflow --strict
    - bash scripts/check-task-sync.sh
    - bun scripts/inspect-project-state.ts --repo . --format text
  manual_checks:
    - "bun test passes once against frozen product source with 2053 pass, 1 skip, 0 fail"
    - "bun src/cli/index.ts adopt --repo . --dry-run succeeds; it is run outside verify-contract because adopt is intentionally classified as an evidence producer"
```

## Acceptance Notes (Human Review)

- Functional behavior: all three status consumers project from policy lifecycle
  metadata; sealed historical archive is explicit and exact-triple only.
- Edge cases: missing policy, malformed projection, unknown status, missing
  contract/review, non-Fulfilled contract, non-pass review, incomplete or
  placeholder receipt, ambiguous artifact resolution, zero AUTO rows.
- Regression risks: changing default live Completed semantics, template drift,
  or moving a plan whose durable evidence is incomplete.

## Rollback Point

- Commit / checkpoint: branch forked from `96c908f7`.
- Revert strategy: revert the bounded package and any audit-backed renames; no
  external state, data migration, or compatibility layer exists.
