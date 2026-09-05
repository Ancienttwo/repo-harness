# Plan: Fleet board card-level failure containment

> **Status**: Executing
> **Created**: 20260905-1413
> **Slug**: fleet-board-card-containment
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Focused fleet/inbox/operator regression guards plus repository-integrity checks and one full suite run on the frozen worktree head
> **Rollback Surface**: Revert the fleet board, task inbox, task message request, and transport projection changes together with their tests
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md`
> **Task Review**: `tasks/reviews/20260905-1413-fleet-board-card-containment.review.md`
> **Implementation Notes**: `tasks/notes/20260905-1413-fleet-board-card-containment.notes.md`

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

- Active plan: `plans/plan-20260905-1413-fleet-board-card-containment.md`
- Sprint contract: `tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md`
- Sprint review: `tasks/reviews/20260905-1413-fleet-board-card-containment.review.md`
- Implementation notes: `tasks/notes/20260905-1413-fleet-board-card-containment.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260905-1413-fleet-board-card-containment.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260905-1413-fleet-board-card-containment.md`.

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
- Contract file: `tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md`
- Review file: `tasks/reviews/20260905-1413-fleet-board-card-containment.review.md`
- Implementation notes file: `tasks/notes/20260905-1413-fleet-board-card-containment.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260905-1413-fleet-board-card-containment.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the fleet board, task inbox, task message request, and transport projection changes together with their tests
- **Verification boundary**: Focused fleet/inbox/operator regression guards plus repository-integrity checks and one full suite run on the frozen worktree head
- **Review/acceptance boundary**: `tasks/reviews/20260905-1413-fleet-board-card-containment.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260905-1413-fleet-board-card-containment.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260905-1413-fleet-board-card-containment.contract.md`, `tasks/reviews/20260905-1413-fleet-board-card-containment.review.md`, and `tasks/notes/20260905-1413-fleet-board-card-containment.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260905-1413-fleet-board-card-containment.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the fleet board, task inbox, task message request, and transport projection changes together with their tests

## Captured Planning Output

## Goal

Contain Fleet board observation failures at the card boundary so one damaged card or one stale inbox event can no longer erase a whole repository from the Task Board, make unclassified cards visible as a number, let the round deadline preempt the synchronous read phase, and fix the write path lock order.

Audit baseline: main 1a9a5ae1, 2026-09-05 five-slice Task Board audit (findings F1, F2, F3, F5, F6, F7, F13 of the fleet/inbox slices).

## P1 Architecture Map

- `src/core/fleet/board.ts` owns column/attention/counts/digest projection (pure).
- `src/effects/fleet/board.ts` owns `collectFleetBoard` / `collectRepository` / `cardInput` / provider limiter / `assertRepositoryAuthority`.
- `src/effects/fleet/task-inbox.ts` owns inbox event scan (`assertEventCanonical`, `listTaskInbox`, `deliverTaskInbox`, `observeTaskInboxFleetSummary`) and the Task Board write `sendTaskBoardMessage`.
- `src/effects/fleet/task-message-request.ts` owns the operator write's repository resolution and lock acquisition order.
- `src/core/operator/fleet-snapshot.ts` projects `FleetBoardSnapshotV1` to the transport-safe `OperatorFleetSnapshotV1`; it must carry any new count field through. Protocol stays 3 (additive field only, no bump).

## P2 Concrete Traces (defects)

1. `cardInput` (`src/effects/fleet/board.ts:178-248`) performs four throwing observations per card; `collectBounded` (`:307-314`) rethrows the first; `collectFleetBoard:460-462` maps it to `repositoryError` -> repository `status: 'unreadable'`, `cards: []`. One `MergeReadinessError('receipt_unavailable')` on one reviewing card hides every other card of that repo. Contradicts the comment at `:388-391`.
2. `assertEventCanonical` (`src/effects/fleet/task-inbox.ts:603-607`) throws `task_revision_mismatch` inside the loop over every stored event, from `listTaskInbox:752`, `deliverTaskInbox:815`, `observeTaskInboxFleetSummary:652`. Editing a sprint row's Task/Mode/Acceptance cell after a message exists changes `task_revision`; from then on the whole task inbox reads as an error forever and the repository card goes `repo_inbox_unreadable` through trace 1.
3. `classifyFleetBoardColumn` (`src/core/fleet/board.ts:182-195`) returns `null` for reviewing-without-publication, `missing`/`drifted` task state, and pending+available with non-ready execution readiness. `counts` (`:298-306`) has no bucket for them; runtime probe showed 15 cards with only 7 counted.
4. `collectRepository` (`src/effects/fleet/board.ts:286-306`) runs `readActiveSprintPath`, `readCanonicalTargetRef`, `resolveBoard`, `collectRepoTaskOffers`, `observeAgentRuntimeEffects` synchronously; the deadline timer at `:413` cannot fire while one repository holds the event loop.
5. `cardInputConsistency` (`:263-269`) ORs board+inbox+feedback only; runtime effect statuses are read once at `:306` before cards and joined against receipts read per card at `:218`, so a torn runtime read is labelled `stable`.
6. Provider limiter (`:367-385`): `release()` wakes a waiter synchronously but the waiter increments `active` a microtask later; another `run()` can admit in between, exceeding `max_concurrency`.
7. `assertRepositoryAuthority` (`:109-128`) compares `realpathSync(repo.path) !== repo.path` as strings; a registered path under a symlinked ancestor (macOS `/tmp`, `/var`) or with a trailing slash is reported `repo_authority_invalid`.
8. `sendOperatorTaskMessage` (`src/effects/fleet/task-message-request.ts:142`) holds the machine-global registry authorization lock across the per-task lock and all repository I/O; lock order registry -> task blocks every other repo's `adopt` while a task lock is contended (task lock waits up to 5 s).

## P3 Decisions

- Failure unit becomes the card: a throwing observation yields a card-level typed error carried on the card (`error: FleetBoardErrorV1 | null`, closed vocabulary reuse) with `column: null`, and the repository is `snapshot_consistency: 'degraded'` with `status: 'ok'`. Repository-level `unreadable` is reserved for failures before any card can be read (registry/authority/sprint/board resolution). No fallback data is invented for the failed card's fields: readiness/feedback/inbox/runtime fields of a failed card are their null/empty forms and the card error names which observation failed.
- Inbox scan skips a non-current-revision event (it is neither listed, delivered, nor counted) instead of aborting the scan. `task_revision_mismatch` stays fail-closed only where the caller names one specific event/revision (send path). Add a `superseded_revision_count` to the list result so the skip is observable.
- Add `counts.unclassified` (cards with `column: null`) to `FleetBoardCountsV1`, the digest basis, and `OperatorFleetSnapshotV1` counts; keep `FLEET_BOARD_PROTOCOL = 3` and the operator payload protocol unchanged (additive). Verify any strict decoder of the collector payload (`src/effects/operator/fleet-collector-process.ts`, `src/core/operator/fleet-snapshot.ts`) accepts the new key; the browser decoder drops unknown keys and is out of scope here.
- Yield to the event loop between repositories and before each card's synchronous phase (`await new Promise(r => setImmediate(r))` or equivalent) so the deadline timer and abort can preempt; re-check `assertCollectionActive` after each yield. Do not change `timeout_ms` semantics otherwise; a repository that finished before the deadline keeps its result (fix the `:457-459` relabel: only still-pending repositories become `repo_collection_timeout`).
- Fold the runtime effect store's revision (or a re-read compare) into `cardInputConsistency` so a changed runtime store marks the card `changed_during_read`.
- Limiter: transfer the slot inside `release()` (increment `active` when handing to a waiter) so it is never observably free.
- Authority check: compare `realpathSync(repo.path)` against `realpathSync` of the normalised registered path (strip trailing slash) — reject only when the registered path itself is a symlink or not a directory, which is the invariant the check protects.
- Lock order: resolve and validate the repository (existence, `access_mode`) under the registry lock, release it, then acquire the task lock for the send. The registry snapshot revision read under the lock is passed to the send so the fence is unchanged.
- Out of scope (deferred, report only): deriving the claim-scope canonical fence from the lease record instead of the main checkout's active-sprint marker (audit F10); `task_label` null vs empty-cell ambiguity; R1 delivery/reachability contributing to `attention_owner` (contract decision); browser UI chips.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/fleet/board.ts` | Modify | `FleetBoardCardV1.error`, `counts.unclassified`, digest basis, projection of card errors |
| `src/effects/fleet/board.ts` | Modify | per-card try/catch in `cardInput` caller, event-loop yields + deadline re-check, timeout relabel only for pending repos, limiter slot transfer, runtime revision in consistency, realpath authority compare |
| `src/effects/fleet/task-inbox.ts` | Modify | skip non-current-revision events in scans, `superseded_revision_count` |
| `src/effects/fleet/task-message-request.ts` | Modify | registry lock released before task lock |
| `src/core/operator/fleet-snapshot.ts` | Modify | carry `counts.unclassified` and card `error` through the transport view |
| `src/effects/operator/fleet-collector-process.ts` | Modify only if its decoder is exact-key | accept new fields |
| `tests/effects/fleet-board.test.ts`, `tests/unit/fleet-board.test.ts`, `tests/effects/task-inbox.test.ts`, `tests/effects/operator-task-message.test.ts`, `tests/unit/operator-fleet-snapshot.test.ts` | Modify/Add | regression guards listed below |

