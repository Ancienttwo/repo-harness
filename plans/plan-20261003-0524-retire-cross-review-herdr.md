# Plan: Retire frozen cross-review runtime onto merged Herdr review

> **Status**: Executing
> **Created**: 20261003-0524
> **Slug**: retire-cross-review-herdr
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Owner-authorized typecheck and affected tests only; Gatekeeper and13checks paused
> **Rollback Surface**: Revert this scoped branch; retain historical runtime evidence
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20261003-0524-retire-cross-review-herdr.contract.md`
> **Task Review**: `tasks/reviews/20261003-0524-retire-cross-review-herdr.review.md`
> **Implementation Notes**: `tasks/notes/20261003-0524-retire-cross-review-herdr.notes.md`

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

- Active plan: `plans/plan-20261003-0524-retire-cross-review-herdr.md`
- Sprint contract: `tasks/contracts/20261003-0524-retire-cross-review-herdr.contract.md`
- Sprint review: `tasks/reviews/20261003-0524-retire-cross-review-herdr.review.md`
- Implementation notes: `tasks/notes/20261003-0524-retire-cross-review-herdr.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20261003-0524-retire-cross-review-herdr.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20261003-0524-retire-cross-review-herdr.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20261003-0524-retire-cross-review-herdr.md`.

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
- Contract file: `tasks/contracts/20261003-0524-retire-cross-review-herdr.contract.md`
- Review file: `tasks/reviews/20261003-0524-retire-cross-review-herdr.review.md`
- Implementation notes file: `tasks/notes/20261003-0524-retire-cross-review-herdr.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20261003-0524-retire-cross-review-herdr.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20261003-0524-retire-cross-review-herdr.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert this scoped branch; retain historical runtime evidence
- **Verification boundary**: Owner-authorized typecheck and affected tests only; Gatekeeper and13checks paused
- **Review/acceptance boundary**: `tasks/reviews/20261003-0524-retire-cross-review-herdr.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20261003-0524-retire-cross-review-herdr.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20261003-0524-retire-cross-review-herdr.contract.md`, `tasks/reviews/20261003-0524-retire-cross-review-herdr.review.md`, and `tasks/notes/20261003-0524-retire-cross-review-herdr.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20261003-0524-retire-cross-review-herdr.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert this scoped branch; retain historical runtime evidence

## Captured Planning Output

P1: current main cc1fc8ee owns generic review via CLI review -> persistent fleet deep-reasoner task-agent in Herdr -> existing OAR host/isolation -> file Result and generic-review Receipt. Three direct advisory Core/Effects/CLI files are obsolete; retain shared diff fingerprint, circuit, generic review, task-session, evidence and verification primitives.
P2: unregister old cross-review CLI imports/command, remove exactly3frozen runtime files, point bundled Skill/catalog/hooks/docs at current generic review. Old evals/checks anchors runCrossReview must become the already-approved f070 executeVerificationContract/executeCheck verification authority; do not remove shared checks/evals fixtures.
P3: migrate only consumers requiring removal; no new adapter/parser/upstream declaration change, no Codex/Claude old receipt source reader. #476merged; old4semantic candidates were retired with real noop proof and gate0 in original worktree. Original26modules stay untouched by semantic migration.
Latest owner boundary: heartbeat4b is NOW, PhaseD/Grok OAR integration must not start. #474/#477/worktree-lifecycle files untouched. Typecheck and affected tests only (--timeout60000 --max-concurrency1); Gatekeeper and13integrity checks explicitly paused. No fabricated AcceptanceReceipt/verdict.
Allowed execution: existing3source deletions, CLI index/hints, bundled Skill3docs/catalog, active consumer docs and mirrored referenceconfig prose, existing related tests/live routing fixtures,4existing archctx semantic entities + necessary existing projection outputs +2AXRauthoring maps; this work-package metadata. No dependency bump, MCP/worker runtime integration or unrelated test change.
Delivery: conventional commit, push branch and Draft PR to main; no Ready/merge/deleteworktree or main change. Verify type and existing relevant files, report exactcommands/exits and deletion list.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Retire frozen cross-review runtime onto merged Herdr review
