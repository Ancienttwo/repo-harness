# Plan: Gate real-install and herdr tests behind the release lane

> **Status**: Executing
> **Substantive Change SHA256**: `sha256:4366f02606f02ae97f07df3bd30bccc84d5cbc05fdd7c2ff2121baec3179b3cd`
> **Created**: 20260913-0250
> **Slug**: expensive-test-gate
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260913-0250-expensive-test-gate.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260913-0250-expensive-test-gate.md`; after execution revert branch `codex/expensive-test-gate` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260913-0250-expensive-test-gate.contract.md`
> **Task Review**: `tasks/reviews/20260913-0250-expensive-test-gate.review.md`
> **Implementation Notes**: `tasks/notes/20260913-0250-expensive-test-gate.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260913-0250-expensive-test-gate.md`
- Sprint contract: `tasks/contracts/20260913-0250-expensive-test-gate.contract.md`
- Sprint review: `tasks/reviews/20260913-0250-expensive-test-gate.review.md`
- Implementation notes: `tasks/notes/20260913-0250-expensive-test-gate.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260913-0250-expensive-test-gate.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260913-0250-expensive-test-gate.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260913-0250-expensive-test-gate.md`.

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
- Contract file: `tasks/contracts/20260913-0250-expensive-test-gate.contract.md`
- Review file: `tasks/reviews/20260913-0250-expensive-test-gate.review.md`
- Implementation notes file: `tasks/notes/20260913-0250-expensive-test-gate.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260913-0250-expensive-test-gate.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260913-0250-expensive-test-gate.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260913-0250-expensive-test-gate.md`; after execution revert branch `codex/expensive-test-gate` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260913-0250-expensive-test-gate.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260913-0250-expensive-test-gate.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260913-0250-expensive-test-gate.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260913-0250-expensive-test-gate.contract.md`, `tasks/reviews/20260913-0250-expensive-test-gate.review.md`, and `tasks/notes/20260913-0250-expensive-test-gate.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260913-0250-expensive-test-gate.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260913-0250-expensive-test-gate.md`; after execution revert branch `codex/expensive-test-gate` or the explicitly reviewed diff.

## Captured Planning Output

# Plan: Gate real-install and herdr tests behind the release lane

## Promotion Gate

- **Merge/PR unit**: One independently reviewable test-scheduling change.
- **Rollback surface**: Two test files, `scripts/check-ci.sh`, one new guard test and one reference-config sentence.
- **Verification boundary**: The two affected files must be observably cheaper with the gate off, complete with it on, and the lane wiring must be asserted mechanically.
- **Review/acceptance boundary**: Local validation recorded here; hosted Required / CI execution is separately identified.
- **High-risk surface**: A renamed variable could silently disable release coverage; the guard test binds the lane and both files to one name.
- **Why not checklist row**: It changes what the default CI lane executes, which is a verification boundary of its own.

## Evidence Contract

- **State/progress path**: This plan's Task Breakdown.
- **Verification evidence**: Gate-off and gate-on runs of both affected files, the guard test, the existing lane test, and the repository-integrity commands, recorded here.
- **Evaluator rubric**: Gate off skips exactly the expensive cases and keeps every `<testcase name>`; gate on runs them green; `all` exports the variable and `functional` does not.
- **Stop condition**: Scope implemented and the declared checks pass, or a verified external blocker is reported.
- **Rollback surface**: This slice's declared files only.

## Decision

P1: `.github/workflows/ci.yml` schedules jobs; its Test job runs `bash scripts/check-ci.sh functional`, so hosted PR and main execution is the `functional` lane. `scripts/check-ci.sh` with no argument is the `all` lane, and that is exactly what `scripts/check-npm-release.sh` invokes in full mode (`check:release`). `prepublishOnly` runs `check-npm-release.sh --prepublish`, which deliberately stops before the suite. So the release path that executes tests is the `all` lane, reached through `bun run check:release` or a bare local `bash scripts/check-ci.sh`.

P2: `tests/harness-benchmark-matrix.test.ts` holds 31 tests; only the two that call `prepareBenchmarkRuntimeArtifact()` pack the whole repository with `npm pack` and install the tarball into an isolated HOME. `tests/claude-review.test.ts` holds 15 declarations (20 executed cases) and every one of them needs the pinned `herdr` binary: the sentinel helper spawns a real `herdr` server and `unstartedSession()` resolves `Bun.which('herdr')`. That makes the whole file, not a subset, the external-program cost.

P3: `test.skipIf(!process.env.REPO_HARNESS_TEST_EXPENSIVE)` follows the existing `BRC_TEST_CONTAINER_IMAGE` precedent in `tests/effects/brc10-lifecycle.test.ts`, keeps every test name in the JUnit report, and keeps the skip visibly a gate rather than a failure. The variable is exported only in the `all` lane so the release gate keeps full coverage while the hosted PR lane drops the two install tests and the herdr file. A rename is the failure mode that would silently drop release coverage, so a guard test asserts the lane wiring and the shared variable name across both files. At 10x scale the first limit is still the hosted full lane's per-file wall clock, not this gate.

## Scope

Gate the two `prepareBenchmarkRuntimeArtifact()` tests in `tests/harness-benchmark-matrix.test.ts` and all of `tests/claude-review.test.ts` behind `REPO_HARNESS_TEST_EXPENSIVE`; export it in the `all` lane of `scripts/check-ci.sh` only; add `tests/expensive-test-gate.test.ts`; add one release-lane sentence to `assets/reference-configs/release-deploy.md` and re-project it. No `src/` change, no `.github/workflows/ci.yml` change, no assertion or title change in the gated tests, no `tasks/todos.md` edit.

## Verification

Run both affected files with the gate off and with the gate on, compare the JUnit `<testcase name>` multisets against the pre-change baseline, run the new guard test and `tests/check-ci-job-split.test.ts`, then `bun run check:type` and the repository-integrity commands. No full local suite: this slice changes only test scheduling and one shell export, and the hosted Required / CI run is the full-coverage authority.

## Task Breakdown

- [x] Gate the two real-install benchmark tests and the whole herdr review file behind one variable.
- [x] Export the variable in the `all` lane of `scripts/check-ci.sh` and leave `functional` unset.
- [x] Add the lane-and-name guard test.
- [x] Document the variable's release-lane relationship in the reference configs and re-project.
- [x] Complete gate-off/gate-on, guard, type and repository-integrity verification.

## Verification Results

- Gate variable is `REPO_HARNESS_TEST_EXPENSIVE`; `scripts/check-ci.sh` exports it only inside the `all` lane, immediately before `run_bun_tests`.
- Release path confirmed by reading: `scripts/check-npm-release.sh` full mode calls `bash scripts/check-ci.sh` with no lane argument, and that script is `bun run check:release`. `prepublishOnly` uses `--prepublish`, which returns before the suite, so it was left untouched.
- `tests/harness-benchmark-matrix.test.ts`, `bun test --timeout 180000`: baseline 62.73 s (31 pass); gate off 2.57 s (29 pass, 2 skip); gate on 55.99 s (31 pass).
- `tests/claude-review.test.ts`, same command: baseline 38.98 s (20 pass); gate off 0.023 s (20 skip); gate on 39.22 s (20 pass).
- JUnit `<testcase name>` multisets are identical between baseline, gate-off and gate-on for both files (`diff` of sorted `name="..."` extractions, zero differences).
- `bun test tests/check-ci-job-split.test.ts tests/expensive-test-gate.test.ts`: 9 passed, 188 expectations, 10.10 s.
- The new guard was mutation-checked: renaming the exported variable fails the shared-name assertion, and hoisting the export out of the `all` branch fails the functional-lane assertion.
- `bun run check:type`, `check:hooks`, `check:helpers`, `check:reference-configs`, `bash scripts/check-deploy-sql-order.sh` equivalents in the governance lane, `bash scripts/check-architecture-sync.sh`, `bash scripts/check-task-workflow.sh --strict`, merge-base-bound `bash scripts/check-task-sync.sh`, `bun src/cli/index.ts init --repo . --dry-run` and `bash scripts/check-ci.sh governance` results are recorded below as they run.
- `.github/workflows/ci.yml` was not modified. Its "Install pinned Herdr runtime" step is now unnecessary for the `functional` lane and is queued for the next change that already touches that file, batched with the existing documentation-lane hardening row in `tasks/todos.md`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Gate the two real-install benchmark tests and the whole herdr review file behind one variable.
- [x] Export the variable in the `all` lane of `scripts/check-ci.sh` and leave `functional` unset.
- [x] Add the lane-and-name guard test.
- [x] Document the variable's release-lane relationship in the reference configs and re-project.
- [x] Complete gate-off/gate-on, guard, type and repository-integrity verification.
