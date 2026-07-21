# Task Contract: helper-source-path-env-leak

> **Status**: Active
> **Plan**: plans/plan-20260722-0308-helper-source-path-env-leak.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-22 03:09
> **Review File**: `tasks/reviews/20260722-0308-helper-source-path-env-leak.review.md`
> **Notes File**: `tasks/notes/20260722-0308-helper-source-path-env-leak.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`REPO_HARNESS_HELPER_SOURCE_PATH` exists so a helper script that may have been copied/adopted elsewhere can still learn its own true package-root identity when `$0` cannot be trusted. Every consumer of the `${REPO_HARNESS_HELPER_SOURCE_PATH:-$0}` pattern (and its if-based close variants) instead trusts the env var unconditionally, with no check that it actually names the running script's own identity. When a parent helper legitimately receives this var for itself (e.g. `verify-sprint.sh` under `repo-harness run verify-sprint`) and then spawns `bun test` through a wrapper (`env -u BASH_ENV bash --noprofile --norc -c "bun test"`) that does not strip it, every nested script the test suite spawns inherits the same leaked value. `tests/install-agent-fleet.test.ts` demonstrates the concrete failure: it forwards `{...process.env, HOME: home}` to the installer child, so the installer resolves `package_root` from the leaked `verify-sprint.sh` path (a real, valid package) instead of its own `$0` (the test's deliberately-bad packaged fixture) — 8 fail-closed assertions wrongly pass. Left unfixed, `repo-harness run verify-sprint --prepare-acceptance` cannot be trusted as Sprint C's acceptance machinery.

## Goal

Guard every consumer of the `${REPO_HARNESS_HELPER_SOURCE_PATH:-$0}` pattern (bash direct-assignment sites, bash if-based `helper_sibling()` sites, and the TypeScript analog) so the env var is honored only when it is plausibly the running script's own forwarded identity — an existing file whose basename equals the script's own basename (`$0`, `${BASH_SOURCE[0]}`, or `fileURLToPath(import.meta.url)`, whichever that file already uses as its self-reference) — otherwise fall back to the script's own path. Add a regression test that proves the fix with a decoy env var pointing at a different real helper, captured red-then-green.

## Scope

- In scope: the basename-of-self guard in `scripts/install-agent-fleet.sh` (anchor defect) and the twelve other consumers found by the repo-wide sweep (`check-agent-tooling.sh`, `ship-worktrees.sh`, `prepare-codex-handoff.sh`, `sprint-backlog.sh`, `contract-worktree.sh`, `workstream-sync.sh` (two sites), `ensure-task-workflow.sh`, `heartbeat-triage.sh`, `architecture-queue.sh`, `check-architecture-sync.sh`, `check-task-workflow.sh`, `capability-config.ts`); projecting all thirteen onto their `assets/templates/helpers/` twins via `bun run sync:helpers`; the new regression-guard test in `tests/install-agent-fleet.test.ts`; this package's lifecycle docs and pre-fix artifact.
- Out of scope: scrubbing or stripping `REPO_HARNESS_HELPER_SOURCE_PATH` anywhere in tests (masks the defect class instead of fixing it); changing `src/cli/runtime/helper-runner.ts`'s export behavior (it is the legitimate producer, not the bug); any benchmark/profile/scenario run, `--force`, push, or PR; registering this as a Sprint C backlog row (it is an out-of-band hotfix that unblocks Sprint C's own acceptance machinery).
- Taste constraints: match each file's existing self-identity idiom (`$0` vs `${BASH_SOURCE[0]}` vs `import.meta.url`) rather than introducing a new one; preserve each file's existing fallback tier structure (e.g. `check-task-workflow.sh`'s hardcoded-relative-path fallback) instead of collapsing it to a bare `$0` fallback.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the guard also rejects a legitimate same-basename adopted-copy forwarding case, the direction is wrong — several existing tests (`tests/heartbeat-triage.test.ts`, `tests/helper-scripts.test.ts`) already inject a same-basename decoy `REPO_HARNESS_HELPER_SOURCE_PATH` and must stay green. Cheapest proof point: rerun those exact test files after the fix and confirm no regression.

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: `scripts/install-agent-fleet.sh:37` `helper_source="${REPO_HARNESS_HELPER_SOURCE_PATH:-$0}"` trusts the env var unconditionally, with no check that it names the running script's own identity rather than an inherited/leaked one.
- repro: `REPO_HARNESS_HELPER_SOURCE_PATH=/Users/kito/.bun/install/global/node_modules/repo-harness/assets/templates/helpers/verify-sprint.sh bun test tests/install-agent-fleet.test.ts` → 10 pass / 8 fail, versus `env -u REPO_HARNESS_HELPER_SOURCE_PATH bun test tests/install-agent-fleet.test.ts` → 18 pass / 0 fail.
- regression_guard: tests/install-agent-fleet.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/helper-source-path-env-leak-pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260722-0308-helper-source-path-env-leak.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-0308-helper-source-path-env-leak.review.md`
- Notes file: `tasks/notes/20260722-0308-helper-source-path-env-leak.notes.md`
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
  - scripts/install-agent-fleet.sh
  - scripts/check-agent-tooling.sh
  - scripts/ship-worktrees.sh
  - scripts/prepare-codex-handoff.sh
  - scripts/sprint-backlog.sh
  - scripts/contract-worktree.sh
  - scripts/workstream-sync.sh
  - scripts/ensure-task-workflow.sh
  - scripts/heartbeat-triage.sh
  - scripts/architecture-queue.sh
  - scripts/check-architecture-sync.sh
  - scripts/check-task-workflow.sh
  - scripts/capability-config.ts
  - assets/templates/helpers/install-agent-fleet.sh
  - assets/templates/helpers/check-agent-tooling.sh
  - assets/templates/helpers/ship-worktrees.sh
  - assets/templates/helpers/prepare-codex-handoff.sh
  - assets/templates/helpers/sprint-backlog.sh
  - assets/templates/helpers/contract-worktree.sh
  - assets/templates/helpers/workstream-sync.sh
  - assets/templates/helpers/ensure-task-workflow.sh
  - assets/templates/helpers/heartbeat-triage.sh
  - assets/templates/helpers/architecture-queue.sh
  - assets/templates/helpers/check-architecture-sync.sh
  - assets/templates/helpers/check-task-workflow.sh
  - assets/templates/helpers/capability-config.ts
  - tests/install-agent-fleet.test.ts
  - plans/plan-20260722-0308-helper-source-path-env-leak.md
  - tasks/contracts/20260722-0308-helper-source-path-env-leak.contract.md
  - tasks/reviews/20260722-0308-helper-source-path-env-leak.review.md
  - tasks/notes/20260722-0308-helper-source-path-env-leak.notes.md
  - tasks/todos.md
  - .ai/harness/runs/helper-source-path-env-leak-pre-fix.log
  - .ai/harness/checks/latest.json
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
    - scripts/install-agent-fleet.sh
    - scripts/check-task-workflow.sh
    - scripts/capability-config.ts
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - .ai/harness/runs/helper-source-path-env-leak-pre-fix.log
    - tasks/notes/20260722-0308-helper-source-path-env-leak.notes.md
  tests_pass:
    - path: tests/install-agent-fleet.test.ts
  commands_succeed:
    - bun test
    - bun run check:helpers
    - repo-harness run check-task-workflow --strict
```

## Acceptance Notes (Human Review)

- Functional behavior: every consumer of the leak-prone pattern rejects an inherited env var whose basename does not match the running script's own identity, and falls back to its pre-existing self-reference exactly as if the var were unset.
- Edge cases: legitimate same-basename adopted-copy forwarding (existing tests) must keep working unchanged; a decoy pointing at a different real helper must be rejected even though the file exists.
- Regression risks: helper twins (`scripts/*` vs `assets/templates/helpers/*`) must stay byte-identical after `bun run sync:helpers`; `check-task-workflow.sh`'s existing hardcoded-relative-path fallback tier must be preserved, not replaced.

## Rollback Point

- Commit / checkpoint: the single helper-source-path-env-leak fix commit for this work-package.
- Revert strategy: revert the branch; no data migration, no schema.
