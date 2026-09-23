# Plan: AKN-05b task context and steer evidence

> **Status**: Executing
> **Created**: 20260922-0655
> **Slug**: akn05-task-evidence
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Exact task query lifetime and historical message provenance
> **Rollback Surface**: Remove read-only detail integration without durable state changes
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-0655-akn05-task-evidence.contract.md`
> **Task Review**: `tasks/reviews/20260922-0655-akn05-task-evidence.review.md`
> **Implementation Notes**: `tasks/notes/20260922-0655-akn05-task-evidence.notes.md`

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

- Active plan: `plans/plan-20260922-0655-akn05-task-evidence.md`
- Sprint contract: `tasks/contracts/20260922-0655-akn05-task-evidence.contract.md`
- Sprint review: `tasks/reviews/20260922-0655-akn05-task-evidence.review.md`
- Implementation notes: `tasks/notes/20260922-0655-akn05-task-evidence.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-0655-akn05-task-evidence.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-0655-akn05-task-evidence.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-0655-akn05-task-evidence.md`.

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
- Contract file: `tasks/contracts/20260922-0655-akn05-task-evidence.contract.md`
- Review file: `tasks/reviews/20260922-0655-akn05-task-evidence.review.md`
- Implementation notes file: `tasks/notes/20260922-0655-akn05-task-evidence.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-0655-akn05-task-evidence.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-0655-akn05-task-evidence.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Remove read-only detail integration without durable state changes
- **Verification boundary**: Exact task query lifetime and historical message provenance
- **Review/acceptance boundary**: `tasks/reviews/20260922-0655-akn05-task-evidence.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-0655-akn05-task-evidence.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-0655-akn05-task-evidence.contract.md`, `tasks/reviews/20260922-0655-akn05-task-evidence.review.md`, and `tasks/notes/20260922-0655-akn05-task-evidence.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-0655-akn05-task-evidence.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Remove read-only detail integration without durable state changes

## Captured Planning Output

## Goal
AKN-05b connects the already implemented task context and bounded activity GETs to the shared task detail. Users can inspect canonical goal/acceptance/plan proof, exact recorded Claim, original messages, recipient delivery and acknowledgement, authenticated reply provenance and partial history. This is an independent read-only UI slice of roadmap section7; three-view navigation and target-scoped message admission remain distinct follow-on work, not claimed complete.

## P1/P2/P3
P1: App owns Task identity, selected revision, refresh generation, Composer draft/fences and TaskDiff. Existing task-context/task-activity transports and strict core decoders own request/response identity and byte/scan bounds. Activity includes historical revisions and recorded actors; none implies current authorization. i18n and CSS own bilingual tokens.
P2: selected repository/task/revision -> context GET(expected revision), activity GET(limit50) -> strict exact request decode -> detail evidence. Abort on deselect, task/revision switch, refresh and unmount, and reject completion even if transport ignores abort. Independent source state prevents a context failure hiding stored history. Manual next page replaces the current page and keeps explicit coverage; no accumulated/unbounded cache. Exact reply/parent message lookup reuses message_id query; return to first page explicitly. Changing revision resets pages. Same-identity refresh can show previous records only marked historical. No message POST, deliver or ACK is called by the new reads. Original Composer and TaskDiff remain mounted under their existing keys.
P3: separate TaskEvidence.tsx protects the query identity/lifetime shared by context and activity without adding a generic query framework. Reuse React useEffect/AbortController and existing transports. No new protocol, route, package, storage, background polling or configuration. At10x activity, page replacement bounds browser memory; server coverage limits remain visible and exact ID lookup can inspect a referenced message without pretending complete scan. Render raw untrusted bodies as text and refs as text, never HTML/arbitrary path links. Use14px text and44px controls. Details distinguish recorded identity from current authority, delivered/acknowledged from adopted, and no reply record from success.

## Files and verification
More than5 files: new src/operator-web/TaskEvidence.tsx (independent query/evidence responsibility), App.tsx integration, i18n.ts, styles.css, fixture.ts if required, existing operator-interactions and operator-ui suites, owning research/workflow artifacts and architecture projection manifest. Do not change backend source or Composer authorization. Extend existing suites with production-component exact request assertions, cancellation, identity rejection, late response suppression, independent failures, refresh historical notice, partial/page replacement, empty bodies, parent/reply lookup and authenticated provenance. Run four existing UI suites, typecheck, browser build and nine required integrity checks. Inspect built fixture page at wide/narrow EN/ZH. No native Host admission, runtime install, main merge or index permission inferred.

## Approval and follow-through
Whole roadmap implementation and stage PRs are already approved by the user. Freeze source and deterministic architecture proof, prepare canonical evidence, obtain one typed semantic acceptance under the contract, then publish a stage PR. Preserve pending05a acceptance and its frozen worktree. No new credentials or external API dependencies. Rollback removes the new read-only details and leaves durable records unchanged.

## Task Breakdown
- [x] Complete shared detail layout:720px wide-screen overlay/full-screen narrow pane; preserve focus, scroll lock, drafts and IME. Move the repository overview to a secondary disclosure in main content.
- [x] Implement exact-scope context/activity queries and original-evidence detail presentation.
- [x] Verify lifetimes, coverage/provenance, existing draft/IME behavior, bilingual narrow/wide layout and integrity.
- [ ] Record durable boundary, architecture/canonical evidence, acceptance and stage PR.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Complete shared detail layout:720px wide-screen overlay/full-screen narrow pane; preserve focus, scroll lock, drafts and IME. Move the repository overview to a secondary disclosure in main content.
- [x] Implement exact-scope context/activity queries and original-evidence detail presentation.
- [x] Verify lifetimes, coverage/provenance, existing draft/IME behavior, bilingual narrow/wide layout and integrity.
- [ ] Record durable boundary, architecture/canonical evidence, acceptance and stage PR.

## Detail layout continuation
Roadmap section7 explicitly requires a wide overlay and narrow full-screen detail. Implement it in this existing detail work-package using already allowed App/styles/interaction tests; no extra plan or worktree. Remove the persistent complementary-pane branch and responsive JS modality, keep a single modal lifetime across resize, preserve overview facts in a secondary main-content disclosure. Formal organization/Decision and Planning dependency adapters remain the next observed data gap, not a renamed empty view.