## Task Breakdown

- [x] Regression guards first (RED): card-internal failure keeps sibling cards; stale-revision event is skipped by list/deliver/summary; unclassified cards counted; deadline preempts a blocking synchronous repository; finished repo not relabelled timeout; limiter never exceeds cap; symlinked-ancestor registered path accepted, symlinked leaf rejected; task lock acquired without the registry lock held. Capture pre-fix artifacts with `bun test <guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>`.
- [x] Implement per-card containment and card `error`; repository degraded not unreadable.
- [x] Implement inbox scan skip + `superseded_revision_count`.
- [x] Implement `counts.unclassified` through core, digest, transport projection, collector decoder.
- [x] Implement event-loop yields, deadline re-check, timeout relabel fix, runtime revision in consistency, limiter slot transfer, realpath authority compare.
- [x] Implement lock-order change in the operator write path.
- [x] Fill the contract (Goal, Scope, Root Cause Evidence, Allowed Paths, Exit Criteria, Change Assessment oracles as `{id,kind,paths}` objects) and clear every `[NOTE]` placeholder; notes only for non-obvious deviations.
- [x] Verification: focused tests above, the six repository-integrity checks, `bun test --timeout 60000` full suite once at the end (log to file), `bun run build:operator-web`.

## Allowed Paths

