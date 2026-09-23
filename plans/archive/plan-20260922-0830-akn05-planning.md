> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-0830-akn05-planning.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-0830-akn05-planning.md` => `plans/archive/plan-20260922-0830-akn05-planning.md`
> **Archive Projection V1**: `tasks/notes/20260922-0830-akn05-planning.notes.md` => `tasks/archive/notes-20260923-1409-akn05-planning.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0830-akn05-planning.contract.md` => `tasks/archive/contract-20260923-1409-akn05-planning.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0830-akn05-planning.review.md` => `tasks/archive/review-20260923-1409-akn05-planning.md`

# Plan: AKN-05e Planning and three observation views

> **Status**: Archived
> **Created**: 20260922-0830
> **Slug**: akn05-planning
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Canonical Planning relationships and shared three-view Task identity
> **Rollback Surface**: Revert server and browser observation protocol together
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260923-1409-akn05-planning.md`
> **Task Review**: `tasks/archive/review-20260923-1409-akn05-planning.md`
> **Implementation Notes**: `tasks/archive/notes-20260923-1409-akn05-planning.md`

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

- Active plan: `plans/archive/plan-20260922-0830-akn05-planning.md`
- Sprint contract: `tasks/archive/contract-20260923-1409-akn05-planning.md`
- Sprint review: `tasks/archive/review-20260923-1409-akn05-planning.md`
- Implementation notes: `tasks/archive/notes-20260923-1409-akn05-planning.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260923-1409-akn05-planning.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260922-0830-akn05-planning.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260922-0830-akn05-planning.md`.

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
- Contract file: `tasks/archive/contract-20260923-1409-akn05-planning.md`
- Review file: `tasks/archive/review-20260923-1409-akn05-planning.md`
- Implementation notes file: `tasks/archive/notes-20260923-1409-akn05-planning.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260923-1409-akn05-planning.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260922-0830-akn05-planning.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert server and browser observation protocol together
- **Verification boundary**: Canonical Planning relationships and shared three-view Task identity
- **Review/acceptance boundary**: `tasks/archive/review-20260923-1409-akn05-planning.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260922-0830-akn05-planning.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260923-1409-akn05-planning.md`, `tasks/archive/review-20260923-1409-akn05-planning.md`, and `tasks/archive/notes-20260923-1409-akn05-planning.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260923-1409-akn05-planning.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert server and browser observation protocol together

## Captured Planning Output

## Goal
Complete roadmap section7's three observation views in AKN-05e: default Organization/Attention supervision, Planning requirements/preparation/dependencies/approval boundaries, and the existing five Delivery columns. All views share selected repository and Task identity. Reuse the existing collaboration GET with protocol4 and an independently unavailable Planning source; no new route, write action, background loop or persistent product state.

## P1/P2/P3
P1: App currently has default automation/Decision/Organization summaries plus a Worklist; StageMatrix only summarizes counts. BoardDocument and TaskOffer own canonical task requirements, execution readiness, original blocker owners and registered-worktree plan proof. readTrackedWorkGraphProjectionAt can bind a graph to the Board's exact canonical commit, and validates canonical carrier/reference/capability identity. dependency-authority owns the four dependency verdicts and refuses unregistered/read-only authority. Current TaskContext already transports the desired task/fence/plan fields. The selected worktree is based on141ea3ce, with no unrelated WIP. H0 was refreshed against Codex CLI0.155.1 and remains runtime_not_admitted because no version-pinned Host probe exists; this remains observation work.
P2: registry ID -> selected repo's canonical Board+TaskOffers -> shared TaskContext projection for canonical rows -> exact-commit Work Graph -> bounded registered dependency graph closure -> original dependency authority -> strict Planning DTO -> collaboration protocol4 -> Planning list and same-task detail. Two observations compare canonical target, Board, offers, graphs, dependency verdicts and authorization, with final registry recheck. A source changing during read is unavailable, never a mixed ready state. UI joins only exact repository/task ID/revision; a missing or stale Fleet card disables detail selection without inventing a replacement.
P3: share the existing TaskContext projection between its GET and Planning instead of creating another task/preparation authority. Planning task collection is bounded to200 canonical rows and2MiB output; graph closure to8 registered repos,200 packages per repo and1000 edges, with existing worker timeout/cancellation bounding I/O. Referenced graph closure is read only, never every unrelated Fleet repo. Graph failures stay independently unavailable inside a readable task Planning observation. Missing canonical carrier is the original unclassified lane, not proof of no dependencies. All declared dependency observations come from the existing resolver after topology validation. At10x scale, bounds or the existing worker deadline refuse the affected source; no silent truncation or false empty list. No pagination or configurable knobs are added to this complete relationship view.

