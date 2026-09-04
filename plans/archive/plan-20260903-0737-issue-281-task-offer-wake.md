> **Archived**: 2026-09-05 03:14
> **Related Plan**: plans/archive/plan-20260903-0737-issue-281-task-offer-wake.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260905-0314
> **Archive Projection V1**: `plans/plan-20260903-0737-issue-281-task-offer-wake.md` => `plans/archive/plan-20260903-0737-issue-281-task-offer-wake.md`
> **Archive Projection V1**: `tasks/notes/20260903-0737-issue-281-task-offer-wake.notes.md` => `tasks/archive/notes-20260905-0314-issue-281-task-offer-wake.md`
> **Archive Projection V1**: `tasks/contracts/20260903-0737-issue-281-task-offer-wake.contract.md` => `tasks/archive/contract-20260905-0314-issue-281-task-offer-wake.md`
> **Archive Projection V1**: `tasks/reviews/20260903-0737-issue-281-task-offer-wake.review.md` => `tasks/archive/review-20260905-0314-issue-281-task-offer-wake.md`

# Plan: Add durable task-offer wake effects

> **Status**: Archived
> **Created**: 20260903-0737
> **Slug**: issue-281-task-offer-wake
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: github:Ancienttwo/repo-harness#281
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0314-issue-281-task-offer-wake.md --strict`.
> **Rollback Surface**: Before execution remove `plans/archive/plan-20260903-0737-issue-281-task-offer-wake.md`; after execution revert branch `codex/issue-281-task-offer-wake` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260905-0314-issue-281-task-offer-wake.md`
> **Task Review**: `tasks/archive/review-20260905-0314-issue-281-task-offer-wake.md`
> **Implementation Notes**: `tasks/archive/notes-20260905-0314-issue-281-task-offer-wake.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: github:Ancienttwo/repo-harness#281
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260903-0737-issue-281-task-offer-wake.md`
- Sprint contract: `tasks/archive/contract-20260905-0314-issue-281-task-offer-wake.md`
- Sprint review: `tasks/archive/review-20260905-0314-issue-281-task-offer-wake.md`
- Implementation notes: `tasks/archive/notes-20260905-0314-issue-281-task-offer-wake.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260905-0314-issue-281-task-offer-wake.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260903-0737-issue-281-task-offer-wake.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260903-0737-issue-281-task-offer-wake.md`.

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
- Contract file: `tasks/archive/contract-20260905-0314-issue-281-task-offer-wake.md`
- Review file: `tasks/archive/review-20260905-0314-issue-281-task-offer-wake.md`
- Implementation notes file: `tasks/archive/notes-20260905-0314-issue-281-task-offer-wake.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0314-issue-281-task-offer-wake.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260903-0737-issue-281-task-offer-wake.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/archive/plan-20260903-0737-issue-281-task-offer-wake.md`; after execution revert branch `codex/issue-281-task-offer-wake` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/archive/contract-20260905-0314-issue-281-task-offer-wake.md --strict`.
- **Review/acceptance boundary**: `tasks/archive/review-20260905-0314-issue-281-task-offer-wake.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260903-0737-issue-281-task-offer-wake.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260905-0314-issue-281-task-offer-wake.md`, `tasks/archive/review-20260905-0314-issue-281-task-offer-wake.md`, and `tasks/archive/notes-20260905-0314-issue-281-task-offer-wake.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260905-0314-issue-281-task-offer-wake.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/archive/plan-20260903-0737-issue-281-task-offer-wake.md`; after execution revert branch `codex/issue-281-task-offer-wake` or the explicitly reviewed diff.

## Captured Planning Output

## Goal and success criteria
Resolve GitHub issue #281: extend the provider-neutral Agent Runtime effect protocol with a durable `wake_for_offer` operation so an idle persistent Engineer is woken for one bounded controller step when its offer snapshot becomes actionable, with coalescing, supersession, fail-closed fences and a controller-step receipt that never carries claim authority. Success: every acceptance criterion in issue #281 is covered (exactly one durable wake intent on the empty→eligible transition; same-snapshot idempotency; newer-snapshot supersession/coalescing; host action carries no claim token or writable authority; success requires an exact controller-step/wake receipt bound to the effect control reference; on wake the controller re-reads offers and a stale/empty snapshot is a no-op; Binding replacement/retirement/capability downgrade/authorization change fail before host action; Codex App thread and tmux adapters implement the contract or report `unsupported`; board/Operator show wake state without being authority) and the full required checks pass.

## Scope
- `src/core/engineers/agent-runtime-effect.ts`: `AgentRuntimeOperation = 'notify_inbox' | 'wake_for_offer'`; `wake_for_offer` intent binds exact Engineer ID, Binding ID + generation + Engineer contract revision, repository ID + authorization revision, `EngineerOffersV1.snapshot_revision`, closed reason (`new_eligible_offer | dependency_unblocked | concurrency_released | retry_due`), host/adapter endpoint fence, idempotency key, creation timestamp, canonical digest. Pure transition functions for prepare/start/observe/supersede/coalesce.
- `src/effects/engineers/agent-runtime-effect-store.ts`: durable intent → start exact host action → adapter observation → controller-step receipt binding (new `ControllerStepReceiptV1`-style receipt distinct from message-delivery receipts); at most one active wake per (Binding, snapshot); newer snapshot supersedes an unstarted older wake; bounded debounce window coalesces without losing the newest snapshot revision; unsupported/unavailable adapters produce typed state; polling fallback only under an explicit controller policy flag (default off); no infinite retry.
- Offer-transition observer: a pure function over two `EngineerOffersV1` snapshots (previous, current) that decides whether a wake intent is due and with which reason; an effect that persists the last observed snapshot revision per Binding so repeated observation of the same snapshot is idempotent.
- SUBSCRIPTION SEAM (hard requirement from the Repair Campaign controller, the first non-interactive consumer): the wake effect must be consumable by a non-CLI controller — expose an effect-level `subscribeToOfferWakes` / `observeOfferWake` API (durable, poll-or-callback over the store) so `#279`'s controller and the campaign controller invoke one bounded `step` without going through the CLI.
- Adapters: Codex App thread adapter and tmux adapter implement `wake_for_offer` (invoke one bounded controller step at the bound endpoint) or return typed `unsupported`; process exit code alone is not proof — the observation requires the controller-step receipt.
- CLI verbs under the existing agent-runtime command surface (prepare/start/observe/status for wake); board/Operator projection of pending/delivered/failed/reconciliation-required wake state.
- Docs/spec/ArchContext updates for capability `runtime-harness-agent-runtime-effects`.

