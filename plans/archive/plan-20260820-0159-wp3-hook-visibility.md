# Plan: WP3 host-aware hook visibility and early lease guard

> **Status**: Archived
> **Created**: 20260820-0159
> **Slug**: wp3-hook-visibility
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Byte-equality slice tests across both hosts, five-step gate fail branches, zero-overhead spy assertions for unarmed paths, measured PreEdit p50 cost-regression thresholds, plus full required checks
> **Rollback Surface**: Zero persistent writes and zero route changes; rollback deletes three additive call sites inside existing handlers, new files become dead code
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-0159-wp3-hook-visibility.contract.md`
> **Task Review**: `tasks/reviews/20260820-0159-wp3-hook-visibility.review.md`
> **Implementation Notes**: `tasks/notes/20260820-0159-wp3-hook-visibility.notes.md`

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

- Active plan: `plans/plan-20260820-0159-wp3-hook-visibility.md`
- Sprint contract: `tasks/contracts/20260820-0159-wp3-hook-visibility.contract.md`
- Sprint review: `tasks/reviews/20260820-0159-wp3-hook-visibility.review.md`
- Implementation notes: `tasks/notes/20260820-0159-wp3-hook-visibility.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-0159-wp3-hook-visibility.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-0159-wp3-hook-visibility.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-0159-wp3-hook-visibility.md`.

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
- Contract file: `tasks/contracts/20260820-0159-wp3-hook-visibility.contract.md`
- Review file: `tasks/reviews/20260820-0159-wp3-hook-visibility.review.md`
- Implementation notes file: `tasks/notes/20260820-0159-wp3-hook-visibility.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-0159-wp3-hook-visibility.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-0159-wp3-hook-visibility.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Zero persistent writes and zero route changes; rollback deletes three additive call sites inside existing handlers, new files become dead code
- **Verification boundary**: Byte-equality slice tests across both hosts, five-step gate fail branches, zero-overhead spy assertions for unarmed paths, measured PreEdit p50 cost-regression thresholds, plus full required checks
- **Review/acceptance boundary**: `tasks/reviews/20260820-0159-wp3-hook-visibility.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-0159-wp3-hook-visibility.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-0159-wp3-hook-visibility.contract.md`, `tasks/reviews/20260820-0159-wp3-hook-visibility.review.md`, and `tasks/notes/20260820-0159-wp3-hook-visibility.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-0159-wp3-hook-visibility.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Zero persistent writes and zero route changes; rollback deletes three additive call sites inside existing handlers, new files become dead code

## Captured Planning Output

## Goal

Add a read-only `BoardSliceV1` to three EXISTING hook handler branches: Codex `SubagentStart.context` and Claude `PreToolUse.subagent`'s `Task|Agent` branch inject a byte-identical slice, and `PreToolUse.edit` arms a five-step lease ownership gate only when the current execution unit is verifiably a contract-mode sprint task. No new route, no route-tuple reorder, no persistent writes, no `AttemptReceiptV1` change.

Design authority: `docs/researches/20260819-GPT-kanban.md` §13 as amended by measured reality (see verdicts); `tasks/todos.md` former WP3 rows' frozen constraints (`RouteHost = 'claude' | 'codex'` only; board context must not ride the `SendUserMessage` branch; the lease gate activates only for genuinely sprint-bound units); `docs/architecture/shared-coordination-plane.md` trust boundary.

## Preconditions (verified at design time)

- WP1 + hardening + WP2 on main (`01e9bffd`); `BoardDocumentV1` frozen in `src/core/state/types.ts`.
- Route surface already exists: `SubagentStart.context` is codex-hosted, `PreToolUse.subagent` matcher is `Task|Agent|SendUserMessage`, `PreToolUse.edit` matcher `Edit|Write` → mutation-guard (`src/cli/hook/route-registry.ts`). Zero route additions.
- Claim tokens live at `<tree>/.ai/harness/sprint/claims/<task_id>.claim` (fields `claim_id/task_id/sprint/task/unit_ref`); contract mode sets `unit_ref = <plan path>`; tokens are write-only accumulated — NO deletion path exists in `sprint-backlog.sh`.
- `runtime.ts` converts handler throws to exitCode 1 (host-level fail-open); any fail-closed outcome must be an explicit `exit(2)`, never an escaping exception.

## Measured cost basis (drives verdicts A/B/G)

Hook telemetry (`.ai/harness/runs/hook-events.jsonl`, n=41,485): `PreToolUse.edit` p50 256.2ms / p95 442.3ms; `PreToolUse.subagent` p50 0.8ms; `SubagentStart.context` p50 7.3ms. Component benchmarks: `resolveEffectiveStateReadOnly` ~100ms per worktree; `readCanonicalSprint` 14.3ms; `readWorktreeTopology` 6.9ms; `readLease` ~0.1ms. Full `resolveBoard` = 644–1288ms → vetoed inside hooks. Thin slice ≈ 22ms.

## Design verdicts (frozen)

- A. Thin per-task collector, single collection, evidence dimension structurally absent, no caching (a cached board lacks even the `changed_during_read` signal and is a worse stale read; real authority re-reads inside finish's task lock).
- B. `actual_path_overlap` cut with no replacement (shadow-parser prohibition; prefix comparison is a documented false-positive machine); `stalled` also cut (100ms/worktree); the slice reports live peers (topology + lease, both cheap and authoritative) and ends with a fixed pointer line to `repo-harness state board --json`.
- C. Arming condition is the double predicate: a unique claim token whose `unit_ref === active-plan marker` AND the current tree is a linked worktree. Tokens have no GC, so existence alone would permanently arm a primary tree that once ran an inline task and block every edit against a dead lease. Predicate-evaluation failure → do not arm + one advisory line (never silent, never blocking).
- D. Once armed, any of the five steps failing or being undecidable → explicit `exit(2)` with `structuredError(..., 'contract_failure')` (matches `WorkflowResolutionUnstableGuard`'s "still fails closed, no fail-open path" precedent). Pre-arming IO failure → advisory + pass (a route firing 2,141 times/year must not block on harness IO jitter).
- E. One pure `projectBoardSlice()` + one `renderBoardSlice()` producing byte-identical strings; hosts only wrap. Marker idempotence follows the `RETURN_CONTRACT_MARKER` / `LONG_COMMAND_GUARDRAIL_MARKER` pattern; the Claude branch gains an `env.HOOK_HOST !== 'codex'` guard for exactly-once (the current `runReturnChannel` lacks host discrimination — real double-injection risk).
- F. Three mount points, all inside existing handlers: `runSubagentStart` context array (before `appendLongCommandGuardrail`); `runReturnChannel`'s `Task|Agent` branch (the `SendUserMessage` branch untouched, byte for byte); `runPerPathGuards` after `mainLoopDispatchGuard`, before `getPreEditEffectiveState` (ownership precedes scope; unarmed path pays ~0.35ms).
- G. No `session-context-budget` reuse (it is a frozen SessionStart-only surface: single evidence file, session-scoped dedupe would silently blank the second subagent's slice). Fixed structural cap 2,000 bytes; peers sorted by `task_id`, first 8 + a `+N more` pointer line; deterministic truncation.
- H. Falsification rows owned by WP3: non-sprint execution unaffected by the lease gate; Bash bypass still cannot finish/publish without a valid lease (WP1 covers, asserted here); Claude and Codex spawns receive byte-equal slices; `SendUserMessage` carries no slice.

## Task Breakdown

- [x] T1 `BoardSliceV1` type + pure projector: extend `src/core/state/types.ts`; new `src/core/state/project-board-slice.ts`; extract the shared task/lease/diagnostics derivation from `src/core/state/project-board.ts` into a shared helper (cross-module invariant: both projections must classify leases identically — do not reimplement). Structurally ABSENT fields: `progress_state`, `column`, any conflict field (absence, not empty values, per WP2 precedent). ~180 new + ~40 extracted lines.
- [x] T2 Thin collector + claim-token reader: new `src/effects/state/coordination-claim-token.ts` (replicates `find_claim_token`'s ambiguity-fail-closed semantics: more than one match → ambiguous, never pick one; paths through `readText` containment) and new `src/effects/state/collect-slice-inputs.ts` reusing `readCanonicalSprint` / `projectCanonicalTasks` / `readWorktreeTopology` / `readLease`; NEVER calls `resolveEffectiveStateReadOnly` and never reads attempt ledgers — write both prohibitions as a module-top "What is deliberately NOT read" comment (the `collect-board-inputs.ts` idiom). Single collection, no A/B. ~150 lines.
- [x] T3 Shared renderer: new `src/cli/hook/board-slice-context.ts`, `renderBoardSlice(slice): string` starting with a `[repo-harness:board-slice]` marker, 2,000-byte hard cap, peers by `task_id` lexicographic first 8 + `+N more`, fixed closing line `progress/stall not computed here — repo-harness state board --json`. Byte-deterministic for identical input. ~120 lines.
- [x] T4 Codex mount: `runSubagentStart` in `src/cli/hook/subagent-handler.ts`, slice resolution wrapped in try/catch (existing handler idiom) — failure means no injection; injection is pure advisory and must never make SubagentStart blocking. ~15 lines.
- [x] T5 Claude mount + early-exit refactor: `runReturnChannel`'s current `RETURN_CONTRACT_MARKER` early-exit would swallow the slice; refactor into two independently marker-gated appendices where either being absent emits `updatedInput`; add the `env.HOOK_HOST !== 'codex'` guard; the `SendUserMessage` branch changes by zero bytes. ~35 lines.
- [x] T6 PreEdit lease gate: new `leaseOwnershipGuard(ctx, filePath)` in `src/cli/hook/mutation-guard.ts` mounted per verdict F. Arming per verdict C. Five steps once armed: token uniqueness → common-dir owner `claim_id` matches token → `state === 'bound'` → owner worktree/branch match the current tree → `task_revision` matches the canonical row; each step failure exits 2 with its own assertable reason token. Add a memo field on `Ctx` so multi-path `apply_patch` batches pay one collection, not N. Pre-arming IO failure → `[LeaseOwnershipGuard] Advisory: ...` then return. ~90 lines + 1 Ctx field.
- [x] T7 Tests: new `tests/board-slice.test.ts`; extend `tests/subagent-handler.test.ts`, `tests/mutation-guard.test.ts`. (a) byte-equality of the marker block extracted from Codex `additionalContext` vs Claude `updatedInput.prompt` on the same fixture; (b) `SendUserMessage` output contains no marker and keeps its deny semantics; (c) one case per five-step fail branch asserting exit 2 + reason token; (d) unarmed cases (no token / `unit_ref` mismatch / primary tree) assert exit 0 AND zero collector invocations (spy — the only assertable form of "zero overhead"); (e) stale-token regression: a token whose `unit_ref` points at an old plan does not arm under the current plan (pins the premise-collapse defusal); (f) failure semantics: collector throwing → exit 2 when armed, exit 0 when unarmed. ~400 lines.
- [x] T8 Docs: append §9 to `docs/architecture/shared-coordination-plane.md` (three mount points, the 22ms-vs-644ms measured tradeoff, why evidence dimension and `column` are structurally absent from the slice, why arming binds `unit_ref` given token no-GC) and annotate the route table in `docs/architecture/global-hook-runtime.md`. NEVER create files under `docs/architecture/modules/` (2026-08-19 lesson names WP3's hook-slice docs explicitly). ~80 lines.

## Non-goals

No route additions or reorder (Codex trust-hashes the tuple); no per-`PostToolUse` progress records and no `AttemptReceiptV1` widening; no Stop auto-release/auto-steal; no SessionStart full-board injection; no generic Bash mutation parser; no `actual_path_overlap` / `scope_overlap` / `stalled` computation; claim-token GC stays out of scope (the `unit_ref` binding renders it harmless here — add a todos row for the WP1-side release path); the `SendUserMessage` deny semantics unchanged.

## Verification

- Targeted: `bun test tests/board-slice.test.ts tests/subagent-handler.test.ts tests/mutation-guard.test.ts tests/hook-protocol.test.ts`
- Cost regression (must run and record in the review): armed `PreToolUse.edit` p50 delta < 15% against the 256.2ms baseline; unarmed delta < 2%.
- Full required checks: `bun test`, `bun run check:type`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh` (outside any bounded verifier), `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bun src/cli/index.ts init --repo . --dry-run`
- Helper mirrors as negative control: `cmp scripts/sprint-backlog.sh assets/templates/helpers/sprint-backlog.sh` and `cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh` (this WP changes no shell).

