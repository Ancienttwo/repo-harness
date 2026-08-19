# Plan: WP2 deterministic kanban board projection (state board --json)

> **Status**: Archived
> **Created**: 20260819-2109
> **Slug**: wp2-board-projection
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Torn-snapshot injectable-collector tests, real linked-worktree board assertions with a stability probe, pure projection decision-table tests, plus full required checks
> **Rollback Surface**: Pure additive TS surface; one revert of the publication commit restores every verb byte-identically; no disk-format or lease-schema change
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260819-2109-wp2-board-projection.contract.md`
> **Task Review**: `tasks/reviews/20260819-2109-wp2-board-projection.review.md`
> **Implementation Notes**: `tasks/notes/20260819-2109-wp2-board-projection.notes.md`

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

- Active plan: `plans/plan-20260819-2109-wp2-board-projection.md`
- Sprint contract: `tasks/contracts/20260819-2109-wp2-board-projection.contract.md`
- Sprint review: `tasks/reviews/20260819-2109-wp2-board-projection.review.md`
- Implementation notes: `tasks/notes/20260819-2109-wp2-board-projection.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260819-2109-wp2-board-projection.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260819-2109-wp2-board-projection.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260819-2109-wp2-board-projection.md`.

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
- Contract file: `tasks/contracts/20260819-2109-wp2-board-projection.contract.md`
- Review file: `tasks/reviews/20260819-2109-wp2-board-projection.review.md`
- Implementation notes file: `tasks/notes/20260819-2109-wp2-board-projection.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260819-2109-wp2-board-projection.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260819-2109-wp2-board-projection.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Pure additive TS surface; one revert of the publication commit restores every verb byte-identically; no disk-format or lease-schema change
- **Verification boundary**: Torn-snapshot injectable-collector tests, real linked-worktree board assertions with a stability probe, pure projection decision-table tests, plus full required checks
- **Review/acceptance boundary**: `tasks/reviews/20260819-2109-wp2-board-projection.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260819-2109-wp2-board-projection.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260819-2109-wp2-board-projection.contract.md`, `tasks/reviews/20260819-2109-wp2-board-projection.review.md`, and `tasks/notes/20260819-2109-wp2-board-projection.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260819-2109-wp2-board-projection.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Pure additive TS surface; one revert of the publication commit restores every verb byte-identically; no disk-format or lease-schema change

## Captured Planning Output

## Goal

Ship `repo-harness state board --json`: a deterministic, read-only, single-sprint-scoped `repo-harness-board` document projecting canonical sprint rows, common-dir leases, git worktree topology, and owner-worktree attempt ledgers into four kanban columns with three separated state dimensions (task / lease / progress), per-dimension input revisions, and honest `changed_during_read` marking. The board holds no task lock and performs no lease mutation. Also lands the bind-time `resumed` receipt (WP1 residual assigned to this WP) and the WP-A frozen products (board schema types + the coordination-plane architecture module doc).

Design authority: `docs/researches/20260819-GPT-kanban.md` §10-§12 as amended by its「落地状态与符合度修订（2026-08-19）」section; `tasks/todos.md` WP2 row + WP2 addendum row (full-input digest is a hard constraint; sprint-only consistency is forbidden). Where spec and landed code diverge, landed code wins.

## Preconditions

1. WP1 shared-lease + coordination-lease-hardening on main (verified: `6bb89c87`).
2. The seven `sprint` verbs are frozen; the board only reads their products and references their command strings in `actions`.
3. Canonical ref comes from `.ai/harness/policy.json#worktree_strategy.merge_back.target` (default `main`).
4. This WP touches no `scripts/*.sh` and no `assets/templates/helpers/*` — the mirror `cmp` surface is intentionally untriggered.

## Task Breakdown

