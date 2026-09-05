# Plan: Align lite task synchronization with runtime profile

> **Status**: Review
> **Substantive Change SHA256**: `sha256:18187caa23bcccb8dcce25661f9b1e7f0892fe9c0842a6b439e9577155a52555`
> **Created**: 20260905-0452
> **Slug**: lite-task-sync
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Focused task-sync tests, full Bun suite, and repository integrity checks
> **Rollback Surface**: Revert only task-sync scripts, related tests, and the approved global-rule template diff
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260905-0452-lite-task-sync.contract.md`
> **Task Review**: `tasks/reviews/20260905-0452-lite-task-sync.review.md`
> **Implementation Notes**: `tasks/notes/20260905-0452-lite-task-sync.notes.md`

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

- Active plan: `plans/plan-20260905-0452-lite-task-sync.md`
- Sprint contract: `tasks/contracts/20260905-0452-lite-task-sync.contract.md`
- Sprint review: `tasks/reviews/20260905-0452-lite-task-sync.review.md`
- Implementation notes: `tasks/notes/20260905-0452-lite-task-sync.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260905-0452-lite-task-sync.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260905-0452-lite-task-sync.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260905-0452-lite-task-sync.md`.

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
- Contract file: `tasks/contracts/20260905-0452-lite-task-sync.contract.md`
- Review file: `tasks/reviews/20260905-0452-lite-task-sync.review.md`
- Implementation notes file: `tasks/notes/20260905-0452-lite-task-sync.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260905-0452-lite-task-sync.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260905-0452-lite-task-sync.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert only task-sync scripts, related tests, and the approved global-rule template diff
- **Verification boundary**: Focused task-sync tests, full Bun suite, and repository integrity checks
- **Review/acceptance boundary**: `tasks/reviews/20260905-0452-lite-task-sync.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260905-0452-lite-task-sync.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260905-0452-lite-task-sync.contract.md`, `tasks/reviews/20260905-0452-lite-task-sync.review.md`, and `tasks/notes/20260905-0452-lite-task-sync.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260905-0452-lite-task-sync.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert only task-sync scripts, related tests, and the approved global-rule template diff

## Captured Planning Output

P1: scripts/check-task-sync.sh owns diff identity and evidence admission; assets/templates/helpers/check-task-sync.sh is its generated projection. The state resolver owns workflow risk. Global instruction templates and their docs mirror are the preceding approved change.
P2: An assets/reference-configs Markdown edit resolves to lite, but the old task-sync helper rejects it for absent workflow artifacts. The regression test failed before the fix and now passes. Supply the complete diff inventory, including base-only and documentation paths, to the existing state resolve CLI.
P3: Admit only a successful lite result without artifacts. Preserve exact diff identity, standard/strict evidence requirements, malformed-waiver rejection, and fail-closed resolver errors. Do not change profile thresholds or guard policy. The extra CLI call reuses existing risk authority; large diffs retain standard/strict requirements.

Scope: finish the task-sync script pair, tests/check-task-sync.test.ts and tests/helper-scripts.test.ts; preserve and validate the approved global-working-rules template and mirror. Document the resulting task-sync contract in the existing reference documentation. No unrelated runtime refactor or host-policy change.

## Task Breakdown
- [x] Update the remaining legacy evidence fixtures to explicitly exercise standard-profile admission.
- [x] Run focused regression tests and full Bun tests; report remaining failures without broadening scope.
- [x] Bind this approved change to its actual substantive digest, run repository checks, and report the final state.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Update the remaining legacy evidence fixtures to explicitly exercise standard-profile admission.
- [x] Run focused regression tests and full Bun tests; report remaining failures without broadening scope.
- [x] Bind this approved change to its actual substantive digest, run repository checks, and report the final state.

## Verification Results

- Delivery verification on isolated base `60a0224d`: 33 task-sync tests and 9 rule/projection tests passed with only this slice's patch applied. The full-suite result below is retained rather than rerun.
- Focused task-sync and diff-bound evidence tests: 33 passed, 0 failed. Log: `/tmp/repo-harness-lite-focused-20260905.log`.
- Full `bun test --timeout 60000`: 4173 passed, 4 skipped, 1 failed across 348 files. Log: `/tmp/repo-harness-lite-full-20260905.log`.
- Remaining failure: `tests/unit/candidate-bound-global-runtime-reconciliation.test.ts:233`, candidate authority replaces a predecessor Stop timeout and preserves an unmanaged hook. The isolated rerun passed without a code change; the full-run failure remains unexplained. No runtime reconciliation code was changed in this slice.
- Repository integrity: deploy SQL order, architecture sync, task sync, strict task workflow, project-state inspection, and init dry-run passed. Helper and reference-config projections are synchronized.
- Implementation is complete. Delivery to main is authorized with the recorded full-suite failure; keep the unresolved verification finding visible and do not represent the isolated rerun as a passing full suite.
