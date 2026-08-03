# Plan: Sprint task: WP3 no-progress circuit breaker

> **Status**: Executing
> **Created**: 20260803-2040
> **Slug**: wp3-no-progress-circuit-breaker
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260803-1810-long-run-anti-drift.sprint.md#WP3 no-progress circuit breaker
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260803-2040-wp3-no-progress-circuit-breaker.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md`; after execution revert branch `codex/wp3-no-progress-circuit-breaker` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260803-2040-wp3-no-progress-circuit-breaker.contract.md`
> **Task Review**: `tasks/reviews/20260803-2040-wp3-no-progress-circuit-breaker.review.md`
> **Implementation Notes**: `tasks/notes/20260803-2040-wp3-no-progress-circuit-breaker.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260803-1810-long-run-anti-drift.sprint.md#WP3 no-progress circuit breaker
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md`
- Sprint contract: `tasks/contracts/20260803-2040-wp3-no-progress-circuit-breaker.contract.md`
- Sprint review: `tasks/reviews/20260803-2040-wp3-no-progress-circuit-breaker.review.md`
- Implementation notes: `tasks/notes/20260803-2040-wp3-no-progress-circuit-breaker.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260803-2040-wp3-no-progress-circuit-breaker.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md`.

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
- Contract file: `tasks/contracts/20260803-2040-wp3-no-progress-circuit-breaker.contract.md`
- Review file: `tasks/reviews/20260803-2040-wp3-no-progress-circuit-breaker.review.md`
- Implementation notes file: `tasks/notes/20260803-2040-wp3-no-progress-circuit-breaker.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260803-2040-wp3-no-progress-circuit-breaker.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md`; after execution revert branch `codex/wp3-no-progress-circuit-breaker` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260803-2040-wp3-no-progress-circuit-breaker.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260803-2040-wp3-no-progress-circuit-breaker.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260803-2040-wp3-no-progress-circuit-breaker.contract.md`, `tasks/reviews/20260803-2040-wp3-no-progress-circuit-breaker.review.md`, and `tasks/notes/20260803-2040-wp3-no-progress-circuit-breaker.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260803-2040-wp3-no-progress-circuit-breaker.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md`; after execution revert branch `codex/wp3-no-progress-circuit-breaker` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: WP3 no-progress circuit breaker

## Context

- Sprint: `plans/sprints/20260803-1810-long-run-anti-drift.sprint.md`
- Backlog row: 3
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `WP3 no-progress circuit breaker` so that the acceptance line holds: Two no-progress turns yield halt:no_progress; receipts stay in ignored runs/ outside Effective State (WP3 spec)

## Planning Expansion

Satisfied by the program's dual-track planning pass (2026-08-03): the
attempt-ledger honesty constraints and falsifiability clause are adjudicated
in `docs/researches/20260803-loopx-comparative-analysis.md` (round-2
addendum) and frozen in the sprint WP3 spec + task contract, including two
parent-level decisions fixed in the contract: single flock-appended
`attempts.jsonl` ledger (no `<run-id>` sharding until observed contention)
and fail-closed `halt:attempt_ledger_unreadable` on corrupt ledger lines. No
separate `$think` re-expansion.

## Task Breakdown

- [x] Falsifier gate first: in a fixture repo, make real material progress
  (check a plan task / land evidence) and confirm the envelope
  `progress_token` moves; if it does not, stop and hand back (fingerprint
  must be fixed, no heuristics here).
- [x] `AttemptReceiptV1` type + pure stall evaluation in `src/core/state/`:
  given (receipt sequence for a unit_ref, current progress_token), decide
  `none | no_progress | ledger_unreadable`; ≥2 trailing consecutive
  `completed` receipts with before === after === current token → stall;
  token change or `resumed` receipt resets; other units' receipts ignored.
- [x] `repo-harness state attempt` recorder in `src/cli/commands/state.ts` +
  ledger append IO in `src/effects/state/`: validate shape, atomic flock
  append of one JSONL line to `.ai/harness/runs/continuation/attempts.jsonl`;
  `--outcome resumed` may omit tokens; recorder reads no state and touches
  no tracked file.
- [x] Envelope integration: `resolve-continuation-envelope.ts` reads the
  ledger (read-only) and `project-continuation-envelope.ts` applies the
  stall verdict — route `halt` reason `no_progress` /
  `attempt_ledger_unreadable` — only after the WP2 route computation would
  otherwise yield an actionable route (a halted/complete/idle repo never
  needs the breaker).
- [x] Tests `tests/continuation-attempt.test.ts`: recorder append + concurrent
  append safety; two-no-progress halt; single no-progress no-halt;
  token-change reset; `resumed` reset then restart count; different-unit
  isolation; corrupt-line fail-closed halt; absent ledger identical to WP2
  behavior; determinism (identical repo bytes + ledger bytes → byte-identical
  envelope); authority fence (receipts never alter `state_revision` /
  `progress_token`; `state next` still writes nothing).
- [x] Verify acceptance: exit-criteria tests + `bun run check:type` green in
  the worktree.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
