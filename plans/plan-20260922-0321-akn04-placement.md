# Plan: AKN-04a: exhaustive Fleet placement and canonical count conservation

> **Status**: Executing
> **Created**: 20260922-0321
> **Slug**: akn04-placement
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: roadmap:AKN-04#8.3
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Fleet and Operator shared protocol cutover with count and authority invariants
> **Rollback Surface**: Roll back Fleet/Operator/browser together; no persisted domain mutation
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260922-0321-akn04-placement.contract.md`
> **Task Review**: `tasks/reviews/20260922-0321-akn04-placement.review.md`
> **Implementation Notes**: `tasks/notes/20260922-0321-akn04-placement.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: roadmap:AKN-04#8.3
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260922-0321-akn04-placement.md`
- Sprint contract: `tasks/contracts/20260922-0321-akn04-placement.contract.md`
- Sprint review: `tasks/reviews/20260922-0321-akn04-placement.review.md`
- Implementation notes: `tasks/notes/20260922-0321-akn04-placement.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260922-0321-akn04-placement.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260922-0321-akn04-placement.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260922-0321-akn04-placement.md`.

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
- Contract file: `tasks/contracts/20260922-0321-akn04-placement.contract.md`
- Review file: `tasks/reviews/20260922-0321-akn04-placement.review.md`
- Implementation notes file: `tasks/notes/20260922-0321-akn04-placement.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260922-0321-akn04-placement.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260922-0321-akn04-placement.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Roll back Fleet/Operator/browser together; no persisted domain mutation
- **Verification boundary**: Fleet and Operator shared protocol cutover with count and authority invariants
- **Review/acceptance boundary**: `tasks/reviews/20260922-0321-akn04-placement.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260922-0321-akn04-placement.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260922-0321-akn04-placement.contract.md`, `tasks/reviews/20260922-0321-akn04-placement.review.md`, and `tasks/notes/20260922-0321-akn04-placement.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260922-0321-akn04-placement.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Roll back Fleet/Operator/browser together; no persisted domain mutation

## Captured Planning Output

## AKN-04a Fleet placement and count conservation

Approved roadmap section 8.3, AKN-04: replace the null-only Fleet classification with an exhaustive placement, preserve exact TaskOffer blockers/owners, and conserve known canonical task counts. This shared-contract work-package cuts Fleet 4 -> 5 and Operator 5 -> 6 together, including effects/IPC/DTO/browser decoders and existing consumers/fixtures. Based on 75036305 (AKN-03b source); AKN-03c notification reconciliation is an independent sibling. No H0/provider activation dependency and no runtime policy change. New scoped context/activity routes and richer automation/Steer observations remain AKN-04b, and the full monitor home remains AKN-05.

## P1 — Map
Canonical resolveBoard owns TaskState, Lease, row identity and publication pointers. collectRepoTaskOffers owns readiness and exact typed blocker/owner pairs. Fleet effects currently discard those blockers. core/fleet/board classifies only five columns or null, then marks every null card degraded; normal missing-plan and inline work are consequently false failures. Operator projection is redaction/pass-through only; browser decoder is independently strict and version-bound. App worklist conflates available with agent_working. Existing Fleet unit/effects, Operator projection/decoder/server/CLI and web fixture/interactions are the consumer boundary.

## P2 — Trace
A canonical pending contract row without a plan produces planning_required plus plan_missing/agent. Effects pass readiness only; core returns null; repository and Fleet become degraded/unclassified; browser reports an anomaly. Fix at the owning projection, preserving the original blocker pair end to end. For bound/reviewing work, an offer may be unsupported because it cannot be reacquired: valid Lease/publication facts take precedence. A missing canonical row with a surviving Lease is TaskState missing; preserve that execution record but exclude it from known canonical task counts. Failed individual card reads retain canonical TaskState and fail independently from sibling cards.

## P3 — Contract decisions
Card placement is a single discriminated union: {kind:column,column:<five existing columns>}, {kind:preparation}, {kind:alternate_workflow,workflow:inline}, or {kind:unclassified,reason:<closed reason>}. Remove the old top-level card.column authoring/consumption path in this same cutover; no old-schema fallback or dual writer. Pass task_state from canonical board and readiness_blockers (exact TaskOffer pairs; null if no offer authority) through Fleet and Operator. No inference from task label, text, provider prose or notifications.

Precedence: observation failure -> missing/drifted canonical identity -> existing valid done/review/working/available rules -> pre-execution preparation/alternate -> explicit unclassified. Only pending+available rows may use readiness for preparation. Normal preparation codes are plan_missing, plan_not_approved, plan_not_projectable, contract_missing, contract_not_projectable, repo_read_only; all supplied blockers must belong to that closed set. planning_required requires at least one such reason. unsupported maps preparation only with a nonempty set entirely from that set. inline_ready maps alternate only with no blockers; execution_ready maps available only with no blockers. Ambiguous/mismatched/unavailable source, unknown Lease, unsupported mode and unmapped combinations remain unclassified. Working/review/done never regress due to reacquisition blockers.

Counts add preparation, alternate_workflow, isolated_execution and known_tasks. Only cards whose canonical task_state is not missing contribute to known_tasks or placement totals. Missing-row execution records contribute only to isolated_execution. Preserve unreadable as unknown-repository count: it is not a task count and must never be added to known_tasks. Decoder checks the count projection against the delivered repository/card set and rejects malformed union, unknown blocker vocabulary, old protocol, missing fields and nonconserving counts. No new persisted Kanban authority.

Normal preparation/alternate do not degrade repository health; unclassified or failed observations still do. Exact readiness blockers are distinct from merge blockers. Include readiness owners in card attention only before valid execution; preserve all raw reasons for detail. App consumes the new placement, renders preparation/inline explicitly, groups available separately, and uses a claimed-stage label instead of implying live Agent execution. This is minimal protocol-consumer integration, not the AKN-05 monitor redesign.

At 10x cardinality classification/counting remain linear in observed cards with bounded per-card blocker vocabulary; existing IO/provider budgets are unchanged. Rollback server/core/browser bundle together. This is a read model cutover with no persistent data migration; do not rewrite Sprint/Lease/messages to fit the projection.

## Files and verification
Existing production files: src/core/fleet/board.ts, src/effects/fleet/board.ts, src/core/operator/fleet-snapshot.ts, src/operator-web/{types.ts,App.tsx,fixture.ts,i18n.ts}; update any discovered direct Fleet IPC/CLI consumer within the explicit contract before editing it. Existing tests: unit/fleet-board, effects/fleet-board, unit/operator-fleet-snapshot, unit/operator-web-types, cli/fleet-board, cli/operator-serve, effects/operator-write-boundary, operator-web/operator-interactions; fixtures/protocol literals in other existing Operator tests as required by the exact cutover. No new production/test module.

Record pre-fix missing-plan degraded regression in existing Fleet unit suite. Cover stage precedence, known/unknown blocker combinations and owners, failed-card isolation, inline, orphan Lease, unreadable repo unknown count, count conservation, protocol rejection and decoder shape/consistency. Use canonical Verification Plan for focused suites, typecheck, browser build and root integrity checks. Inspect rendered fixture UI for changed labels/grouping before stage acceptance. Keep model-free evidence distinct from real Host/H0 acceptance. Freeze final source/projection and perform one independent acceptance review before stage PR; no main merge/runtime install.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze placement/count/blocker protocol and implement canonical Fleet projection/effect wiring.
- [x] Cut over Operator DTO/decoder and browser consumers without legacy fallback.
- [x] Update existing regression/consumer fixtures and prove source-level behavior plus rendered UI.
- [ ] Freeze source/projection, verify and obtain stage acceptance before submitting PR.

## Protocol inventory closure

The existing C0 authority inventory imports Fleet protocol and therefore belongs to this same v4-to-v5 cutover. Synchronize its expected version and computed digest, retaining the historical freeze record and adding an explicit AKN-04a revision. Add the existing inventory suite to canonical verification. This correction introduces no new authority plane or product behavior.
