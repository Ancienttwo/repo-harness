> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-0734-akn05-organization.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-0734-akn05-organization.md` => `plans/archive/plan-20260922-0734-akn05-organization.md`
> **Archive Projection V1**: `tasks/notes/20260922-0734-akn05-organization.notes.md` => `tasks/archive/notes-20260923-1409-akn05-organization.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0734-akn05-organization.contract.md` => `tasks/archive/contract-20260923-1409-akn05-organization.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0734-akn05-organization.review.md` => `tasks/archive/review-20260923-1409-akn05-organization.md`

# Plan: AKN-05c Organization observation

> **Status**: Archived
> **Created**: 20260922-0734
> **Slug**: akn05-organization
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Independent organization source redaction and protocol2 browser scope
> **Rollback Surface**: Revert server and browser transport together without durable state changes
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260923-1409-akn05-organization.md`
> **Task Review**: `tasks/archive/review-20260923-1409-akn05-organization.md`
> **Implementation Notes**: `tasks/archive/notes-20260923-1409-akn05-organization.md`

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

- Active plan: `plans/archive/plan-20260922-0734-akn05-organization.md`
- Sprint contract: `tasks/archive/contract-20260923-1409-akn05-organization.md`
- Sprint review: `tasks/archive/review-20260923-1409-akn05-organization.md`
- Implementation notes: `tasks/archive/notes-20260923-1409-akn05-organization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260923-1409-akn05-organization.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260922-0734-akn05-organization.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260922-0734-akn05-organization.md`.

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
- Contract file: `tasks/archive/contract-20260923-1409-akn05-organization.md`
- Review file: `tasks/archive/review-20260923-1409-akn05-organization.md`
- Implementation notes file: `tasks/archive/notes-20260923-1409-akn05-organization.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260923-1409-akn05-organization.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260922-0734-akn05-organization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert server and browser transport together without durable state changes
- **Verification boundary**: Independent organization source redaction and protocol2 browser scope
- **Review/acceptance boundary**: `tasks/archive/review-20260923-1409-akn05-organization.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260922-0734-akn05-organization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260923-1409-akn05-organization.md`, `tasks/archive/review-20260923-1409-akn05-organization.md`, and `tasks/archive/notes-20260923-1409-akn05-organization.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260923-1409-akn05-organization.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert server and browser transport together without durable state changes

## Captured Planning Output

## Goal
AKN-05c exposes canonical Engineering Overlay and Organization Attention in the default supervision page through the existing collaboration GET. This completes the Engineer/Binding observation boundary while preserving the existing WorkExchange and task details. Formal Decision inventory and Planning graph remain named roadmap dependencies; this package must not fabricate them or claim all three views complete.

## P1/P2/P3
P1: collectEngineeringBoard owns validated Engineer profiles, Binding, live Claim receipt, message/runtime-effect counts, source revisions/consistency and Organization Attention owner/reason. Existing collaboration GET owns registry scoping, Host/Origin rules, worker isolation, deadline, cancellation and single-flight. Current WorkExchange is a distinct read model. Browser App owns repository selection and refresh generation; no provider principal belongs to the browser.
P2: selected registered repository -> existing collaboration worker -> independent WorkExchange and Engineering Board reads -> strict redaction and identity checks -> protocol2 envelope -> strict browser decode -> Organization summary plus existing WorkExchange pane. A failed source is unavailable with observation time; no invented empty source. A malformed/mismatched payload is refused at worker/server/browser boundaries. Opening/refreshing/closing the page never calls provider, bind/acquire, message delivery/ACK or controller effects.
P3: evolve collaboration transport to required protocol2 envelope {protocol,kind,repository_id,exchange,organization}. Exchange retains its source protocol1 redaction as a nested document, with no old top-level fallback. Organization strips host_id/provider_thread_id, worktree/branch/unit_ref while retaining exact task/revision/Claim/generation and recorded provider observation. Source summaries remain exact upstream semantics; no owner remapping or running inference. Both source outcomes are independently observed/unavailable. Fixed transport limits (200 Engineers and bounded JSON) fail unavailable rather than truncate/recount; worker deadline bounds synchronous reads. At10x store size collection may hit deadline/size limits and reports unavailable rather than a false total. Browser consumes one repository query, not card fan-out. Use existing UI suites and scoped source readers; no new server, database, config knob or external dependency.

## Implementation boundary
More than8 files across transport/core/effects/browser/tests, all one rollback and verification boundary. Modify src/core/operator/collaboration-snapshot.ts, src/effects/operator/collaboration.ts, collaboration-worker.ts, server.ts, src/operator-web/types.ts, App.tsx, fixture.ts, i18n.ts, styles.css. Add src/core/operator/organization-snapshot.ts for browser-safe redaction shape/strict decoder (upstream module imports Node crypto and contains private fields), and src/operator-web/OrganizationSummary.tsx for the distinct Organization observation responsibility. Extend existing tests/operator-web/operator-collaboration.test.tsx, tests/unit/operator-web-types.test.ts, tests/effects/operator-write-boundary.test.ts, tests/cli/operator-serve.test.ts and relevant fixture consumers only. Add no task-named test file. Record durable boundary in docs/researches/20260922-operator-organization.md and owning workflow artifacts. Architecture projection manifest only when deterministic reconcile is permitted.

## Verification and acceptance
Focused production projector/decoder tests cover exact redaction, invalid/extra fields, duplicates, scope mismatch, original owner vocabulary and consistency; source tests cover independent failure and registry errors with isolated HOME. UI tests cover default repository observation, source failure independence, stale scope cancellation and original detail/Composer protections. Run four UI suites, operator-web-types/write-boundary/operator-serve focused suites, typecheck, Vite build and nine required integrity checks. Inspect built EN/ZH narrow/wide page. Freeze candidate, obtain current architecture proof when local indexing is authorized, canonical verification and one independent semantic acceptance, then stage PR as already authorized. Main merge, native execution, runtime install and provider traffic are excluded. Rollback reverts server/browser protocol together without changing durable state.

## Task Breakdown
- [x] Implement protocol2 independent source outcomes and browser-safe Organization projection/decoder.
- [x] Integrate existing worker/HTTP route and default Organization summary with exact repository cancellation.
- [x] Complete focused behavioral, browser and required integrity evidence.
- [ ] Record architecture/canonical acceptance and stage PR.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Implement protocol2 independent source outcomes and browser-safe Organization projection/decoder.
- [x] Integrate existing worker/HTTP route and default Organization summary with exact repository cancellation.
- [x] Complete focused behavioral, browser and required integrity evidence.
- [ ] Record architecture/canonical acceptance and stage PR.