## Integration and UI
Extract projectOperatorTaskContext into existing browser-safe core/task-context.ts, retaining the exact schema/decoder and existing effect checks. New core/operator/planning-snapshot.ts owns only transport projection/strict decoding; effect collection stays in existing effects/operator/collaboration.ts. The graph transport carries lane/revision, exact package/task IDs/revisions, capability, acceptance-policy and rollback refs, declared dependency verdicts, and canonical source revisions; filesystem/provider coordinates are excluded. No graph library.

Navigation has exactly Planning, Delivery and Organization/Attention, with Organization selected initially. Accessible tabs support arrows/Home/End and selected focus. Observation view changes neither fetch every task nor reset repository, Task detail, Composer, draft, IME or fences. Existing shared720px overlay/fullscreen details remain mounted outside view content. Planning uses readable rows and expandable original relationships; only exact matching Fleet cards can open the existing Task detail. Delivery renders five existing placement columns and explicit preparation/alternate/unclassified/isolated groups without relabeling them as execution. Default Organization retains automation/Decision/Engineer/attention/current-work summaries. Repository health and history/source details remain secondary. No inferred next action or browser start/approve/stop controls.

## Files
More than8 files: core/operator/task-context.ts and new planning-snapshot.ts; effects/operator/task-context.ts, collaboration.ts, collaboration-worker.ts, server.ts; operator-web/types.ts, App.tsx, new PlanningView.tsx, fixture.ts, i18n.ts, styles.css. Extend existing effects/operator-task-context.test.ts, operator-web/operator-collaboration.test.tsx, operator-web/operator-interactions.test.tsx, unit/operator-web-types.test.ts, effects/operator-write-boundary.test.ts, cli/operator-serve.test.ts. Existing graph/dependency tests supply authority regression. Durable conclusions go to docs/researches/20260922-operator-planning-views.md and this package's plan/contract/review/notes; projection manifest only through deterministic tooling.

## Verification
Use real temporary canonical Sprint/graph fixtures for requirements and declared dependencies, strict ref/digest and capability validation, original plan_missing/agent vs plan_not_approved/user, exact-commit reads despite dirty files, unavailable dependency source, bounded counts, double-read changes, registry drift, and no writes. Extend transport/HTTP coverage for protocol4 required source and source isolation. UI coverage: default view, keyboard tabs, five-column count conservation plus other groups, Planning ID/revision join, unchanged Task/Composer draft across view change, scope cancellation, no read/write triggered by navigation, original relationship text, narrow/wide bilingual rendering. Run owning focused suites, typecheck, production build and nine required integrity checks. No full suite, provider traffic, installation, native canary or main merge.

## Acceptance and rollback
Full roadmap implementation and stage PRs are already approved. Freeze candidate after local checks; obtain this worktree's CodeGraph indexing authorization before current proof, deterministic reconcile and canonical verification; run one semantic acceptance and submit the stage PR. Index/acceptance on ancestor worktrees does not admit this package. Revert protocol4 server/browser and projection extraction together; no durable data migration is required.


## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Implement canonical Planning collection and strict protocol4 projection with bounded independent source health.
- [x] Complete Planning/Delivery/Organization navigation and exact shared Task details.
- [x] Verify focused behavior, bilingual responsive browser and repository integrity.
- [ ] Complete current architecture/canonical acceptance and stage PR.
