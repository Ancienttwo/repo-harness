> **Archived**: 2026-08-20 22:11
> **Related Plan**: plans/archive/plan-20260820-2049-coordination-wait-metrics.md
> **Outcome**: Completed
> **Lifecycle**: contract
> **Parent Run ID**: run-20260820-2211

# Task Contract: coordination-wait-metrics

> **Status**: Fulfilled
> **Plan**: plans/plan-20260820-2049-coordination-wait-metrics.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-20 20:49
> **Review File**: `tasks/reviews/20260820-2049-coordination-wait-metrics.review.md`
> **Notes File**: `tasks/notes/20260820-2049-coordination-wait-metrics.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The 2026-08-20 ship of `native-subagent-boundary-dedup` hit three mid-ship `main` advances and four gate rounds (~13 minutes re-freeze each) — real multi-agent serialization cost with zero measurement. `scripts/sprint-backlog.sh` has no timing anywhere (mkdir-spin lock at `acquire_backlog_lock()`, `:178-209`, default 0.1s × 100 attempts); `scripts/contract-worktree.sh` stamps `started_at` (`:920`, `:932`) but pairs no completion or duration. Without numbers, the sprint-split decision (tasks/todos.md instrumentation row) stays anecdote-driven — the exact zero-data trap `tasks/lessons.md` (2026-08-17) warns against. Verification duration needs NO new emission: `scripts/verify-contract.sh:588,597` already records `total_duration_ms` + per-check `duration_ms` into every `.ai/harness/runs/run-*-<contract>.json` (embedded via `scripts/verify-sprint.sh:1220,1333`).

## Goal

Append-only wait metrics at the two unmeasured coordination points, into `.ai/harness/runs/coordination/waits.jsonl` (gitignored runtime evidence): `acquire_backlog_lock()` emits one `backlog_lock_wait` record per acquisition (including uncontended; on timeout, before the existing `exit 1`), and `finish_worktree()` emits one `finish_attempt` record per attempt (`merged` | `refused_stale_fork` | `aborted`) with wall-clock ms from function entry. Zero behavior change on every existing path. Record shapes are frozen in the plan (`## Frozen decisions` 2–3).

## Scope

- In scope:
  - `scripts/sprint-backlog.sh` `acquire_backlog_lock()` (`:178-209`): epoch-ms bracket around the `until mkdir` loop; fields `verb`, `ms`, `attempts`, `reclaimed_stale`, `outcome: acquired|timeout`; JSONL append via local `json_escape()` + `printf '%s\n' >>` (the `scripts/workstream-sync.sh:304-305` idiom — no new shared helper, no lock file).
  - `scripts/contract-worktree.sh` `finish_worktree()` (`:1634-2031`): entry timestamp; `finish_attempt` emission at both stale-fork refusal sites (`:1769-1774`, `:1952-1958`), the `finish_transaction_abort` path, and the post-merge success point (`:2012`); fields `slug`, `ms`, `outcome`, `frozen_base`, `publication`.
  - Sync both `assets/templates/helpers/` twins via `bun scripts/sync-helper-sources.ts --write`.
  - Tests: extend `tests/sprint-backlog.test.ts` (one `backlog_lock_wait` record with `outcome:"acquired"`, integer `ms`/`attempts`, after a `start-task` fixture run — `existsSync`/`readFileSync` idiom per `tests/contract-run.test.ts:313-316`); extend an existing finish-driving test (`tests/contract-worktree-single-publication.test.ts` or the closest fixture) for `outcome:"merged"` and a stale-fork fixture for `outcome:"refused_stale_fork"`.
  - Rewrite the instrumentation row in `tasks/todos.md`: landed, split decision still deferred, revisit trigger = read the waits ledger after sustained multi-agent use.
- Out of scope:
  - Any change to lock mechanics, timeouts, retry counts, or finish gate semantics — measurement only.
  - Reader/aggregator/report command (unrequested until the split decision is actually being made); verification-duration emission (already covered structurally); sprint-file split itself; TS attempt-ledger reuse; new env knobs.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If timing/telemetry already exists on these paths, the slice is redundant. Cheapest proof: `grep -nE 'date \+%s|SECONDS|duration|elapsed' scripts/sprint-backlog.sh scripts/contract-worktree.sh` — verified zero matches beyond the two unpaired `started_at` stamps (explorer pass, 2026-08-20).

## Root Cause Evidence

Required when Task Profile is `bugfix`; leave as-is otherwise.

- root_cause: one sentence naming file:line/condition (testable, not "a state issue").
- repro: the command or UI path that reproduces the symptom.
- regression_guard: path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).
- pre_fix_failure_artifact: path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see the Root Cause Evidence Gate section in docs/reference-configs/sprint-contracts.md).

## Workflow Inventory

- Source plan: `plans/plan-20260820-2049-coordination-wait-metrics.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260820-2049-coordination-wait-metrics.review.md`
- Notes file: `tasks/notes/20260820-2049-coordination-wait-metrics.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Change Assessment

```json
{"protocol":1,"oracles":[{"id":"coordination-waits-deterministic-suite","kind":"deterministic_test","paths":["scripts/contract-worktree.sh","scripts/sprint-backlog.sh","tests/sprint-backlog.test.ts"]},{"id":"coordination-waits-ledger-readback","kind":"runtime_readback","paths":["scripts/contract-worktree.sh","scripts/sprint-backlog.sh"]}]}
```

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/
  - tasks/todos.md
  - tasks/contracts/20260820-2049-coordination-wait-metrics.contract.md
  - tasks/reviews/20260820-2049-coordination-wait-metrics.review.md
  - tasks/notes/20260820-2049-coordination-wait-metrics.notes.md
  - scripts/sprint-backlog.sh
  - scripts/contract-worktree.sh
  - assets/templates/helpers/sprint-backlog.sh
  - assets/templates/helpers/contract-worktree.sh
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
    - scripts/sprint-backlog.sh
    - scripts/contract-worktree.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260820-2049-coordination-wait-metrics.notes.md
  tests_pass:
    - path: tests/sprint-backlog.test.ts
    - path: tests/helper-scripts.test.ts
    - path: tests/contract-worktree-single-publication.test.ts
  commands_succeed:
    - bun run check:type
    - bun test --timeout 60000
    - bun src/cli/index.ts init --repo . --dry-run
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: worktree base (branch `codex/coordination-wait-metrics` fork point from `main`)
- Revert strategy: single revert removes the emission brackets; the ledger file is gitignored runtime evidence and needs no migration.
