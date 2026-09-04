> **Archived**: 2026-09-05 02:27
> **Related Plan**: plans/archive/plan-20260905-0119-brc3-development-campaign-core.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260905-0227
> **Archive Projection V1**: `plans/plan-20260905-0119-brc3-development-campaign-core.md` => `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md`
> **Archive Projection V1**: `tasks/notes/20260905-0119-brc3-development-campaign-core.notes.md` => `tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0119-brc3-development-campaign-core.contract.md` => `tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0119-brc3-development-campaign-core.review.md` => `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md`

# Task Contract: brc3-development-campaign-core

> **Status**: Fulfilled
> **Plan**: plans/archive/plan-20260905-0119-brc3-development-campaign-core.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-05 01:19
> **Review File**: `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md`
> **Notes File**: `tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

BRC3 is the first uncompleted campaign slice. Without a host-bound payload, target-base policy, and crash-safe journal, later Issue authoring and adoption rows would have no trustworthy identity, activation ceiling, or replay authority.

## Goal

Deliver the bounded Campaign foundation: reuse `ProgramAuthorizationV1`, add a closed default-off policy, canonical definition/event/current contracts, a Git-common-dir append-only store serialized across processes, and an operator-only CLI surface.

## Scope

- In scope: the seven Task Breakdown items in the approved plan, including the BRC0 freeze transition and Development Campaign architecture capability.
- Out of scope: GitHub/GPT provider calls, Issue batch intent/reconciliation, Task or Work Graph materialization, Claim/Lease execution, PR creation, merge, Issue closure, cleanup, budget attempts, heartbeat scheduling, and canary activation.
- Taste constraints: reuse canonical message mechanics, host grant store, Git common-dir resolver, and exclusive directory lock; no generic campaign framework or compatibility parser.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If target-revision policy cannot be read independently from candidate bytes, or the existing lock cannot make identical cross-process appends converge, stop. Prove both with focused policy and contention tests before broader CLI verification.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md`
- Notes file: `tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"brc3-development-campaign-tests","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - .ai/harness/policy.json
  - docs/spec.md
  - docs/architecture/
  - docs/researches/
  - plans/
  - scripts/
  - tasks/todos.md
  - tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md
  - tasks/archive/review-20260905-0227-brc3-development-campaign-core.md
  - tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md
  - .ai/context/capabilities.json
  - .archcontext/model/
  - .claude/templates/
  - assets/
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
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md
  tests_pass:
    - path: tests/unit/development-campaign-core.test.ts
    - path: tests/unit/development-campaign-policy.test.ts
    - path: tests/effects/development-campaign-store.test.ts
    - path: tests/cli/development-campaign.test.ts
    - path: tests/characterization/repair-campaign-authority-freeze.test.ts
    - path: tests/unit/issue-282-automation-budget-prd-drift.test.ts
  commands_succeed:
    - bun run check:type
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bash scripts/check-task-workflow.sh --strict
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

- Functional behavior: exact host grant payload and target-base policy authorize a canonical event journal; reads rebuild projection from immutable events.
- Edge cases: off mode, disabled external source intake, expired/stale grant, over-limit payload, replay conflict, stale current, candidate policy relaxation, linked worktrees, and real process contention.
- Regression risks: `ProgramAuthorizationV1` gains one required nullable field; all in-repo producers and the schema source must move atomically, and old out-of-repo grant bytes intentionally fail closed rather than being guessed.

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
