> **Archived**: 2026-09-23 03:26
> **Related Plan**: plans/archive/plan-20260923-0311-akn05-supervision-integration.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260923-0326
> **Archive Projection V1**: `plans/plan-20260923-0311-akn05-supervision-integration.md` => `plans/archive/plan-20260923-0311-akn05-supervision-integration.md`
> **Archive Projection V1**: `tasks/notes/20260923-0311-akn05-supervision-integration.notes.md` => `tasks/archive/notes-20260923-0326-akn05-supervision-integration.md`
> **Archive Projection V1**: `tasks/contracts/20260923-0311-akn05-supervision-integration.contract.md` => `tasks/archive/contract-20260923-0326-akn05-supervision-integration.md`
> **Archive Projection V1**: `tasks/reviews/20260923-0311-akn05-supervision-integration.review.md` => `tasks/archive/review-20260923-0326-akn05-supervision-integration.md`

# Plan: AKN-05a accepted reader stack integration

> **Status**: Archived
> **Created**: 20260923-0311
> **Slug**: akn05-supervision-integration
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Existing supervision UI composed with accepted scoped automation protocol and reader cleanup
> **Rollback Surface**: Return PR439 to its pre-integration head without changing stored authority
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260923-0326-akn05-supervision-integration.md`
> **Task Review**: `tasks/archive/review-20260923-0326-akn05-supervision-integration.md`
> **Implementation Notes**: `tasks/archive/notes-20260923-0326-akn05-supervision-integration.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260923-0311-akn05-supervision-integration.md`
- Sprint contract: `tasks/archive/contract-20260923-0326-akn05-supervision-integration.md`
- Sprint review: `tasks/archive/review-20260923-0326-akn05-supervision-integration.md`
- Implementation notes: `tasks/archive/notes-20260923-0326-akn05-supervision-integration.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260923-0326-akn05-supervision-integration.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260923-0311-akn05-supervision-integration.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260923-0311-akn05-supervision-integration.md`.

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
- Contract file: `tasks/archive/contract-20260923-0326-akn05-supervision-integration.md`
- Review file: `tasks/archive/review-20260923-0326-akn05-supervision-integration.md`
- Implementation notes file: `tasks/archive/notes-20260923-0326-akn05-supervision-integration.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260923-0326-akn05-supervision-integration.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260923-0311-akn05-supervision-integration.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Return PR439 to its pre-integration head without changing stored authority
- **Verification boundary**: Existing supervision UI composed with accepted scoped automation protocol and reader cleanup
- **Review/acceptance boundary**: `tasks/archive/review-20260923-0326-akn05-supervision-integration.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260923-0311-akn05-supervision-integration.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260923-0326-akn05-supervision-integration.md`, `tasks/archive/review-20260923-0326-akn05-supervision-integration.md`, and `tasks/archive/notes-20260923-0326-akn05-supervision-integration.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260923-0326-akn05-supervision-integration.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Return PR439 to its pre-integration head without changing stored authority

## Captured Planning Output

## Goal
Narrow PR439 to its existing supervision homepage UI on the accepted automation-summary stack. This is an integration and acceptance boundary, not new UI scope.

## P1/P2/P3 and frozen decisions
P1: PR439 head796b3746 has an archived AKN-05a owner-accepted contract. Its obsolete placement base includes intervening readers. The current automation-summary candidate76f989cc incorporates accepted repository snapshot62429482 and accepted portable Inbox/Windows persistence; it must complete its own acceptance before this integration closes. A read-only merge-tree proves the resulting product delta is exactly seven browser/UI-test files; only the generated architecture manifest conflicts.
P2: App selects repository -> AutomationSummary requests the scoped snapshot -> strict protocol2 decoder -> original automation observations -> display. AbortController, render-time repository identity and epoch/generation checks prevent stale cross-scope display. Existing message drafts, task cards and POST authority remain unchanged. The integration must preserve current process cleanup and real record source readers.
P3: merge the accepted upstream, preserve semantic source owners and archived receipts, regenerate the manifest, and set the PR base to the automation-summary branch. Pin its accepted SHA as canonical source diff/rollback base before final evidence. The full normalized review subject remains policy origin/main. No source rewrite, new abstraction, tests file, timer, write route, migration execution, runtime installation or native execution claim is authorized. At10x records, original collector admission/limit/deadline refuses unavailable; UI keeps original source gaps.

## Scope and files
Seven UI surfaces: src/operator-web/App.tsx, AutomationSummary.tsx, fixture.ts, i18n.ts, styles.css; tests/operator-web/operator-interactions.test.tsx and operator-ui.test.tsx. No production behavior edit is expected. A concrete integration regression may be corrected only at this existing boundary with pre-fix proof.
Preserve docs/researches/20260922-operator-supervision-summary.md, accepted upstream docs and exact workflow archive paths. Generated docs/architecture/.projection-manifest.json is regenerated. Own plan/contract/review/notes and tasks/todos.md carry workflow evidence. Expand Allowed Paths only with exact inherited diff paths before merging.

## Verification and acceptance
Use existing UI/interactions/collaboration/task-diff suites, actual automation-record and scoped HTTP/IPC integration suites, existing migration effects runtime-readback for the inherited irreversible-effect classification, typecheck and operator browser build; retain all nine repository integrity checks in one contract Verification Plan. Do not repeat full hosted tests until the final integrated source is frozen. Obtain current CodeGraph proof using the already authorized worktree index; deterministic projection only. Preserve the original consumed AKN-05a review. This new package validates the composition and current acceptance; it does not rerun the prior UI review. Under the owner's autonomous stage acceptance instruction, use a truthful delegated disposition when no new semantic decision is introduced, without inventing external approval. Keep no-main-merge and no-install boundaries. PR439 must point to the accepted automation-summary branch and include actual CI/acceptance limitations.

## Task Breakdown
- [x] Capture bounded integration contract and enumerate exact dependency paths.
- [x] Integrate accepted automation summary and regenerate architecture proof; retain the seven-file UI delta.
- [ ] Verify current UI/protocol composition and record stage acceptance.
- [ ] Archive the integration package, update PR439 base and delivery evidence, and verify remote state.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture bounded integration contract and enumerate exact dependency paths.
- [x] Integrate accepted automation summary and regenerate architecture proof; retain the seven-file UI delta.
- [ ] Verify current UI/protocol composition and record stage acceptance.
- [ ] Archive the integration package, update PR439 base and delivery evidence, and verify remote state.
