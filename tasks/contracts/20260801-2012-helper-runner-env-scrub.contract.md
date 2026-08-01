# Task Contract: helper-runner-env-scrub

> **Status**: Active
> **Plan**: plans/plan-20260801-2012-helper-runner-env-scrub.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-01 20:12
> **Review File**: `tasks/reviews/20260801-2012-helper-runner-env-scrub.review.md`
> **Notes File**: `tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The package-dispatched helper mechanism injects `REPO_HARNESS_*` wiring into its child environment (`src/cli/runtime/helper-runner.ts:375-391`). That set inherits down `verify-sprint.sh` -> `verify-contract.sh` -> a nested `bun test`, so the command a gate runs to produce evidence executes in a mutated environment. `REPO_HARNESS_TARGET_REPO_ROOT` alone overrides `tests/evidence-recovery-materializer.test.ts`'s temp-repo fixture isolation and turns a green suite red under the gate — the exact evidence inversion the gate exists to prevent.

## Goal

A bounded verifier command observes the project's real behaviour in a clean environment: `scripts/run-bounded-verifier-command.ts` strips every `REPO_HARNESS_`-prefixed variable from the spawned child's environment, whole-prefix rather than a curated subset, while every other variable passes through untouched. The helper-runner injection itself is unchanged — it is the legitimate contract of the helper dispatch mechanism.

## Scope

- In scope: child-env scrub in `scripts/run-bounded-verifier-command.ts`; its projection into `assets/templates/helpers/run-bounded-verifier-command.ts` via `bun scripts/sync-helper-sources.ts --write`; regression coverage in `tests/unit/verifier-evidence-lifecycle-cutover.test.ts`; retiring the deferred entry in `tasks/todos.md`.
- Out of scope: `src/cli/runtime/helper-runner.ts` (injection stays), `scripts/verify-sprint.sh`, `scripts/verify-contract.sh`, the existing `env -u BASH_ENV` guard, and the separately ledgered `checks/latest.json` provenance-overlay defect.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If the bounded runner itself, or any verification command that legitimately depends on harness wiring, needs a `REPO_HARNESS_*` variable to function, the whole-prefix scrub is wrong and the fix must move to a narrower boundary. Cheapest proof point: the runner reads no `REPO_HARNESS_*` variable (`rg 'process.env' scripts/run-bounded-verifier-command.ts` matched nothing before the change), and the full suite stays green.

## Root Cause Evidence

- root_cause: `scripts/run-bounded-verifier-command.ts:49` spawned the verification command with the inherited environment, so the `REPO_HARNESS_*` set that `src/cli/runtime/helper-runner.ts:375-391` injects into helper children reached the nested command and overrode fixture-local repo-root resolution.
- repro: with the six injected variables exported at gate-realistic values, `bun scripts/run-bounded-verifier-command.ts --deadline-ms <now+300s> --log <log> --result <result> -- bun test tests/evidence-recovery-materializer.test.ts` exits 1 with `12 pass / 1 fail` at `tests/evidence-recovery-materializer.test.ts:220`; the same command after the fix exits 0 with `13 pass / 0 fail` (observed 2026-08-01).
- regression_guard: tests/unit/verifier-evidence-lifecycle-cutover.test.ts
- pre_fix_failure_artifact: tasks/notes/20260801-env-scrub.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260801-2012-helper-runner-env-scrub.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260801-2012-helper-runner-env-scrub.review.md`
- Notes file: `tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md`
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
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260801-2012-helper-runner-env-scrub.contract.md
  - tasks/reviews/20260801-2012-helper-runner-env-scrub.review.md
  - tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md
  - tasks/notes/20260801-env-scrub.pre-fix.log
  - scripts/run-bounded-verifier-command.ts
  - assets/templates/helpers/run-bounded-verifier-command.ts
  - tests/unit/verifier-evidence-lifecycle-cutover.test.ts
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
  artifacts_exist:
    - tasks/notes/20260801-2012-helper-runner-env-scrub.notes.md
  tests_pass:
    - path: tests/unit/verifier-evidence-lifecycle-cutover.test.ts
  commands_succeed:
    - bun scripts/sync-helper-sources.ts --check
    - bash scripts/check-task-sync.sh
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: `143e36b0` (main at branch creation, branch `codex/helper-runner-env-scrub`)
- Revert strategy: revert the commit — the bounded runner returns to inheriting the full environment, restoring the leak but no other behaviour change.
