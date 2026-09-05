> **Archived**: 2026-09-05 17:42
> **Related Plan**: plans/archive/plan-20260905-1617-refactor-multi-work-package.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-1742
> **Archive Projection V1**: `plans/plan-20260905-1617-refactor-multi-work-package.md` => `plans/archive/plan-20260905-1617-refactor-multi-work-package.md`
> **Archive Projection V1**: `tasks/notes/20260905-1617-refactor-multi-work-package.notes.md` => `tasks/archive/notes-20260905-1742-refactor-multi-work-package.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1617-refactor-multi-work-package.contract.md` => `tasks/archive/contract-20260905-1742-refactor-multi-work-package.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1617-refactor-multi-work-package.review.md` => `tasks/archive/review-20260905-1742-refactor-multi-work-package.md`

# Plan: Refactor recommendation multi Work Package closure

> **Status**: Archived
> **Created**: 20260905-1617
> **Slug**: refactor-multi-work-package
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Same recommendation two-task materialization through final-main resolution; focused refactor and canonical task tests plus integrity checks
> **Rollback Surface**: Revert codex/refactor-multi-work-package as one unit before activation
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-1742-refactor-multi-work-package.md`
> **Task Review**: `tasks/archive/review-20260905-1742-refactor-multi-work-package.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-1742-refactor-multi-work-package.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260905-1617-refactor-multi-work-package.md`
- Sprint contract: `tasks/archive/contract-20260905-1742-refactor-multi-work-package.md`
- Sprint review: `tasks/archive/review-20260905-1742-refactor-multi-work-package.md`
- Implementation notes: `tasks/archive/notes-20260905-1742-refactor-multi-work-package.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-1742-refactor-multi-work-package.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-1617-refactor-multi-work-package.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-1617-refactor-multi-work-package.md`.

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
- Contract file: `tasks/archive/contract-20260905-1742-refactor-multi-work-package.md`
- Review file: `tasks/archive/review-20260905-1742-refactor-multi-work-package.md`
- Implementation notes file: `tasks/archive/notes-20260905-1742-refactor-multi-work-package.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-1742-refactor-multi-work-package.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-1617-refactor-multi-work-package.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert codex/refactor-multi-work-package as one unit before activation
- **Verification boundary**: Same recommendation two-task materialization through final-main resolution; focused refactor and canonical task tests plus integrity checks
- **Review/acceptance boundary**: `tasks/archive/review-20260905-1742-refactor-multi-work-package.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-1617-refactor-multi-work-package.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-1742-refactor-multi-work-package.md`, `tasks/archive/review-20260905-1742-refactor-multi-work-package.md`, and `tasks/archive/notes-20260905-1742-refactor-multi-work-package.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-1742-refactor-multi-work-package.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert codex/refactor-multi-work-package as one unit before activation

## Captured Planning Output

### Scope and success
Complete the approved recommendation → multiple Work Packages slice against ArchContext 0.5.7. One accepted recommendation fans out to distinct canonical tasks, each with its own candidate/contract/closure/acceptance/merge evidence. Final-main resolution aggregates every mapped task exactly once. Keep activation off; the existing activation canary ladder remains separate.

### P1/P2/P3
P1: Program owns recommendation → Work Package/taskRef mapping. Canonical Sprint owns task identity/revision, WorkGraph owns scheduling, ArchContext owns recommendation and resolution, immutable receipts own execution evidence. Changes span src/core/refactor/{program,materialization,board}.ts and src/effects/refactor/{candidate-verification,execution-binding-store,post-merge-resolution}.ts plus focused tests and documentation.
P2: The observed input is one accepted cross-module proposal mapped to two nodes/tasks. Program rejects repeated recommendation IDs; materialization and candidate lookup select by recommendation alone; post-merge requires unique recommendation evidence; board cannot distinguish tasks. Candidate verification also incorrectly requires the first stage to resolve the whole recommendation.
P3: Retain the existing flat bindings contract; repeat recommendation identity only with the same fingerprint/alias, preserve unique Work Package/taskRef and one module/rollback boundary per unit. Resolve executable identity using the canonical task suffix, with exact canonical task verification. Multi-task candidate verification admits authoritative resolved/partially_resolved/not_improved measurements, rejects stale/regressed and still requires all other gates; single-task verification retains resolved requirement. Final-main groups task evidence in Program order and measures/resolves each recommendation once. Board keeps one card per Program binding and adds Work Package/taskRef identity; resolution requires all mapped execution bindings. No copied lifecycle status or compatibility translator. At 10x scale, bounded module/parallelism policy rejects excess materialization first; evidence aggregation is linear in task count.

### Data flow
```mermaid
flowchart LR
  A[Accepted recommendation] --> B[Program task mappings]
  B --> C[Canonical Sprint and WorkGraph]
  C --> D[Task candidate receipts]
  D --> E[Task execution bindings]
  E --> F[Aggregate final-main verification]
  F --> G[One provider resolution]
  E --> H[Board per Work Package]
  G --> H
```

### Verification and rollback
Red regression for same-recommendation fanout; real Git fixture materialization → two genuine persisted candidate receipts → distinct merges → one aggregated final-main resolution, including incomplete/duplicate/swapped task rejection and interrupted lifecycle retry. Run all refactor tests plus canonical coordination task tests, typecheck, state boundaries and six repository-integrity checks. Baseline 78bb1716 has partitioned 350-file coverage; this bounded delta is covered by named tests and does not claim a new full-suite pass. No package/release/CLI surface change. Revert this branch's commit as one unit before activating multi-task Programs. Complete one independent /check review and canonical finish.

## Task Breakdown
- [x] Prove same-recommendation multi-task failure and freeze identity/measurement contract.
- [x] Implement mapping, candidate and execution binding, aggregate resolution and Board projection.
- [x] Verify positive, incomplete, crossed, duplicate and retry paths; update durable architecture/research/workstream conclusions.
- [ ] Freeze, accept and merge only this worktree's changes into main.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Prove same-recommendation multi-task failure and freeze identity/measurement contract.
- [x] Implement mapping, candidate and execution binding, aggregate resolution and Board projection.
- [x] Verify positive, incomplete, crossed, duplicate and retry paths; update durable architecture/research/workstream conclusions.
- [ ] Freeze, accept and merge only this worktree's changes into main.
