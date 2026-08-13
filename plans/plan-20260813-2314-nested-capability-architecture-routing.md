# Plan: Nested capability architecture routing

> **Status**: Executing
> **Created**: 20260813-2314
> **Slug**: nested-capability-architecture-routing
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Red-green architecture-queue regression plus helper projection sync and repository required checks.
> **Rollback Surface**: Revert the focused architecture-queue helper, packaged projection, regression test, and this workflow package.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260813-2314-nested-capability-architecture-routing.contract.md`
> **Task Review**: `tasks/reviews/20260813-2314-nested-capability-architecture-routing.review.md`
> **Implementation Notes**: `tasks/notes/20260813-2314-nested-capability-architecture-routing.notes.md`

## Agentic Routing
- Selected route: hunt
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260813-2314-nested-capability-architecture-routing.md`
- Sprint contract: `tasks/contracts/20260813-2314-nested-capability-architecture-routing.contract.md`
- Sprint review: `tasks/reviews/20260813-2314-nested-capability-architecture-routing.review.md`
- Implementation notes: `tasks/notes/20260813-2314-nested-capability-architecture-routing.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260813-2314-nested-capability-architecture-routing.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260813-2314-nested-capability-architecture-routing.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260813-2314-nested-capability-architecture-routing.md`.

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
- Contract file: `tasks/contracts/20260813-2314-nested-capability-architecture-routing.contract.md`
- Review file: `tasks/reviews/20260813-2314-nested-capability-architecture-routing.review.md`
- Implementation notes file: `tasks/notes/20260813-2314-nested-capability-architecture-routing.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260813-2314-nested-capability-architecture-routing.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260813-2314-nested-capability-architecture-routing.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the focused architecture-queue helper, packaged projection, regression test, and this workflow package.
- **Verification boundary**: Red-green architecture-queue regression plus helper projection sync and repository required checks.
- **Review/acceptance boundary**: `tasks/reviews/20260813-2314-nested-capability-architecture-routing.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260813-2314-nested-capability-architecture-routing.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260813-2314-nested-capability-architecture-routing.contract.md`, `tasks/reviews/20260813-2314-nested-capability-architecture-routing.review.md`, and `tasks/notes/20260813-2314-nested-capability-architecture-routing.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260813-2314-nested-capability-architecture-routing.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the focused architecture-queue helper, packaged projection, regression test, and this workflow package.

## Captured Planning Output

> **Task Profile**: bugfix

### P1 Architecture Map
- Boundary: scripts/architecture-queue.sh classifies changed paths before scripts/capability-resolver.ts routes them; assets/templates/helpers/architecture-queue.sh is the deterministic packaged projection; tests/architecture-queue.test.ts is the focused regression surface.
- Out of scope: fin-forecast capability registration, contract scope, Archcontext projection enablement, semantic architecture prose.

### P2 Concrete Trace
- Repro: packages/providers/hyperliquid/src/l1-lifecycle-evidence.ts reaches classify_change, misses the one-level workspace regexes, returns none unrelated, and record_command exits before capability-resolver match.
- Expected: if longest-prefix capability resolution matches packages/providers/hyperliquid and the file is under a src segment, classify it as low source-change and route the request to provider-hyperliquid.

### P3 Decision
- Preserve internal and agent-context exclusions and all existing severity rules. Only consult the resolved capability before the final unrelated exit; do not invent a root fallback for unmatched source changes.
- At 10x workspace depth, matching remains bounded by the registry longest-prefix resolver and one path-segment check; no directory-depth regex grows with the monorepo.

### Files
- scripts/architecture-queue.sh
- assets/templates/helpers/architecture-queue.sh
- tests/architecture-queue.test.ts
- generated workflow artifacts for this plan and contract

### Acceptance
- Red: focused regression test fails on current code with unrelated.
- Green: the same test creates provider-hyperliquid.md with the registered architecture module and no root.md.
- Projection sync and full required checks pass.

- [x] Add and capture the failing nested-workspace regression guard.
- [x] Resolve capability before the final unrelated exit and classify matched src paths as source-change.
- [x] Regenerate the packaged helper projection and run focused plus required checks.
- [ ] Record review and close workflow artifacts.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add and capture the failing nested-workspace regression guard.
- [x] Resolve capability before the final unrelated exit and classify matched src paths as source-change.
- [x] Regenerate the packaged helper projection and run focused plus required checks.
- [ ] Record review and close workflow artifacts.
