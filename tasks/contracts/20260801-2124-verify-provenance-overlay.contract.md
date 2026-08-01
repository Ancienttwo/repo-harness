# Task Contract: verify-provenance-overlay

> **Status**: Active
> **Plan**: plans/plan-20260801-2124-verify-provenance-overlay.md
> **Task Profile**: bugfix
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: ancienttwo
> **Capability ID**: root
> **Last Updated**: 2026-08-01 21:40
> **Review File**: `tasks/reviews/20260801-2124-verify-provenance-overlay.review.md`
> **Notes File**: `tasks/notes/20260801-2124-verify-provenance-overlay.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

`.ai/harness/checks/latest.json` claims to be a deterministic projection whose `provenance.content_hash` can be recomputed from the published file alone. The post-acceptance finalize overlay breaks that claim on every accept-then-final-verify window, so the published projection is not verifiable against itself and the live self-consistency check in `tests/evidence-projection-drift.test.ts` goes red for unrelated full-suite runs.

## Goal

`finalize_prepared_acceptance()` in `scripts/verify-sprint.sh` hands the canonical materializer a run trace carrying no materializer-owned `provenance` block, so the re-materialized `checks/latest.json` is `provenance.content_hash` self-consistent by construction, with the packaged helper mirror byte-identical and a regression test that fails on the unfixed overlay.

## Scope

- In scope:
  - The finalize overlay in `scripts/verify-sprint.sh` and its `assets/templates/helpers/verify-sprint.sh` mirror.
  - Regression coverage in `tests/evidence-projection-drift.test.ts`.
  - Removing the fulfilled deferred row from `tasks/todos.md`.
- Out of scope:
  - `src/effects/evidence/checks-materializer.ts`, `scripts/emit-verify-evidence.ts`, `scripts/acceptance-receipt.ts`.
  - Retroactively repairing already-emitted ledger events; the next verify run rematerializes.
- Taste constraints: <!-- advisory only, no run gate; default style/taste lives in AGENTS.md and the minimal-change policy, use this to record a per-task override -->

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.

## Falsifier

If a materialized `checks/latest.json` were still content_hash-inconsistent after a full prepare -> record -> finalize cycle on the fixed script, the embedding site named here would not be the only one. Cheapest proof point: on the newest `verify_sprint.result` event in `.ai/harness/evidence/events/log.jsonl`, the emitted `run_trace` must no longer have a `provenance` key.

## Root Cause Evidence

- root_cause: the finalize jq overlay at `scripts/verify-sprint.sh:547-563` reads the already-materialized `checks/latest.json` (run trace plus materializer-owned `provenance`) and re-emits it whole as the next event `run_trace`, so `contentHashOf(runTrace)` in `src/effects/evidence/checks-materializer.ts` hashes the stale `provenance` while the published file consumer-facing content excludes it.
- repro: `bun test tests/evidence-projection-drift.test.ts` in a worktree whose last verify ran the finalize path; measured on commit `62daea2e` / event `evt-01KYYJ74Z379ASFNG69S9TCY2A`, recorded `content_hash` `sha256:2840da08...` equals hash(run trace including stale provenance) while the published content hashes to `sha256:4447362b...`.
- regression_guard: tests/evidence-projection-drift.test.ts
- pre_fix_failure_artifact: tasks/notes/20260801-verify-provenance-overlay.pre-fix.log

## Workflow Inventory

- Source plan: `plans/plan-20260801-2124-verify-provenance-overlay.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260801-2124-verify-provenance-overlay.review.md`
- Notes file: `tasks/notes/20260801-2124-verify-provenance-overlay.notes.md`
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
  - plans/plan-20260801-2124-verify-provenance-overlay.md
  - tasks/todos.md
  - tasks/contracts/20260801-2124-verify-provenance-overlay.contract.md
  - tasks/reviews/20260801-2124-verify-provenance-overlay.review.md
  - tasks/notes/
  - scripts/verify-sprint.sh
  - assets/templates/helpers/verify-sprint.sh
  - tests/evidence-projection-drift.test.ts
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
    - scripts/verify-sprint.sh
    - assets/templates/helpers/verify-sprint.sh
  artifacts_exist:
    - tasks/notes/20260801-verify-provenance-overlay.pre-fix.log
    - tasks/notes/20260801-2124-verify-provenance-overlay.notes.md
  tests_pass:
    - path: tests/evidence-projection-drift.test.ts
  commands_succeed:
    - bun scripts/sync-helper-sources.ts --check
```

## Acceptance Notes (Human Review)

- Functional behavior: the finalize overlay emits a provenance-free run trace, so the next materialization is self-consistent.
- Edge cases: the overlay still rewrites `.guards[]` and `.next_step` unchanged; a machine without `jq` is unaffected, the overlay already refuses without it.
- Regression risks: none for already-published events; this worktree pre-existing `checks/latest.json` stays inconsistent until the next verify run rematerializes it.

## Rollback Point

- Commit / checkpoint: branch `codex/verify-provenance-overlay`, the single task-A commit.
- Revert strategy: `git revert` that commit; the overlay returns to re-emitting the projection whole.
