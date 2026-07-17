# Plan: LSC-01 Profile × Operation Characterization

> **Status**: Executing
> **Created**: 2026-07-16 01:50
> **Updated**: 2026-07-16 02:23
> **Slug**: lsc-01-profile-operation-characterization
> **Task Profile**: eval-only
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md#lsc-01-profile-operation-characterization
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-01 Execution Base**: `origin/main@be3e93ce72c812a33045a15c4d97452c59fa3fbb` (PR #80)
> **Verification Boundary**: The exact 9-cell characterization fixture, its focused test, strict workflow checks, fresh review/external acceptance, and the SHA-bound merge gate.
> **Rollback Surface**: Revert this independent PR to `be3e93ce72c812a33045a15c4d97452c59fa3fbb`; no production path is part of the package.
> **Source Audit**: `plans/sprints/20260715-harness-loop-audit-and-optimization.md`
> **Source Sprint**: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`
> **Task Contract**: `tasks/contracts/20260716-0150-lsc-01-profile-operation-characterization.contract.md`
> **Task Review**: `tasks/reviews/20260716-0150-lsc-01-profile-operation-characterization.review.md`
> **Implementation Notes**: `tasks/notes/20260716-0150-lsc-01-profile-operation-characterization.notes.md`

## Goal

Freeze the current Lite/Standard/Strict × edit/stop/ship behavior as exactly
nine named cells, including verdict, reason, exit semantics, ordering, and
observable side effects. Record only the target deltas already approved by the
Harness Loop audit. This package must reuse the ESA characterization fixture
and goldens and must not change runtime behavior.

## Success Criteria

- The matrix has exactly nine unique `profile.operation` cells.
- Every cell records a selected runtime-semantic projection from the existing
  edit, Stop, or ship gate plus explicitly named read-only source inventory.
  Raw nondeterministic transport fields are excluded rather than normalized;
  every captured semantic value is compared byte-for-byte.
- The fixture records the approved target delta separately from the observed
  current behavior; it does not implement or simulate a future evaluator.
- The Standard missing-contract mismatch, the Strict fail-closed edit
  boundary, and allowed-to-stop/not-ready-to-ship are visible in named cells.
- The diff contains only the exact workflow/test/eval paths authorized by the
  contract and no production source, Hook, installer, policy, or Skill path.

## P1: Architecture Map

- Profile authority: `src/core/workflow/profile.ts` and the Effective State
  projection under `src/core/state`; these are read-only inputs.
- ESA baseline authority: `tests/state/effective-state-fixture.ts` plus
  `tests/state/fixtures/idle-inspect.json`,
  `missing-contract.json`, `executing-fresh-evidence.json`, and
  `explicit-strict-without-path-signals.json`; these are reused, not edited.
- Edit observation: the current `pre-edit-guard.sh` route, whose profile
  lookup consumes `repo-harness state resolve --operation edit`.
- Stop observation: the current `stop-orchestrator.sh` route, including its
  cached-profile lookup and handoff/review side effects.
- Ship observation: `verify-sprint`, `ship-worktrees`, and
  `contract-worktree finish`; the test exercises only read-only/dry-run or
  disposable-repository gates and never pushes, merges, or opens a PR.
- LSC-01 ownership: one test file and one JSON matrix fixture, plus this
  package's workflow artifacts. Production policy begins in LSC-02.

## P2: Concrete Trace

For each named cell, the test creates a disposable repository through the ESA
fixture helper, references the corresponding byte-bound ESA golden lineage,
selects the explicit workflow profile, and invokes the current public operation
boundary:

1. `edit` sends a low-risk implementation path through PreEdit and captures
   the Effective State result, guard, exit code, and state-cache effect.
2. `stop` invokes Stop against the corresponding current state and captures
   decision JSON/exit behavior plus handoff, resume, review, and related writes.
3. `ship` probes the existing verification/finish envelope without network or
   mutation outside the disposable repository and records its profile-blind
   requirements and failure reason.
4. The deterministic semantic projection is compared to
   `tests/state/fixtures/loop-semantics/characterization.json`; raw
   nondeterministic transport fields are excluded and captured values are never
   normalized.

The exact pressure point is that edit, Stop, and ship currently obtain profile,
artifact, and readiness semantics from different owners. The matrix preserves
that divergence before any owner is cut over.

## P3: Design Decision

Use one data fixture and one focused test. A separate helper module or nine
fixture files would add an abstraction and file surface with only one current
consumer. The test may reuse ESA helpers and read current production entrypoints
but cannot edit them. Approved target deltas remain inert JSON data so LSC-01
cannot become a shadow readiness authority.

At 10× matrix size, subprocess count and fixture setup time fail first. That is
acceptable for this fixed nine-cell baseline; optimizing or centralizing the
runtime belongs to HRD, not this package.

## Frozen Matrix

| Cell | Current behavior to freeze | Approved target delta |
|---|---|---|
| `lite.edit.no-plan-contract-allows` | Low-risk edit has no plan/contract gate and exits 0. | Remain allowed; only safety/path/destructive requirements apply. |
| `standard.edit.complete-work-package-no-contract-blocks` | Effective State emits `missing_contract`; PreEdit collapses it to `WorkflowProfileGuard`, exit 2. | Allow a complete Approved Work Package with `contract=not_required`. |
| `strict.edit.missing-contract-blocks` | Missing contract fails before the Strict-specific guard can own the reason. | Remain blocked with typed missing-contract/worktree requirements. |
| `lite.stop.handoff-only-allows` | Stop writes compact recovery state and exits 0 without review orchestration. | Remain allowed; later emit one compact checkpoint. |
| `standard.stop.stale-review-warns-allows` | Stale review warns but ordinarily does not block Stop. | Remain allowed; unrequired review/external acceptance cannot block Stop. |
| `strict.stop.not-ready-to-ship-still-allows` | Stop shares the Standard branch and can allow recovery despite incomplete ship evidence. | Preserve allowed-to-stop while reporting not-ready-to-ship and missing requirements. |
| `lite.ship.no-profile-readiness` | Ship has no Lite branch and the contract closeout envelope fails without full artifacts. | Add typed readiness; changed code requires subject-bound targeted evidence. |
| `standard.ship.full-strict-envelope-required` | Ship applies the same contract/review/external/checks envelope as Strict. | Complete Work Package plus required targeted evidence; contract/external default to not required unless risk/policy raises them. |
| `strict.ship.full-envelope-fragmented` | Full envelope exists but is distributed across shell gates. | Preserve the verdict through one typed readiness authority and candidate revision precondition. |

## Exact File Changes

| Path | Action | Purpose |
|---|---|---|
| `tests/state/loop-semantics-characterization.test.ts` | Add | Exercise and freeze the nine current operation paths. |
| `tests/state/fixtures/loop-semantics/characterization.json` | Add | Store observed current cells and approved target deltas outside the ESA top-level scenario enumeration. |
| `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md` | Update | Pin the execution base and backfill LSC-01 closeout evidence. |
| Plan/contract/review/notes listed above | Update | Carry the self-contained execution and acceptance boundary. |
| `tasks/current.md` | Deterministic closeout projection | Reflect the active/completed workflow state if the closeout helper updates it. |
| `tasks/todos.md` | Deterministic closeout projection | Preserve deferred-goal projection if the closeout helper updates it. |

## Non-goals

- No changes under `src/`, `.ai/hooks/`, `assets/hooks/`, `scripts/`,
  installer/profile/policy files, or Skill surfaces.
- No LSC-02..08 semantic implementation, ArtifactRequirementPolicy,
  `allowedToEdit`, `allowedToStop`, `readyToShip`, or Loop Kernel.
- No Hook Runtime Diet, Evidence Ledger, Checkpoint migration, Skill
  rename/merge, compatibility, fallback, dual authority, or silent migration.
- No network ship action, commit to `main`, push, merge, or PR creation from
  a disposable characterization fixture.

## Verification

### Machine

- `repo-harness run contract-run preflight --contract tasks/contracts/20260716-0150-lsc-01-profile-operation-characterization.contract.md --repo . --json`
- `repo-harness run check-task-workflow --strict`
- `repo-harness state resolve --json`
- `bun test tests/state/loop-semantics-characterization.test.ts`
- `bun run check:type`
- `bun test`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts adopt --repo . --dry-run`
- `git diff --check`
- After code freeze only: the full-suite/root checks above,
  `repo-harness run verify-sprint`, external acceptance, and the SHA-bound
  merge gate.

### Manual

- Inspect all nine cells for exact current verdict/reason/exit/side-effect
  preservation and approved target-delta provenance.
- Confirm raw nondeterministic transport fields are excluded and no captured
  semantic value is normalized.
- Confirm the final diff contains no production path and no future-semantics
  implementation.

## Risks and Failure Handling

- If a semantic field needs normalization to pass, stop: the baseline is not
  deterministic enough to freeze.
- If observing a cell requires changing a production path or performing a
  network ship action, stop and redesign the eval probe.
- If an approved target delta is ambiguous or absent from the source audit,
  record the ambiguity and stop instead of inventing policy.
- Limit each fail → fix → reverify issue to three rounds. Expensive final
  evidence runs once after code freeze.

## Task Breakdown

- [x] Calibrate the generated plan/contract to this exact eval-only boundary;
  pass contract preflight, strict workflow, and Effective State readback.
- [x] Add the nine-cell fixture and focused characterization test using ESA
  fixture/golden inputs.
- [x] Freeze the diff, run the focused and proportionate regression checks once,
  and record exact evidence.
- [ ] Obtain fresh review/external acceptance and run verify-sprint plus the SHA-bound merge gate.
- [ ] Commit, push, open/merge the independent PR, backfill Sprint A, and pin the next exact `origin/main` SHA before LSC-02 starts.

## Evidence Contract

- **State/progress path**: this plan, its contract/review/notes, and the
  canonical Sprint A row.
- **Verification evidence**: focused test output, ignored structured checks/run
  snapshots, and the final merge-gate receipt.
- **Evaluator rubric**: current behavior is frozen exactly, approved target
  deltas remain inert data, and production paths are untouched.
- **Stop condition**: every task item is complete, review/external acceptance
  and verify-sprint pass for the frozen subject, and the independent PR is
  merged/pushed.
- **Rollback surface**: revert the LSC-01 PR to the exact execution base.

## Promotion Gate

- **Merge/PR unit**: this LSC-01 eval-only branch and its seven authored paths,
  plus only the two deterministic `tasks/current.md` / `tasks/todos.md`
  closeout projections when emitted, are one independent PR.
- **Rollback surface**: revert the LSC-01 PR to
  `be3e93ce72c812a33045a15c4d97452c59fa3fbb`.
- **Verification boundary**: focused nine-cell test, strict workflow/root
  checks, fresh review/external acceptance, verify-sprint, and merge gate.
- **Review/acceptance boundary**: review must confirm exact current behavior,
  inert target deltas, and no production path.
- **High-risk surface**: accidental semantic normalization or a real ship
  action; both fail closed.
- **Why not checklist row**: the baseline is an independent merge, review,
  rollback, and predecessor boundary for every later LSC semantic package.
