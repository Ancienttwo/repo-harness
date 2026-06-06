# Plan: Think Skill Integration Boundary

> **Status**: Draft
> **Created**: 20260606-0443
> **Slug**: think-skill-codex-repo-skill-think-hook-agents-md
> **Planning Source**: waza-think
> **Orchestration Kind**: waza-think
> **Source Ref**: think 这个skill 是让codex以更宏观的角度去思考方案，我们应该怎么集成到本repo中，是skill触发？集成到think?/集成到hook？/还是集成到agents.md呢？
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.contract.md`
> **Sprint Review**: `tasks/reviews/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.review.md`
> **Implementation Notes**: `tasks/notes/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: think 这个skill 是让codex以更宏观的角度去思考方案，我们应该怎么集成到本repo中，是skill触发？集成到think?/集成到hook？/还是集成到agents.md呢？
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.md`
- Sprint contract: `tasks/contracts/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.contract.md`
- Sprint review: `tasks/reviews/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.review.md`
- Implementation notes: `tasks/notes/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.notes.md`
- Deferred-goal ledger: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.md`.

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
- Contract file: `tasks/contracts/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.contract.md`
- Review file: `tasks/reviews/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.review.md`
- Implementation notes file: `tasks/notes/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.md` task breakdown, `tasks/todo.md` deferred-goal ledger, `tasks/contracts/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.contract.md`, `tasks/reviews/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.review.md`, and `tasks/notes/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260606-0443-think-skill-codex-repo-skill-think-hook-agents-md.md`; after execution revert branch `codex/think-skill-codex-repo-skill-think-hook-agents-md` or the generated task artifacts

## Captured Planning Output

# Think Skill Integration Boundary

## Status

Draft plan captured from pending Waza think orchestration.

## P1: Architecture Map

The repo-harness planning boundary is split across Waza skills, repo-local hook lifecycle gates, and durable repo docs. `$think` is the deliberate planning/reasoning entrypoint. `.ai/hooks/prompt-guard.sh` and `assets/hooks/prompt-guard.sh` should capture plan lifecycle state and prevent unsafe execution, but should not become a hidden macro-reasoning engine. `AGENTS.md` and `CLAUDE.md` should stay short, stable contracts that route detailed guidance into `docs/reference-configs/`.

## P2: Concrete Trace

A user starts with an explicit `$think` or Waza planning prompt. The prompt hook records pending orchestration in `.ai/harness/planning/pending.json` and expects a `plans/plan-*.md` artifact. The agent captures the reasoning output through `scripts/capture-plan.sh`. Approval later promotes the plan and, when requested, projects execution through `scripts/plan-to-todo.sh` or `capture-plan.sh --execute`.

## P3: Decision

Integrate the macro think behavior as a skill-triggered planning route, not as automatic hook behavior and not as large static AGENTS instructions. Hooks should detect and preserve lifecycle state; `$think` should own the high-level reasoning pass; AGENTS should document the stable invariant and point to the detailed reference docs. This keeps the user-visible trigger explicit, avoids hidden token-heavy reasoning on ordinary prompts, and preserves the file-backed plan as the source of truth.

## Task Breakdown

1. Keep `$think` as the user-facing macro planning trigger.
2. Keep hook changes limited to pending-plan capture and execution gating.
3. Keep AGENTS/CLAUDE concise and move detailed guidance into reference docs when implementation is approved.
4. Verify with prompt-guard lifecycle tests, task-workflow checks, and release/package gates before publishing.

## Evidence Contract

Verification should include `bun test`, `bash scripts/check-task-workflow.sh --strict`, `bash scripts/check-npm-release.sh`, and package dry-run inspection before any npm/GitHub release.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Think Skill Integration Boundary