- [x] T1 Freeze board document schema + architecture module doc: add `BoardDocumentV1` / `BoardCardV1` / `BoardColumn` / `TaskState` / `BoardProgressState` / `BoardDiagnosticsV1` / `BoardActionsV1` to `src/core/state/types.ts` (NOT a new `src/core/coordination/` directory — the landed layout never created one); write `docs/architecture/modules/workflow-engine/shared-coordination-plane.md` (identity formulas, four-state machine, fencing, board input set and revision semantics, the `changed_during_read` trust boundary, and the documented `begin-completion ?? null` key-nulling caveat) and link it from `docs/architecture/index.md`. ~90 lines types, ~200 lines doc. Doc path amended to `docs/architecture/shared-coordination-plane.md` (root placement, see the contract provenance note).
- [x] T2 First TS reader for `git worktree list --porcelain`: new `src/effects/git/worktree-topology.ts`, `readWorktreeTopology(cwd)` returning `{ raw, worktrees: [{path, branch, head, detached}] }`; `raw` preserved verbatim for the topology digest. ~70 lines.
- [x] T3 Expose raw owner bytes from the lease store: `LeaseRead` gains `readonly raw: string | null` in `src/effects/state/coordination-lease-store.ts`; classification logic unchanged, one new test in `tests/coordination-lease-store.test.ts`. Digests must hash bytes, not parsed objects.
- [x] T4 `src/effects/state/collect-board-inputs.ts` (all IO here): canonical sprint via `git show <target_ref>:<sprint_path>` (commit + text); `readLease` for every task_id in THIS sprint only; topology raw; for each owner with an execution worktree, `readAttemptLedger(ownerWorktree)` + `resolveEffectiveStateReadOnly(ownerWorktree, nowMs, {targetPaths: [], operationKind: 'inspect'})` for `progress_token`; four per-dimension digests + composite `board` digest, domain-separated via the JSON-array encoding used by `coordination-identity.ts`. `StateResolutionUnstableError` is never swallowed: record `progress_unreadable_reason: 'owner_state_unresolvable'`. ~220 lines.
- [x] T5 `src/core/state/project-board.ts` (pure, zero IO / zero clock): `projectBoard(inputs): BoardDocumentV1`; column precedence fixed as done > blocked > doing > todo; identical input bytes yield byte-identical JSON. ~200 lines.
- [x] T6 `src/effects/state/resolve-board.ts`: collect → project → collect; composite-digest equality → `stable`; otherwise discard the whole round and rerun once; still unequal → last round's A-side revisions + `snapshot_consistency: 'changed_during_read'`. Header comment: a `changed_during_read` board is diagnostic only; claim/steal/release/finish must re-read authority inside their task locks. ~90 lines.
- [x] T7 CLI verb in `src/cli/commands/state.ts`: `repo-harness state board --json [--sprint <path>] [--target-ref <ref>]`; `--json` required (matches `resolve`/`next`/`attempt`); omitted `--sprint` resolves the active sprint marker, and no active sprint + no flag → exit 2 with a `--sprint` hint (no `plans/sprints/` directory scan); omitted `--target-ref` reads policy. Exit codes: 0 document (including `changed_during_read`), 1 operational failure, 2 invalid invocation. ~60 lines.
- [x] T8 Bind-time `resumed` receipt in `src/cli/commands/sprint.ts`: `CoordinationPort` gains `appendResumedReceipt(worktree, unitRef)`; `bindSprintCommand` appends the receipt BEFORE writing the bound owner record (append failure → bind fails closed, lease stays `reserving`, caller's existing `rollback_claim` applies; an orphan `resumed` receipt from a failed bind is harmless — it only clears a stall count). Reuse `buildAttemptReceipt({unitRef, outcome: 'resumed'})` + `appendAttemptReceipt`; no new receipt type; not conditioned on generation. ~35 lines.
- [x] T9 Pure projection tests: new `tests/board-projection.test.ts` — column decision table across {4 task_state} × {6 lease_state} × {4 progress_state}; all 8 `unknown_reason` values pass through verbatim and land in blocked; `[x]` + residual lease → done + `lease_cleanup_required`; residual `released` → blocked (it really blocks claim, `sprint.ts` refuses non-`available`); `definition_drift` / `worktree_missing` / `target_ref_mismatch` cases; `actions.steal` null while `completing`. ~280 lines.
- [x] T10 Torn-snapshot tests: new `tests/board-snapshot-consistency.test.ts` with an injectable collector — (1) the todos-addendum scenario: sprint revision constant while owner flips A→B must yield `changed_during_read` (the core falsifier against sprint-only checks); (2) topology-only change detected and localizable via `revisions.topology`; (3) evidence-only change detected; (4) first round unequal + second round equal → `stable` (proves full-round retry); (5) unreadable attempt ledger → `progress_state: 'unreadable'` with `claim` / `lease_state` / `column` field-for-field identical to the readable case (ownership never transfers on evidence failure). ~240 lines.
- [x] T11 Real linked-worktree board assertions: extend `tests/sprint-claim-concurrency.test.ts` (reuse the existing harness, no second fixture) — two worktrees claimed+bound → two `doing` cards with distinct `claim_id`/`generation`/worktree; steal → `generation: 2` + `stolen_from` populated; `git worktree remove` → `worktree_missing: true` + `orphan_reclaimable: true` + blocked; rebind second generation to the same worktree → old no-progress receipts no longer mark the new owner stalled (T8 acceptance). Plus the premise-collapse probe: under 2-3 active worktrees, run `state board` 20 consecutive times and record the `stable` ratio in the test output (assert the mechanism, log the ratio; <80% is the documented collapse threshold). ~200 lines.
- [x] T12 Closeout: `tasks/todos.md` — delete the WP2 row and WP2-addendum row, strike the resumed-receipt item from the WP1-residual row, update the WP3 row's dependency to satisfied, add one deferred row for the cut conflict projection (merge with the existing `allowed_paths` overlap-classification row's trigger); notes file records the A/C/D verdicts and their reasons.

