# Plan: Sprint task: hrd-01-loop-event-protocol-and-runtime-characterization

> **Status**: Archived
> **Created**: 20260719-1540
> **Slug**: hrd-01-loop-event-protocol-and-runtime-characterization
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-01-loop-event-protocol-and-runtime-characterization
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Sprint Planning Base**: `origin/main@2c39c4a46c83c604fc9ce2fe2752a79d93edbddc`
> **HRD-01 Execution Base**: `origin/main@4f4666efd3810ed50dd1d5da17e44fd721d84689` (post-sprint-planning push; this branch's fork point)
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md`; after execution revert branch `codex/hrd-01-loop-event-protocol-and-runtime-characterization` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md`
> **Task Review**: `tasks/reviews/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.review.md`
> **Implementation Notes**: `tasks/notes/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-01-loop-event-protocol-and-runtime-characterization
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md`
- Sprint contract: `tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md`
- Sprint review: `tasks/reviews/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.review.md`
- Implementation notes: `tasks/notes/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md`.

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
| `src/core/loop/loop-event-protocol.ts` | Create | Pure host-neutral `LoopEvent` union + `LoopEventResult` + total `routeToLoopEvent` mapping over the 11 route tuples; zero consumers |
| `tests/loop-event-protocol.test.ts` | Create | Route-mapping totality (11 tuples, no extras) and purity smoke |
| `tests/hook-runtime-characterization.test.ts` | Create | Per-route `runHook()` characterization: script sequence, child-invocation counts via PATH stubs, decision/exit code, durable-write set |
| `tests/fixtures/loop-runtime/characterization.json` | Create | Frozen baseline records for all 11 routes; only path/time/PID normalized |
| `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` | Edit | Pin HRD-01 Execution Base per successor rule |
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
- Contract file: `tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md`
- Review file: `tasks/reviews/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.review.md`
- Implementation notes file: `tasks/notes/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md`; after execution revert branch `codex/hrd-01-loop-event-protocol-and-runtime-characterization` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md`, `tasks/reviews/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.review.md`, and `tasks/notes/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.md`; after execution revert branch `codex/hrd-01-loop-event-protocol-and-runtime-characterization` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: hrd-01-loop-event-protocol-and-runtime-characterization

## Context

- Sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`
- Backlog row: 1
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `hrd-01-loop-event-protocol-and-runtime-characterization` so that the acceptance line holds: In an independent PR, establish host-neutral `LoopEvent`/`LoopEventResult` typed contracts as a pure module with zero consumers, and freeze the current per-event runtime baseline for all 11 routes (script sequence, subprocess count, decision/reason/exit code, durable-write set) as characterization fixtures; no host-visible behavior change, no script retired, and the fixtures normalize only path/time/PID data

## Planning Expansion (resolved 2026-07-19)

Planning was resolved in the orchestrator main loop from the sprint's
Architecture Notes and the cited post-LSC runtime survey; the calibrated
contract `tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md`
is the execution authority. Concrete design:

- `src/core/loop/loop-event-protocol.ts`: `LoopEvent` discriminated union
  (8 kinds per audit §6), `LoopEventResult` (protocol 1, eventId, decision
  allow/block/advise/noop with structured reasons and nextAction, planned
  effects, telemetry counters), and a total `routeToLoopEvent` mapping over
  the 11 tuples of `src/cli/hook/route-registry.ts:56-123`. Pure module,
  type-only imports, zero consumers, passes `check:state-boundaries`.
- `tests/hook-runtime-characterization.test.ts` +
  `tests/fixtures/loop-runtime/characterization.json`: per route, invoke
  `runHook()` against a temp fixture repo with this repo's hook projection;
  record script sequence, child-invocation counts of `bun`/`git`/CLI via
  PATH-instrumented stubs, decision/reason/exit code, and the durable-write
  set as a before/after tree diff. Normalize only path/time/PID.
- Pin the HRD-01 execution base in the sprint header (successor-pin
  precedent: the pin lands inside this row's branch, which knows its fork
  point `4f4666ef`).

## Task Breakdown

- [ ] Implement `src/core/loop/loop-event-protocol.ts` and `tests/loop-event-protocol.test.ts` (mapping totality over 11 tuples, purity smoke)
- [ ] Implement `tests/hook-runtime-characterization.test.ts` and record `tests/fixtures/loop-runtime/characterization.json` for all 11 routes
- [ ] Pin HRD-01 Execution Base in `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md`; run the two new test files, `bun run check:type`, `bun run check:state-boundaries`, `bun run check:hooks`, and `repo-harness run verify-contract --contract tasks/contracts/20260719-1540-hrd-01-loop-event-protocol-and-runtime-characterization.contract.md --strict`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown (mirror; the list above is authoritative)
- [ ] Implement `src/core/loop/loop-event-protocol.ts` and `tests/loop-event-protocol.test.ts`
- [ ] Implement `tests/hook-runtime-characterization.test.ts` and `tests/fixtures/loop-runtime/characterization.json`
- [ ] Pin HRD-01 Execution Base in the sprint header and run the contract's verification commands