- `src/core/fleet/board.ts`
- `src/effects/fleet/board.ts`
- `src/effects/fleet/task-inbox.ts`
- `src/effects/fleet/task-message-request.ts`
- `src/core/operator/fleet-snapshot.ts`
- `src/effects/operator/fleet-collector-process.ts`
- `tests/**`
- `docs/architecture/**` (only if the projection drain rewrites module docs)
- plan, contract, review, notes files of this work package

## Verification

- `bun test --timeout 60000 tests/effects/fleet-board.test.ts tests/unit/fleet-board.test.ts tests/cli/fleet-board.test.ts tests/board-snapshot-consistency.test.ts tests/effects/task-inbox.test.ts tests/unit/task-inbox-v1.test.ts tests/cli/fleet-task-inbox.test.ts tests/effects/operator-task-message.test.ts tests/unit/operator-fleet-snapshot.test.ts tests/cli/operator-serve.test.ts`
- `bash scripts/check-deploy-sql-order.sh && bash scripts/check-architecture-sync.sh && bash scripts/check-task-sync.sh && bash scripts/check-task-workflow.sh --strict && bun scripts/inspect-project-state.ts --repo . --format text && bun src/cli/index.ts init --repo . --dry-run`
- `bun test --timeout 60000` (full, once, logged)

## Task Breakdown
- [x] Regression guards first (RED): card-internal failure keeps sibling cards; stale-revision event is skipped by list/deliver/summary; unclassified cards counted; deadline preempts a blocking synchronous repository; finished repo not relabelled timeout; limiter never exceeds cap; symlinked-ancestor registered path accepted, symlinked leaf rejected; task lock acquired without the registry lock held. Capture pre-fix artifacts with `bun test <guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>`.
- [x] Implement per-card containment and card `error`; repository degraded not unreadable.
- [x] Implement inbox scan skip + `superseded_revision_count`.
- [x] Implement `counts.unclassified` through core, digest, transport projection, collector decoder.
- [x] Implement event-loop yields, deadline re-check, timeout relabel fix, runtime revision in consistency, limiter slot transfer, realpath authority compare.
- [x] Implement lock-order change in the operator write path.
- [x] Fill the contract (Goal, Scope, Root Cause Evidence, Allowed Paths, Exit Criteria, Change Assessment oracles as `{id,kind,paths}` objects) and clear every `[NOTE]` placeholder; notes only for non-obvious deviations.
- [x] Verification: focused tests above, the six repository-integrity checks, `bun test --timeout 60000` full suite once at the end (log to file), `bun run build:operator-web`.
