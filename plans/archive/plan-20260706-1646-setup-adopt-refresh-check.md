# Plan: Setup check adopt refresh advisory

> **Status**: Archived
> **Created**: 20260706-1646
> **Slug**: setup-adopt-refresh-check
> **Planning Source**: codex
> **Orchestration Kind**: codex
> **Source Ref**: user: add check for repos needing adopt refresh
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260706-1646-setup-adopt-refresh-check.md`; after execution revert branch `codex/setup-adopt-refresh-check` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md`
> **Task Review**: `tasks/reviews/20260706-1646-setup-adopt-refresh-check.review.md`
> **Implementation Notes**: `tasks/notes/20260706-1646-setup-adopt-refresh-check.notes.md`

## Agentic Routing
- Selected route: implementation
- Routing reason: Captured from codex planning output.
- Source ref: user: add check for repos needing adopt refresh
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260706-1646-setup-adopt-refresh-check.md`
- Sprint contract: `tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md`
- Sprint review: `tasks/reviews/20260706-1646-setup-adopt-refresh-check.review.md`
- Implementation notes: `tasks/notes/20260706-1646-setup-adopt-refresh-check.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260706-1646-setup-adopt-refresh-check.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260706-1646-setup-adopt-refresh-check.md`.

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
- Contract file: `tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md`
- Review file: `tasks/reviews/20260706-1646-setup-adopt-refresh-check.review.md`
- Implementation notes file: `tasks/notes/20260706-1646-setup-adopt-refresh-check.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260706-1646-setup-adopt-refresh-check.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260706-1646-setup-adopt-refresh-check.md`; after execution revert branch `codex/setup-adopt-refresh-check` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260706-1646-setup-adopt-refresh-check.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260706-1646-setup-adopt-refresh-check.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260706-1646-setup-adopt-refresh-check.contract.md`, `tasks/reviews/20260706-1646-setup-adopt-refresh-check.review.md`, and `tasks/notes/20260706-1646-setup-adopt-refresh-check.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260706-1646-setup-adopt-refresh-check.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260706-1646-setup-adopt-refresh-check.md`; after execution revert branch `codex/setup-adopt-refresh-check` or the explicitly reviewed diff.

## Captured Planning Output

# Setup check adopt refresh advisory

> **Status**: Approved
> **Artifact Level**: work-package
> **Promotion Gate**: human_decision_boundary

## Goal

Add a read-only setup-check advisory that tells an Agent when the current repository needs `repo-harness adopt` refresh, analogous to the existing repo-harness version refresh advisory.

## In Scope

- Reuse the existing adoption planner/dry-run summary as the source of truth for whether repo-local workflow files need refresh.
- Surface the result in `repo-harness setup check --target <host> --check-updates --json` and formatted output via the existing checks and `agent_actions` structure.
- Add focused tests for no-refresh, refresh-needed, and non-adoptable/non-repo-safe behavior where appropriate.
- Update concise user-facing docs/release notes only where this setup-check surface is already described.

## Out of Scope

- Do not execute `repo-harness adopt` automatically.
- Do not introduce a new command or background hook.
- Do not change adoption planner semantics.
- Do not stage or include generated `.archcontext/` scaffold files.

## Allowed Paths

- src/cli/commands/init-hook.ts
- src/cli/commands/doctor.ts
- src/cli/commands/adopt-plan.ts
- src/core/adoption/**
- tests/cli/init-hook.test.ts
- tests/cli/adoption-plan.test.ts
- README.md
- README.zh-CN.md
- README.ja.md
- README.fr.md
- README.es.md
- docs/reference-configs/external-tooling.md
- docs/CHANGELOG.md
- deploy/release-checklists/260706-repo-harness-0.9.1.md
- tasks/notes/**
- tasks/current.md

## Exit Criteria

- `repo-harness setup check --target codex --check-updates --json` includes an adopt refresh check and `agent_actions` when the adoption dry-run has planned operations.
- The check stays read-only and does not run adoption apply.
- Focused Bun tests for the setup-check behavior pass.
- Release prep docs mention the new advisory if 0.9.1 remains the target release.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Execute captured plan: Setup check adopt refresh advisory
