> **Archived**: 2026-09-23 14:09
> **Related Plan**: plans/archive/plan-20260922-0757-akn05-decisions.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260923-1409
> **Archive Projection V1**: `plans/plan-20260922-0757-akn05-decisions.md` => `plans/archive/plan-20260922-0757-akn05-decisions.md`
> **Archive Projection V1**: `tasks/notes/20260922-0757-akn05-decisions.notes.md` => `tasks/archive/notes-20260923-1409-akn05-decisions.md`
> **Archive Projection V1**: `tasks/contracts/20260922-0757-akn05-decisions.contract.md` => `tasks/archive/contract-20260923-1409-akn05-decisions.md`
> **Archive Projection V1**: `tasks/reviews/20260922-0757-akn05-decisions.review.md` => `tasks/archive/review-20260923-1409-akn05-decisions.md`

# Plan: AKN-05d Formal Decision inventory

> **Status**: Archived
> **Created**: 20260922-0757
> **Slug**: akn05-decisions
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Bounded canonical Decision inventory and exact query lifetime
> **Rollback Surface**: Revert read protocol and UI together without altering Decisions
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260923-1409-akn05-decisions.md`
> **Task Review**: `tasks/archive/review-20260923-1409-akn05-decisions.md`
> **Implementation Notes**: `tasks/archive/notes-20260923-1409-akn05-decisions.md`

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

- Active plan: `plans/archive/plan-20260922-0757-akn05-decisions.md`
- Sprint contract: `tasks/archive/contract-20260923-1409-akn05-decisions.md`
- Sprint review: `tasks/archive/review-20260923-1409-akn05-decisions.md`
- Implementation notes: `tasks/archive/notes-20260923-1409-akn05-decisions.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260923-1409-akn05-decisions.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260922-0757-akn05-decisions.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260922-0757-akn05-decisions.md`.

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
- Contract file: `tasks/archive/contract-20260923-1409-akn05-decisions.md`
- Review file: `tasks/archive/review-20260923-1409-akn05-decisions.md`
- Implementation notes file: `tasks/archive/notes-20260923-1409-akn05-decisions.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260923-1409-akn05-decisions.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260922-0757-akn05-decisions.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert read protocol and UI together without altering Decisions
- **Verification boundary**: Bounded canonical Decision inventory and exact query lifetime
- **Review/acceptance boundary**: `tasks/archive/review-20260923-1409-akn05-decisions.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260922-0757-akn05-decisions.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260923-1409-akn05-decisions.md`, `tasks/archive/review-20260923-1409-akn05-decisions.md`, and `tasks/archive/notes-20260923-1409-akn05-decisions.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260923-1409-akn05-decisions.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert read protocol and UI together without altering Decisions

## Captured Planning Output

## Goal
AKN-05d adds a bounded read-only inventory of canonical open Human Decisions and exposes it through collaboration protocol3 with independent source status, exact pagination scope and a default Needs your decision section. This supplies the missing formal Decision authority of roadmap section7. It does not add browser approval, change Decision transitions, substitute acceptance waivers or claim native execution/full three-view completion.

## P1/P2/P3
P1: verified-context-store.ts owns Git-common-dir Decision storage, hashed UUID directories, canonical current/request/event validation and Human-only answer semantics. No inventory currently exists. Collaboration GET already owns registry scoping, isolated worker/deadline, cancellation and repository single-flight; protocol2 has independent Exchange and Organization sources. Browser Organization summary explicitly reports Decision inventory absent.
P2: registered repository plus decision_after cursor -> safe bounded enumeration of existing decisions directories -> canonical current/request/event reads -> exact directory/UUID/digest/event/current linkage -> double-read validation -> open records and coverage -> protocol3 decisions source -> browser strict decoder -> explicit open questions and recorded Task/Binding fences. A missing decisions directory is known empty without creating it; corrupt, symlinked, misplaced, changed or oversized single records fail closed. No store creation/lock, transition, provider, ACK or task execution occurs. Pagination replaces the page; next cursor is the last completely scanned key, never an inferred UUID. Closed records are validated before being skipped.
P3: add inventory to existing store, reuse canonical validators and immutable reader with an injected bounded byte reader internal to this module. Enumerate at most20000 directory keys; scan at most200 decisions per page; output default50/max100; per-file128KiB, total8MiB, and deadline2s. If scan/output/byte budget ends after progress, return explicit partial coverage and cursor; invalid single record, deadline expiry or no-progress budget failure is unavailable because final consistency must still be validated within the deadline. Sorted key enumeration must finish before cursor selection, so excess directory count is unavailable rather than silently skipping unseen earlier keys. Current digests and directory inventory are reread before returning; concurrent change is a conflict. At10x history the UI pages rather than accumulating rows or hiding failures; enumeration cap remains an explicit unavailable bound.

## Integration
Upgrade required collaboration envelope protocol2->3, adding decision_after echo and independent decisions source. Existing GET accepts only bounded decision_after query; per-query single-flight key includes repository and cursor, while worker budget/deadline stays shared. Browser fetch passes cursor, decoder binds it, and repository change/refresh reset page; Task selection does not reset it. Render original question as text, exact Task/Binding/request/current/event references and human ownership; no action button claims to answer. Partial pages never show a repository-wide pending count. Next-page control replaces current page and superseded reads cannot update it. WorkExchange and Organization remain usable if Decision source fails. No new route, service, configuration, credential or external dependency.

## Files and verification
More than8 files: src/effects/engineers/verified-context-store.ts; new src/core/operator/decision-inventory.ts for browser-safe redaction/strict wire decoder (source module contains Node crypto); existing collaboration core/effect/worker/server; browser App/types/OrganizationSummary/fixture/i18n/styles. Existing tests/unit/me2c-verified-evidence-context.test.ts owns canonical store and fault coverage; extend operator collaboration/types/write-boundary/serve suites for transport/query/privacy/cancellation. Add no task-named suite. Durable conclusions in docs/researches/20260922-operator-decision-inventory.md and owning workflow artifacts. Projection manifest only through authorized deterministic reconcile.

Tests cover real stored open/answered/cancelled records, exact fence retention, sorted pagination with closed records, no-store empty/no write, corruption/misfiled key/symlinks/half-write, partial scan/bytes/output, stale cursor/source identity and no late response; plain-text XSS, page replacement, per-query single-flight and independent source failure. Seed canonical read fixtures directly where possible rather than repeating provider/durability setup. Run the existing store suite, four UI suites, operator-web-types/write-boundary/serve, typecheck, Vite and nine required integrity checks. Inspect built bilingual narrow/wide UI.

## Acceptance and rollback
Whole-roadmap implementation and stage PRs are already authorized. Freeze source, current architecture proof when index is authorized, canonical verification, one independent semantic acceptance and stage PR. Revert browser/server protocol together to rollback; inventory never changes durable data. Main merge, runtime install, native Host canary, Planning graph and browser answer transitions remain outside this package.

## Task Breakdown
- [x] Implement and verify bounded canonical open Decision inventory in the owning store.
- [x] Integrate protocol3 query scope, independent Decision observation and page replacement UI.
- [x] Complete focused tests, browser and repository integrity evidence.
- [ ] Record current architecture/canonical acceptance and stage PR.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Implement and verify bounded canonical open Decision inventory in the owning store.
- [x] Integrate protocol3 query scope, independent Decision observation and page replacement UI.
- [x] Complete focused tests, browser and repository integrity evidence.
- [ ] Record current architecture/canonical acceptance and stage PR.
