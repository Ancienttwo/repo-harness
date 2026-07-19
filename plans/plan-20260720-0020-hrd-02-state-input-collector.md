# Plan: Sprint task: hrd-02-state-input-collector

> **Status**: Executing
> **Created**: 20260720-0020
> **Slug**: hrd-02-state-input-collector
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-02-state-input-collector
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **HRD-01 Delivered**: PR #94 squash-merged at `9fcd33ec`; frozen baseline `tests/fixtures/loop-runtime/characterization.json`
> **HRD-02 Execution Base**: `origin/main@b57d6323fb8ba6a0edb55117abaf9953913d9ddf` (post-HRD-01 merge plus backfill; this branch's fork point)
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260720-0020-hrd-02-state-input-collector.md`; after execution revert branch `codex/hrd-02-state-input-collector` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md`
> **Task Review**: `tasks/reviews/20260720-0020-hrd-02-state-input-collector.review.md`
> **Implementation Notes**: `tasks/notes/20260720-0020-hrd-02-state-input-collector.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-02-state-input-collector
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260720-0020-hrd-02-state-input-collector.md`
- Sprint contract: `tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md`
- Sprint review: `tasks/reviews/20260720-0020-hrd-02-state-input-collector.review.md`
- Implementation notes: `tasks/notes/20260720-0020-hrd-02-state-input-collector.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260720-0020-hrd-02-state-input-collector.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260720-0020-hrd-02-state-input-collector.md`.

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
| `src/effects/loop/state-input-collector.ts` | Create | Lazy memoizing once-per-event collector; getters delegate to existing effects authorities; no new parsers |
| `src/cli/hook/runtime.ts` | Edit | Construct one collector per event at `runHook()` entry, thread it down; route SessionStart's existing single resolution through it, byte-identical |
| `tests/state-input-collector.test.ts` | Create | Determinism, memoization (counting probe), laziness, SessionStart single-resolution invariant |
| `tests/fixtures/loop-runtime/state-input-collector.json` | Create (if golden needed) | Collector snapshot golden, path/time/PID normalized only |
| `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` | Edit | Add HRD-02 Execution Base pin per successor rule |
| Contract/review/notes for this slug | Edit | Workflow envelope |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md`
- Review file: `tasks/reviews/20260720-0020-hrd-02-state-input-collector.review.md`
- Implementation notes file: `tasks/notes/20260720-0020-hrd-02-state-input-collector.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260720-0020-hrd-02-state-input-collector.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260720-0020-hrd-02-state-input-collector.md`; after execution revert branch `codex/hrd-02-state-input-collector` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260720-0020-hrd-02-state-input-collector.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260720-0020-hrd-02-state-input-collector.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md`, `tasks/reviews/20260720-0020-hrd-02-state-input-collector.review.md`, and `tasks/notes/20260720-0020-hrd-02-state-input-collector.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260720-0020-hrd-02-state-input-collector.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260720-0020-hrd-02-state-input-collector.md`; after execution revert branch `codex/hrd-02-state-input-collector` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: hrd-02-state-input-collector

## Context

- Sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- Backlog row: 2
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `hrd-02-state-input-collector` so that the acceptance line holds: In an independent PR, implement a one-shot `StateInputCollector` at the `runHook()` entry that gathers repo facts and the single Effective State resolution once per event and hands the collected input to downstream handlers; determinism fixtures pass, SessionStart and Stop keep exactly one resolution, and no consumer behavior changes yet — consumers cut over in HRD-03..06

## Planning Expansion (resolved 2026-07-20)

Planning was resolved in the orchestrator main loop from the sprint's
Architecture Notes and the HRD-01 frozen baseline; the calibrated contract
`tasks/contracts/20260720-0020-hrd-02-state-input-collector.contract.md`
is the execution authority. Concrete design:

- `src/effects/loop/state-input-collector.ts`: lazy, memoizing,
  once-per-event collector factory covering the audit §5.1 Sense inputs;
  every getter delegates to an existing effects authority (no new parsers,
  no second representation); zero collections at construction.
- `src/cli/hook/runtime.ts`: construct exactly one collector per event at
  the `runHook()` entry and thread it down. SessionStart's existing single
  Effective State resolution routes through the collector with
  byte-identical output and subprocess count; no other call site changes
  behavior; scripts untouched.
- `tests/state-input-collector.test.ts`: determinism, memoization via
  counting probe, laziness, SessionStart single-resolution invariant.
- Regression gate: `tests/hook-runtime-characterization.test.ts` passes
  with the HRD-01 golden byte-identical; never regenerate the golden.
- Pin the HRD-02 execution base in the sprint header inside this branch
  (fork point `b57d6323`).

## Task Breakdown

- [ ] Implement `src/effects/loop/state-input-collector.ts` and wire one lazy collector per event at the `runHook()` entry, routing SessionStart's existing resolution through it byte-identically
- [ ] Implement `tests/state-input-collector.test.ts` (determinism, memoization, laziness, single-resolution invariant); HRD-01 characterization golden stays byte-identical
- [ ] Pin HRD-02 Execution Base in `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`; run the contract battery and `repo-harness run verify-contract --strict`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown (mirror; the list above is authoritative)
- [ ] Implement collector module + entry wiring (byte-identical SessionStart)
- [ ] Implement collector tests; characterization golden unchanged
- [ ] Pin HRD-02 base in sprint header; run contract verification battery
