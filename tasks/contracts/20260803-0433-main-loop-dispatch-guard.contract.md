# Task Contract: main-loop-dispatch-guard

> **Status**: Active
> **Plan**: plans/plan-20260803-0433-main-loop-dispatch-guard.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-08-03 04:33
> **Review File**: `tasks/reviews/20260803-0433-main-loop-dispatch-guard.review.md`
> **Notes File**: `tasks/notes/20260803-0433-main-loop-dispatch-guard.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The operator's model-routing hierarchy (orchestrator plans, execution subagents edit) is prompt-layer only; observed debug sessions ran with zero subagent dispatch while the main loop hand-edited code. Without a hard edit-layer boundary the routing contract does not bind, and orchestrator quota burns on execution work.

## Goal

`MainLoopDispatchGuard` in `src/cli/hook/mutation-guard.ts`: when env `REPO_HARNESS_MAIN_LOOP_EDIT_GUARD` is `1`/`true` and `HOOK_HOST=claude`, an Edit/Write whose payload lacks top-level `agent_id`/`agent_type` (main-loop call) targeting a code-extension file is denied via `structuredError` + exit 2 with a dispatch-to-fast-worker instruction; subagent calls and non-code paths pass through; unset env keeps the guard fully inert (product default off). Guard is a strong boundary (never trips open) and covers apply-patch expanded paths. Six regression cases in `tests/mutation-guard.test.ts` prove all of the above.

## Scope

- In scope: `src/cli/hook/mutation-guard.ts` guard + call site; six regression cases in `tests/mutation-guard.test.ts`; hook-generated architecture-sync artifacts that ride along.
- Out of scope: route-registry/matcher/adapter/installer changes, `.ai/harness/policy.json`, settings files, npm release/version bump, hunt SKILL.md.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If real Claude Code subagent Edit/Write payloads do NOT carry top-level `agent_id` (contrary to the official hooks docs verified 2026-08-03), the armed guard would block fast-worker edits too and deadlock delegation. Cheapest proof point: test case (b) (payload with `agent_id` passes); live confirmation is one armed-session subagent Write of a code file inside a git repo.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260803-0433-main-loop-dispatch-guard.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260803-0433-main-loop-dispatch-guard.review.md`
- Notes file: `tasks/notes/20260803-0433-main-loop-dispatch-guard.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

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
  - tasks/contracts/20260803-0433-main-loop-dispatch-guard.contract.md
  - tasks/reviews/20260803-0433-main-loop-dispatch-guard.review.md
  - tasks/notes/20260803-0433-main-loop-dispatch-guard.notes.md
  - .ai/context/capabilities.json
  - .claude/templates/
  - assets/hooks/
  - docs/architecture/
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
    - tasks/notes/20260803-0433-main-loop-dispatch-guard.notes.md
  tests_pass:
    - path: tests/mutation-guard.test.ts
    - path: tests/state/loop-semantics-characterization.test.ts
    - path: tests/session-state-authority.test.ts
  commands_succeed:
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: base `2b266f38` (release 0.12.2), branch `codex/main-loop-dispatch-guard`.
- Revert strategy: pre-merge, drop the branch/worktree; post-merge, revert the `src/cli/hook/mutation-guard.ts` and `tests/mutation-guard.test.ts` hunks; runtime kill-switch is unsetting `REPO_HARNESS_MAIN_LOOP_EDIT_GUARD` (guard fully inert).
