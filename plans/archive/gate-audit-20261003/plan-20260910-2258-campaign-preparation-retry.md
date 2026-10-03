# Plan: Retry campaign preparation before any runtime effect

> **Status**: Executing
> **Created**: 20260910-2258
> **Slug**: campaign-preparation-retry
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Preserved identity and deadline before any container journal or launch
> **Rollback Surface**: Revert two bounded runtime source changes
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md`
> **Task Review**: `tasks/reviews/20260910-2258-campaign-preparation-retry.review.md`
> **Implementation Notes**: `tasks/notes/20260910-2258-campaign-preparation-retry.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260910-2258-campaign-preparation-retry.md`
- Sprint contract: `tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md`
- Sprint review: `tasks/reviews/20260910-2258-campaign-preparation-retry.review.md`
- Implementation notes: `tasks/notes/20260910-2258-campaign-preparation-retry.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260910-2258-campaign-preparation-retry.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260910-2258-campaign-preparation-retry.md`.

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
- Contract file: `tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md`
- Review file: `tasks/reviews/20260910-2258-campaign-preparation-retry.review.md`
- Implementation notes file: `tasks/notes/20260910-2258-campaign-preparation-retry.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260910-2258-campaign-preparation-retry.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert two bounded runtime source changes
- **Verification boundary**: Preserved identity and deadline before any container journal or launch
- **Review/acceptance boundary**: `tasks/reviews/20260910-2258-campaign-preparation-retry.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260910-2258-campaign-preparation-retry.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260910-2258-campaign-preparation-retry.contract.md`, `tasks/reviews/20260910-2258-campaign-preparation-retry.review.md`, and `tasks/notes/20260910-2258-campaign-preparation-retry.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260910-2258-campaign-preparation-retry.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert two bounded runtime source changes

## Captured Planning Output

P1 Map: campaign-worker owns immutable child admission, launch and budget reservation. campaign-runtime assembles the pinned provider invocation. campaign-container owns the protected account journal and exclusive pre-create directory fence. The existing execution worktree and handoff are unchanged.

P2 Trace: prepareChild persists preparation before prepareCampaignCodexInvocation. A missing Docker executable fails in the first context inspection before either deterministic container journal is created. Re-entry unconditionally rejects the persisted preparation, so a failure with no provider/runtime effect wedges the acquired task. The observed live dispatch has preparation only; no invocation, started, launch, final or reservation.

P3 Decision: Permit retry of preparation only when its identity matches the current handoff, its original deadline is still valid and no later runtime/admission evidence or either protected journal exists. The original stored deadline remains the only effect deadline; a new caller upper bound never extends it and an earlier incompatible bound rejects. Keep the immutable record, exact contract/claim validation and the lower mkdirSync exclusive fence. A journal, including empty or symlink state, remains a reconciliation boundary. At ten times concurrent retries the exclusive directory fence allows at most one create. No retry after launch, no budget reset, no container request reconstruction or deletion, no extra provider/carrier.

Implementation paths: src/effects/automation/campaign-worker.ts, src/effects/automation/campaign-runtime.ts, tests/effects/campaign-worker.test.ts. Record durable boundary and pre-fix evidence in docs/researches/20260910-campaign-preparation-retry.md and tasks/evidence/campaign-preparation-retry-pre-fix.log; maintain required architecture projections only if the existing sync gate identifies those exact changed source paths.

Verification: First observe the new regression fail on the unchanged implementation. Run focused campaign-worker, BRC10 lifecycle and campaign containment model tests on the host; no BRC_TEST_CONTAINER_IMAGE is supplied and no test container is created. Run the repository's required integrity checks and typecheck. The changed admission window is covered by named positive retry, preserved deadline, existing journal, later effect, identity and existing launch/final refusal cases; a full suite is not justified for this bounded change. Reuse final evidence after code freeze. Then resume the existing prepared dispatch through normal contract-run with the controller's Docker PATH repaired; test/build production remains on pinned host verification runtime9cc12bac.

Rollback: Revert the bounded source fix. Preserve all live immutable preparation, grant, counters and runtime journals. Stop rather than widen retry when any journal/effect exists or the original deadline expires.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Execute captured plan: Retry campaign preparation before any runtime effect
