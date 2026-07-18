# Plan: Sync review-convergence product changes into repo sources

> **Status**: Completed
> **Created**: 20260719-0432
> **Slug**: review-convergence-source-sync
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260719-0432-review-convergence-source-sync.md`; after execution revert branch `codex/review-convergence-source-sync` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md`
> **Task Review**: `tasks/reviews/20260719-0432-review-convergence-source-sync.review.md`
> **Implementation Notes**: `tasks/notes/20260719-0432-review-convergence-source-sync.notes.md`

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

- Active plan: `plans/plan-20260719-0432-review-convergence-source-sync.md`
- Sprint contract: `tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md`
- Sprint review: `tasks/reviews/20260719-0432-review-convergence-source-sync.review.md`
- Implementation notes: `tasks/notes/20260719-0432-review-convergence-source-sync.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260719-0432-review-convergence-source-sync.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260719-0432-review-convergence-source-sync.md`.

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
- Contract file: `tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md`
- Review file: `tasks/reviews/20260719-0432-review-convergence-source-sync.review.md`
- Implementation notes file: `tasks/notes/20260719-0432-review-convergence-source-sync.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260719-0432-review-convergence-source-sync.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260719-0432-review-convergence-source-sync.md`; after execution revert branch `codex/review-convergence-source-sync` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260719-0432-review-convergence-source-sync.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260719-0432-review-convergence-source-sync.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260719-0432-review-convergence-source-sync.contract.md`, `tasks/reviews/20260719-0432-review-convergence-source-sync.review.md`, and `tasks/notes/20260719-0432-review-convergence-source-sync.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260719-0432-review-convergence-source-sync.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260719-0432-review-convergence-source-sync.md`; after execution revert branch `codex/review-convergence-source-sync` or the explicitly reviewed diff.

## Captured Planning Output

# Sync review-convergence product changes back into repo sources

## Context

The review-trigger convergence (user-approved 2026-07-19) and the claude-plan external-brain skill (2026-07-18) were applied to installed host copies (`~/.claude/skills`, `~/.codex/skills`) without updating this repo's product sources. The user flagged the gap: this repo generates harness config for downstream projects, so installed-copy changes must flow back to `assets/`. Audit also found pre-existing product→source drift: installed claude-review carries the fable pin + single opus retry and codex-review carries the 1800s budget, while `assets/skills/` still had the older 330s/no-pin versions.

## Task Breakdown

- [x] Sync `assets/skills/claude-review/SKILL.md` and `assets/skills/codex-review/SKILL.md` from the newer installed copies (fable pin + opus retry; 1800s CODEX_REVIEW_TIMEOUT_SECS budget).
- [x] Add `assets/skills/claude-plan/SKILL.md` (new external-brain plan-consult skill, Codex host).
- [x] Wire `claude-plan` into `src/cli/commands/init.ts` CROSS_REVIEW_SKILLS (host: codex) and update the comment to cover cross-model consult.
- [x] Update `tests/cli/init.test.ts` fixtures (both asset stub helpers) and host-aware install assertions for claude-plan.
- [x] Update `docs/reference-configs/external-tooling.md` and `assets/reference-configs/external-tooling.md` install-surface sentence to include claude-plan.
- [x] Append the Review Trigger Discipline section to `assets/reference-configs/global-working-rules.md` (mirrors the installed `~/.codex/AGENTS.md` addition).

## Verification Boundary

`bun test tests/cli/init.test.ts tests/bootstrap-files.test.ts tests/install-profiles.test.ts` green; `bun src/cli/index.ts adopt --repo . --dry-run` unchanged behavior.

## Rollback Surface

All changes are working-tree file edits on top of the current branch; revert with `git checkout -- <paths>` per file. Installed host copies are untouched by this work-package.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Sync `assets/skills/claude-review/SKILL.md` and `assets/skills/codex-review/SKILL.md` from the newer installed copies (fable pin + opus retry; 1800s CODEX_REVIEW_TIMEOUT_SECS budget).
- [x] Add `assets/skills/claude-plan/SKILL.md` (new external-brain plan-consult skill, Codex host).
- [x] Wire `claude-plan` into `src/cli/commands/init.ts` CROSS_REVIEW_SKILLS (host: codex) and update the comment to cover cross-model consult.
- [x] Update `tests/cli/init.test.ts` fixtures (both asset stub helpers) and host-aware install assertions for claude-plan.
- [x] Update `docs/reference-configs/external-tooling.md` and `assets/reference-configs/external-tooling.md` install-surface sentence to include claude-plan.
- [x] Append the Review Trigger Discipline section to `assets/reference-configs/global-working-rules.md` (mirrors the installed `~/.codex/AGENTS.md` addition).
