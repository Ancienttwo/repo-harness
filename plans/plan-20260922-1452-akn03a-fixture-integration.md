# Plan: PR 435 accepted fixture integration

> **Status**: Executing
> **Created**: 20260922-1452
> **Slug**: akn03a-fixture-integration
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: PR 435 exact integrated head
> **Rollback Surface**: PR 435 fixture integration merge
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-1452-akn03a-fixture-integration.contract.md`
> **Task Review**: `tasks/reviews/20260922-1452-akn03a-fixture-integration.review.md`
> **Implementation Notes**: `tasks/notes/20260922-1452-akn03a-fixture-integration.notes.md`

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

- Active plan: `plans/plan-20260922-1452-akn03a-fixture-integration.md`
- Sprint contract: `tasks/contracts/20260922-1452-akn03a-fixture-integration.contract.md`
- Sprint review: `tasks/reviews/20260922-1452-akn03a-fixture-integration.review.md`
- Implementation notes: `tasks/notes/20260922-1452-akn03a-fixture-integration.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-1452-akn03a-fixture-integration.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-1452-akn03a-fixture-integration.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-1452-akn03a-fixture-integration.md`.

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
- Contract file: `tasks/contracts/20260922-1452-akn03a-fixture-integration.contract.md`
- Review file: `tasks/reviews/20260922-1452-akn03a-fixture-integration.review.md`
- Implementation notes file: `tasks/notes/20260922-1452-akn03a-fixture-integration.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-1452-akn03a-fixture-integration.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-1452-akn03a-fixture-integration.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: PR 435 fixture integration merge
- **Verification boundary**: PR 435 exact integrated head
- **Review/acceptance boundary**: `tasks/reviews/20260922-1452-akn03a-fixture-integration.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-1452-akn03a-fixture-integration.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-1452-akn03a-fixture-integration.contract.md`, `tasks/reviews/20260922-1452-akn03a-fixture-integration.review.md`, and `tasks/notes/20260922-1452-akn03a-fixture-integration.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-1452-akn03a-fixture-integration.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: PR 435 fixture integration merge

## Captured Planning Output

## Goal

Integrate the owner-accepted PR #436 fixture correction into PR #435 and verify the new head within the existing narrow stage scope. No main merge, Host admission, Campaign or runtime installation.

## P1 / P2 / P3

PR #436 commit 8c7fd593ac6d41a103de610a23c309e88fe08110 corrects candidate Stop timeout test setup against the existing authority. Merge its exact accepted branch into this isolated PR branch, preserve all current production content, and regenerate the architecture manifest if its generated proof conflicts. Both branches share base 0d4371c3; only tests and durable fixture/workflow evidence should enter. At 10x there is no runtime change.

## Task Breakdown

- [ ] Merge the accepted fixture branch and resolve only deterministic generated proof conflicts.
- [ ] Run the existing candidate fixture regression and the stage contract verification plan with mandatory integrity checks.
- [ ] Bind acceptance and publish the new PR head, then read its actual CI. Keep Host admission unproven.

## Verification

Use the original stage package's focused contract checks plus tests/unit/candidate-bound-global-runtime-reconciliation.test.ts. No new tests or local full suite. Hosted CI remains independent.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Merge the accepted fixture branch and resolve only deterministic generated proof conflicts.
- [ ] Run the existing candidate fixture regression and the stage contract verification plan with mandatory integrity checks.
- [ ] Bind acceptance and publish the new PR head, then read its actual CI. Keep Host admission unproven.
