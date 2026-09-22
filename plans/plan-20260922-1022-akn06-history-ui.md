# Plan: AKN-06e old Task URLs and historical context

> **Status**: Executing
> **Created**: 20260922-1022
> **Slug**: akn06-history-ui
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Existing context GET to exact-ID historical browser detail without write authority
> **Rollback Surface**: Remove history context mode and browser navigation together; retain standalone history reader
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-1022-akn06-history-ui.contract.md`
> **Task Review**: `tasks/reviews/20260922-1022-akn06-history-ui.review.md`
> **Implementation Notes**: `tasks/notes/20260922-1022-akn06-history-ui.notes.md`

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

- Active plan: `plans/plan-20260922-1022-akn06-history-ui.md`
- Sprint contract: `tasks/contracts/20260922-1022-akn06-history-ui.contract.md`
- Sprint review: `tasks/reviews/20260922-1022-akn06-history-ui.review.md`
- Implementation notes: `tasks/notes/20260922-1022-akn06-history-ui.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-1022-akn06-history-ui.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-1022-akn06-history-ui.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-1022-akn06-history-ui.md`.

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
- Contract file: `tasks/contracts/20260922-1022-akn06-history-ui.contract.md`
- Review file: `tasks/reviews/20260922-1022-akn06-history-ui.review.md`
- Implementation notes file: `tasks/notes/20260922-1022-akn06-history-ui.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-1022-akn06-history-ui.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-1022-akn06-history-ui.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Remove history context mode and browser navigation together; retain standalone history reader
- **Verification boundary**: Existing context GET to exact-ID historical browser detail without write authority
- **Review/acceptance boundary**: `tasks/reviews/20260922-1022-akn06-history-ui.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-1022-akn06-history-ui.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-1022-akn06-history-ui.contract.md`, `tasks/reviews/20260922-1022-akn06-history-ui.review.md`, and `tasks/notes/20260922-1022-akn06-history-ui.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-1022-akn06-history-ui.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Remove history context mode and browser navigation together; retain standalone history reader

## Captured Planning Output

## Goal
Connect AKN-06d's proven Task history source to old URLs through the existing context GET and an explicit read-only historical definition region. A current selected Task keeps the existing DetailPane/Composer; no current card means historical lookup, never a synthesized writable card.

## P1 / P2 / P3
P1: Existing /context uses a bounded shared Task reader pool and Node worker. The history reader has exact schema2/commit/registry authority. App currently stores selection only in memory and drops disappeared cards, so an old URL cannot recover context. Existing DetailPane owns current Task/Claim draft and modal focus protections; retain those.
P2: Validate browser selectors repository/task/task_revision/view with unique allowed keys. Normal card selection emits repository+Task ID, no body/fence/path. Explicit view=history optionally binds a revision. Startup/popstate restores the selected scope. Current Task selection remains live across revisions using original draft guards. If a previously selected Task disappears, preserve its ID/revision and display only historical evidence. Browser current details and history are disjoint: history has no Composer, TaskDiff or readiness projection. History requests use /context?view=history, strict parse and decoder, existing shared worker slot/exit retirement, cancellation and Host/Origin checks. A removed repository remains explicit scope and can return history_unavailable; never silently select another repository.
P3: Add no route, writer, dependency or storage authority. Separate history worker entrypoint is required because it calls a different owner and preserves the existing typed current-context API. History DTO stays protocol1; the mode selector is explicit, not a shape fallback. Reuse observation hook for late response fences and visibility/refresh lifecycle. URL is navigation preference only and never authorizes a write. Invalid/duplicate selectors show a named invalid-link state and invoke no history reader. At10x load only one selected history source runs under the existing finite server pool and AKN-06d budgets. Main risks are lost selection/draft, stale cross-scope responses and misleading historic status; focused integration/real HTTP/browser prove them.

## Files / surface
src/core/operator/task-history.ts parse explicit history query; src/effects/operator/server.ts route branch/read injection, new src/effects/operator/task-history-worker.ts; new src/operator-web/task-history.ts transport; new src/operator-web/task-location.ts strict URL selectors; new src/operator-web/TaskHistory.tsx read-only historical source region; App.tsx navigation/state; i18n.ts/styles.css bilingual bounded presentation. Existing tests/effects/operator-task-context.test.ts, tests/cli/operator-serve.test.ts, tests/unit/operator-web-types.test.ts, tests/operator-web/operator-interactions.test.tsx and operator-ui.test.tsx. Own research/plan/contract/review/notes/todos plus deterministic architecture manifest only. More than8 files are one HTTP→browser behavior slice with its existing verification boundaries.

## Verification and acceptance
Five named suites, typecheck, production browser build and root9. Actual HTTP worker obtains archived commit evidence without filesystem mutation; Host/Origin/method/duplicate/ref/path selectors refuse before reader; shared budget busy/cancellation paths stay bounded. DOM verifies direct old URL, absent/malformed scope, popstate, explicit revision, no writes, late response rejection, and existing draft/IME tests. Production browser fixture visits current Task URL and archived exact-ID URL, validates visible commit/ref and read-only state. No installed-package/Host canary claim. Existing index/semantic acceptance gates remain required before stage PR; no main merge/runtime installation.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Connect explicit history context reads to the bounded server worker.
- [x] Restore Task URLs and render historical evidence without current-task authority.
- [x] Verify HTTP/browser/regressions and prepare candidate evidence.
- [x] Commit the verified candidate.
- [ ] Complete architecture and semantic acceptance before the stage PR.
