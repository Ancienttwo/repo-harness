# Plan: Coordination lease hardening: close WP1 conformance deviations before first live lease

> **Status**: Approved
> **Created**: 20260819-1519
> **Slug**: coordination-lease-hardening
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Falsification tests pinning each closed deviation (completing-steal refusal, inline completion gate, schema field validation, legacy fail-closed) plus full required checks and helper mirror cmp
> **Rollback Surface**: Single contract worktree branch, one synthesized publication commit, one revert; empty-lease-store precondition keeps the schema change migration-free
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260819-1519-coordination-lease-hardening.contract.md`
> **Task Review**: `tasks/reviews/20260819-1519-coordination-lease-hardening.review.md`
> **Implementation Notes**: `tasks/notes/20260819-1519-coordination-lease-hardening.notes.md`

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

- Active plan: `plans/plan-20260819-1519-coordination-lease-hardening.md`
- Sprint contract: `tasks/contracts/20260819-1519-coordination-lease-hardening.contract.md`
- Sprint review: `tasks/reviews/20260819-1519-coordination-lease-hardening.review.md`
- Implementation notes: `tasks/notes/20260819-1519-coordination-lease-hardening.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260819-1519-coordination-lease-hardening.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260819-1519-coordination-lease-hardening.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260819-1519-coordination-lease-hardening.md`.

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
- Contract file: `tasks/contracts/20260819-1519-coordination-lease-hardening.contract.md`
- Review file: `tasks/reviews/20260819-1519-coordination-lease-hardening.review.md`
- Implementation notes file: `tasks/notes/20260819-1519-coordination-lease-hardening.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260819-1519-coordination-lease-hardening.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260819-1519-coordination-lease-hardening.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single contract worktree branch, one synthesized publication commit, one revert; empty-lease-store precondition keeps the schema change migration-free
- **Verification boundary**: Falsification tests pinning each closed deviation (completing-steal refusal, inline completion gate, schema field validation, legacy fail-closed) plus full required checks and helper mirror cmp
- **Review/acceptance boundary**: `tasks/reviews/20260819-1519-coordination-lease-hardening.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260819-1519-coordination-lease-hardening.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260819-1519-coordination-lease-hardening.contract.md`, `tasks/reviews/20260819-1519-coordination-lease-hardening.review.md`, and `tasks/notes/20260819-1519-coordination-lease-hardening.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260819-1519-coordination-lease-hardening.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single contract worktree branch, one synthesized publication commit, one revert; empty-lease-store precondition keeps the schema change migration-free

## Captured Planning Output

## Goal

Close the conformance deviations between the landed WP1 shared-lease implementation (main `f5f4d8ce`) and the approved coordination-plane spec (`docs/researches/20260819-GPT-kanban.md`), inside the zero-live-lease window: `$GIT_COMMON_DIR/repo-harness/coordination/v1/` does not exist yet on this clone, so the owner-record schema can still change without a protocol bump or lease migration.

## Preconditions (verify before any edit; fail closed)

- Resolve `git rev-parse --git-common-dir`, then confirm `repo-harness/coordination/v1/leases/` is absent or empty. If any lease exists, STOP: the schema task would then require an explicit protocol-2 bump behind a no-active-lease gate, which this plan does not authorize.
- Conformance evidence source: the as-landed review recorded in `docs/researches/20260819-GPT-kanban.md` section「落地状态与符合度修订（2026-08-19）」.

## Task Breakdown

- [ ] T1 Owner-record schema: add `generation` (integer >= 1; claim mints 1; steal increments), `target_ref` (canonical ref captured at claim time), and `finish_transaction_key` (string | null; set by begin-completion from the closeout journal key) to the lease owner record in `src/core/state/coordination-identity.ts` (build / parse / steal / begin-completion), and thread them through `src/cli/commands/sprint.ts`: claim records `target_ref`; `begin-completion` and `reconcile` validate their `--target-ref` argument equals the recorded value and fail closed on mismatch. `parseLeaseOwnerRecord` rejects records missing the new fields (protocol stays 1; the empty-store precondition makes this safe).
- [ ] T2 State-machine guards: `stealLeaseRecord` rejects `state = completing` (spec §6 hard rule; protects the publication window); `releaseLeaseRecord` accepts only `reserving` and `bound` (spec §8.3).
- [ ] T3 Inline completion gate: in `scripts/sprint-backlog.sh` `cmd_complete_task`, before rewriting the row to `[x]`: resolve the task's lease from the common-dir store; if a lease exists and this worktree does not hold the matching claim token, refuse and name the owning claim in the error; if no lease exists, proceed unchanged (single-agent flow unaffected). Mirror byte-identically into `assets/templates/helpers/sprint-backlog.sh`.
- [ ] T4 Claim-side legacy fail-closed (spec §14 closing clause): `sprint claim` and `sprint steal` refuse when a legacy `.ai/harness/sprint/in-flight/*` marker exists in any registered worktree and no v1 `protocol.json` marker is present, pointing the operator to the init cutover; a missing `git` binary is an error, never a silent gate skip (`src/cli/commands/sprint.ts` + `src/effects/state/coordination-cutover.ts`).
- [ ] T5 Cutover marker ordering: move `recordCutoverInstalled` after `runAdoptionApply` succeeds in `src/cli/commands/init.ts`, closing the fail-open window recorded in `tasks/todos.md` (marker-before-apply row); remove that todos row in this slice's closeout.
- [ ] T6 Falsification tests pinning each closed deviation: steal against `completing` refused; release from `completing` refused; drifted task definition blocks `begin-completion`; inline `complete-task` without the owning token against a claimed row refused, and allowed when no lease exists; claim refused on legacy marker without protocol marker; parse rejects owner records missing `generation` / `target_ref` / `finish_transaction_key`; generation increments across steal. Extend `tests/coordination-identity.test.ts`, `tests/coordination-lease-store.test.ts`, `tests/sprint-claim-concurrency.test.ts`, `tests/sprint-backlog.test.ts`.

## Non-goals (deferred; ledger rows exist in `tasks/todos.md`)

Audit event log (`events/<task-id>.jsonl`), reconcile git-topology orphan cleanup, `completing -> bound` finish-abort recovery, reconcile completing finish-journal completion, claim-time canonical dirty check, bind-time `resumed` receipt, board projection (WP2), hook visibility (WP3), metadata relocation (WP4).

## Verification

- Targeted: `bun test tests/coordination-identity.test.ts tests/coordination-lease-store.test.ts tests/sprint-claim-concurrency.test.ts tests/sprint-backlog.test.ts`
- Full required checks: `bun test`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh`, `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, `bun src/cli/index.ts init --repo . --dry-run`
- Mirrors: `cmp scripts/sprint-backlog.sh assets/templates/helpers/sprint-backlog.sh` and `cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh`

## Rollback

Single contract worktree branch; one synthesized publication commit; one revert. The empty-lease-store precondition guarantees no on-disk lease state depends on the new schema until this slice publishes.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] T1 Owner-record schema: add `generation` (integer >= 1; claim mints 1; steal increments), `target_ref` (canonical ref captured at claim time), and `finish_transaction_key` (string | null; set by begin-completion from the closeout journal key) to the lease owner record in `src/core/state/coordination-identity.ts` (build / parse / steal / begin-completion), and thread them through `src/cli/commands/sprint.ts`: claim records `target_ref`; `begin-completion` and `reconcile` validate their `--target-ref` argument equals the recorded value and fail closed on mismatch. `parseLeaseOwnerRecord` rejects records missing the new fields (protocol stays 1; the empty-store precondition makes this safe).
- [ ] T2 State-machine guards: `stealLeaseRecord` rejects `state = completing` (spec §6 hard rule; protects the publication window); `releaseLeaseRecord` accepts only `reserving` and `bound` (spec §8.3).
- [ ] T3 Inline completion gate: in `scripts/sprint-backlog.sh` `cmd_complete_task`, before rewriting the row to `[x]`: resolve the task's lease from the common-dir store; if a lease exists and this worktree does not hold the matching claim token, refuse and name the owning claim in the error; if no lease exists, proceed unchanged (single-agent flow unaffected). Mirror byte-identically into `assets/templates/helpers/sprint-backlog.sh`.
- [ ] T4 Claim-side legacy fail-closed (spec §14 closing clause): `sprint claim` and `sprint steal` refuse when a legacy `.ai/harness/sprint/in-flight/*` marker exists in any registered worktree and no v1 `protocol.json` marker is present, pointing the operator to the init cutover; a missing `git` binary is an error, never a silent gate skip (`src/cli/commands/sprint.ts` + `src/effects/state/coordination-cutover.ts`).
- [ ] T5 Cutover marker ordering: move `recordCutoverInstalled` after `runAdoptionApply` succeeds in `src/cli/commands/init.ts`, closing the fail-open window recorded in `tasks/todos.md` (marker-before-apply row); remove that todos row in this slice's closeout.
- [ ] T6 Falsification tests pinning each closed deviation: steal against `completing` refused; release from `completing` refused; drifted task definition blocks `begin-completion`; inline `complete-task` without the owning token against a claimed row refused, and allowed when no lease exists; claim refused on legacy marker without protocol marker; parse rejects owner records missing `generation` / `target_ref` / `finish_transaction_key`; generation increments across steal. Extend `tests/coordination-identity.test.ts`, `tests/coordination-lease-store.test.ts`, `tests/sprint-claim-concurrency.test.ts`, `tests/sprint-backlog.test.ts`.
