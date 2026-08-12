# Plan: Fail-closed legacy architecture cascade acknowledgement

> **Status**: Executing
> **Created**: 20260812-1448
> **Slug**: legacy-cascade-ack
> **Planning Source**: user-approved-fix
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Stop and manual-drain failure-path regressions, targeted hook/projection suites, then one frozen final required-check run
> **Rollback Surface**: Revert codex/legacy-cascade-ack; cursor state remains at the prior acknowledged SHA on delivery failure
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260812-1448-legacy-cascade-ack.contract.md`
> **Task Review**: `tasks/reviews/20260812-1448-legacy-cascade-ack.review.md`
> **Implementation Notes**: `tasks/notes/20260812-1448-legacy-cascade-ack.notes.md`

## Agentic Routing
- Selected route: execution
- Routing reason: Captured from user-approved-fix planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260812-1448-legacy-cascade-ack.md`
- Sprint contract: `tasks/contracts/20260812-1448-legacy-cascade-ack.contract.md`
- Sprint review: `tasks/reviews/20260812-1448-legacy-cascade-ack.review.md`
- Implementation notes: `tasks/notes/20260812-1448-legacy-cascade-ack.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260812-1448-legacy-cascade-ack.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260812-1448-legacy-cascade-ack.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260812-1448-legacy-cascade-ack.md`.

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
- Contract file: `tasks/contracts/20260812-1448-legacy-cascade-ack.contract.md`
- Review file: `tasks/reviews/20260812-1448-legacy-cascade-ack.review.md`
- Implementation notes file: `tasks/notes/20260812-1448-legacy-cascade-ack.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260812-1448-legacy-cascade-ack.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260812-1448-legacy-cascade-ack.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert codex/legacy-cascade-ack; cursor state remains at the prior acknowledged SHA on delivery failure
- **Verification boundary**: Stop and manual-drain failure-path regressions, targeted hook/projection suites, then one frozen final required-check run
- **Review/acceptance boundary**: `tasks/reviews/20260812-1448-legacy-cascade-ack.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260812-1448-legacy-cascade-ack.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260812-1448-legacy-cascade-ack.contract.md`, `tasks/reviews/20260812-1448-legacy-cascade-ack.review.md`, and `tasks/notes/20260812-1448-legacy-cascade-ack.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260812-1448-legacy-cascade-ack.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert codex/legacy-cascade-ack; cursor state remains at the prior acknowledged SHA on delivery failure

## Captured Planning Output

## Goal and Success Criteria

Close the post-merge acknowledgement defect in the Stop-time architecture drift cursor. In projection-disabled repositories, the cursor must advance only after every legacy architecture cascade delivery succeeds. Missing runners and non-zero helper exits must leave the cursor unchanged and surface an observable error. The manual `architecture-projection drain` path must obey the same contract.

## Scope / Non-scope

- In scope: `processArchitectureCascade` result contract; Stop and manual-drain acknowledgement checks; focused regression tests; workflow artifacts and the runtime-harness hook-adapters architecture note if required by the architecture sync gate.
- Out of scope: changed-set construction, journal authority, fan-out caps/deduplication, Codex mutation guard parity, consumer repository repairs, release or deployment.

## Constraints

- Preserve the Stop-time git cursor as the single architecture changed-set authority.
- Fail closed: no compatibility fallback, no synthesized success, no cursor advance after incomplete delivery.
- Reuse the existing cascade command path; do not introduce a second classifier or architecture authority.
- Work in an isolated contract worktree based on current `origin/main`; do not touch the dirty main checkout.

## P1: Architecture Map

- `src/cli/hook/architecture-drift.ts` owns changed-set and cursor state.
- `src/cli/hook/stop-handler.ts` and `src/cli/commands/architecture-projection.ts` are the two consumers.
- `src/cli/hook/mutation-observed.ts#processArchitectureCascade` owns the legacy cascade command execution.
- `src/effects/architecture/projection-orchestrator.ts` returns provider-lane acknowledgement; its disabled acknowledgement is not legacy-delivery proof.

## P2: Concrete Trace

`diff(cursor, HEAD)` contains a committed path -> provider reports disabled/acknowledged -> legacy cascade sees no runner or a non-zero helper exit but returns `void` -> caller advances cursor -> next changed set is empty. The committed path is silently lost.

## P3: Decision

Make `processArchitectureCascade` return a typed success/failure result. Runner absence, primary `architecture-queue` failure, and request-triggered follow-up failure are unsuccessful delivery. Both consumers aggregate per-path results and advance the cursor only if all paths succeed. Surface one bounded diagnostic while retaining the cursor for retry. This changes acknowledgement only; changed-set and classifier authority remain unchanged.

At 10x scale, existing per-path fan-out remains the first bottleneck and stays under its already-recorded deferred item. This slice is sufficient because it closes the only proven loss path without expanding into batching policy.

## Tests and Evidence Contract

- Red/green Stop regression: committed-only path plus unavailable runner leaves cursor at its previous SHA and reports failure.
- Red/green manual drain regression: non-zero cascade helper leaves cursor unchanged and command exits non-zero.
- Existing success-path fleet test continues to advance the cursor.
- Run targeted hook/projection tests and typecheck; after code freeze, run the repository-required verification exactly once and record fresh acceptance evidence.
- State/progress authority: captured plan, linked task contract/review/notes, and isolated contract worktree.
- Evaluator rubric: no cursor advance unless every legacy delivery succeeded; no journal reintroduction; both consumers covered.
- Stop condition: any required change outside the captured contract's allowed paths or a repeated three-round failure.

## Rollback / Failure Handling

Revert the focused branch. Cursor files are ignored runtime state; preserving the old cursor on failure is the intended retry behavior and requires no migration.

## Task Breakdown

- [x] Add failing Stop and manual-drain regression cases.
- [x] Implement typed cascade delivery and fail-closed cursor advancement in both consumers.
- [x] Run targeted verification and update architecture/workflow artifacts.
- [ ] Freeze code, run final required checks once, and record fresh acceptance evidence.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add failing Stop and manual-drain regression cases.
- [x] Implement typed cascade delivery and fail-closed cursor advancement in both consumers.
- [x] Run targeted verification and update architecture/workflow artifacts.
- [ ] Freeze code, run final required checks once, and record fresh acceptance evidence.
