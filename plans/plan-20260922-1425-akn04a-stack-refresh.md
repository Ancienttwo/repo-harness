# Plan: AKN-04a accepted stack refresh

> **Status**: Executing
> **Created**: 20260922-1425
> **Slug**: akn04a-stack-refresh
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Integrated Fleet and Task reply stack with regenerated architecture proof
> **Rollback Surface**: AKN-04a upstream merge
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-1425-akn04a-stack-refresh.contract.md`
> **Task Review**: `tasks/reviews/20260922-1425-akn04a-stack-refresh.review.md`
> **Implementation Notes**: `tasks/notes/20260922-1425-akn04a-stack-refresh.notes.md`

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

- Active plan: `plans/plan-20260922-1425-akn04a-stack-refresh.md`
- Sprint contract: `tasks/contracts/20260922-1425-akn04a-stack-refresh.contract.md`
- Sprint review: `tasks/reviews/20260922-1425-akn04a-stack-refresh.review.md`
- Implementation notes: `tasks/notes/20260922-1425-akn04a-stack-refresh.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-1425-akn04a-stack-refresh.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-1425-akn04a-stack-refresh.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-1425-akn04a-stack-refresh.md`.

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
- Contract file: `tasks/contracts/20260922-1425-akn04a-stack-refresh.contract.md`
- Review file: `tasks/reviews/20260922-1425-akn04a-stack-refresh.review.md`
- Implementation notes file: `tasks/notes/20260922-1425-akn04a-stack-refresh.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-1425-akn04a-stack-refresh.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-1425-akn04a-stack-refresh.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: AKN-04a upstream merge
- **Verification boundary**: Integrated Fleet and Task reply stack with regenerated architecture proof
- **Review/acceptance boundary**: `tasks/reviews/20260922-1425-akn04a-stack-refresh.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-1425-akn04a-stack-refresh.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-1425-akn04a-stack-refresh.contract.md`, `tasks/reviews/20260922-1425-akn04a-stack-refresh.review.md`, and `tasks/notes/20260922-1425-akn04a-stack-refresh.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-1425-akn04a-stack-refresh.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: AKN-04a upstream merge

## Captured Planning Output

## Goal

Refresh PR #438 onto the accepted AKN-03b stack and resolve the generated architecture manifest conflict without changing Fleet placement semantics.

## Scope

Integrate the existing upstream protected-reply correction and its workflow closeout in the current isolated AKN-04a worktree. Regenerate the projection manifest through the configured provider. Preserve the upstream source and canonical workflow artifacts exactly. No main merge, runtime installation or new product behavior.

## P1 / P2 / P3

Git merge-tree proves that PR #438 conflicts only in docs/architecture/.projection-manifest.json. The existing upstream adds the verified code-point UUID comparator and regression, then archives its completed contract. Resolve the generated file through current CodeGraph/projection, not by combining proof digests manually. Existing Fleet/Operator consumer checks validate the resulting stack. At 10x task count there is no new runtime operation or resource limit change.

## Task Breakdown

- [ ] Integrate the accepted upstream branch and regenerate its manifest against current source.
- [ ] Verify the integrated stack under a fresh post-closeout contract, obtain one semantic acceptance, and update PR #438.

## Verification

Reuse the AKN-04a focused behavior suite selection and required repository checks. Do not claim the earlier frozen receipt applies to the new stack. Read back remote mergeability and CI after push.

## Rollback

Base 4e5556d61ed2ed9a58e3ed9b5d25c6d670ee94d4. Revert the stack integration as a unit; retain protected messages and receipts.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Integrate the accepted upstream branch and regenerate its manifest against current source.
- [ ] Verify the integrated stack under a fresh post-closeout contract, obtain one semantic acceptance, and update PR #438.

## Owner review integration boundary

Pin the corrected #437 head including expiry, encoded size, accepted #436 fixture and installed transport verification. Merge the exact upstream candidate, preserve all placement sources, regenerate manifest conflicts through the provider, and rerun this contract's protocol/projection/decoder/statistics/installed-consumer checks. The old placement waiver remains historical; it does not cover new integration conflicts or CI. No main merge or Host admission.
