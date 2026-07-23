# Plan: Converge workflow status and historical archive authority

> **Status**: Archived
> **Created**: 20260724-0324
> **Slug**: workflow-status-archive-authority
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: focused status/archive regressions plus one final verify-sprint
> **Rollback Surface**: revert the bounded policy/runtime package and its evidence-proven archive moves
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260724-0324-workflow-status-archive-authority.contract.md`
> **Task Review**: `tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md`
> **Implementation Notes**: `tasks/notes/20260724-0324-workflow-status-archive-authority.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260724-0324-workflow-status-archive-authority.md`
- Sprint contract: `tasks/contracts/20260724-0324-workflow-status-archive-authority.contract.md`
- Sprint review: `tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md`
- Implementation notes: `tasks/notes/20260724-0324-workflow-status-archive-authority.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260724-0324-workflow-status-archive-authority.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260724-0324-workflow-status-archive-authority.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260724-0324-workflow-status-archive-authority.md`.

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
- Contract file: `tasks/contracts/20260724-0324-workflow-status-archive-authority.contract.md`
- Review file: `tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md`
- Implementation notes file: `tasks/notes/20260724-0324-workflow-status-archive-authority.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260724-0324-workflow-status-archive-authority.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260724-0324-workflow-status-archive-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: revert the bounded policy/runtime package and its evidence-proven archive moves
- **Verification boundary**: focused status/archive regressions plus one final verify-sprint
- **Review/acceptance boundary**: `tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260724-0324-workflow-status-archive-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260724-0324-workflow-status-archive-authority.contract.md`, `tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md`, and `tasks/notes/20260724-0324-workflow-status-archive-authority.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260724-0324-workflow-status-archive-authority.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: revert the bounded policy/runtime package and its evidence-proven archive moves

## Captured Planning Output

## Goal
Converge the three legacy plan-status consumers on the policy-owned `active_plan.statuses` lifecycle, add an explicit sealed-terminal evidence mode for historical Completed archives, classify all 61 current root plans, and archive only plans that independently satisfy the owner-approved triple: contract status exactly `Fulfilled`, review recommendation exactly `pass`, and a structurally complete recorded Acceptance Receipt Projection.

## P1: Architecture Map
- Known plan-status authority: `.ai/harness/policy.json#active_plan.statuses`, mirrored by `assets/workflow-contract.v1.json` and emitted policy templates in `scripts/lib/project-init-lib.sh` / `assets/templates/helpers/ensure-task-workflow.sh`.
- Consumers to converge: `src/cli/hook/mutation-guard.ts` planning-state block, `.ai/hooks/lib/workflow-state.sh` plus `assets/hooks/lib/workflow-state.sh` transition validation, and `scripts/check-task-workflow.sh` plus template mirror terminal-plan checks.
- Archive boundary: `scripts/archive-workflow.sh` plus template mirror owns Completed gating and transactional moves; `tests/archive-evidence-gates.test.ts` owns the behavior contract.
- Durable historical evidence: each root plan's declared/stem contract, declared/stem review, exact contract/review headers, and the review's `## Acceptance Receipt Projection`; ignored runtime checks or current ledger state cannot certify a historical plan.
- Out of scope: rewriting frozen historical contracts/reviews, treating `Done`/`Active` as `Fulfilled`, accepting legacy prose as a typed receipt, changing PRD/sprint status semantics, or archiving active/blocked/user-owned/ambiguous work.

## P2: Concrete Trace
1. Policy emits an ordered known-status array.
2. Mutation guard, transition validator, and terminal-status checker load/project that policy instead of maintaining independent literal unions; missing/malformed projection data fails closed.
3. `archive-workflow --outcome Completed` keeps current-evidence mode unchanged by default; an explicit sealed-terminal mode resolves the plan's own contract/review family, requires the exact approved triple, and then reuses the existing transactional archive path.
4. A read-only classifier evaluates every `plans/plan-*.md`, records evidence paths/statuses/verdict, and marks only exact triple matches AUTO; all other rows are HOLD with a deterministic reason.
5. Apply archive moves only to AUTO rows; refresh current status once and preserve an audit table.

## P3: Decision Rationale
- Use one policy-owned lifecycle schema and deterministic projections; do not add a second hardcoded status union.
- Make sealed-terminal historical evidence an explicit operator-selected mode, not an implicit fallback from stale current checks.
- Require byte-level explicit headers and a complete typed receipt projection. Do not infer, migrate, or synthesize missing authority.
- Preserve current Completed closeout semantics for live work. Historical sweep is fail-closed and may legitimately archive zero plans.
- At 10x history size the first pressure point is repeated shell scanning, so classification must be one bounded pass with a machine-readable/durable audit, not per-plan full verification.

## Scope
- Update policy schema/projections and all installed/template mirrors needed to keep self-host/adoption parity.
- Add focused tests for authority projection, fail-closed missing/malformed policy, terminal classification, sealed-history acceptance/rejection, and current-mode non-regression.
- Classify the current 61 root plans and transactionally archive exact AUTO rows only.
- Remove the two deferred Todo rows only if their acceptance conditions are fully met; otherwise rewrite the archive row with exact remaining evidence gap.

## Task Breakdown
- [x] Converge the three legacy plan-status consumers on policy projections with parity tests.
- [x] Add explicit sealed-terminal historical archive mode and focused acceptance/rejection tests.
- [x] Classify all 61 root plans, record the audit, and archive only exact triple matches.
- [x] Sync workflow artifacts and run focused checks followed by one final `verify-sprint` gate.

## Evidence Contract
- State/progress path: this plan, its contract/review/notes, `tasks/todos.md`, and the historical classification audit.
- Verification evidence: focused status/archive tests, policy/template parity checks, exact pre/post root-plan counts, and one final `verify-sprint`.
- Evaluator rubric: no independent status unions remain at the three named consumers; sealed mode accepts only exact Fulfilled + pass + typed receipt; default live closeout is unchanged; no ambiguous plan moves.
- Stop condition: all task rows complete, every planned move is audit-backed, review passes, and final gate is green.
- Rollback surface: revert the bounded package and archive renames; no external state, schema migration, or compatibility path.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Converge the three legacy plan-status consumers on policy projections with parity tests.
- [x] Add explicit sealed-terminal historical archive mode and focused acceptance/rejection tests.
- [x] Classify all 61 root plans, record the audit, and archive only exact triple matches.
- [x] Sync workflow artifacts and run focused checks followed by one final `verify-sprint` gate.
