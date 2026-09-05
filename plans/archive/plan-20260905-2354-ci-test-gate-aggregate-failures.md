> **Archived**: 2026-09-06 01:58
> **Related Plan**: plans/archive/plan-20260905-2354-ci-test-gate-aggregate-failures.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260906-0158
> **Archive Projection V1**: `plans/plan-20260905-2354-ci-test-gate-aggregate-failures.md` => `plans/archive/plan-20260905-2354-ci-test-gate-aggregate-failures.md`
> **Archive Projection V1**: `tasks/notes/20260905-2354-ci-test-gate-aggregate-failures.notes.md` => `tasks/archive/notes-20260906-0158-ci-test-gate-aggregate-failures.md`
> **Archive Projection V1**: `tasks/contracts/20260905-2354-ci-test-gate-aggregate-failures.contract.md` => `tasks/archive/contract-20260906-0158-ci-test-gate-aggregate-failures.md`
> **Archive Projection V1**: `tasks/reviews/20260905-2354-ci-test-gate-aggregate-failures.review.md` => `tasks/archive/review-20260906-0158-ci-test-gate-aggregate-failures.md`

# Plan: CI test gate reports every failing file

> **Status**: Archived
> **Created**: 20260905-2354
> **Slug**: ci-test-gate-aggregate-failures
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: New aggregation guard plus bootstrap-files literal guard, helper projection checks, repository-integrity checks, one full suite run
> **Rollback Surface**: Revert scripts/check-ci.sh, scripts/lib/ci-run-tests.sh, the new test, and any projected helper mirror together
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260906-0158-ci-test-gate-aggregate-failures.md`
> **Task Review**: `tasks/archive/review-20260906-0158-ci-test-gate-aggregate-failures.md`
> **Implementation Notes**: `tasks/archive/notes-20260906-0158-ci-test-gate-aggregate-failures.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260905-2354-ci-test-gate-aggregate-failures.md`
- Sprint contract: `tasks/archive/contract-20260906-0158-ci-test-gate-aggregate-failures.md`
- Sprint review: `tasks/archive/review-20260906-0158-ci-test-gate-aggregate-failures.md`
- Implementation notes: `tasks/archive/notes-20260906-0158-ci-test-gate-aggregate-failures.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260906-0158-ci-test-gate-aggregate-failures.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-2354-ci-test-gate-aggregate-failures.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-2354-ci-test-gate-aggregate-failures.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/archive/contract-20260906-0158-ci-test-gate-aggregate-failures.md`
- Review file: `tasks/archive/review-20260906-0158-ci-test-gate-aggregate-failures.md`
- Implementation notes file: `tasks/archive/notes-20260906-0158-ci-test-gate-aggregate-failures.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260906-0158-ci-test-gate-aggregate-failures.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-2354-ci-test-gate-aggregate-failures.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert scripts/check-ci.sh, scripts/lib/ci-run-tests.sh, the new test, and any projected helper mirror together
- **Verification boundary**: New aggregation guard plus bootstrap-files literal guard, helper projection checks, repository-integrity checks, one full suite run
- **Review/acceptance boundary**: `tasks/archive/review-20260906-0158-ci-test-gate-aggregate-failures.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-2354-ci-test-gate-aggregate-failures.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260906-0158-ci-test-gate-aggregate-failures.md`, `tasks/archive/review-20260906-0158-ci-test-gate-aggregate-failures.md`, and `tasks/archive/notes-20260906-0158-ci-test-gate-aggregate-failures.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260906-0158-ci-test-gate-aggregate-failures.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert scripts/check-ci.sh, scripts/lib/ci-run-tests.sh, the new test, and any projected helper mirror together

## Captured Planning Output

## Goal

Make the CI test gate report every failing test file in one run instead of stopping at the first, so a single early-sorting failure on `main` can no longer hide the rest of the suite from every PR.

Observed 2026-09-05: with `BUN_TEST_ISOLATE_FILES=1` (the `Test` job's setting in `.github/workflows/ci.yml`), `scripts/check-ci.sh` loops `bun test <file>` per file under `set -euo pipefail`; the first non-zero exit aborts the loop and the whole gate. For several `main` commits everything sorting after `tests/architecture-projection-provider.test.ts` (the ninth file) was unexercised, and the red set changed three times in one hour without anyone seeing the full picture.

## P1 Map

- `scripts/check-ci.sh` owns the CI gate sequence: install, typecheck, projection checks, tests (`run_bun_tests`), workflow checks, inspection, package dry-run. `package.json#check:ci` calls it; `.github/workflows/ci.yml` `Test` job runs it with `BUN_TEST_MAX_CONCURRENCY=1 BUN_TEST_TIMEOUT_MS=180000 BUN_TEST_ISOLATE_FILES=1`.
- Non-isolate mode (`BUN_TEST_ISOLATE_FILES` unset) runs one `bun test` over all files and already reports every failure; only isolate mode has the fail-fast defect.
- `tests/bootstrap-files.test.ts` and `scripts/check-npm-release.sh` reference `check-ci`; `bun run check:helpers` verifies packaged helper mirrors under `assets/templates/helpers/` — confirm whether `check-ci.sh` has a mirror that must stay in sync.

## P2 Trace

`run_bun_tests` (isolate) → `run_bun_test_file "$file"` → `bun test … "$file"` exits 1 → `set -e` terminates the script → GitHub job fails with only the files run so far in the log → `Required / CI` aggregates `test=failure` → every later suite is unknown.