## Premise collapse (documented fallback, pre-authorized)

Assumption: a claim token reliably identifies "the current execution unit is sprint-bound". Half-collapsed already (tokens have no GC — proven by grep), which the double predicate defuses. Residual risk: `unit_ref` binding assumes one plan path maps to at most one live claim at a time; falsify by claiming two different sprint rows for the same plan in one linked worktree and checking for two same-`unit_ref` tokens (that degrades the match to ambiguous → fail-closed → primary-tree-style blocking inside a linked worktree). Minimal correction WITHOUT reopening the WP: tighten the match key to the `(unit_ref, task_id)` composite where `task_id` comes from the plan's single currently-`bound` common-dir lease — the lease record adjudicates, the token stays a capability (the division `sprint-backlog.sh`'s own comment already states). Change surface: T2's token reader only, no mount points.

## Rollback

Zero persistent writes, zero schema change, zero route change — all three mounts are additive branches inside existing handlers. Rollback = delete three call sites (≤35 lines each); the new files become dead code; no migration, no state cleanup, no lease impact.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] T1 `BoardSliceV1` type + pure projector: extend `src/core/state/types.ts`; new `src/core/state/project-board-slice.ts`; extract the shared task/lease/diagnostics derivation from `src/core/state/project-board.ts` into a shared helper (cross-module invariant: both projections must classify leases identically — do not reimplement). Structurally ABSENT fields: `progress_state`, `column`, any conflict field (absence, not empty values, per WP2 precedent). ~180 new + ~40 extracted lines.
- [x] T2 Thin collector + claim-token reader: new `src/effects/state/coordination-claim-token.ts` (replicates `find_claim_token`'s ambiguity-fail-closed semantics: more than one match → ambiguous, never pick one; paths through `readText` containment) and new `src/effects/state/collect-slice-inputs.ts` reusing `readCanonicalSprint` / `projectCanonicalTasks` / `readWorktreeTopology` / `readLease`; NEVER calls `resolveEffectiveStateReadOnly` and never reads attempt ledgers — write both prohibitions as a module-top "What is deliberately NOT read" comment (the `collect-board-inputs.ts` idiom). Single collection, no A/B. ~150 lines.
- [x] T3 Shared renderer: new `src/cli/hook/board-slice-context.ts`, `renderBoardSlice(slice): string` starting with a `[repo-harness:board-slice]` marker, 2,000-byte hard cap, peers by `task_id` lexicographic first 8 + `+N more`, fixed closing line `progress/stall not computed here — repo-harness state board --json`. Byte-deterministic for identical input. ~120 lines.
- [x] T4 Codex mount: `runSubagentStart` in `src/cli/hook/subagent-handler.ts`, slice resolution wrapped in try/catch (existing handler idiom) — failure means no injection; injection is pure advisory and must never make SubagentStart blocking. ~15 lines.
- [x] T5 Claude mount + early-exit refactor: `runReturnChannel`'s current `RETURN_CONTRACT_MARKER` early-exit would swallow the slice; refactor into two independently marker-gated appendices where either being absent emits `updatedInput`; add the `env.HOOK_HOST !== 'codex'` guard; the `SendUserMessage` branch changes by zero bytes. ~35 lines.
- [x] T6 PreEdit lease gate: new `leaseOwnershipGuard(ctx, filePath)` in `src/cli/hook/mutation-guard.ts` mounted per verdict F. Arming per verdict C. Five steps once armed: token uniqueness → common-dir owner `claim_id` matches token → `state === 'bound'` → owner worktree/branch match the current tree → `task_revision` matches the canonical row; each step failure exits 2 with its own assertable reason token. Add a memo field on `Ctx` so multi-path `apply_patch` batches pay one collection, not N. Pre-arming IO failure → `[LeaseOwnershipGuard] Advisory: ...` then return. ~90 lines + 1 Ctx field.
- [x] T7 Tests: new `tests/board-slice.test.ts`; extend `tests/subagent-handler.test.ts`, `tests/mutation-guard.test.ts`. (a) byte-equality of the marker block extracted from Codex `additionalContext` vs Claude `updatedInput.prompt` on the same fixture; (b) `SendUserMessage` output contains no marker and keeps its deny semantics; (c) one case per five-step fail branch asserting exit 2 + reason token; (d) unarmed cases (no token / `unit_ref` mismatch / primary tree) assert exit 0 AND zero collector invocations (spy — the only assertable form of "zero overhead"); (e) stale-token regression: a token whose `unit_ref` points at an old plan does not arm under the current plan (pins the premise-collapse defusal); (f) failure semantics: collector throwing → exit 2 when armed, exit 0 when unarmed. ~400 lines.
- [x] T8 Docs: append §9 to `docs/architecture/shared-coordination-plane.md` (three mount points, the 22ms-vs-644ms measured tradeoff, why evidence dimension and `column` are structurally absent from the slice, why arming binds `unit_ref` given token no-GC) and annotate the route table in `docs/architecture/global-hook-runtime.md`. NEVER create files under `docs/architecture/modules/` (2026-08-19 lesson names WP3's hook-slice docs explicitly). ~80 lines.
