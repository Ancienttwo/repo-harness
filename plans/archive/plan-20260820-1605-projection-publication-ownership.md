# Plan: Projection Publication Ownership

> **Status**: Archived
> **Created**: 20260820-1605
> **Slug**: projection-publication-ownership
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Targeted regression tests plus repository required checks and a post-publication no-WIP probe.
> **Rollback Surface**: Revert the single publication commit; no persisted schema migration.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-1605-projection-publication-ownership.contract.md`
> **Task Review**: `tasks/reviews/20260820-1605-projection-publication-ownership.review.md`
> **Implementation Notes**: `tasks/notes/20260820-1605-projection-publication-ownership.notes.md`

## Agentic Routing
- Selected route: bugfix
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260820-1605-projection-publication-ownership.md`
- Sprint contract: `tasks/contracts/20260820-1605-projection-publication-ownership.contract.md`
- Sprint review: `tasks/reviews/20260820-1605-projection-publication-ownership.review.md`
- Implementation notes: `tasks/notes/20260820-1605-projection-publication-ownership.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-1605-projection-publication-ownership.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-1605-projection-publication-ownership.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-1605-projection-publication-ownership.md`.

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
- Contract file: `tasks/contracts/20260820-1605-projection-publication-ownership.contract.md`
- Review file: `tasks/reviews/20260820-1605-projection-publication-ownership.review.md`
- Implementation notes file: `tasks/notes/20260820-1605-projection-publication-ownership.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-1605-projection-publication-ownership.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-1605-projection-publication-ownership.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single publication commit; no persisted schema migration.
- **Verification boundary**: Targeted regression tests plus repository required checks and a post-publication no-WIP probe.
- **Review/acceptance boundary**: `tasks/reviews/20260820-1605-projection-publication-ownership.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-1605-projection-publication-ownership.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-1605-projection-publication-ownership.contract.md`, `tasks/reviews/20260820-1605-projection-publication-ownership.review.md`, and `tasks/notes/20260820-1605-projection-publication-ownership.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-1605-projection-publication-ownership.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single publication commit; no persisted schema migration.

## Captured Planning Output

## Goal
Make docs/architecture/.projection-manifest.json an acceptance-owned output committed in the same contract publication, then acknowledge that exact publication so post-publication Stop processing has no source delta to replay and leaves no standalone WIP.

## Task Profile
- bugfix

## P1 Architecture Map
- Entrypoints: scripts/verify-sprint.sh prepares the review subject; scripts/contract-worktree.sh freezes and publishes it; src/cli/commands/architecture-projection.ts materializes deterministic projections; src/cli/hook/stop-handler.ts is a post-publication safety net.
- Authority: the task contract allowed_paths and AcceptanceReceipt bind the reviewed subject; docs/architecture/.projection-manifest.json is generated projection state, never an independent publication.
- Strong dependencies: architecture projection provider output, review subject fingerprint, finish scope gate, helper template mirrors.
- Out of scope: changing architecture rendering semantics, lease semantics, generic workflow archival, or allowing arbitrary generated architecture files outside a contract.

## P2 Concrete Trace
- Current failing path: contract finish publishes candidate -> Stop hook observes the new HEAD -> architecture projection rewrites only the manifest -> target becomes dirty -> the next finish restores that file to HEAD, so it never joins the originating contract.
- Fixed path: verify-sprint prepare-acceptance computes changed paths -> materializes projection before subject hashing -> generated manifest is included in the frozen review subject -> finish scope accepts only this machine-owned manifest -> the single publication commit includes it -> finish verifies that exact clean target tree and advances the drift cursor to the publication SHA -> Stop sees an empty range.
- Error path: unavailable provider, rejected projection, or generated non-manifest paths outside allowed_paths fails closed before acceptance.

## P3 Decision Rationale
- Preserve one authority: AcceptanceReceipt plus publication tree. Stop remains recovery only; the cursor acknowledges delivery but never authors tracked output.
- Use the smallest coherent change: move materialization to acceptance preparation, grant an exact workflow-owned exception only to docs/architecture/.projection-manifest.json, and acknowledge only a clean checked-out synthesized publication that actually changed that file; all semantic architecture outputs still require explicit contract scope.
- At 10x contract volume, provider cost grows once per acceptance preparation; repeated prepares remain idempotent. The first failure surface is provider latency, which stays visible and fail-closed.

## Scope
- Update verify-sprint and its packaged mirror to materialize automatic architecture projections before review subject fingerprinting.
- Update contract-worktree and its packaged mirror so the exact projection manifest is workflow-owned at scope verification.
- Add fail-closed publication acknowledgement and recovery reconciliation for manifest-bearing synthesized commits.
- Add regression tests for ordering, reviewed-subject inclusion, same-publication behavior, and non-manifest fail-closed behavior.
- Update the sprint contract documentation and task artifacts.

Non-scope:
- No standalone projection refresh commits.
- No automatic exemption for docs/architecture modules or agent context files.
- No changes to architecture renderer output semantics.
- No changes to generic archive-workflow projection.

## Acceptance Criteria
- A stale projection manifest is generated before prepare-acceptance fingerprints the candidate.
- The manifest is accepted without manually adding it to every contract allowed_paths, but any other unexpected projection output still fails scope.
- contract-worktree publishes the reviewed manifest in its single publication commit.
- After publication acknowledgement, the architecture drift changed set is empty and Stop produces no standalone projection WIP.
- Script/template mirrors are byte-identical and required checks pass.

## Rollback
Revert the publication commit; the old Stop-time behavior resumes without data migration.

## Task Breakdown
- [ ] Capture a pre-fix failing regression guard.
- [ ] Implement acceptance-time projection materialization.
- [ ] Implement exact manifest scope ownership in finish.
- [ ] Synchronize helper mirrors and documentation.
- [ ] Run targeted and full checks, record acceptance, and finish through the contract gate.

## Annotations
<!-- [NOTE]: Real-provider verification disproved the initial byte-idempotency assumption: `verifiedAgainst.commit` legitimately restamps when HEAD moves. The coherent publication boundary therefore also acknowledges the exact synthesized publication SHA in the architecture drift cursor after the manifest-bearing tree lands. -->
<!-- [SCOPE]: On 2026-08-20 the user explicitly directed "连WIP一起提交". The same publication therefore absorbs the primary worktree's two superseded v0.5 plan deletions and the new model-infra boundary research note. Its stale generated manifest is not copied; the candidate's acceptance-time projection remains authoritative. -->

## Task Breakdown
- [x] Capture a pre-fix failing regression guard.
- [x] Implement acceptance-time projection materialization.
- [x] Implement exact manifest scope ownership in finish.
- [x] Synchronize helper mirrors and documentation.
- [x] Acknowledge the manifest-bearing publication in the architecture drift cursor.
- [x] Absorb the user-authorized primary-worktree WIP into this publication scope.
- [ ] Run targeted and full checks, record acceptance, and finish through the contract gate.