## P3 Decision

- In isolate mode, run EVERY selected file regardless of earlier failures; record each failing file (path + exit code) in an array; after the loop print `[ci] failed test files (N):` followed by one line per file, then `return 1`. Passing runs print nothing extra. Preserve the per-file `[ci] test <file>` line and each file's own bun output unchanged. Preserve `BUN_TEST_FILES` selection and the "no test files matched" error. Non-isolate mode unchanged.
- Do not swallow non-test failures: keep `set -euo pipefail` for the rest of the gate; only the per-file test loop tolerates a non-zero exit (capture with `if ! run_bun_test_file "$file"; then …; fi`, never `|| true`).
- Do not continue past a failed test phase into workflow checks: the gate still stops after the test summary when any file failed (the summary is the deliverable; later phases are cheap to run locally). This keeps the gate's phase order and exit semantics.
- Testability: move `run_bun_test_file`/`run_bun_tests` into a sourceable `scripts/lib/ci-run-tests.sh` (bash, no side effects at source time) and `source` it from `check-ci.sh`. Add `tests/check-ci-isolate-aggregation.test.ts` that writes two tiny bun test files into a temp dir (one passing, one failing), runs `bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests'` with `BUN_TEST_ISOLATE_FILES=1 BUN_TEST_FILES="<a> <b>"` ordered so the failing file comes FIRST, and asserts: exit code 1, both `[ci] test` lines present (the passing file still ran), the summary names exactly the failing file with its exit code. Add a second case with two passing files: exit 0, no summary line.
- If `check:helpers` shows a packaged mirror of `check-ci.sh`, update the mirror the way the projection expects (run the projection command, do not hand-copy) and include the new lib in the same projection if the tooling requires it; otherwise leave `assets/` untouched.
- `.github/workflows/ci.yml` unchanged unless the new lib requires nothing there (it does not).
- Out of scope: changing which checks run, timeouts, concurrency, bun version, or any test outside the new file.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/ci-run-tests.sh` | Add | sourceable `run_bun_test_file` + `run_bun_tests` with failure aggregation |
| `scripts/check-ci.sh` | Modify | source the lib; remove the inlined functions |
| `tests/check-ci-isolate-aggregation.test.ts` | Add | RED-first regression guard |
| `assets/templates/helpers/**` | Modify only if `check:helpers` requires a mirror | projection output |

## Task Breakdown

- [x] RED: add `tests/check-ci-isolate-aggregation.test.ts` against the current inlined behaviour (it must fail because the passing file never runs after the failing one); capture `bun test <guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>`.
- [x] GREEN: extract the lib, aggregate failures, source from `check-ci.sh`.
- [x] Run `bun run check:helpers`, `bun run check:hooks`, `bun run check:reference-configs`; reconcile any mirror via the projection tooling.
- [x] Fill the contract (Goal, Scope, Root Cause Evidence, Allowed Paths, Exit Criteria, Change Assessment oracles as `{id,kind,paths}` objects), clear `[NOTE]` placeholders, tick boxes.
- [x] Verification: the new test, `tests/bootstrap-files.test.ts`, `BUN_TEST_ISOLATE_FILES=1 BUN_TEST_FILES="tests/unit/fleet-board.test.ts tests/check-ci-isolate-aggregation.test.ts" bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests'` (exit 0), the six repository-integrity checks, `bun test --timeout 60000` full once (product tooling changed).

## Allowed Paths

- `scripts/check-ci.sh`
- `scripts/lib/ci-run-tests.sh`
- `tests/check-ci-isolate-aggregation.test.ts`
- `assets/templates/helpers/**` (only via projection tooling)
- plan, contract, review, notes files of this work package

## Verification

- `bun test --timeout 60000 tests/check-ci-isolate-aggregation.test.ts tests/bootstrap-files.test.ts`
- `bun run check:helpers && bun run check:hooks && bun run check:reference-configs`
- `bash scripts/check-deploy-sql-order.sh && bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh && bash scripts/check-task-workflow.sh --strict && bun scripts/inspect-project-state.ts --repo . --format text && bun src/cli/index.ts init --repo . --dry-run`
- `bun test --timeout 60000` (full, once, logged)

## Annotations

- None.

## Task Breakdown
- [x] RED: add `tests/check-ci-isolate-aggregation.test.ts` against the current inlined behaviour (it must fail because the passing file never runs after the failing one); capture `bun test <guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>`.
- [x] GREEN: extract the lib, aggregate failures, source from `check-ci.sh`.
- [x] Run `bun run check:helpers`, `bun run check:hooks`, `bun run check:reference-configs`; reconcile any mirror via the projection tooling.
- [x] Fill the contract (Goal, Scope, Root Cause Evidence, Allowed Paths, Exit Criteria, Change Assessment oracles as `{id,kind,paths}` objects), clear `[NOTE]` placeholders, tick boxes.
- [x] Verification: the new test, `tests/bootstrap-files.test.ts`, `BUN_TEST_ISOLATE_FILES=1 BUN_TEST_FILES="tests/unit/fleet-board.test.ts tests/check-ci-isolate-aggregation.test.ts" bash -c 'source scripts/lib/ci-run-tests.sh; run_bun_tests'` (exit 0), the six repository-integrity checks, `bun test --timeout 60000` full once (product tooling changed).
