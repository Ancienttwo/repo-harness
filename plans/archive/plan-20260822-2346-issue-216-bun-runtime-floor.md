# Plan: Fix issue 216 Bun runtime floor

> **Status**: Archived
> **Created**: 20260822-2346
> **Slug**: issue-216-bun-runtime-floor
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Bun 1.3.14 is rejected while Bun 1.4.0 passes all installer and publication receipt gates
> **Rollback Surface**: Before execution remove `plans/plan-20260822-2346-issue-216-bun-runtime-floor.md`; after execution revert branch `codex/issue-216-bun-runtime-floor` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260822-2346-issue-216-bun-runtime-floor.contract.md`
> **Task Review**: `tasks/reviews/20260822-2346-issue-216-bun-runtime-floor.review.md`
> **Implementation Notes**: `tasks/notes/20260822-2346-issue-216-bun-runtime-floor.notes.md`

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

- Active plan: `plans/plan-20260822-2346-issue-216-bun-runtime-floor.md`
- Sprint contract: `tasks/contracts/20260822-2346-issue-216-bun-runtime-floor.contract.md`
- Sprint review: `tasks/reviews/20260822-2346-issue-216-bun-runtime-floor.review.md`
- Implementation notes: `tasks/notes/20260822-2346-issue-216-bun-runtime-floor.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260822-2346-issue-216-bun-runtime-floor.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260822-2346-issue-216-bun-runtime-floor.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260822-2346-issue-216-bun-runtime-floor.md`.

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
- Contract file: `tasks/contracts/20260822-2346-issue-216-bun-runtime-floor.contract.md`
- Review file: `tasks/reviews/20260822-2346-issue-216-bun-runtime-floor.review.md`
- Implementation notes file: `tasks/notes/20260822-2346-issue-216-bun-runtime-floor.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260822-2346-issue-216-bun-runtime-floor.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260822-2346-issue-216-bun-runtime-floor.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260822-2346-issue-216-bun-runtime-floor.md`; after execution revert branch `codex/issue-216-bun-runtime-floor` or the explicitly reviewed diff.
- **Verification boundary**: Bun 1.3.14 is rejected while Bun 1.4.0 passes all installer and publication receipt gates
- **Review/acceptance boundary**: `tasks/reviews/20260822-2346-issue-216-bun-runtime-floor.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260822-2346-issue-216-bun-runtime-floor.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260822-2346-issue-216-bun-runtime-floor.contract.md`, `tasks/reviews/20260822-2346-issue-216-bun-runtime-floor.review.md`, and `tasks/notes/20260822-2346-issue-216-bun-runtime-floor.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260822-2346-issue-216-bun-runtime-floor.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260822-2346-issue-216-bun-runtime-floor.md`; after execution revert branch `codex/issue-216-bun-runtime-floor` or the explicitly reviewed diff.

## Captured Planning Output

# Fix issue 216: require Bun 1.4.0

## Goal
Align the public Bun runtime floor with the already-landed Bun 1.4.0 CI baseline so Bun 1.3.14 is rejected before publication provider execution.

## Scope
- Update package, bootstrap installers, global runtime bootstrap, agent-fleet helper, current docs, and deterministic projections from 1.1.35 to 1.4.0.
- Add regression coverage that rejects 1.3.14 and accepts 1.4.0.
- Do not add explicit provider environment compatibility logic or change publication semantics.

## Task Breakdown
- [x] Pin regression expectations to Bun 1.4.0 and observe the old implementation fail.
- [x] Raise every current runtime/install authority and regenerate projections.
- [x] Run targeted tests, required repository checks, package inspection, and isolated install smoke.

## Verification
- bun test tests/install-scripts.test.ts tests/install-agent-fleet.test.ts tests/cli/global-runtime-init.test.ts tests/unit/publication-receipt.test.ts
- bun run check:helpers
- bun run check:reference-configs
- Required checks from AGENTS.md.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Pin regression expectations to Bun 1.4.0 and observe the old implementation fail.
- [x] Raise every current runtime/install authority and regenerate projections.
- [x] Run targeted tests, required repository checks, package inspection, and isolated install smoke.
