> **Archived**: 2026-08-29 11:06
> **Related Plan**: plans/archive/plan-20260829-0208-verify-contract-fail-closed.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260829-1106

# Task Contract: verify-contract-fail-closed

> **Status**: Fulfilled
> **Plan**: plans/plan-20260829-0208-verify-contract-fail-closed.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-29 02:08
> **Review File**: `tasks/reviews/20260829-0208-verify-contract-fail-closed.review.md`
> **Notes File**: `tasks/notes/20260829-0208-verify-contract-fail-closed.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`verify-contract.sh` is the exit-criteria gate for every contract in this repo and every downstream scaffolded repo. Its exit-criteria parser fails open: a one-space indent slip on `criterion_reuse:` silently promotes reuse-only commands into the executed criteria set (ME-1C ran the full test suite twice and the gate was killed by its supervisor timeout, ~2 hours lost) while never enabling reuse, with zero diagnostics. Separately, the shared `$(( $(now_ms) - started_ms ))` idiom in three helper scripts is shell-fatal under `set -u` when a polluted node/bun stdout emits a bare word; the worst site (`scripts/contract-worktree.sh:2169`) sits after merge publication with the rollback trap disarmed, so a crash orphans the worktree with no recovery path.

## Goal

Malformed `exit_criteria` / `criterion_reuse` shapes are rejected fail-closed with `failure_class="missing_artifact"` and a per-line error naming the offending line, instead of silently mutating the executed criteria set; non-numeric `now_ms` output can no longer shell-fatal any of the three helper scripts (telemetry emission is skipped or `total_duration_ms` is null instead); `scripts/` and `assets/templates/helpers/` copies stay byte-identical and `verify-contract.sh` joins the enforced byte-parity test list. Deferred ledger rows #45 (`now_ms` defensive delta) and #48 (exit-criteria parser fail-closed) in `tasks/todos.md` are closed.

## Scope

- In scope:
  - `scripts/verify-contract.sh` + `assets/templates/helpers/verify-contract.sh`: reject valueless header-shaped lines inside `exit_criteria:` that are not one of the 9 recognized section keys (rule A1); reject `criterion_reuse:` at non-zero indentation anywhere in the YAML block (rule A2); normalize a YAML trailing ` # comment` off every key/header line once and feed the normalized key to all key matchers (section dispatch, A1, A2, and the `criterion_reuse` parser) so a commented header cannot bypass them, leaving item lines and quoted `#` untouched; guard the `now_ms` arithmetic in `write_report` (null `total_duration_ms` on non-numeric input, never fatal) and validate the opening `now_ms` sample (a non-numeric start timestamp fails closed with a `verification_budget` report instead of running criteria without an enforceable deadline).
  - `scripts/sprint-backlog.sh` + mirror: guard `now_ms` arithmetic in `emit_backlog_lock_wait` (skip emission on non-numeric input) and make the opening sample in `acquire_backlog_lock` non-fatal and numeric-validated.
  - `scripts/contract-worktree.sh` + mirror: guard `now_ms` arithmetic in `emit_finish_attempt` (skip emission on non-numeric input) and make the opening sample in `finish_worktree` non-fatal and numeric-validated.
  - `tests/helper-scripts.test.ts`: regression tests for misindented `criterion_reuse` (fails closed, reuse-only command NOT executed twice), unknown section key (fails closed), preserved happy-path column-0 `criterion_reuse`, the same four shapes carrying a trailing ` # comment` (including the valid commented header that must still dispatch and the quoted-`#` item that must not be mangled), and polluted `now_ms` at both the closing sample (null `total_duration_ms`, never fatal) and the opening sample (structured fail-closed report).
  - `tests/sprint-claim-concurrency.test.ts`: add `verify-contract.sh` to the byte-parity file list.
  - `tasks/todos.md`: remove rows #45 and #48 at closeout.
- Out of scope:
  - `checks_failed` blocker split (row #24), Stop cascade cap (row #46), any `src/` change, any change to the finish/publication sequence, any new `failure_class` value, any parser rewrite outside the two rejection rules, any fallback timestamp source.
- Taste constraints: match the existing bash idiom of each script; keep the two parser loops' structure recognizable — this is a rejection hardening, not a rewrite.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if rule A1 rejects any existing fixture or template that is currently considered valid (report the collision instead of widening the accepted-key set on your own).

## Falsifier

If a currently-valid contract shape in `tests/helper-scripts.test.ts` fixtures or `assets/templates/contract.template.md` is rejected by rules A1/A2, the rejection rules are drawn too wide. Cheapest proof point: run the existing 18 `verify-contract` tests in `tests/helper-scripts.test.ts` before adding new ones.

## Root Cause Evidence

- root_cause: `scripts/verify-contract.sh:1128` section dispatch recognizes only 9 literal keys and silently ignores any other header-shaped line, so an indented `criterion_reuse:` leaves `$section` unchanged and its nested `commands_succeed:`/`tests_pass:` sub-headers re-trigger the top-level dispatch, appending reuse-only items into the executed arrays; the reuse parser at `:1238` matches `criterion_reuse:` only at column 0, so the reuse arrays stay empty.
- repro: run `verify-contract` against a fixture contract whose `criterion_reuse:` block is indented under `exit_criteria:`; the reuse-only command appears twice in executed `commands_succeed` and reuse stays disabled.
- regression_guard: tests/helper-scripts.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/pre-fix-verify-contract-fail-closed.log

## Workflow Inventory

- Source plan: `plans/plan-20260829-0208-verify-contract-fail-closed.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260829-0208-verify-contract-fail-closed.review.md`
- Notes file: `tasks/notes/20260829-0208-verify-contract-fail-closed.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"verify-contract-fail-closed-deterministic","kind":"deterministic_test","paths":["*"]}]}
```

## Acceptance Policy

```json
{"protocol":2,"reviewer":"Codex","source":"codex-review","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260829-0208-verify-contract-fail-closed.contract.md
  - tasks/reviews/20260829-0208-verify-contract-fail-closed.review.md
  - tasks/notes/20260829-0208-verify-contract-fail-closed.notes.md
  - scripts/verify-contract.sh
  - scripts/sprint-backlog.sh
  - scripts/contract-worktree.sh
  - assets/templates/helpers/verify-contract.sh
  - assets/templates/helpers/sprint-backlog.sh
  - assets/templates/helpers/contract-worktree.sh
  - tests/helper-scripts.test.ts
  - tests/sprint-claim-concurrency.test.ts
  - tests/cli/cross-review.test.ts
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
    - scripts/verify-contract.sh
    - assets/templates/helpers/verify-contract.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260829-0208-verify-contract-fail-closed.notes.md
    - .ai/harness/runs/pre-fix-verify-contract-fail-closed.log
  tests_pass:
    - path: tests/helper-scripts.test.ts
    - path: tests/sprint-claim-concurrency.test.ts
    - path: tests/contract-worktree-single-publication.test.ts
    - path: tests/sprint-backlog.test.ts
  commands_succeed:
    - bun run check:type
    - diff scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh
    - diff scripts/sprint-backlog.sh assets/templates/helpers/sprint-backlog.sh
    - diff scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh
    - bun test --timeout 60000
criterion_reuse:
  commands_succeed:
    - bun test --timeout 60000
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint:
- Revert strategy:
