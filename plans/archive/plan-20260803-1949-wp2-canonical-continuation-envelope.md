# Plan: Sprint task: WP2 canonical continuation envelope

> **Status**: Archived
> **Created**: 20260803-1949
> **Slug**: wp2-canonical-continuation-envelope
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260803-1810-long-run-anti-drift.sprint.md#WP2 canonical continuation envelope
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260803-1949-wp2-canonical-continuation-envelope.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md`; after execution revert branch `codex/wp2-canonical-continuation-envelope` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260803-1949-wp2-canonical-continuation-envelope.contract.md`
> **Task Review**: `tasks/reviews/20260803-1949-wp2-canonical-continuation-envelope.review.md`
> **Implementation Notes**: `tasks/notes/20260803-1949-wp2-canonical-continuation-envelope.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260803-1810-long-run-anti-drift.sprint.md#WP2 canonical continuation envelope
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md`
- Sprint contract: `tasks/contracts/20260803-1949-wp2-canonical-continuation-envelope.contract.md`
- Sprint review: `tasks/reviews/20260803-1949-wp2-canonical-continuation-envelope.review.md`
- Implementation notes: `tasks/notes/20260803-1949-wp2-canonical-continuation-envelope.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260803-1949-wp2-canonical-continuation-envelope.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md`.

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
- Contract file: `tasks/contracts/20260803-1949-wp2-canonical-continuation-envelope.contract.md`
- Review file: `tasks/reviews/20260803-1949-wp2-canonical-continuation-envelope.review.md`
- Implementation notes file: `tasks/notes/20260803-1949-wp2-canonical-continuation-envelope.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260803-1949-wp2-canonical-continuation-envelope.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md`; after execution revert branch `codex/wp2-canonical-continuation-envelope` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260803-1949-wp2-canonical-continuation-envelope.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260803-1949-wp2-canonical-continuation-envelope.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260803-1949-wp2-canonical-continuation-envelope.contract.md`, `tasks/reviews/20260803-1949-wp2-canonical-continuation-envelope.review.md`, and `tasks/notes/20260803-1949-wp2-canonical-continuation-envelope.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260803-1949-wp2-canonical-continuation-envelope.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260803-1949-wp2-canonical-continuation-envelope.md`; after execution revert branch `codex/wp2-canonical-continuation-envelope` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: WP2 canonical continuation envelope

## Context

- Sprint: `plans/sprints/20260803-1810-long-run-anti-drift.sprint.md`
- Backlog row: 2
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `WP2 canonical continuation envelope` so that the acceptance line holds: `state next --json` byte-identical, one unit or halt per call, read-only, routes derive from Effective State (WP2 spec)

## Planning Expansion

Satisfied by the program's dual-track planning pass (2026-08-03): route
vocabulary and design constraints are adjudicated in
`docs/researches/20260803-loopx-comparative-analysis.md` (round-2 addendum)
and frozen in the sprint WP2 spec + task contract. No separate `$think`
re-expansion.

## Task Breakdown

- [x] Route decision table first (Falsifier gate): enumerate the six routes
  (`continue_active_plan`, `advance_sprint`, `verify_or_finish`, `halt`,
  `complete`, `idle`) against the actual `EffectiveStateV1` fields
  (`readiness`, `next_action`, `blockers`, `state_revision`,
  `progress_token`) plus active-sprint marker/backlog state; if any route
  lacks deriving fields, stop and hand back with the missing-field list.
- [x] `ContinuationEnvelopeV1` type next to the existing state types
  (`{protocol: 1, kind: "repo-harness-continuation-envelope", route,
  unit_ref, authority_revision, progress_token, command, reason}`), plus a
  pure projection function `(resolvedState, sprintState) -> envelope` in the
  layer matching the existing resolver/projector split. No environmental
  inputs; stable key order.
- [x] `repo-harness state next --json` wiring in
  `src/cli/commands/state.ts`: resolve → project → print; exit 0 on any
  well-formed envelope (including `halt`); no writes of any kind (no cache,
  no marker updates, no checks emission).
- [x] For actionable routes carry the exact existing command string
  (`advance_sprint` → `repo-harness run sprint-backlog start-task
  --execute`; `verify_or_finish` → the contract completion-gate command;
  `continue_active_plan` → the active plan/contract status command); row
  selection stays with `sprint-backlog` — the envelope names the command, it
  never parses rows itself beyond what the existing sprint surfaces already
  expose.
- [x] Tests `tests/continuation-envelope.test.ts`: one fixture per route
  proving derivation; byte-identical stdout across two invocations on
  identical repo bytes; read-only proof (tree + `.ai/harness/` unchanged
  after invocation); `continue_active_plan` vs `verify_or_finish`
  distinction fixture.
- [x] Verify acceptance: exit-criteria tests + `bun run check:type` green in
  the worktree; `tests/effective-state.test.ts` and
  `tests/check-state-boundaries.test.ts` stay green.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
