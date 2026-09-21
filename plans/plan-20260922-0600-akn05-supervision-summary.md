# Plan: AKN-05a: repository automation supervision homepage

> **Status**: Executing
> **Created**: 20260922-0600
> **Slug**: akn05-supervision-summary
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Original automation observations and stale scoped UI responses
> **Rollback Surface**: Remove homepage observation without durable migration
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-0600-akn05-supervision-summary.contract.md`
> **Task Review**: `tasks/reviews/20260922-0600-akn05-supervision-summary.review.md`
> **Implementation Notes**: `tasks/notes/20260922-0600-akn05-supervision-summary.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: docs/researches/20260921-agent-first-kanban-implementation-roadmap.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260922-0600-akn05-supervision-summary.md`
- Sprint contract: `tasks/contracts/20260922-0600-akn05-supervision-summary.contract.md`
- Sprint review: `tasks/reviews/20260922-0600-akn05-supervision-summary.review.md`
- Implementation notes: `tasks/notes/20260922-0600-akn05-supervision-summary.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-0600-akn05-supervision-summary.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-0600-akn05-supervision-summary.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-0600-akn05-supervision-summary.md`.

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
- Contract file: `tasks/contracts/20260922-0600-akn05-supervision-summary.contract.md`
- Review file: `tasks/reviews/20260922-0600-akn05-supervision-summary.review.md`
- Implementation notes file: `tasks/notes/20260922-0600-akn05-supervision-summary.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-0600-akn05-supervision-summary.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-0600-akn05-supervision-summary.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Remove homepage observation without durable migration
- **Verification boundary**: Original automation observations and stale scoped UI responses
- **Review/acceptance boundary**: `tasks/reviews/20260922-0600-akn05-supervision-summary.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-0600-akn05-supervision-summary.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-0600-akn05-supervision-summary.contract.md`, `tasks/reviews/20260922-0600-akn05-supervision-summary.review.md`, and `tasks/notes/20260922-0600-akn05-supervision-summary.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-0600-akn05-supervision-summary.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Remove homepage observation without durable migration

## Captured Planning Output

## Goal
AKN-05a: put original repository automation observations on the operator homepage, above the existing task worklist. This is the first independently verifiable UI slice of AKN-05; three-view navigation, context/activity details and target-scoped write admission remain the next AKN-05 slice. Never claim complete AKN-05 or native autonomy from this slice.

## P1/P2/P3 and decision
P1: AKN-04d2 owns the strict repository envelope and original automation summary. App owns selected repository and explicit refresh generation. Existing Worklist/DetailPane/Composer own Task observation and the message fence. Existing i18n owns bilingual copy and CSS tokens own visual semantics.
P2: selected repository ID -> abortable existing repository snapshot GET -> strict full decoding and exact identity -> per-selection summary state -> original policy/grant/budget/controller/Campaign records and explicit unavailable native admission. A switch aborts the old request and hides its result immediately, including transports that ignore cancellation. Manual refresh invalidates the selected observation. Failed refresh retains same-repository evidence only with a stale warning. No old response may satisfy a newer generation. No global snapshot filtering supplies automation facts. The existing Fleet observation continues to own the existing task worklist until the separately tested navigation/context cutover; this slice never substitutes scoped task cards into the message fence.
P3: use existing React effect cleanup and the existing strict transport, with no dependency, cache, periodic polling, new route or write. Display typed source operations and refs as original facts; no guessed last decision across runs, no native execution inference from executing, no grant-to-live-authorization inference, no guessed attention owner. Render each source known/missing/unavailable separately; original controller owner operator remains operator. At 10x records the existing server per-source64 and512KiB bounds apply; HTML details keeps secondary evidence compact. Abort and service epoch/generation are observation metadata, not authorization. Body14px, controls44px, responsive grid and existing tokens; preserve drafts/focus/IME and original TaskDiff untouched.

## Files and verification
More than5 files: new src/operator-web/AutomationSummary.tsx, App.tsx integration, i18n.ts, styles.css, fixture.ts, existing tests/operator-web/operator-ui.test.tsx and operator-interactions.test.tsx; own docs/workflow and deterministic architecture projection manifest. Extend existing UI suites because they already own homepage and repository switching; no new test file. Test actual production component: original records and missing/unavailable, native unknown regardless controller executing, bilingual render, A->B late completion ignored, abort on unmount/superseding refresh, invalid identity/schema rejected, stale evidence labelled, epoch reset accepted for current request. Existing message/collaboration/diff suites remain regression evidence. Typecheck, full browser build and9 required integrity commands. Inspect actual read-only built fixture page in English/Chinese and wide/narrow browser. No main merge/runtime install/owner waiver/index permission inferred.

## Task Breakdown
- [x] Implement scoped summary observation and bilingual original-authority homepage.
- [x] Verify source truth, cancellation/stale isolation, existing message regressions and browser layouts.
- [ ] Record durable boundary; freeze architecture/canonical evidence, one semantic acceptance and stage PR.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