## Non-scope
- No Work Package selection or claim authority in the runtime effect; no acquisition from the host adapter; no reuse of message-delivery receipts; no controller loop (#279 consumes this); no attempt/retry semantics (#287 supplies `retry_due` transitions later — keep the reason closed but leave the observer extensible only through the closed enum); no changes to task identity (#283), budget (#282), lease liveness (#286) or acquire-next (#280) — parallel worktrees.

## P1 Architecture map
Agent runtime effect core + store (R1 provider-neutral runtime, `capability.runtime-harness.agent-runtime-effects`), adapters under `src/effects/engineers/` (provider thread effect, tmux), offers from `collectEngineerOffers` (`src/effects/engineers/scheduling.ts`), Binding/authorization revisions from engineer-binding effects, board projections in `src/core/fleet/board.ts` / operator snapshots.

## P2 Concrete trace
Offer collector pass → previous snapshot (persisted) vs current `EngineerOffersV1` → transition observer says `new_eligible_offer` → persist wake intent (idempotency key = digest of Binding generation + snapshot revision + reason) → fence check (Binding current, capability observation current, authorization revision current) → start host action (adapter invokes one bounded controller step at the endpoint) → adapter observation → controller-step receipt bound to the effect control reference → current projection `delivered`. Newer snapshot before start → supersede. Controller wakes → re-reads offers/authorization → acquires through the ordinary seam or no-ops. Pressure point: coalescing must be deterministic and the receipt must be the only success proof.

## P3 Decision rationale
Wake is a hint, not authority; keeping selection/claim out of the effect preserves the single scheduling/lease authorities. Extending the existing runtime-effect protocol (not a new daemon) keeps one provider-neutral seam. At 10x Engineers the first pressure is snapshot-diff frequency per collector pass; persist only the last observed revision per Binding and coalesce within a bounded window.

## Task Breakdown
- [x] #1 Failing tests: protocol validation for both operations, transition observer (empty→eligible, same snapshot idempotent, newer supersedes, debounce coalescing), fence failures before host action.
- [x] #2 Core types + pure transitions + observer.
- [x] #3 Store: durable intent/start/observe, supersession, coalescing, controller-step receipt, typed unsupported/unavailable, crash fixtures at intent/effect-start/receipt/current-projection writes; subscription seam for non-CLI controllers.
- [x] #4 Adapters (Codex App thread, tmux) implementing one bounded controller invocation or typed `unsupported`; CLI verbs; board/Operator projection.
- [x] #5 End-to-end idle → offer → wake → re-read → acquire fixture; docs/spec/ArchContext; focused tests + root required checks; evidence.

## Verification
bun test --timeout 60000; bun run check:type; bun run check:state-boundaries; bash scripts/check-deploy-sql-order.sh; bash scripts/check-architecture-sync.sh; bash scripts/check-task-sync.sh; repo-harness run check-task-workflow --strict; bun scripts/inspect-project-state.ts --repo . --format text; bun src/cli/index.ts init --repo . --dry-run.

## Annotations

## Annotations

## Task Breakdown
- [x] #1 Failing tests: protocol validation for both operations, transition observer (empty→eligible, same snapshot idempotent, newer supersedes, debounce coalescing), fence failures before host action.
- [x] #2 Core types + pure transitions + observer.
- [x] #3 Store: durable intent/start/observe, supersession, coalescing, controller-step receipt, typed unsupported/unavailable, crash fixtures at intent/effect-start/receipt/current-projection writes; subscription seam for non-CLI controllers.
- [x] #4 Adapters (Codex App thread, tmux) implementing one bounded controller invocation or typed `unsupported`; CLI verbs; board/Operator projection.
- [x] #5 End-to-end idle → offer → wake → re-read → acquire fixture; docs/spec/ArchContext; focused tests + root required checks; evidence.
