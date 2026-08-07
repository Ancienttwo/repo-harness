# Plan: Tests: complete the subprocess-timeout sibling sweep

> **Status**: Archived
> **Created**: 20260807-1930
> **Slug**: test-timeout-sibling-sweep
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: a2381159-sibling-class
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: bun test full suite; downstream verify-sprint green
> **Rollback Surface**: single commit, test files only
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260807-1930-test-timeout-sibling-sweep.contract.md`
> **Task Review**: `tasks/reviews/20260807-1930-test-timeout-sibling-sweep.review.md`
> **Implementation Notes**: `tasks/notes/20260807-1930-test-timeout-sibling-sweep.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: a2381159-sibling-class
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260807-1930-test-timeout-sibling-sweep.md`
- Sprint contract: `tasks/contracts/20260807-1930-test-timeout-sibling-sweep.contract.md`
- Sprint review: `tasks/reviews/20260807-1930-test-timeout-sibling-sweep.review.md`
- Implementation notes: `tasks/notes/20260807-1930-test-timeout-sibling-sweep.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260807-1930-test-timeout-sibling-sweep.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260807-1930-test-timeout-sibling-sweep.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260807-1930-test-timeout-sibling-sweep.md`.

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
- Contract file: `tasks/contracts/20260807-1930-test-timeout-sibling-sweep.contract.md`
- Review file: `tasks/reviews/20260807-1930-test-timeout-sibling-sweep.review.md`
- Implementation notes file: `tasks/notes/20260807-1930-test-timeout-sibling-sweep.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260807-1930-test-timeout-sibling-sweep.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260807-1930-test-timeout-sibling-sweep.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single commit, test files only
- **Verification boundary**: bun test full suite; downstream verify-sprint green
- **Review/acceptance boundary**: `tasks/reviews/20260807-1930-test-timeout-sibling-sweep.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260807-1930-test-timeout-sibling-sweep.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260807-1930-test-timeout-sibling-sweep.contract.md`, `tasks/reviews/20260807-1930-test-timeout-sibling-sweep.review.md`, and `tasks/notes/20260807-1930-test-timeout-sibling-sweep.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260807-1930-test-timeout-sibling-sweep.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single commit, test files only

## Captured Planning Output

# Tests: complete the subprocess-timeout sibling sweep a2381159 started

## Problem

`a2381159` ("make five load-sensitive tests robust under machine load") established the convention — subprocess-spawning tests carry an explicit generous per-test timeout (30000ms) because bun's 5000ms default measures machine load, not correctness — but fixed only the five instances that had failed by then. The sibling class was left unswept. Consequence, empirically demonstrated across two consecutive shipments (gitignore-dir-level, mcp-scope-retirement): verify-sprint's `bun test` (harness process contending with its own child) repeatedly trips *different* threshold-marginal tests — `capability-config` (fixed ad hoc mid-slice), `session-context-packet-panel` fixture builder (5163ms/5000), `factor-factory` lifecycle (29323ms/15000), `continuation-attempt` breaker siblings (5036ms, 5073ms/5000) — each passing 3/3 standalone. Every future contract on this repo blocks on this class until it is closed.

## Decision

One sweep, one convention: every test that spawns CLI subprocesses (`spawnSync`/`spawn` of `bun`/CLI entrypoints, directly or through fixture helpers like `record()`/`envelopeFrom()`/`commitFixture()`) declares an explicit timeout in the `a2381159` shape (positional `30_000`; larger only where an explicit bound already exists and has proven insufficient — factor-factory's 15000 becomes 45_000 given the observed 29.3s under contention). Assertion-only tests keep the default. No production code, no test-logic changes, no timeout removal.

## Task Breakdown

- [x] Sweep `tests/` for subprocess-spawning tests lacking explicit timeouts (minimum confirmed set: remaining `continuation-attempt.test.ts` no-progress-breaker siblings, `session-context-packet-panel.test.ts` fixture builder, `factor-factory.test.ts` lifecycle; sweep the rest of the suite for the same class).
- [x] Apply the `a2381159` positional-timeout shape to each.
- [x] Full `bun test` green; spot-check the previously failing tests individually.

## Verification

`bun test` (full), `bun run check:type`. The real acceptance signal arrives downstream: mcp-scope-retirement's verify-sprint re-run going green.

## Rollback

Single commit, test files only; revert restores defaults.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Sweep `tests/` for subprocess-spawning tests lacking explicit timeouts (minimum confirmed set: remaining `continuation-attempt.test.ts` no-progress-breaker siblings, `session-context-packet-panel.test.ts` fixture builder, `factor-factory.test.ts` lifecycle; sweep the rest of the suite for the same class).
- [x] Apply the `a2381159` positional-timeout shape to each.
- [x] Full `bun test` green; spot-check the previously failing tests individually.
