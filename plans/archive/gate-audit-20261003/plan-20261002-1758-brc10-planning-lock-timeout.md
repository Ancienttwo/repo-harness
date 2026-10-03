# Plan: Fix concurrent campaign recovery planning lock timeout

> **Status**: Executing
> **Created**: 20261002-1758
> **Slug**: brc10-planning-lock-timeout
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20261002-1758-brc10-planning-lock-timeout.md`; after execution revert branch `codex/brc10-planning-lock-timeout` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md`
> **Task Review**: `tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md`
> **Implementation Notes**: `tasks/notes/20261002-1758-brc10-planning-lock-timeout.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20261002-1758-brc10-planning-lock-timeout.md`
- Sprint contract: `tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md`
- Sprint review: `tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md`
- Implementation notes: `tasks/notes/20261002-1758-brc10-planning-lock-timeout.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20261002-1758-brc10-planning-lock-timeout.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20261002-1758-brc10-planning-lock-timeout.md`.

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
- Contract file: `tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md`
- Review file: `tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md`
- Implementation notes file: `tasks/notes/20261002-1758-brc10-planning-lock-timeout.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20261002-1758-brc10-planning-lock-timeout.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20261002-1758-brc10-planning-lock-timeout.md`; after execution revert branch `codex/brc10-planning-lock-timeout` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20261002-1758-brc10-planning-lock-timeout.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20261002-1758-brc10-planning-lock-timeout.contract.md`, `tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md`, and `tasks/notes/20261002-1758-brc10-planning-lock-timeout.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20261002-1758-brc10-planning-lock-timeout.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20261002-1758-brc10-planning-lock-timeout.md`; after execution revert branch `codex/brc10-planning-lock-timeout` or the explicitly reviewed diff.

## Captured Planning Output

## Goal
Fix the existing two-OS-recovery-callers planning.lock timeout with a proven lower lock/recovery root cause. Preserve every existing test assertion and timeout; no timeout increase, external CLI adapter, push, PR, merge or deletion. Only local commit after verification.

## P1 architecture boundary
Campaign recovery owns persisted retirement/recovery intent/recovered/final records; campaign planning store owns immutable journal publication and group serialization; exclusive-directory-lock owns token-fenced OS mutual exclusion. Existing Engineer/Task/Lease stores own generation and exact binding/actor/token checks. No S4 selected entrypoint, admission/schema/scheduler/retention change.

## P2 concrete trace
Unmodified brc10 two OS callers -> recoverCampaignDispatch -> retirement lock -> persisted recovery intent under group planning.lock -> automaticReclaimLease Task lock -> resumeReclaimedEngineerTask Binding lock and existing Fleet exact rebind -> recovered record -> final settlement. Pre-fix focused command fails at brc10-lifecycle.test.ts:247 with ExclusiveLockContentionError. Measure acquisition/hold/release and phase timestamps before choosing a fix; failure alone does not prove load causality.

## P3 decision boundary
Root cause must be stated with runtime evidence before production repair. Preserve exact generation, immutable journal replay, fail-closed owner fences and crash-boundary idempotency. Prefer the smallest correction in existing lock/recovery owners; no new adapter or compatibility authority. Temporary diagnostics must be removed before verification/commit. At 10x callers, serialization remains mandatory; improve critical-section correctness, not waiting budgets.

## Task Breakdown
- [x] Capture pre-fix failure, instrument discriminating lock/phase evidence and prove one root cause.
- [x] Implement smallest root-cause correction without changing assertions or timeouts; restore all temporary diagnostics.
- [x] Verify unchanged brc10 under normal and low concurrency, existing related guards, full suite, typecheck and integrity checks; record truthful notes and local commit only.

## Allowed Paths
src/effects/automation/campaign-recovery.ts
src/effects/automation/campaign-planning-store.ts
src/effects/locking/exclusive-directory-lock.ts
Generated plan/contract/review/notes for this work-package only. Narrow unused paths after diagnosis; extend only with concrete root-cause evidence within the owner-authorized lower lock/recovery scope. Existing brc10 test is a read-only regression guard. Do not edit test assertions or timeouts, S4 worktree, primary checkout, dependency versions, adapters or unrelated sources.

## Verification Boundary
Pre-fix: PATH=/opt/homebrew/opt/node@24/bin:$PATH bun test --timeout 180000 --max-concurrency 1 tests/effects/brc10-lifecycle.test.ts --test-name-pattern 'two OS callers settle the historical final under one recovered generation'; /tmp/brc10-lock-pre-fix.log has PRE_FIX_EXIT=1.
Existing brc10 entire file under --max-concurrency 4 and 1, unchanged case-specific 60000 timeout; then owner-required full inventory through existing isolated4-job CI runner at180000 per-file timeout, explicit bun run check:type and all9 required integrity/state/adoption checks. No new tests document/benchmark. Contract Verification Plan is the only executable authority. Retain actual exit/count/skip/environment/subject. Final notes carry runtime root cause and before/after evidence, not a fabricated AcceptanceReceipt/verdict.

## Rollback Surface
Local branch fix/brc10-planning-lock-timeout based on origin/main9aef6693. Revert only this fix's owned paths. No remote operation, merge, worktree/branch deletion or contract-worktree finish is authorized. EXECUTION_BOUNDARY: absent requirements are forbidden design space.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture pre-fix failure, instrument discriminating lock/phase evidence and prove one root cause.
- [x] Implement smallest root-cause correction without changing assertions or timeouts; restore all temporary diagnostics.
- [x] Verify unchanged brc10 under normal and low concurrency, existing related guards, full suite, typecheck and integrity checks; record truthful notes and local commit only.

## Proven P3 decision

The current owner legitimately holds planning.lock for6092ms; final settlement after immutable recovered publication consumes1514ms, exceeding unchanged5000ms contention budget. Existing budget/attempt stores already serialize and validate replay, so final settlement follows journal lock release. Intent/reclaim/rebind/recovered publication and crash hooks remain serialized. No generic lock primitive, timeout, assertion, CLI adapter or policy changes.

## Verified delivery

Actual canonical14/14 execution passed; full457files5737pass/0fail/81skip and typecheck exit0. Exact frozen evidence is recorded in notes; subsequent edits are workflow-result metadata only. Only local commit is authorized; no finish/push/PR/merge/deletion or fabricated semantic acceptance.
