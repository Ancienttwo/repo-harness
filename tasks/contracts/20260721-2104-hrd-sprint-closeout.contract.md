# Task Contract: hrd-sprint-closeout

> **Status**: Fulfilled
> **Plan**: plans/plan-20260721-2104-hrd-sprint-closeout.md
> **Task Profile**: ledger-closeout
> **Workflow Profile**: strict
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-21 21:04
> **Review File**: `tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md`
> **Notes File**: `tasks/notes/20260721-2104-hrd-sprint-closeout.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

HRD-01 through HRD-09 are merged and the canonical backlog is 9/9 complete,
but the Hook Runtime Diet sprint header remains `Approved`. That leaves the
Program transition into VGBR/EPC ambiguous. The HRD-08 and HRD-09 archived
reviews also retain historically accurate pre-merge pending language; changing
those archived bytes would falsify history. This package closes only the
lifecycle ledger and records the later superseding merge fact in a new
append-only annotation.

## Goal

Set the canonical Hook Runtime Diet sprint to `Done`, record PR #106's immutable
implementation merge as `HRD_RUNTIME_SHA`, and preserve both archived review
files byte-for-byte. This package must not predict or write its own merge SHA.
After merge, the next VGBR contract must fresh-fetch `origin/main`, pin the
actual HRD-CLOSEOUT merge commit as `POST_HRD_SHA`, and consume that exact SHA
while `main` remains frozen through benchmark acceptance.

## Scope

- In scope:
  - `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`: status and
    append-only closeout metadata only.
  - This package's plan, contract, notes, and review.
  - Provider-free contract/workflow/scope/hash/merge-seal evidence.
- Out of scope:
  - Any edit to the archived HRD-08 or HRD-09 review, plan, contract, or notes.
  - `tasks/current.md`, `tasks/todos.md`, and every BDD2 artifact.
  - Runtime `src/`, tests, hooks, assets, benchmark runner/reports, VGBR
    execution, EPC canonicalization/implementation, and SSD activation.
  - Full `bun test`, provider review, authoritative benchmark, publish, deploy,
    or any compatibility/fallback path.
- Taste constraints: preserve historical evidence; add the smallest explicit
  lifecycle projection and fixed-order annotation needed to close HRD.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop if either archived review hash changes from the frozen values below.
- Stop on any BDD2 path overlap, runtime/test/benchmark edit, or compatibility
  request.
- Stop if `origin/main` moves before the closeout subject and local merge seal
  are frozen.
- After closeout merge, fail closed on any `main` merge until VGBR acceptance;
  BDD2 may continue development only in its independent worktree.
- Stop after three fail-fix-reverify rounds for one issue.

## Falsifier

The direction is wrong if sprint closeout requires changing runtime behavior,
benchmark evidence, historical review bytes, or any path outside the exact
allowlist. Cheapest proof: hash the two archived reviews before lifecycle edits
and require the same hashes at final verification.

## Root Cause Evidence

Not applicable: this is a `ledger-closeout`, not a bugfix.

## Workflow Inventory

- Source plan: `plans/plan-20260721-2104-hrd-sprint-closeout.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md`
- Notes file: `tasks/notes/20260721-2104-hrd-sprint-closeout.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed AcceptanceReceipt under the frozen policy below, then run `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Codex","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260721-2104-hrd-sprint-closeout.md
  - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
  - tasks/contracts/20260721-2104-hrd-sprint-closeout.contract.md
  - tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md
  - tasks/notes/20260721-2104-hrd-sprint-closeout.notes.md
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
    runner_invocations: 1
    wall_time_minutes: 30
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
    - plans/plan-20260721-2104-hrd-sprint-closeout.md
    - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
    - tasks/contracts/20260721-2104-hrd-sprint-closeout.contract.md
    - tasks/reviews/20260721-2104-hrd-sprint-closeout.review.md
    - tasks/notes/20260721-2104-hrd-sprint-closeout.notes.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260721-2104-hrd-sprint-closeout.notes.md
  tests_pass:
  commands_succeed:
    - repo-harness run check-task-workflow --strict
    - git diff --check
    - test "$(shasum -a 256 tasks/archive/review-20260721-1746-hrd-08-event-telemetry-and-benchmark.md | awk '{print $1}')" = "5b4a91d186fd02b38dac4618a48a38fc016840a961e1a057918e8e8dcf8c25f9"
    - test "$(shasum -a 256 tasks/archive/review-20260721-2035-hrd-09-legacy-retirement-and-adopted-migration.md | awk '{print $1}')" = "54e2d4ddf9c4c3b2b1538d0d7b5259f02c6d60322975a3de533d4feb0b0917ed"
  qa_scores:
    - dimension: functionality
      min: 9
    - dimension: code quality
      min: 9
  manual_checks:
    - "HRD sprint Status is Done and all nine backlog rows remain checked"
    - "Historical Closeout Annotation records PR #106 without rewriting archived review text"
    - "Changed paths are exactly the sprint plus this package's four workflow artifacts"
    - "HRD_RUNTIME_SHA is b5a98c90, this package does not predict its merge SHA, and VGBR must successor-pin POST_HRD_SHA after fresh fetch"
```

## Acceptance Notes (Human Review)

- Functional behavior: no runtime behavior changes; HRD lifecycle becomes Done.
- Edge cases: archived pending prose remains historical and is superseded only
  through the new annotation.
- Regression risks: `origin/main` movement after closeout merge invalidates the
  VGBR start gate; main must freeze until VGBR benchmark acceptance. BDD2 may
  continue off-main but cannot merge during that quiescence window.

## Rollback Point

- Commit / checkpoint: implementation merge
  `b5a98c903d3728002d2f663ba7a1b421913e368f`; closeout merge SHA is assigned
  only after the PR merges.
- Revert strategy: revert only the HRD-CLOSEOUT PR. Runtime, tests, benchmark
  evidence, receipts, and archived HRD reviews remain unchanged.
