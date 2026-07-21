# Task Contract: vgbr-benchmark-runner-subject-immutability

> **Status**: Verified
> **Plan**: plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md
> **Task Profile**: bugfix
> **Workflow Profile**: strict
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Program**: Sprint C (Evidence & Projection Convergence) backlog row 2 `vgbr-rf` — `plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`
> **Base SHA**: `e4f649536097e29e3c686666567c0f9f2d133b7b` (`origin/main`, fetched and rebased onto 2026-07-22)
> **Target Branch**: `main`
> **PR Unit**: `codex/vgbr-benchmark-runner-subject-immutability` (this branch; not yet opened as a PR)
> **Last Updated**: 2026-07-22 01:18
> **Review File**: `tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md`
> **Notes File**: `tasks/notes/20260721-2237-vgbr-benchmark-runner-subject-immutability.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

The sole post-HRD VGBR attempt completed all 27 provider arms but could not be
accepted because profile preparation changed two authoritative source modes
from `0755` to `0777` while Git remained clean.  The producer sampled its
subject only after that mutation, so the report was internally valid for the
wrong subject.  Without a runner-level immutability boundary, every later VGBR
or EPC comparison can silently bind to producer-modified source instead of the
frozen checkout it claims to evaluate.

## Goal

Make the authoritative profile benchmark capture one immutable initial source
commit and subject before any preparation, install the runtime from one
external hash-checked package artifact, reject subject drift both before the
first provider and after the last arm, and bind the report only to the initial
authority.  Prove the original `core.filemode=false` mode-drift failure with a
regression test.  Do not run a provider benchmark or change canonical reports
in this package.

## Scope

- In scope:
  - `scripts/run-harness-profile-benchmark.ts`: initial authority capture,
    one external `npm pack --ignore-scripts` artifact, installed-CLI profile
    projection, pre-provider/post-run drift guards, and initial report binding.
  - `tests/harness-benchmark-matrix.test.ts`: pre-fix regression and focused
    artifact/command/phase-boundary coverage.
  - This package's own plan, contract, notes, and review.
- Out of scope:
  - The prior invalid report bytes, canonical `profile-comparison.*`, a new
    provider matrix, report regrade/rebind, manifests, scenarios, or fixtures.
  - `src/**`, `assets/**`, CLI product contracts, HRD semantics, BDD2 files,
    EPC/SSD implementation, `tasks/current.md`, and `tasks/todos.md`.
  - Mode normalization, post-hoc `chmod`, copied-source fallback, alternate
    install semantics, report protocol/schema changes, or compatibility code.
- Non-goals: this package does not run, validate, or accept a new authoritative
  VGBR provider matrix; that is `vgbr-r` (Sprint C backlog row 3), a separate
  approved contract that starts only after this package merges and its exact
  merge SHA is re-fetched and pinned as `VGBR_BASELINE_SHA`.
- Taste constraints: preserve one source/subject authority and fail closed;
  the runner may consume an external immutable artifact but must never repair
  or reinterpret the authoritative checkout.

## Stop Conditions

- Stop and hand back to the parent if the change would require editing a path outside Allowed Paths.
- Stop if an Exit Criteria command cannot be run in this environment.
- Stop if Goal, Scope, or Exit Criteria are internally contradictory.
- Stop on any write overlap with BDD2 or another runner/test owner.
- Stop if a pack lifecycle script is required, the artifact is created inside
  the authoritative source root, or any install command references that root.
- Stop if profile preparation changes any initial subject component, even when
  `git status` stays clean.
- Stop if the fix would require accepting or editing the consumed VGBR report.
- Stop after three fail-fix-reverify rounds for one issue.

## Falsifier

The design is wrong if Bun cannot install and execute the packed runtime without
reading or mutating the authoritative source checkout, or if the installed CLI
requires the tarball after installation.  Cheapest proof: a focused disposable
profile-preparation smoke using an isolated `BUN_INSTALL`, followed by subject
and tarball hash equality checks before any provider process exists.

## Root Cause Evidence

- root_cause: `scripts/run-harness-profile-benchmark.ts:607-620,1185-1225` prepares profiles by installing directly from authoritative `ROOT`, then samples `benchmarkSubject()` only after all arms, allowing a Git-clean `0755 -> 0777` source mutation to become the reported authority.
- repro: `BUN_INSTALL=<isolated> bun add -g <clean-checkout>` changes `src/cli/index.ts` and `src/cli/hook-entry.ts` from `0755` to `0777` while `git -c core.filemode=false status --porcelain` remains empty; the pre-run and post-run subject hashes differ.
- regression_guard: tests/harness-benchmark-matrix.test.ts
- pre_fix_failure_artifact: .ai/harness/runs/vgbr-benchmark-runner-subject-immutability-pre-fix.log

## Concurrency & Ownership

- Program registration: Sprint C (`Evidence & Projection Convergence`,
  `plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`)
  backlog row 2, task `vgbr-rf`. This contract is that row's execution slice;
  the sprint file is the Program contract-of-record and this package never
  edits it.
- Layer 1 (repository ownership, Program Rule R2): `allowed_paths` below
  intersect no other active package's `allowed_paths`. No `vgbr-r`/EPC row has
  started; none owns `scripts/run-harness-profile-benchmark.ts` or
  `tests/harness-benchmark-matrix.test.ts`.
- Layer 2 (verification subject, Program Rule R2/R3): merging this package
  neither opens nor closes the VGBR subject-quiescence freeze. That freeze
  begins only when the successor `vgbr-r` contract pins `VGBR_BASELINE_SHA`
  after a fresh post-merge fetch; this package may merge before that freeze
  opens and carries no freeze obligation of its own.
- No-compatibility declaration (Program Rule R5 / repo-wide no-compat rule):
  this package replaces the direct-`ROOT` install path outright. It adds no
  alias, dual read/write, semantic fallback, or steady-state migration shim;
  the retired install call site is deleted in the same commit that adds the
  packed-artifact path.

## Workflow Inventory

- Source plan: `plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md`
- Notes file: `tasks/notes/20260721-2237-vgbr-benchmark-runner-subject-immutability.notes.md`
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
  - plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md
  - tasks/contracts/20260721-2237-vgbr-benchmark-runner-subject-immutability.contract.md
  - tasks/reviews/20260721-2237-vgbr-benchmark-runner-subject-immutability.review.md
  - tasks/notes/20260721-2237-vgbr-benchmark-runner-subject-immutability.notes.md
  - .ai/harness/runs/vgbr-benchmark-runner-subject-immutability-pre-fix.log
  - scripts/run-harness-profile-benchmark.ts
  - tests/harness-benchmark-matrix.test.ts
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
    runner_invocations: 6
    wall_time_minutes: 90
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
    - scripts/run-harness-profile-benchmark.ts
    - tests/harness-benchmark-matrix.test.ts
    - plans/plan-20260721-2237-vgbr-benchmark-runner-subject-immutability.md
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260721-2237-vgbr-benchmark-runner-subject-immutability.notes.md
  files_contain:
    - path: scripts/run-harness-profile-benchmark.ts
      pattern: "assertBenchmarkSubjectUnchanged"
    - path: scripts/run-harness-profile-benchmark.ts
      pattern: "--ignore-scripts"
    - path: scripts/run-harness-profile-benchmark.ts
      pattern: "--no-cli"
  tests_pass:
    - path: tests/harness-benchmark-matrix.test.ts
  commands_succeed:
    - bun test
    - bun run check:type
    - bash scripts/check-deploy-sql-order.sh
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - repo-harness run check-task-workflow --strict
  manual_checks:
    - The packed runtime artifact and every global-install spec resolve outside the authoritative source root.
    - The canonical profile-comparison report triplet is byte-identical to the task base.
    - BDD2 owns no changed runner or focused benchmark-test path during this package.
```

## Acceptance Notes (Human Review)

- Functional behavior: initial source/subject authority survives pack,
  preparation, providers, and report binding without resampling.
- Edge cases: Git-clean POSIX mode drift, tarball byte drift, pack/install
  failure, no-harness isolation, and post-run drift all fail closed.
- Regression risks: installed-bin path resolution and package lifecycle
  behavior; focused smoke must prove both before full verification.

## Closeout Blocker (Resolved)

- `repo-harness run check-task-workflow --strict` previously failed on this
  package's diff for a proven pre-existing, out-of-scope reason: Sprint C
  (`plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`)
  had no `## PRD` section. Resolved on `main` by commit `e4f64953` (`docs
  (program): add PRD section to Sprint C for execution readiness`), which
  this package rebased onto. Re-run in this worktree post-rebase: `[workflow]
  OK`, exit 0. No change to this package's own files was required.

## Rollback Point

- Commit / checkpoint: `e4f649536097e29e3c686666567c0f9f2d133b7b`
- Revert strategy: revert the runner/test commit; no schema, report, or data
  migration exists.