## Design verdicts (frozen)

- A. `lease_state` passes the store vocabulary through unchanged: `available | reserving | bound | completing | released | unknown`; `orphaned` is derived, lives in `diagnostics.orphan_reclaimable`; residual `released` sits in blocked because it genuinely blocks claim.
- B. `resumed` receipt lands in TS `bind`, receipt-before-owner-write; progress token source is `resolveEffectiveStateReadOnly(ownerWorktree).progress_token` — the only input shape `evaluateAttemptStall` accepts; no second stall rule.
- C. Four-dimension digests (task_authority / coordination / topology / evidence) plus a composite `board` digest; consistency compares the composite; per-dimension values published for localization. Worktree metadata is NOT in the input set (the board never reads it).
- D. Conflict projection (`actual_path_overlap` / `scope_overlap`) is cut from this WP entirely — the changed-set authority is a cwd-bound bash function and a TS rewrite would be a forbidden shadow parser. The fields are ABSENT from cards, not empty arrays. Deferred with an observed-collision trigger.
- E. `done` column is decided first and unconditionally; any non-`available` lease on a done row sets `lease_cleanup_required: true` with an executable `actions.reconcile` string.
- F. WP-A frozen products (schema + module doc) fold into this WP; types live in `src/core/state/types.ts`.
- G. Single-sprint scope; no directory scan; no human-readable rendering in v1 (`--json` only; consumers are WP3 hooks and orchestrators).
- H. Falsification rows owned by this WP: lease-changes-during-read, unreadable-ledger-never-transfers-ownership, new-generation-resets-stall; all on the real-worktree harness.

## Premise collapse (documented fallback, pre-authorized)

This plan assumes lock-free A/B input-revision comparison converges to `stable` at a high rate under real multi-agent load — currently unverified (zero parallel load exists). T11's 20-run probe measures it. If the `stable` ratio falls below ~80%, apply the pre-designed ~15-line correction WITHOUT reopening the WP: remove the `evidence` dimension from the composite consistency digest (keep `task_authority + coordination + topology`) and downgrade the progress overlay to an explicitly possibly-stale evidence layer — semantics already authorized by spec §10.5 ("stalled is only an evidence overlay and never transfers ownership").

## Non-goals

Conflict projection (deferred, observed-collision trigger); worktree metadata relocation (WP4, and this WP creates no reads that could trigger it); audit events log / reconcile topology cleanup / completing→bound abort recovery / canonical dirty check / begin-completion key-nulling guard (all stay in the WP1-residual todos row); hook injection (WP3); any `scripts/` or template change; TUI/watch/incremental refresh.

## Verification

