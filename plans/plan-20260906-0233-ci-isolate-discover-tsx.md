# Plan: CI isolate loop discovers .test.tsx files

> **Status**: Executing
> **Created**: 20260906-0233
> **Slug**: ci-isolate-discover-tsx
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: tsx-discovery guard, discovery count readback against bun, repository-integrity checks, one full suite run
> **Rollback Surface**: Revert the discovery predicate and the guard case together
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260906-0233-ci-isolate-discover-tsx.contract.md`
> **Task Review**: `tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md`
> **Implementation Notes**: `tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md`

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

- Active plan: `plans/plan-20260906-0233-ci-isolate-discover-tsx.md`
- Sprint contract: `tasks/contracts/20260906-0233-ci-isolate-discover-tsx.contract.md`
- Sprint review: `tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md`
- Implementation notes: `tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260906-0233-ci-isolate-discover-tsx.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260906-0233-ci-isolate-discover-tsx.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260906-0233-ci-isolate-discover-tsx.md`.

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
- Contract file: `tasks/contracts/20260906-0233-ci-isolate-discover-tsx.contract.md`
- Review file: `tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md`
- Implementation notes file: `tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260906-0233-ci-isolate-discover-tsx.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260906-0233-ci-isolate-discover-tsx.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the discovery predicate and the guard case together
- **Verification boundary**: tsx-discovery guard, discovery count readback against bun, repository-integrity checks, one full suite run
- **Review/acceptance boundary**: `tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260906-0233-ci-isolate-discover-tsx.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260906-0233-ci-isolate-discover-tsx.contract.md`, `tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md`, and `tasks/notes/20260906-0233-ci-isolate-discover-tsx.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the discovery predicate and the guard case together

## Captured Planning Output

## Goal

Make the isolate-mode CI test loop discover `*.test.tsx` files so the three `tests/operator-web/*.test.tsx` suites run in CI's `Test` job, matching bun's own discovery.

## P1 Map

- `scripts/lib/ci-run-tests.sh` owns isolate-mode discovery: `find tests -type f -name '*.test.ts' | LC_ALL=C sort` (used by `scripts/check-ci.sh` under `BUN_TEST_ISOLATE_FILES=1`, the `.github/workflows/ci.yml` `Test` job setting).
- Non-isolate `bun test` discovers `.test.ts` and `.test.tsx`; at main 02385612 it ran 361 files while the isolate loop ran 358 — the delta is exactly `tests/operator-web/operator-{collaboration,interactions,ui}.test.tsx`.
- `tests/check-ci-isolate-aggregation.test.ts` guards the loop's aggregation behaviour; `tests/bootstrap-files.test.ts` pins `check-ci` literals.

## P2 Trace

`run_bun_tests` (isolate) → `find tests -type f -name '*.test.ts'` → tsx files never enter the loop → CI never executes them → any regression in the operator-web suites is invisible to CI while passing locally under plain `bun test`.

## P3 Decision

- Change the discovery predicate to `\( -name '*.test.ts' -o -name '*.test.tsx' \)` (keep `-type f`, keep `LC_ALL=C sort`). No other behaviour change. `BUN_TEST_FILES` explicit selection unchanged.
- Guard: extend `tests/check-ci-isolate-aggregation.test.ts` with one case that creates a temp `tests`-shaped dir containing a `.test.ts` and a `.test.tsx` file (both passing), runs `run_bun_tests` in isolate mode WITHOUT `BUN_TEST_FILES` from that temp root (the lib finds under `tests` relative to cwd, so `cd` into the temp root and create `tests/` there), and asserts both `[ci] test` lines appear. On the unfixed lib the tsx line is absent (RED).
- Out of scope: any other discovery root, file-name pattern, sort order, concurrency, timeouts, workflow YAML.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/ci-run-tests.sh` | Modify | discovery predicate includes `*.test.tsx` |
| `tests/check-ci-isolate-aggregation.test.ts` | Modify | add tsx-discovery case |

## Task Breakdown

- [x] RED: add the tsx-discovery case; capture `bun test <guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>`.
- [x] GREEN: change the find predicate.
- [x] Fill the contract (Task Profile bugfix, Root Cause Evidence, Allowed Paths, Exit Criteria, Change Assessment oracles as `{id,kind,paths}` objects with `deterministic_test` and `runtime_readback`), clear `[NOTE]` placeholders, tick boxes.
- [x] Verification: the guard + `tests/bootstrap-files.test.ts`; runtime readback `BUN_TEST_ISOLATE_FILES=1 bash -c 'set -euo pipefail; source scripts/lib/ci-run-tests.sh; run_bun_tests'` is too slow for a readback (whole suite) — instead readback the discovery alone: `find tests -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) | LC_ALL=C sort | wc -l` equals the count bun reports in `bun test --timeout 60000` (`Ran N tests across M files`), and the three operator-web tsx paths appear in the sorted list; six repository-integrity checks; CI-mode `check-task-sync` digest bound; one full `bun test --timeout 60000`.

## Allowed Paths

- `scripts/lib/ci-run-tests.sh`
- `tests/check-ci-isolate-aggregation.test.ts`
- plan, contract, review, notes files of this work package

## Verification

- `bun test --timeout 60000 tests/check-ci-isolate-aggregation.test.ts tests/bootstrap-files.test.ts`
- `bash scripts/check-deploy-sql-order.sh && bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh && bash scripts/check-task-workflow.sh --strict && bun scripts/inspect-project-state.ts --repo . --format text && bun src/cli/index.ts init --repo . --dry-run`
- `bun test --timeout 60000` (full, once, logged)

## Annotations

- None.
