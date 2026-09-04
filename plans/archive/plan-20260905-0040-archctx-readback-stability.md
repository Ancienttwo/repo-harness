> **Archived**: 2026-09-05 00:47
> **Related Plan**: plans/archive/plan-20260905-0040-archctx-readback-stability.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-0047
> **Archive Projection V1**: `plans/plan-20260905-0040-archctx-readback-stability.md` => `plans/archive/plan-20260905-0040-archctx-readback-stability.md`
> **Archive Projection V1**: `tasks/notes/20260905-0040-archctx-readback-stability.notes.md` => `tasks/archive/notes-20260905-0047-archctx-readback-stability.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0040-archctx-readback-stability.contract.md` => `tasks/archive/contract-20260905-0047-archctx-readback-stability.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0040-archctx-readback-stability.review.md` => `tasks/archive/review-20260905-0047-archctx-readback-stability.md`

# Plan: Stabilize ArchContext clean-room readback

> **Status**: Archived
> **Created**: 20260905-0040
> **Slug**: archctx-readback-stability
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Two consecutive clean-room runs remain byte-identical plus focused provider and workflow gates
> **Rollback Surface**: Revert the readback evidence-shape change
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-0047-archctx-readback-stability.md`
> **Task Review**: `tasks/archive/review-20260905-0047-archctx-readback-stability.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-0047-archctx-readback-stability.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260905-0040-archctx-readback-stability.md`
- Sprint contract: `tasks/archive/contract-20260905-0047-archctx-readback-stability.md`
- Sprint review: `tasks/archive/review-20260905-0047-archctx-readback-stability.md`
- Implementation notes: `tasks/archive/notes-20260905-0047-archctx-readback-stability.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-0047-archctx-readback-stability.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-0040-archctx-readback-stability.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-0040-archctx-readback-stability.md`.

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
- Contract file: `tasks/archive/contract-20260905-0047-archctx-readback-stability.md`
- Review file: `tasks/archive/review-20260905-0047-archctx-readback-stability.md`
- Implementation notes file: `tasks/archive/notes-20260905-0047-archctx-readback-stability.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0047-archctx-readback-stability.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-0040-archctx-readback-stability.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the readback evidence-shape change
- **Verification boundary**: Two consecutive clean-room runs remain byte-identical plus focused provider and workflow gates
- **Review/acceptance boundary**: `tasks/archive/review-20260905-0047-archctx-readback-stability.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-0040-archctx-readback-stability.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-0047-archctx-readback-stability.md`, `tasks/archive/review-20260905-0047-archctx-readback-stability.md`, and `tasks/archive/notes-20260905-0047-archctx-readback-stability.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-0047-archctx-readback-stability.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the readback evidence-shape change

## Captured Planning Output

# ArchContext clean-room readback stability

## Goal
Make `bun run check:archctx-integration` byte-stable across repeated runs after the 0.5.6 adoption.

## Root cause
`scripts/axr5-archctx-clean-room.ts` persists integrity and SHA-512 values for a freshly packed temporary tarball. The ArchContext package build embeds non-semantic archive bytes, so identical source revision and package contents can produce a different tarball hash and dirty the tracked readback.

## Scope
- Remove ephemeral tarball-byte hashes from the tracked clean-room readback while retaining source revision, exact versions, package filenames, authoritative schema digest, capability handshake, renderer identity, and worktree-match proof.
- Add a regression test that runs the clean-room readback twice and asserts byte identity, or a bounded equivalent that proves the rendered evidence excludes ephemeral pack hashes.
- Update the task notes with the evidence-boundary decision.

## Non-scope
- No change to package installation, provider runtime behavior, architecture acceptance, package versions, or compatibility paths.

## Verification
- Run `bun run check:archctx-integration` twice and require a clean diff after both runs.
- Run the focused clean-room/provider tests, typecheck, architecture/task/workflow/deploy gates, inspect, and init dry-run.

## Task Breakdown
- [x] Stabilize tracked ArchContext clean-room evidence and prove consecutive-run byte identity.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Stabilize tracked ArchContext clean-room evidence and prove consecutive-run byte identity.