- Targeted: `bun test tests/board-projection.test.ts tests/board-snapshot-consistency.test.ts tests/sprint-claim-concurrency.test.ts tests/coordination-lease-store.test.ts tests/continuation-attempt.test.ts`
- Full required checks: `bun test`, `bun run check:type`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh` (outside any bounded verifier — see the archctx sandbox ledger row), `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bun src/cli/index.ts init --repo . --dry-run`

## Rollback

Pure additive: four new TS files, additive types, one new CLI subcommand, one read-only field on `LeaseRead`, one append in `bind`. No disk-format change, no lease schema bump, no migration. Rollback = revert the publication commit. Residual `resumed` receipts in the ignored runtime ledger only clear stall counts (worst case: one no-progress halt fires two rounds late).

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] T1 Freeze board document schema + architecture module doc: add `BoardDocumentV1` / `BoardCardV1` / `BoardColumn` / `TaskState` / `BoardProgressState` / `BoardDiagnosticsV1` / `BoardActionsV1` to `src/core/state/types.ts` (NOT a new `src/core/coordination/` directory — the landed layout never created one); write `docs/architecture/modules/workflow-engine/shared-coordination-plane.md` (identity formulas, four-state machine, fencing, board input set and revision semantics, the `changed_during_read` trust boundary, and the documented `begin-completion ?? null` key-nulling caveat) and link it from `docs/architecture/index.md`. ~90 lines types, ~200 lines doc. Doc path amended to `docs/architecture/shared-coordination-plane.md` (root placement, see the contract provenance note).
- [x] T2 First TS reader for `git worktree list --porcelain`: new `src/effects/git/worktree-topology.ts`, `readWorktreeTopology(cwd)` returning `{ raw, worktrees: [{path, branch, head, detached}] }`; `raw` preserved verbatim for the topology digest. ~70 lines.
- [x] T3 Expose raw owner bytes from the lease store: `LeaseRead` gains `readonly raw: string | null` in `src/effects/state/coordination-lease-store.ts`; classification logic unchanged, one new test in `tests/coordination-lease-store.test.ts`. Digests must hash bytes, not parsed objects.
- [x] T4 `src/effects/state/collect-board-inputs.ts` (all IO here): canonical sprint via `git show <target_ref>:<sprint_path>` (commit + text); `readLease` for every task_id in THIS sprint only; topology raw; for each owner with an execution worktree, `readAttemptLedger(ownerWorktree)` + `resolveEffectiveStateReadOnly(ownerWorktree, nowMs, {targetPaths: [], operationKind: 'inspect'})` for `progress_token`; four per-dimension digests + composite `board` digest, domain-separated via the JSON-array encoding used by `coordination-identity.ts`. `StateResolutionUnstableError` is never swallowed: record `progress_unreadable_reason: 'owner_state_unresolvable'`. ~220 lines.
- [x] T5 `src/core/state/project-board.ts` (pure, zero IO / zero clock): `projectBoard(inputs): BoardDocumentV1`; column precedence fixed as done > blocked > doing > todo; identical input bytes yield byte-identical JSON. ~200 lines.
- [x] T6 `src/effects/state/resolve-board.ts`: collect → project → collect; composite-digest equality → `stable`; otherwise discard the whole round and rerun once; still unequal → last round's A-side revisions + `snapshot_consistency: 'changed_during_read'`. Header comment: a `changed_during_read` board is diagnostic only; claim/steal/release/finish must re-read authority inside their task locks. ~90 lines.
- [x] T7 CLI verb in `src/cli/commands/state.ts`: `repo-harness state board --json [--sprint <path>] [--target-ref <ref>]`; `--json` required (matches `resolve`/`next`/`attempt`); omitted `--sprint` resolves the active sprint marker, and no active sprint + no flag → exit 2 with a `--sprint` hint (no `plans/sprints/` directory scan); omitted `--target-ref` reads policy. Exit codes: 0 document (including `changed_during_read`), 1 operational failure, 2 invalid invocation. ~60 lines.
- [x] T8 Bind-time `resumed` receipt in `src/cli/commands/sprint.ts`: `CoordinationPort` gains `appendResumedReceipt(worktree, unitRef)`; `bindSprintCommand` appends the receipt BEFORE writing the bound owner record (append failure → bind fails closed, lease stays `reserving`, caller's existing `rollback_claim` applies; an orphan `resumed` receipt from a failed bind is harmless — it only clears a stall count). Reuse `buildAttemptReceipt({unitRef, outcome: 'resumed'})` + `appendAttemptReceipt`; no new receipt type; not conditioned on generation. ~35 lines.
- [x] T9 Pure projection tests: new `tests/board-projection.test.ts` — column decision table across {4 task_state} × {6 lease_state} × {4 progress_state}; all 8 `unknown_reason` values pass through verbatim and land in blocked; `[x]` + residual lease → done + `lease_cleanup_required`; residual `released` → blocked (it really blocks claim, `sprint.ts` refuses non-`available`); `definition_drift` / `worktree_missing` / `target_ref_mismatch` cases; `actions.steal` null while `completing`. ~280 lines.
- [x] T10 Torn-snapshot tests: new `tests/board-snapshot-consistency.test.ts` with an injectable collector — (1) the todos-addendum scenario: sprint revision constant while owner flips A→B must yield `changed_during_read` (the core falsifier against sprint-only checks); (2) topology-only change detected and localizable via `revisions.topology`; (3) evidence-only change detected; (4) first round unequal + second round equal → `stable` (proves full-round retry); (5) unreadable attempt ledger → `progress_state: 'unreadable'` with `claim` / `lease_state` / `column` field-for-field identical to the readable case (ownership never transfers on evidence failure). ~240 lines.
- [x] T11 Real linked-worktree board assertions: extend `tests/sprint-claim-concurrency.test.ts` (reuse the existing harness, no second fixture) — two worktrees claimed+bound → two `doing` cards with distinct `claim_id`/`generation`/worktree; steal → `generation: 2` + `stolen_from` populated; `git worktree remove` → `worktree_missing: true` + `orphan_reclaimable: true` + blocked; rebind second generation to the same worktree → old no-progress receipts no longer mark the new owner stalled (T8 acceptance). Plus the premise-collapse probe: under 2-3 active worktrees, run `state board` 20 consecutive times and record the `stable` ratio in the test output (assert the mechanism, log the ratio; <80% is the documented collapse threshold). ~200 lines.
- [x] T12 Closeout: `tasks/todos.md` — delete the WP2 row and WP2-addendum row, strike the resumed-receipt item from the WP1-residual row, update the WP3 row's dependency to satisfied, add one deferred row for the cut conflict projection (merge with the existing `allowed_paths` overlap-classification row's trigger); notes file records the A/C/D verdicts and their reasons.
