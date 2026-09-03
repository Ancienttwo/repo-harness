# Task Contract: refactor-provider-contract

> **Status**: Active
> **Plan**: plans/plan-20260904-0525-refactor-provider-contract.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-09-04 05:26
> **Review File**: `tasks/reviews/20260904-0525-refactor-provider-contract.review.md`
> **Notes File**: `tasks/notes/20260904-0525-refactor-provider-contract.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

ArchContext 0.5.2 is now the published structural authority for refactor scan, record, and verify. repo-harness still pins 0.4.7 and has no Refactor Mode provider boundary, so every provider-backed module remains unreachable. A permissive or duplicated adapter would let stale or malformed measurements enter the workflow under an incorrect repository identity.

## Goal

Consume exact `archctx@0.5.2` and `archctx-contracts@0.5.2` through a refactor-specific contract and effect adapter that reuses the existing package-local/runtime/process mechanics and fails closed on version, feature, request, result, head, or worktree mismatch.

## Scope

- In scope:
  - exact dependency and policy/template pin update to 0.5.2
  - stage-specific refactor feature policy while `mode=off`
  - scan, record, and verify contract validation and CLI adapter
  - focused provider fixtures and architecture-provider regression coverage
  - PRD/research correction from broken 0.5.1 assumptions to released 0.5.2 facts
- Out of scope:
  - proposal authoring, program state machine, routing, materialization, architecture intervention, board, and automatic mutation.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if the packaged 0.5.2 CLI cannot expose all four required refactor features or its request/result contracts cannot be validated without locally reimplementing classification semantics. Cheapest proof: clean-room `capabilities --json` plus the exported `archctx-contracts` invariant functions. Both passed during intake.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260904-0525-refactor-provider-contract.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260904-0525-refactor-provider-contract.review.md`
- Notes file: `tasks/notes/20260904-0525-refactor-provider-contract.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - docs/researches/20260902-restructure.md
  - docs/verification/axr5-archctx-clean-room-readback.json
  - docs/architecture/
  - AGENTS.md
  - CLAUDE.md
  - plans/prds/20260903-0435-archctx-backed-refactor-mode.prd.md
  - package.json
  - bun.lock
  - .ai/harness/policy.json
  - assets/
  - scripts/
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260904-0525-refactor-provider-contract.contract.md
  - tasks/reviews/20260904-0525-refactor-provider-contract.review.md
  - tasks/notes/20260904-0525-refactor-provider-contract.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
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
    - tasks/notes/20260904-0525-refactor-provider-contract.notes.md
  tests_pass:
    - path: tests/unit/refactor-provider-contract.test.ts
    - path: tests/refactor-archctx-provider.test.ts
    - path: tests/architecture-projection-provider.test.ts
  commands_succeed:
    - bun run check:type
    - bun test --timeout 60000
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
- Exact 0.5.2 stage handshake precedes every provider call; no local measurement or classification fallback exists.
- Edge cases:
- 0.4.x, broken/missing features, malformed envelopes, stale HEAD/worktree, and unsupported Node fail before data is returned.
- Regression risks:
- The shared exact package bump also advances architecture projection; its existing provider suite is an explicit gate.

## Rollback Point

- Commit / checkpoint:
- Branch point `f845bd4a` (Module 1 merge on main).
- Revert strategy:
- Revert this work-package PR as one unit; it has no persisted Refactor Program state and policy remains `off`.
