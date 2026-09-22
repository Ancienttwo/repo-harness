# Plan: Codex fleet worker model mappings

> **Status**: Approved
> **Created**: 20260922-1717
> **Slug**: codex-fleet-worker-models
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Installer emits requested Codex model and effort with matching tracked projection
> **Rollback Surface**: Fleet override, helper mirror, tracked Codex persona and existing test expectation
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-1717-codex-fleet-worker-models.contract.md`
> **Task Review**: `tasks/reviews/20260922-1717-codex-fleet-worker-models.review.md`
> **Implementation Notes**: `tasks/notes/20260922-1717-codex-fleet-worker-models.notes.md`

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

- Active plan: `plans/plan-20260922-1717-codex-fleet-worker-models.md`
- Sprint contract: `tasks/contracts/20260922-1717-codex-fleet-worker-models.contract.md`
- Sprint review: `tasks/reviews/20260922-1717-codex-fleet-worker-models.review.md`
- Implementation notes: `tasks/notes/20260922-1717-codex-fleet-worker-models.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-1717-codex-fleet-worker-models.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-1717-codex-fleet-worker-models.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-1717-codex-fleet-worker-models.md`.

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
- Contract file: `tasks/contracts/20260922-1717-codex-fleet-worker-models.contract.md`
- Review file: `tasks/reviews/20260922-1717-codex-fleet-worker-models.review.md`
- Implementation notes file: `tasks/notes/20260922-1717-codex-fleet-worker-models.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-1717-codex-fleet-worker-models.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-1717-codex-fleet-worker-models.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Fleet override, helper mirror, tracked Codex persona and existing test expectation
- **Verification boundary**: Installer emits requested Codex model and effort with matching tracked projection
- **Review/acceptance boundary**: `tasks/reviews/20260922-1717-codex-fleet-worker-models.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-1717-codex-fleet-worker-models.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-1717-codex-fleet-worker-models.contract.md`, `tasks/reviews/20260922-1717-codex-fleet-worker-models.review.md`, and `tasks/notes/20260922-1717-codex-fleet-worker-models.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-1717-codex-fleet-worker-models.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Fleet override, helper mirror, tracked Codex persona and existing test expectation

## Captured Planning Output

## Goal
Set Codex fast-worker to gpt-5.6-sol / medium and deep-worker to gpt-5.6-sol / high.

## Scope
scripts/install-agent-fleet.sh, assets/templates/helpers/install-agent-fleet.sh, .codex/agents/fast-worker.toml, .codex/agents/deep-worker.toml and tests/install-agent-fleet.test.ts. No Claude mapping or global installation changes.

## Decision
The installer per-agent override owns model selection. Keep its packaged helper, repository personas and existing test expectations aligned.

## Task Breakdown
- [x] Update fast-worker mapping, helper mirror, persona and existing test expectation.
- [x] Run focused installer tests and required integrity checks; confirm deep-worker uses Sol high.

## Verification
bun test tests/install-agent-fleet.test.ts
Required repository integrity commands from AGENTS.md.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Update fast-worker mapping, helper mirror, persona and existing test expectation.
- [x] Run focused installer tests and required integrity checks; confirm deep-worker uses Sol high.
