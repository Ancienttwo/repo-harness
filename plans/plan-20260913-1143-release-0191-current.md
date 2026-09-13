# Plan: Publish repo-harness 0.19.1 from current main

> **Status**: Executing
> **Created**: 20260913-1143
> **Slug**: release-0191-current
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260913-1143-release-0191-current.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260913-1143-release-0191-current.md`; after execution revert branch `codex/release-0191-current` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260913-1143-release-0191-current.contract.md`
> **Task Review**: `tasks/reviews/20260913-1143-release-0191-current.review.md`
> **Implementation Notes**: `tasks/notes/20260913-1143-release-0191-current.notes.md`

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

- Active plan: `plans/plan-20260913-1143-release-0191-current.md`
- Sprint contract: `tasks/contracts/20260913-1143-release-0191-current.contract.md`
- Sprint review: `tasks/reviews/20260913-1143-release-0191-current.review.md`
- Implementation notes: `tasks/notes/20260913-1143-release-0191-current.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260913-1143-release-0191-current.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260913-1143-release-0191-current.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260913-1143-release-0191-current.md`.

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
- Contract file: `tasks/contracts/20260913-1143-release-0191-current.contract.md`
- Review file: `tasks/reviews/20260913-1143-release-0191-current.review.md`
- Implementation notes file: `tasks/notes/20260913-1143-release-0191-current.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260913-1143-release-0191-current.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260913-1143-release-0191-current.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260913-1143-release-0191-current.md`; after execution revert branch `codex/release-0191-current` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260913-1143-release-0191-current.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260913-1143-release-0191-current.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260913-1143-release-0191-current.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260913-1143-release-0191-current.contract.md`, `tasks/reviews/20260913-1143-release-0191-current.review.md`, and `tasks/notes/20260913-1143-release-0191-current.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260913-1143-release-0191-current.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260913-1143-release-0191-current.md`; after execution revert branch `codex/release-0191-current` or the explicitly reviewed diff.

## Captured Planning Output

# Publish repo-harness 0.19.1 from current main

## P1 Map
The release package is defined by package.json files/bin/prepack and assets/skill-version.json. scripts/check-npm-release.sh owns the full release gate and fast prepublish gate; scripts/check-ci.sh all owns expensive install/Herdr cases and the tarball smoke. GitHub CI functional does not unskip them. docs/CHANGELOG.md and deploy/release-checklists/260912-repo-harness-0.19.1.md describe the release. The previously pushed annotated v0.19.1 points at d94ec3c7; npm 0.19.1 is absent. Current main is 7f6fcd1f.

## P2 Trace
Update the 0.19.1 changelog and filing for the accepted current-main range, freeze source and contract, prepare one full release gate, obtain the contract-required semantic acceptance, finish/archive and merge the documentation PR with hosted CI. Pack the resulting immutable main commit, inspect its archive, then update v0.19.1 using an exact old-tag lease and publish that exact tarball to npm. Create the GitHub release and read back registry, tag, tarball and installed runtime identity. Refresh the Bun-global runtime through the supported update surface after publication.

## P3 Decision
The user explicitly selected version 0.19.1 and authorized publishing current main despite the existing old tag. Do not change the version or silently keep the old tag target. Preserve unrelated WIP using this linked worktree. Product source and deferred CI tasks remain outside this release; the owner subsequently approved repairs to the two observed Oracle cleanup and CodeGraph/tooling fixture failures. npm publication is irreversible; never replace an existing version. A tag push uses force-with-lease against the observed old tag object. At 10x scale, real-install/provider test cost dominates; execute the expensive gate once after freezing and reuse valid evidence, never relabel a skipped case as pass.

## Task Breakdown
- [ ] Refresh the existing 0.19.1 changelog and release filing for current main, preserving migration warnings.
- [ ] Freeze the release contract and run the full release gate plus version/document assertions.
- [ ] Prepare semantic acceptance and the documentation work-package for integration.

## Verification Plan
One cost:expensive command runs BUN_TEST_ISOLATE_FILES=1 BUN_TEST_JOBS=4 BUN_TEST_MAX_CONCURRENCY=1 bun run check:release. It includes full tests, projections, typecheck, state checks, architecture/task checks, init dry-run, pack dry-run and real tarball installation smoke. Separate nonduplicate normal checks are bun scripts/check-skill-version.ts and tests/readme-dx.test.ts only if not already covered by the full gate (omit the duplicate leaf). The runtime_readback oracle is the tarball smoke already nested in the release gate; do not execute it a second time to populate a separate check.

## Publication Authorization
The current user explicitly authorized latest-main 0.19.1 release, including moving the preexisting old v0.19.1 tag. The owner acceptance for PR #429 does not stand in for this new release contract's acceptance. No extra approval is needed for the requested publish chain unless an actual new risk or authentication requirement blocks it.

## Rollback
Before publication, abandon this task branch and leave npm untouched. Preserve the old tag object in the release filing so a failed pre-npm tag update can be restored with an exact lease. After npm publication do not overwrite/delete the published version; report the exact published state and repair with a new version if needed.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Refresh the existing 0.19.1 changelog and release filing for current main, preserving migration warnings.
- [ ] Freeze the release contract and run the full release gate plus version/document assertions.
- [ ] Prepare semantic acceptance and the documentation work-package for integration.

## Work-package Boundary

This plan closes the release-preparation documentation and verified package
boundary before publication. The separately authorized post-merge operator chain
(tag, npm, GitHub Release, readback and runtime refresh) remains the parent
agent's delivery ledger; closing this plan does not claim those steps happened.

## Approved Scope Amendment

On 2026-09-13 the owner approved fixing both release-gate blockers and then
continuing publication. Existing testing oracles and production deadlines stay
intact. The repair changes five existing tests and their shared fixture helper:
Tooling fixtures share a prepared shell launcher with private command bodies;
Oracle cleanup timing begins at the real workload marker after preflight.
