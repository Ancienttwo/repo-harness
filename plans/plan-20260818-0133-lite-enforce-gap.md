# Plan: minimal_change enforce reachable under lite profile

> **Status**: Executing
> **Created**: 20260818-0133
> **Slug**: lite-enforce-gap
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Execution Mode**: primary
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: targeted suites + full bun test + gatekeeper acceptance
> **Rollback Surface**: single commit revert restores post-v2 ordering
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0133-lite-enforce-gap.contract.md`
> **Task Review**: `tasks/reviews/20260818-0133-lite-enforce-gap.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0133-lite-enforce-gap.notes.md`

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

- Active plan: `plans/plan-20260818-0133-lite-enforce-gap.md`
- Sprint contract: `tasks/contracts/20260818-0133-lite-enforce-gap.contract.md`
- Sprint review: `tasks/reviews/20260818-0133-lite-enforce-gap.review.md`
- Implementation notes: `tasks/notes/20260818-0133-lite-enforce-gap.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0133-lite-enforce-gap.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0133-lite-enforce-gap.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0133-lite-enforce-gap.md`.

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
- Contract file: `tasks/contracts/20260818-0133-lite-enforce-gap.contract.md`
- Review file: `tasks/reviews/20260818-0133-lite-enforce-gap.review.md`
- Implementation notes file: `tasks/notes/20260818-0133-lite-enforce-gap.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0133-lite-enforce-gap.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0133-lite-enforce-gap.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single commit revert restores post-v2 ordering
- **Verification boundary**: targeted suites + full bun test + gatekeeper acceptance
- **Review/acceptance boundary**: `tasks/reviews/20260818-0133-lite-enforce-gap.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0133-lite-enforce-gap.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0133-lite-enforce-gap.contract.md`, `tasks/reviews/20260818-0133-lite-enforce-gap.review.md`, and `tasks/notes/20260818-0133-lite-enforce-gap.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0133-lite-enforce-gap.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single commit revert restores post-v2 ordering

## Captured Planning Output

# minimal_change enforce reachable under lite profile

## Context

The enforce gate landed at `stop-handler.ts:788` behind the lite early-return (`:781-783`). Proven non-empty intersection: a single `package.json` edit adding a dependency stays `risk-floor:lite:local-low-risk` (`profile.ts:256-273`; `package.json` carries no strict tokens and counts as 1 implementation path) yet produces a `dependency` finding → verdict `review` (`minimal-change-signals.ts:398-408, 589`). The gate is therefore silently swallowed exactly where daily small edits live — the same false-quiet failure mode as the two-month advice dark period.

## Approved decisions

1. Hoist the minimal_change review block (policy load + review + summary + `minimalChangeEnforceBlock`) above the lite early-return in `stop-handler.ts`. The gate's own inertia conditions (mode !== enforce, verdict !== review, missing report/fingerprint → null) keep lite sessions silent when there is nothing to audit.
2. `profile` resolution gains an explicit `'lite'` branch for the breaker key (previously lite fell through to `'strict'`).
3. Consequence accepted: when both fire, the minimal-change gate now blocks before `planCompletenessBlock` — a necessary result of the hoist, not a separate choice.
4. The loop-semantics characterization golden (`tests/state/fixtures/loop-semantics/characterization.json`) flips `minimal_change_review` before `lite_early_exit` in 3 stop cells. This is the intended semantic change; regeneration via `UPDATE_LOOP_SEMANTICS_GOLDEN=1` is authorized for this slice. Record the rationale in the v2 notes file.
5. Tests: lite + enforce + verdict review → Stop blocks; lite with no report → silent (no `[MinimalChange]` on stderr, empty stdout).

## Task Breakdown

- [x] Proof pass (intersection non-empty, file:line evidence)
- [x] Hoist implemented in `src/cli/hook/stop-handler.ts`
- [x] Two lite-path test cases in `tests/stop-handler.test.ts`
- [x] Golden regeneration + notes rationale
- [x] Full verification: targeted suites + `bun run check:type` + `bash scripts/check-task-sync.sh` + full `bun test`

## Verification boundary

Targeted stop-handler/minimal-change/loop-semantics suites plus full `bun test` against the 2461-pass baseline; gatekeeper acceptance before ship.

## Rollback surface

Single commit revert restores the post-v2 ordering (gate behind lite return); no schema or policy change involved.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Proof pass (intersection non-empty, file:line evidence)
- [x] Hoist implemented in `src/cli/hook/stop-handler.ts`
- [x] Two lite-path test cases in `tests/stop-handler.test.ts`
- [x] Golden regeneration + notes rationale
- [x] Full verification: targeted suites + `bun run check:type` + `bash scripts/check-task-sync.sh` + full `bun test`
