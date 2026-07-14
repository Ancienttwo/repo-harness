# Task Contract: codex-delegation-auto-boundary

> **Status**: Active
> **Plan**: plans/plan-20260714-2026-codex-delegation-auto-boundary.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-14 20:26
> **Review File**: `tasks/reviews/20260714-2026-codex-delegation-auto-boundary.review.md`
> **Notes File**: `tasks/notes/20260714-2026-codex-delegation-auto-boundary.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Global Codex `delegation.mode=auto` currently injects the full contract-execution
packet on every user prompt. That turns standing permission to delegate into an
instruction to continue workflow execution, including when no active contract
exists or the user is asking for status or diagnosis. The result is scope drift,
unnecessary verification, and long-running work that the current prompt did not
request.

## Goal

Make Codex auto delegation a permission boundary rather than an unconditional
execution route. Only a valid active contract plus a deterministic execute or
verify prompt may receive contract-bound context; all other auto-mode prompts
bypass it. Preserve explicit delegation without claiming a nonexistent contract.

## Scope

- In scope:
  - Make the Codex delegation advisor validate active plan/contract state before
    emitting contract-bound context in auto mode.
  - Reuse `src/cli/hook/prompt-router.ts` as the deterministic execute/verify
    routing authority.
  - Preserve explicit delegation with permission-only context when no active
    contract exists.
  - Synchronize the product hook and self-host projection, add focused tests,
    update narrow runtime docs, and apply the reversible local explicit-mode
    operator mitigation.
- Out of scope:
  - Benchmark, verifier, CI, worktree, Claude hook/model routing, Codex model
    selection, global instruction rewrites, or unrelated cleanup.
- Taste constraints: no second intent classifier, compatibility path, semantic
  fallback, new configuration, telemetry, or broad refactor.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

The direction is wrong if auto mode can still emit `Treat the active task
contract ... as authoritative` without a valid contract, if status/diagnosis
prompts with an active contract still receive that packet, or if explicit
delegation without a contract stops working entirely. Focused hook tests are the
cheapest proof.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260714-2026-codex-delegation-auto-boundary.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260714-2026-codex-delegation-auto-boundary.review.md`
- Notes file: `tasks/notes/20260714-2026-codex-delegation-auto-boundary.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract pass, the review recommend pass, and `## External Acceptance Advice` pass or record a manual override.

## Allowed Paths

```yaml
allowed_paths:
  - docs/spec.md
  - docs/reference-configs/hook-operations.md
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  - plans/
  - tasks/todos.md
  - tasks/current.md
  - tasks/contracts/20260714-2026-codex-delegation-auto-boundary.contract.md
  - tasks/reviews/20260714-2026-codex-delegation-auto-boundary.review.md
  - tasks/notes/20260714-2026-codex-delegation-auto-boundary.notes.md
  - assets/hooks/codex-delegation-advisor.sh
  - .ai/hooks/codex-delegation-advisor.sh
  - .ai/hooks/.projection.json
  - src/cli/hook/prompt-router.ts
  - src/cli/hook/runtime.ts
  - tests/cli/hook.test.ts
  - tests/hook-contracts.test.ts
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    tool_calls: null
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
    - assets/hooks/codex-delegation-advisor.sh
    - .ai/hooks/codex-delegation-advisor.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260714-2026-codex-delegation-auto-boundary.notes.md
  tests_pass:
    - path: tests/cli/hook.test.ts
    - path: tests/hook-contracts.test.ts
  commands_succeed:
    - bun test tests/cli/hook.test.ts tests/hook-contracts.test.ts
    - bun run check:type
    - bun run check:hooks
    - bash scripts/check-task-sync.sh
    - bun src/cli/index.ts run check-task-workflow --strict
    - git diff --check
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
