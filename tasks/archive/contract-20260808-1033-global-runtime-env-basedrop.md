> **Archived**: 2026-08-08 10:33
> **Related Plan**: plans/archive/plan-20260808-0924-global-runtime-env-basedrop.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260808-1033

# Task Contract: global-runtime-env-basedrop

> **Status**: Fulfilled
> **Plan**: plans/plan-20260808-0924-global-runtime-env-basedrop.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-08 10:20
> **Review File**: `tasks/reviews/20260808-0924-global-runtime-env-basedrop.review.md`
> **Notes File**: `tasks/notes/20260808-0924-global-runtime-env-basedrop.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`commandEnv` in global-runtime carries the same base-dropping shape fixed in #169: npx-cache source with no caller env yields a single-key environment record that downstream consumers read as an environment (`withProcessEnv` key-swaps it; `readInstalledProfile` -> `installProfileStatePath` resolves `env.HOME ?? homedir()`), losing every caller lever. Masked today only because `homedir()` equals process-start HOME. Skipped, the proven-dangerous shape stays as a template for the next copy.

## Goal

`commandEnv` matches the #169 post-fix shape: non-npx callers get `env` through untouched (including `undefined`, whose downstream meaning — fall back to live `process.env` — is well-defined in every consumer); npx-with-flag returns env untouched; only the npx-no-flag branch bases on `process.env`. No signature change. `bindBunRuntimeEnv` gets the same disposition: fixed if it constructs a partial record consumed as an environment, or a verified-inert report in notes. Regression guard proves RED on unfixed code (artifact captured) and GREEN after. Full suite, typecheck, init dry-run green.

## Scope

- In scope: `src/cli/commands/global-runtime.ts` (`commandEnv`, `bindBunRuntimeEnv` disposition); regression guard in `tests/cli/global-runtime.test.ts`.
- Out of scope: signature/contract changes to `commandEnv` (undefined stays legal), `withProcessEnv`/`readInstalledProfile` behavior, init.ts (already fixed in #169), any other command surface.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If any consumer of `commandEnv`'s return distinguishes "single-key record" from "full env record" semantically (relies on the record being minimal), basing on `process.env` breaks it — cheapest proof point: enumerate the callers of `commandEnv` and every sink of its return value before editing.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `src/cli/commands/global-runtime.ts:271-277` — `commandEnv` builds `{ ...(env ?? {}) }` so an npx-cache source with no caller env produces a single-key record that downstream environment readers treat as the whole environment, dropping REPO_HARNESS_HOME/HOME levers.
- repro: with a home-override marker in `process.env`, drive the npx-cache setup-global path with no caller env — installed-profile/state resolution ignores the override (observable under an isolated fixture; masked in production only because homedir() equals process-start HOME).
- regression_guard: tests/cli/global-runtime.test.ts
- pre_fix_failure_artifact: .ai/harness/checks/pre-fix-global-runtime-env.log

## Workflow Inventory

- Source plan: `plans/plan-20260808-0924-global-runtime-env-basedrop.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260808-0924-global-runtime-env-basedrop.review.md`
- Notes file: `tasks/notes/20260808-0924-global-runtime-env-basedrop.notes.md`
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
  - tasks/contracts/20260808-0924-global-runtime-env-basedrop.contract.md
  - tasks/reviews/20260808-0924-global-runtime-env-basedrop.review.md
  - tasks/notes/20260808-0924-global-runtime-env-basedrop.notes.md
  - .ai/context/capabilities.json
  - .ai/harness/checks/
  - src/cli/commands/global-runtime.ts
  - tests/cli/
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
    - tasks/notes/20260808-0924-global-runtime-env-basedrop.notes.md
  tests_pass:
    - path: tests/cli/global-runtime.test.ts
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
