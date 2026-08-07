# Task Contract: init-command-env-basedrop

> **Status**: Active
> **Plan**: plans/plan-20260808-0054-init-command-env-basedrop.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-08 00:55
> **Review File**: `tasks/reviews/20260808-0054-init-command-env-basedrop.review.md`
> **Notes File**: `tasks/notes/20260808-0054-init-command-env-basedrop.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`initCommandEnv` silently discards the entire `process.env` for the child invocation on the npx-cache path when the caller passes no env — PATH, HOME, proxy settings, and any `REPO_HARNESS_HOME` override are all lost. This is real user-facing behavior for npx-invoked `init`, and it was the one hole the test-home-isolation preload could not defend (init family kept leaking a registry entry per run until a test-side workaround). Skipped, the same base-dropping shape invites copies.

## Goal

`initCommandEnv` bases the constructed environment on `process.env` when the caller provides none; callers passing explicit env keep exact current behavior. A regression guard proves RED on unfixed code (artifact captured) and GREEN after. Sibling `...(env ?? {})`-style base-dropping shapes in `src/` are fixed or reported. Full suite, typecheck, and init dry-run green.

## Scope

- In scope: `src/cli/commands/init.ts` `initCommandEnv`; sibling base-dropping shapes found by the class sweep in `src/`; regression guard in `tests/cli/init.test.ts`.
- Out of scope: the bare-spawn explicit-env lint guard (separate slice), preload changes, `tests/` beyond the guard, behavior of callers that already pass env.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If some caller depends on the child seeing a minimal environment (deliberate sanitization), basing on `process.env` would be a behavior break — cheapest proof point: enumerate `initCommandEnv` callers and check none relies on the empty-base shape (the function's own guard clause returns caller env untouched when set, so only the no-env npx path changes).

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/cli/commands/init.ts:194` — `initCommandEnv` returns `{ ...(env ?? {}), AGENTIC_DEV_LINK_INSTALLED_COPIES: "0" }` for an npx-cache source with no caller env, so the constructed child environment contains one key and `process.env` is discarded wholesale.
- repro: with `REPO_HARNESS_HOME` set in `process.env`, run an npx-cache-source `init` without passing env — the child resolves home via `homedir()` and writes to the real `~/.repo-harness` (observed as the init-family +1 registry leak per full-suite run that survived the isolation preload).
- regression_guard: tests/cli/init.test.ts
- pre_fix_failure_artifact: .ai/harness/checks/pre-fix-init-command-env.log

## Workflow Inventory

- Source plan: `plans/plan-20260808-0054-init-command-env-basedrop.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260808-0054-init-command-env-basedrop.review.md`
- Notes file: `tasks/notes/20260808-0054-init-command-env-basedrop.notes.md`
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
  - tasks/contracts/20260808-0054-init-command-env-basedrop.contract.md
  - tasks/reviews/20260808-0054-init-command-env-basedrop.review.md
  - tasks/notes/20260808-0054-init-command-env-basedrop.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/checks/
  - src/
  - tests/cli/
  - tests/continuation-conformance.test.ts
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
    - tasks/notes/20260808-0054-init-command-env-basedrop.notes.md
  tests_pass:
    - path: tests/cli/init.test.ts
  commands_succeed:
    - bun run check:type
    - bun test
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
