# Plan: Make Effective State concurrency barriers counter-safe

> **Status**: Executing
> **Created**: 20260724-0232
> **Slug**: state-concurrency-counter-barrier
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Both continuous-mutation tests pass under repeated targeted execution and the full test suite completes without the known counter ENOENT.
> **Rollback Surface**: Revert the three mutator ready-signal reorderings and restore the deferred Todo row.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260724-0232-state-concurrency-counter-barrier.contract.md`
> **Task Review**: `tasks/reviews/20260724-0232-state-concurrency-counter-barrier.review.md`
> **Implementation Notes**: `tasks/notes/20260724-0232-state-concurrency-counter-barrier.notes.md`

## Agentic Routing
- Selected route: hunt
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260724-0232-state-concurrency-counter-barrier.md`
- Sprint contract: `tasks/contracts/20260724-0232-state-concurrency-counter-barrier.contract.md`
- Sprint review: `tasks/reviews/20260724-0232-state-concurrency-counter-barrier.review.md`
- Implementation notes: `tasks/notes/20260724-0232-state-concurrency-counter-barrier.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260724-0232-state-concurrency-counter-barrier.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260724-0232-state-concurrency-counter-barrier.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260724-0232-state-concurrency-counter-barrier.md`.

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
- Contract file: `tasks/contracts/20260724-0232-state-concurrency-counter-barrier.contract.md`
- Review file: `tasks/reviews/20260724-0232-state-concurrency-counter-barrier.review.md`
- Implementation notes file: `tasks/notes/20260724-0232-state-concurrency-counter-barrier.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260724-0232-state-concurrency-counter-barrier.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260724-0232-state-concurrency-counter-barrier.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the three mutator ready-signal reorderings and restore the deferred Todo row.
- **Verification boundary**: Both continuous-mutation tests pass under repeated targeted execution and the full test suite completes without the known counter ENOENT.
- **Review/acceptance boundary**: `tasks/reviews/20260724-0232-state-concurrency-counter-barrier.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260724-0232-state-concurrency-counter-barrier.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260724-0232-state-concurrency-counter-barrier.contract.md`, `tasks/reviews/20260724-0232-state-concurrency-counter-barrier.review.md`, and `tasks/notes/20260724-0232-state-concurrency-counter-barrier.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260724-0232-state-concurrency-counter-barrier.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the three mutator ready-signal reorderings and restore the deferred Todo row.

## Captured Planning Output

## Why

The Effective State concurrency suite has a known intermittent ENOENT because three background mutators publish their `mutator-started` marker before creating `mutator-count`, while the parent waits only for the marker and immediately reads the counter. A forced legal scheduling gap reproduced `started-visible-counter-missing` deterministically.

## P1: Architecture Map

- System boundary: test-only concurrency fixtures in `tests/state/state-concurrency.test.ts`.
- Production authority: Effective State resolver and lock/version allocation code remain out of scope.
- Sibling surface: the capability-registry mutator, confirm-window exhaustion mutator, and shared non-authority stability mutator share the same signal-before-counter ordering.
- Deferred ledger: `tasks/todos.md` owns the known-flake row and is removed only after verified closeout.

## P2: Concrete Trace

1. The test creates `startedPath`, `counterPath`, a state lock, and a background shell mutator.
2. The mutator currently writes `startedPath`, mutates the source, increments and writes `counterPath`, then releases the lock and loops.
3. The parent waits for `startedPath` only.
4. Under a valid preemption between steps 2a and 2b, the parent calls `readFileSync(counterPath)` before the file exists and throws ENOENT.
5. The resolver itself is never reached, so the failure is test-fixture synchronization rather than product behavior.

## P3: Design Decision

Move the existing `startedPath` publication after the first counter write in all three same-shape mutators. This preserves one ready authority, guarantees every field consumed after the barrier exists, retains the intended continuous-mutation and lock-release behavior, and avoids sleeps, retries, fuzzy fallbacks, or a new abstraction. At 10x test load, the first failure remains a bounded barrier timeout rather than an unordered file read.

## Scope

- Reorder the ready marker in both continuous-mutation shell fixtures in `tests/state/state-concurrency.test.ts`.
- Reorder the ready marker in the shared mutator in `tests/state/effective-state-stability.test.ts`.
- Add or strengthen an in-suite regression assertion only if needed to make the ordering contract explicit without timing sleeps.
- Remove the resolved known-flake row from `tasks/todos.md` after verification.
- Record red-first probe evidence and final review/receipt artifacts required by the generated contract.

## Non-Goals

- No production Effective State logic changes.
- No lock protocol, retry-count, timeout, cache, or process-runner changes.
- No unrelated flaky-test fixes.

## Task Breakdown

- [x] Capture the deterministic pre-fix interleaving evidence in the contract run directory.
- [x] Reorder all three mutator ready markers after their initial counter writes.
- [x] Sweep all `mutator-started`/`mutator-count` sites for the same shape.
- [x] Run repeated targeted tests, both complete affected test files, typecheck, and the contract verification gate.
- [x] Remove the resolved Todo row and prepare the review/acceptance artifacts for lifecycle closeout.

## Evidence Contract

- State/progress path: generated plan, contract, notes, review, and Effective State projection.
- Verification evidence: deterministic pre-fix probe; repeated targeted runs; `bun test tests/state/state-concurrency.test.ts`; `bun run check:type`; `repo-harness run verify-sprint --prepare-acceptance`; final CI after push.
- Evaluator rubric: no counter read can occur after the ready barrier unless the counter has already been written; all three sibling fixtures follow the same invariant; no production behavior changes.
- Stop condition: targeted and full verification are green, the acceptance receipt is fresh, main is pushed, CI is green, and cleanup succeeds.
- Rollback surface: the three shell-line reorderings plus the Todo deletion and workflow artifacts.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture the deterministic pre-fix interleaving evidence in the contract run directory.
- [x] Reorder all three mutator ready markers after their initial counter writes.
- [x] Sweep all `mutator-started`/`mutator-count` sites for the same shape.
- [x] Run repeated targeted tests, both complete affected test files, typecheck, and the contract verification gate.
- [x] Remove the resolved Todo row and prepare the review/acceptance artifacts for lifecycle closeout.
