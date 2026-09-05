> **Archived**: 2026-09-05 23:07
> **Related Plan**: plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-2307
> **Archive Projection V1**: `plans/plan-20260905-1841-campaign-authoring-budget-prerequisite.md` => `plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/notes/20260905-1841-campaign-authoring-budget-prerequisite.notes.md` => `tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/contracts/20260905-1841-campaign-authoring-budget-prerequisite.contract.md` => `tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Archive Projection V1**: `tasks/reviews/20260905-1841-campaign-authoring-budget-prerequisite.review.md` => `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md`

# Plan: Campaign authoring budget admission and terminal evidence

> **Status**: Archived
> **Created**: 20260905-1841
> **Slug**: campaign-authoring-budget-prerequisite
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Cross-process last-round admission, unknown-result recovery and BRC6 terminal proof
> **Rollback Surface**: Revert this isolated upstream contract change; remint campaign grants explicitly
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Task Review**: `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md`
- Sprint contract: `tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md`
- Sprint review: `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md`
- Implementation notes: `tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md`.

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
- Contract file: `tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md`
- Review file: `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md`
- Implementation notes file: `tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert this isolated upstream contract change; remint campaign grants explicitly
- **Verification boundary**: Cross-process last-round admission, unknown-result recovery and BRC6 terminal proof
- **Review/acceptance boundary**: `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260905-1841-campaign-authoring-budget-prerequisite.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-2307-campaign-authoring-budget-prerequisite.md`, `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md`, and `tasks/archive/notes-20260905-2307-campaign-authoring-budget-prerequisite.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-2307-campaign-authoring-budget-prerequisite.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert this isolated upstream contract change; remint campaign grants explicitly

## Captured Planning Output

## Goal
Deliver the minimum upstream budget authority consumed by BRC6: bounded per-group authoring, persist-first provider admission, and verifiable terminal/quiescent evidence. Reuse ProgramAuthorizationV1 and the existing automation budget ledger. Do not implement all BRC9 limits or BRC6 adoption.

## P1 — Map
ProgramAuthorizationV1.campaign owns campaign policy; budget.ts owns grant validation, reservations and accounting; budget-store.ts owns anchored authorization, per-run cross-process locking, append-only reservations/events and recovery. gpt-pro-issue-authoring.ts currently calls browser adapters after persisting intent but without budget admission. campaign-step.ts has its own provider mutation recovery journal, which must not become a budget counter. BRC6 owns adoption/challenge materialization and its draft plan/sprint changes; those files remain outside this implementation's ownership.

## P2 — Trace
For initial/fill_missing/edit_issue, validate campaign and intent, acquire the existing budget reservation bound to repository/campaign/group/intent/authorization/budget revision/request identity before browser I/O, persist the returned session before settling usage. An interrupted or uncertain call remains open and prevents another call or quiescent evidence. A second process competing for the final round is rejected under the same budget lock. BRC6 reads a validated locked budget snapshot: completed rounds come from settled reservations and events, never campaign journal counts. Exhaustion plus no open call seals authoring for that exact group/intent. Full batches may seal before exhaustion. Challenge uses provider admission under the same run without charging an authoring round.

## P3 — Decisions
- Extend only the campaign payload with a required positive max_authoring_rounds_per_group. Existing non-campaign grant semantics remain unchanged; old campaign grants lacking the field fail closed and require operator remint. No default or compatibility reader.
- Keep one deterministic automation run per campaign, bound to its anchored grant and target; no fake Task/Claim/Lease. Existing contract_less scope supports pre-Task execution explicitly. Do not silently convert task-contract authorization.
- Add explicit campaign reservation context (campaign/group/intent and authoring operation or challenge), validated and hashed in the existing reservation. initial/fill_missing/edit_issue each spend one admitted authoring round; challenge spends existing provider_invocation budget only. Existing global runner/provider-failure/wall-clock limits remain enforced, and no claim of separate BRC9 provider-call limits is made.
- Authoring round exhaustion closes only that group/intent, not the entire run: challenge can still proceed if global budget allows it. A durable terminal record in the same budget store is a seal over ledger evidence, not another usage counter. Current global stop receipts remain global and cannot be bypassed by challenge.
- Consumption proof must bind repository/campaign/group/intent, grant digest, budget revision, ledger/reservation/event references and terminal status; reading/verifying checks current authority and no open reservations. A proof cannot self-authorize new I/O, survive mismatched revision, or reopen authoring. Revisions cannot erase a group seal or remap its intent.
- Keep external browser calls outside locks. Reserve replay never means permission to repeat unknown I/O. Terminal completion persists session then usage; uncertain running/recoverable/capture outcomes remain unresolved. Dry-run performs no new budget mutation.
- At 10x the per-run lock and ledger scan become first contention/latency costs; bounded campaign groups (1–3) make a second index authority unnecessary.

## Owned Files
src/core/automation/budget.ts; src/effects/automation/budget-store.ts and necessary internal helpers; focused campaign budget adapter under src/effects/automation; src/effects/automation/gpt-pro-issue-authoring.ts; minimal campaign-step/CLI wiring if required by the frozen interface; affected grant/campaign fixtures and tests; owning automation-budget/development-campaign architecture docs; this work-package plan/contract/review/notes; tasks/current.md. Do not edit BRC6 plan or sprint; coordinate its owner to consume delivered API names.

## Verification
Focused existing issue-282 core/store/contention/e2e/drift tests, new campaign authoring budget tests, authoring/campaign-step/CLI regressions, typecheck, state boundaries, six repository integrity checks. Verify last-round race, replay once, unknown result blocks, mismatch/revocation, exhausted round followed by legal challenge, global exhaustion denies challenge, sealed group cannot reopen across revision or alternate run, full-batch seal without false exhaustion, and dry-run zero budget writes. Assess shared schema impact after implementation; obey required full-suite trigger when focused coverage leaves shared runtime integration risk. No real browser/provider spend for this work-package.

## Task Breakdown
- [x] Freeze BRC6 consumption seam and canonical execution contract in an isolated worktree.
- [x] Implement campaign-scoped admission and terminal/quiescent proof within the existing budget authority, with concurrency/replay tests.
- [x] Wire initial and continuation authoring through reservation/session/settlement and verify existing campaign behavior.
- [x] Document the delivered consumer API, run risk-scoped acceptance, and hand off the verified candidate to BRC6 owner.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze BRC6 consumption seam and canonical execution contract in an isolated worktree.
- [x] Implement campaign-scoped admission and terminal/quiescent proof within the existing budget authority, with concurrency/replay tests.
- [x] Wire initial and continuation authoring through reservation/session/settlement and verify existing campaign behavior.
- [x] Document the delivered consumer API, run risk-scoped acceptance, and hand off the verified candidate to BRC6 owner.
