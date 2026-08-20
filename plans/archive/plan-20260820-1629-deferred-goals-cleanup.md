# Plan: Deferred goals cleanup: due-trigger batch

> **Status**: Archived
> **Created**: 20260820-1629
> **Slug**: deferred-goals-cleanup
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260820-1629-deferred-goals-cleanup.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260820-1629-deferred-goals-cleanup.md`; after execution revert branch `codex/deferred-goals-cleanup` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-1629-deferred-goals-cleanup.contract.md`
> **Task Review**: `tasks/reviews/20260820-1629-deferred-goals-cleanup.review.md`
> **Implementation Notes**: `tasks/notes/20260820-1629-deferred-goals-cleanup.notes.md`

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

- Active plan: `plans/plan-20260820-1629-deferred-goals-cleanup.md`
- Sprint contract: `tasks/contracts/20260820-1629-deferred-goals-cleanup.contract.md`
- Sprint review: `tasks/reviews/20260820-1629-deferred-goals-cleanup.review.md`
- Implementation notes: `tasks/notes/20260820-1629-deferred-goals-cleanup.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-1629-deferred-goals-cleanup.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-1629-deferred-goals-cleanup.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-1629-deferred-goals-cleanup.md`.

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
- Contract file: `tasks/contracts/20260820-1629-deferred-goals-cleanup.contract.md`
- Review file: `tasks/reviews/20260820-1629-deferred-goals-cleanup.review.md`
- Implementation notes file: `tasks/notes/20260820-1629-deferred-goals-cleanup.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-1629-deferred-goals-cleanup.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-1629-deferred-goals-cleanup.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260820-1629-deferred-goals-cleanup.md`; after execution revert branch `codex/deferred-goals-cleanup` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260820-1629-deferred-goals-cleanup.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260820-1629-deferred-goals-cleanup.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-1629-deferred-goals-cleanup.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-1629-deferred-goals-cleanup.contract.md`, `tasks/reviews/20260820-1629-deferred-goals-cleanup.review.md`, and `tasks/notes/20260820-1629-deferred-goals-cleanup.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-1629-deferred-goals-cleanup.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260820-1629-deferred-goals-cleanup.md`; after execution revert branch `codex/deferred-goals-cleanup` or the explicitly reviewed diff.

## Captured Planning Output

## Goal
Execute the three due-trigger deferred goals from tasks/todos.md as one merge unit: (1) widen protected-helper trusted Node discovery with `~/.local/bin/node` in `src/effects/runtime/node-candidates.ts` plus test expectations; (2) correct `docs/architecture/modules/runtime-harness/hook-adapters.md` §3.3 to match measured hook telemetry (Stop.default / PostToolUse.bash dominance, sink attribution split, all-or-nothing SessionStart blob); (3) reproduce and prove the full-suite timing-flake load-sensitivity class (three known member tests) under controlled load, landing only test-side determinism changes backed by the proven mechanism.

## Non-goals
No production-source changes for (3) beyond what the proven mechanism justifies in test files; no guard/policy weakening; no new abstractions; the parallel session's WIP (v0.5 refactor plan deletions, projection-publication-ownership) stays untouched.

## Task Breakdown
- [ ] Widen trustedNodeCandidates with `~/.local/bin/node` and update the two provider-test assertions; delete the closed ledger row.
- [ ] Rewrite hook-adapters.md §3.3 from fresh telemetry aggregation; delete the closed ledger row.
- [ ] Timing-flake diagnosis under controlled load; apply proven test-side determinism fixes; update the ledger row with the outcome.
- [ ] Focused tests green, required checks green, single commit.

## Verification Boundary
bun test tests/architecture-projection-provider.test.ts, tests/readme-dx.test.ts, focused flake-member tests; check-task-sync; check-task-workflow --strict.

## Rollback Surface
Revert the single commit; no schema, migration, or external state.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Widen trustedNodeCandidates with `~/.local/bin/node` and update the two provider-test assertions; delete the closed ledger row.
- [ ] Rewrite hook-adapters.md §3.3 from fresh telemetry aggregation; delete the closed ledger row.
- [ ] Timing-flake diagnosis under controlled load; apply proven test-side determinism fixes; update the ledger row with the outcome.
- [ ] Focused tests green, required checks green, single commit.
