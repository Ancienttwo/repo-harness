# Plan: Sprint task: lsc-08-adapter-parity-and-docs

> **Status**: Executing
> **Created**: 20260719-0155
> **Slug**: lsc-08-adapter-parity-and-docs
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md#lsc-08-adapter-parity-and-docs
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Post-ESA Program Baseline**: `origin/main@3b33cea2422b1aa1e5be9080be54f731c4f2015d` (PR #79)
> **LSC-08 Execution Base**: `origin/main@89f75d8a` (post-LSC-07 merge PR #89 plus backfill)
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md`; after execution revert branch `codex/lsc-08-adapter-parity-and-docs` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md`
> **Task Review**: `tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md`
> **Implementation Notes**: `tasks/notes/20260719-0155-lsc-08-adapter-parity-and-docs.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md#lsc-08-adapter-parity-and-docs
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md`
- Sprint contract: `tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md`
- Sprint review: `tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md`
- Implementation notes: `tasks/notes/20260719-0155-lsc-08-adapter-parity-and-docs.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md`.

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
- Contract file: `tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md`
- Review file: `tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md`
- Implementation notes file: `tasks/notes/20260719-0155-lsc-08-adapter-parity-and-docs.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md`; after execution revert branch `codex/lsc-08-adapter-parity-and-docs` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: worktree_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260719-0155-lsc-08-adapter-parity-and-docs.contract.md`, `tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md`, and `tasks/notes/20260719-0155-lsc-08-adapter-parity-and-docs.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260719-0155-lsc-08-adapter-parity-and-docs.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260719-0155-lsc-08-adapter-parity-and-docs.md`; after execution revert branch `codex/lsc-08-adapter-parity-and-docs` or the explicitly reviewed diff.

## Captured Planning Output

# Sprint Task: lsc-08-adapter-parity-and-docs

## Context

- Sprint: `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md`
- Backlog row: 8
- Mode: contract
- Read the sprint Source PRD and Architecture Notes before implementation.
- The sprint row is a long-task waypoint, not a detailed implementation plan.

## Goal

Deliver backlog task `lsc-08-adapter-parity-and-docs` so that the acceptance line holds: In an independent PR, prove CLI/MCP/Hook/Skill parity for profile, operation, decision, reason, and readiness on the same fixtures; public route/tool/CLI names remain unchanged and parity/docs gates pass

## Planning Expansion

Before editing code, use `$think` to expand this sprint row into a decision-complete implementation plan. The `$think` pass should read the sprint file, preserve the acceptance line, name concrete files or commands, and produce the detailed `plans/plan-*.md` body that drives contract execution.

## Task Breakdown

- [ ] Run `$think` for backlog task `lsc-08-adapter-parity-and-docs` using sprint `plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md` and acceptance: In an independent PR, prove CLI/MCP/Hook/Skill parity for profile, operation, decision, reason, and readiness on the same fixtures; public route/tool/CLI names remain unchanged and parity/docs gates pass
- [ ] Capture the approved `$think` output with `repo-harness run capture-plan --source waza-think --source-ref sprint:plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md#lsc-08-adapter-parity-and-docs`
- [ ] Verify acceptance: In an independent PR, prove CLI/MCP/Hook/Skill parity for profile, operation, decision, reason, and readiness on the same fixtures; public route/tool/CLI names remain unchanged and parity/docs gates pass

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add readiness + guidance to MCP compact state (verbatim copies, no renames) and re-pin MCP output-shape tests additively
- [x] Write the four-adapter parity assertions against the single authority (falsifier first: the allowed-to-stop/not-ready-to-ship cross-adapter assertion), incl. Skill-guidance parity
- [x] Recalibrate the characterization probe to the authority surface and regenerate delta-shaped (missing fields may only shrink, no fake closure)
- [x] Land the two carried follow-ups: REPO_HARNESS_CLI pinning in the five hook.test.ts fixtures; scalar-readiness guard in stop-orchestrator (+mirror+sync)
- [x] State the parity contract in docs/architecture/index.md
- [x] Pin `LSC-08 Execution Base: origin/main@89f75d8a` in the sprint header per successor rule
- [x] Record the migration note and the deliberate non-goals (pre-edit/ship kernel cutover stays future work) in notes
- [x] Run the full Exit Criteria command surface in this worktree and record evidence
- [x] Author the task review, obtain independent external acceptance, and ship as an independent PR against base `89f75d8a`
- [ ] Capture the approved `$think` output with `repo-harness run capture-plan --source waza-think --source-ref sprint:plans/sprints/20260716-0101-loop-semantics-convergence.sprint.md#lsc-08-adapter-parity-and-docs`
- [ ] Verify acceptance: In an independent PR, prove CLI/MCP/Hook/Skill parity for profile, operation, decision, reason, and readiness on the same fixtures; public route/tool/CLI names remain unchanged and parity/docs gates pass
