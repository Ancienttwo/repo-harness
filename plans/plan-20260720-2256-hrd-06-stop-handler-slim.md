# Plan: Sprint task: hrd-06-stop-handler-slim

> **Status**: Review
> **Created**: 20260720-2256
> **Slug**: hrd-06-stop-handler-slim
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-06-stop-handler-slim
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260720-2256-hrd-06-stop-handler-slim.md`; after execution revert branch `codex/hrd-06-stop-handler-slim` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md`
> **Task Review**: `tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md`
> **Implementation Notes**: `tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-06-stop-handler-slim
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260720-2256-hrd-06-stop-handler-slim.md`
- Sprint contract: `tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md`
- Sprint review: `tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md`
- Implementation notes: `tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260720-2256-hrd-06-stop-handler-slim.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260720-2256-hrd-06-stop-handler-slim.md`.

## Approach
### Strategy
Execute the approved HRD-06 cutover recorded in the task contract: write the recovery projection before the single Stop Effective State resolution, then preserve strict readiness > plan-completeness > delegation short-circuit precedence inside one in-process handler.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Resolve then project | Simple end-of-handler flow | False-blocks a fresh repository because `durable_recovery_state` is still missing | Reject |
| Project recovery pair before resolve | Preserves the existing first-Stop behavior and keeps one Stop resolution | Projection content cannot depend on the just-resolved state | Use |
| Append minimal-change evidence into handoff after resolve | Preserves the script's second rewrite | Violates the accepted one-write-per-path invariant | Retire the append; keep canonical evidence and block suffixes |
| Redesign delegation scoped-state writes | Closes the inherited same-scope lost-update schedule | Requires changing both Stop and the surviving SubagentStart writer outside this contract | Reject; port the existing protocol exactly and record the independent deferred goal in `tasks/todos.md` |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `src/cli/hook/stop-handler.ts` | Add | Own journal flush, recovery projection, one Stop state read, gate precedence, diagnostics, plan-completeness, and delegation fallback |
| `src/effects/loop/state-input-collector.ts` | Modify | Add a zero-argument memoized `getStopEffectiveState()` getter |
| `src/cli/hook/runtime.ts` / `route-registry.ts` | Modify | Wire the in-process handler and remove the Stop script route |
| `src/core/workflow/operation-readiness.ts` | Modify | Correct the stale pre-cutover module comment |
| `assets/hooks/stop-orchestrator.sh` / `.ai/hooks/stop-orchestrator.sh` | Delete | Complete the authority cutover with no compatibility dispatch |
| Stop tests, fixtures, docs, projections | Modify | Preserve behavior, prove ordering/write counts/lock interoperability, and re-sync only the approved Stop ripple |

### Code Snippets
No compatibility wrapper or dual dispatch is permitted. `StopProjectionBatch.commit()` owns an exact four-target projection: handoff current, resume packet, workflow handoff-refresh event, and run summary. Each target is touched exactly once, and the commit completes before the sole `getStopEffectiveState()` call.

### Data Flow
1. Parse Stop input and honor the re-entry guard.
2. Flush pending PostEdit journal events through the HRD-05 consumer.
3. Build and commit the recovery projection once; handoff and resume now exist on disk.
4. Resolve Stop Effective State once through `StateInputCollector`; read `state.readiness` verbatim.
5. Short-circuit in order: readiness block; lite exit; ready-to-ship/review diagnostics; plan-completeness block; delegation block.
6. Run minimal-change review from its canonical cached evidence without rewriting handoff/resume.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Recovery projection occurs after resolve | Medium | Fresh repos false-block | Ordering test with no pre-existing handoff plus single resolver call assertion |
| Multiple armed gates emit multiple/wrong blocks | Medium | User-visible Stop regression | Explicit short-circuit tests for all precedence pairs and suffix differences |
| Handoff/resume are rewritten twice | Medium | Acceptance violation and write amplification | Injected write observer proves each named projection target is touched once |
| TS lock writer diverges from surviving bash writers | Medium | Race/corruption | Preserve marker, retry, in-lock recheck, token release, and real subprocess race tests |
| Golden regeneration hides unrelated drift | Low | Scope expansion | Accept only the four authorized Stop cells; stop on any other diff |

## Task Contracts
- Contract file: `tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md`
- Review file: `tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md`
- Implementation notes file: `tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260720-2256-hrd-06-stop-handler-slim.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260720-2256-hrd-06-stop-handler-slim.md`; after execution revert branch `codex/hrd-06-stop-handler-slim` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260720-2256-hrd-06-stop-handler-slim.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md`, `tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md`, and `tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260720-2256-hrd-06-stop-handler-slim.md`; after execution revert branch `codex/hrd-06-stop-handler-slim` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: hrd-06-stop-handler-slim

## Context

- Sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- Backlog row: 6
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `hrd-06-stop-handler-slim` so that the acceptance line holds: In an independent PR, port the Stop orchestrator to an in-process handler that consumes the HRD-02 collected input and the LSC-07 shared readiness verbatim, flushes the pending journal, and performs exactly one batched projection-write transaction per Stop; minimal-change and delegation checks consume already-collected facts with no second Effective State resolution and no readiness recomputation, the stale pre-cutover docstring in `operation-readiness.ts` is corrected, and `stop-orchestrator.sh` is deleted with the projection re-synced in the same package

## Planning Expansion

Before editing code, use `$think` to expand this sprint row into a decision-complete implementation plan. The `$think` pass should read the sprint file, preserve the acceptance line, name concrete files or commands, and produce the detailed `plans/plan-*.md` body that drives contract execution.

## Task Breakdown

- [x] Run `$think` for backlog task `hrd-06-stop-handler-slim` using sprint `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` and acceptance: In an independent PR, port the Stop orchestrator to an in-process handler that consumes the HRD-02 collected input and the LSC-07 shared readiness verbatim, flushes the pending journal, and performs exactly one batched projection-write transaction per Stop; minimal-change and delegation checks consume already-collected facts with no second Effective State resolution and no readiness recomputation, the stale pre-cutover docstring in `operation-readiness.ts` is corrected, and `stop-orchestrator.sh` is deleted with the projection re-synced in the same package
- [x] Capture the approved `$think` output with `repo-harness run capture-plan --source waza-think --source-ref sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-06-stop-handler-slim`
- [x] Verify acceptance: In an independent PR, port the Stop orchestrator to an in-process handler that consumes the HRD-02 collected input and the LSC-07 shared readiness verbatim, flushes the pending journal, and performs exactly one batched projection-write transaction per Stop; minimal-change and delegation checks consume already-collected facts with no second Effective State resolution and no readiness recomputation, the stale pre-cutover docstring in `operation-readiness.ts` is corrected, and `stop-orchestrator.sh` is deleted with the projection re-synced in the same package

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
