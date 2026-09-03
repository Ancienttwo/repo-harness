# Task Contract: issue-282-automation-budget

> **Status**: Fulfilled
> **Plan**: plans/plan-20260903-0437-issue-282-automation-budget.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-03 04:37
> **Review File**: `tasks/reviews/20260903-0437-issue-282-automation-budget.review.md`
> **Notes File**: `tasks/notes/20260903-0437-issue-282-automation-budget.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

An unattended automation controller currently has stall protection but no machine-enforced cost ceiling: a goal that keeps making slow material progress can spend acquisitions, runner invocations, wall time and provider quota indefinitely. Prompt text such as "stop after N tokens" is not an enforcement mechanism, and summing totals after a provider call cannot prevent the next claim or dispatch. If this ships wrong, an unattended run either burns unbounded quota, or worse, silently under-counts a crashed operation and keeps spending against a ledger it knows is incomplete.

## Goal

Deliver one typed budget authority plus an append-only consumption ledger per automation run, with reserve-before-act enforcement under a per-budget lock, a frozen absolute wall-clock deadline, provider-verified-usage-only token/cost limits, idempotent single charging, typed reconciliation after a crash between reservation and usage append, strictest composition with contract-level runner budgets, and an immutable `AutomationStopReceiptV1` published on exhaustion, projected into a read-only operator surface.

## Scope

- In scope: `src/core/automation/` pure limits, composition, reservation evaluation, ledger fold, digests and board-slice projection; `src/effects/automation/` ledger store under `<git-common-dir>/repo-harness/automation-budget/v1/` with per-run lock, CAS current record, immutable reservations/usage events/reconciliations/stop receipt; `src/cli/commands/automation.ts` read-only budget projection; the PRD `ProgramBudgetLimitV1` / `ProgramBudgetEventV1` field extension that this implementation makes real; capability node, module doc, spec and deferred-goal ledger closure.
- Out of scope: the unattended controller loop itself (issue #279); provider usage extraction changes beyond reading already-verified usage evidence; task identity (`coordination-identity.ts`, #283), lease liveness (#286), attempt receipts (#287), acquire-next (#280) — those bind through typed nullable slots only; budget auto-renewal or auto-increase; an operator HTTP route or web UI surface.
- Taste constraints: fail closed with typed refusals; never synthesize a usage number the provider did not attest; no second authorization shape beside `ProgramAuthorizationV1`.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If two concurrent processes can each obtain a reservation that together exceed the same hard limit, or if a run that crashed between reservation and usage append can reserve again without an explicit evidence-bearing reconciliation, the reserve-before-act design is wrong and a post-hoc accounting design would be no worse. Cheapest proof point: the spawned two-worker contention test against a budget whose remaining acquisition headroom is exactly one.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260903-0437-issue-282-automation-budget.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260903-0437-issue-282-automation-budget.review.md`
- Notes file: `tasks/notes/20260903-0437-issue-282-automation-budget.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"issue-282-automation-budget","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - src/core/automation/
  - src/effects/automation/
  - src/cli/commands/automation.ts
  - src/cli/index.ts
  - tests/unit/issue-282-automation-budget-core.test.ts
  - tests/unit/issue-282-automation-budget-store.test.ts
  - tests/unit/issue-282-automation-budget-contention.test.ts
  - tests/unit/issue-282-automation-budget-e2e.test.ts
  # Widened during execution: adding capability.runtime-harness.automation-budget
  # changes the self-host node count and adds one protocol-owning core module, so
  # three existing closed-scan assertions have to be re-baselined with it.
  - tests/capability-archcontext-export.test.ts
  - tests/architecture-projection-e2e.test.ts
  - tests/unit/collaboration-authority-baseline.test.ts
  - plans/plan-20260903-0437-issue-282-automation-budget.md
  - plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md
  - docs/spec.md
  - docs/architecture/
  - .archcontext/model/
  - .ai/context/
  - AGENTS.md
  - CLAUDE.md
  - tasks/todos.md
  - tasks/contracts/20260903-0437-issue-282-automation-budget.contract.md
  - tasks/reviews/20260903-0437-issue-282-automation-budget.review.md
  - tasks/notes/20260903-0437-issue-282-automation-budget.notes.md
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
    - plans/plan-20260903-0437-issue-282-automation-budget.md
  artifacts_exist:
    - tasks/contracts/20260903-0437-issue-282-automation-budget.contract.md
    - tasks/reviews/20260903-0437-issue-282-automation-budget.review.md
    - tasks/notes/20260903-0437-issue-282-automation-budget.notes.md
  tests_pass:
    - path: tests/unit/issue-282-automation-budget-core.test.ts
    - path: tests/unit/issue-282-automation-budget-store.test.ts
    - path: tests/unit/issue-282-automation-budget-contention.test.ts
    - path: tests/unit/issue-282-automation-budget-e2e.test.ts
  commands_succeed:
    - bun test --timeout 60000
    - bun run check:type
    - bun run check:state-boundaries
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
    - bun scripts/inspect-project-state.ts --repo . --format text
    - bun src/cli/index.ts init --repo . --dry-run
# Optional exact-subject reuse is fail-closed and opt-in. List only deterministic
# criteria whose inputs are fully bound by the frozen subject/toolchain context.
# criterion_reuse:
#   tests_pass:
#     - path/to/deterministic.test.ts
#   commands_succeed:
#     - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
