# Plan: Make provider subprocess isolation authoritative

> **Status**: Archived
> **Created**: 20260724-0300
> **Slug**: provider-subprocess-isolation
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: focused routing-provider regression plus one final verify-sprint
> **Rollback Surface**: revert the bounded package; no migration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260724-0300-provider-subprocess-isolation.contract.md`
> **Task Review**: `tasks/reviews/20260724-0300-provider-subprocess-isolation.review.md`
> **Implementation Notes**: `tasks/notes/20260724-0300-provider-subprocess-isolation.notes.md`

## Agentic Routing
- Selected route: hunt
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260724-0300-provider-subprocess-isolation.md`
- Sprint contract: `tasks/contracts/20260724-0300-provider-subprocess-isolation.contract.md`
- Sprint review: `tasks/reviews/20260724-0300-provider-subprocess-isolation.review.md`
- Implementation notes: `tasks/notes/20260724-0300-provider-subprocess-isolation.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260724-0300-provider-subprocess-isolation.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260724-0300-provider-subprocess-isolation.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260724-0300-provider-subprocess-isolation.md`.

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
- Contract file: `tasks/contracts/20260724-0300-provider-subprocess-isolation.contract.md`
- Review file: `tasks/reviews/20260724-0300-provider-subprocess-isolation.review.md`
- Implementation notes file: `tasks/notes/20260724-0300-provider-subprocess-isolation.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260724-0300-provider-subprocess-isolation.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260724-0300-provider-subprocess-isolation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: revert the bounded package; no migration
- **Verification boundary**: focused routing-provider regression plus one final verify-sprint
- **Review/acceptance boundary**: `tasks/reviews/20260724-0300-provider-subprocess-isolation.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260724-0300-provider-subprocess-isolation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260724-0300-provider-subprocess-isolation.contract.md`, `tasks/reviews/20260724-0300-provider-subprocess-isolation.review.md`, and `tasks/notes/20260724-0300-provider-subprocess-isolation.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260724-0300-provider-subprocess-isolation.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: revert the bounded package; no migration

## Captured Planning Output

## Goal
Fix Claude routing-eval case isolation by restricting setting sources to the case project, add a deterministic provider-command regression guard, and retire the already-resolved verify-context heisenbug Todo from current replay evidence.

## Scope
- Add `--setting-sources project` only to the Claude routing provider command.
- Add one fake-provider regression test that fails if the flag is absent and proves route extraction still works.
- Remove the routing-injection and verify-context-heisenbug rows from `tasks/todos.md` after targeted verification.
- Do not rerun the 136-call real-provider matrix; the one bounded live sample is mechanism evidence only.

## Root Cause Evidence
- Routing: default Claude setting sources load user ambient skills; a project-only live sample exposed only the case skill plus built-ins and invoked it.
- Verify context: commit `8763ad5d` guards the cross-helper env leak; exact helper-to-fleet bounded replay passes 122/0 and 21/0.

## Task Breakdown
- [x] Add the Claude project-only setting-source flag and deterministic regression guard.
- [x] Run the focused routing test once and typecheck once.
- [x] Remove both resolved Todo rows and prepare the review/acceptance artifacts for lifecycle closeout.

## Evidence Contract
- State/progress path: this plan, its contract/review/notes, and `tasks/todos.md`.
- Verification evidence: focused routing test, typecheck, and final `verify-sprint`.
- Evaluator rubric: root causes fit both symptoms; no ambient-skill fallback remains; no unrelated runtime semantics change.
- Stop condition: receipt valid and main CI green.
- Rollback surface: revert the bounded package; no migration or external state mutation.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add the Claude project-only setting-source flag and deterministic regression guard.
- [x] Run the focused routing test once and typecheck once.
- [x] Remove both resolved Todo rows and prepare the review/acceptance artifacts for lifecycle closeout.
