# Plan: Make five load-sensitive tests robust under concurrent machine load

> **Status**: Executing
> **Created**: 20260807-0104
> **Slug**: timing-tests-load-robustness
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260807-0104-timing-tests-load-robustness.md`; after execution revert branch `codex/timing-tests-load-robustness` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md`
> **Task Review**: `tasks/reviews/20260807-0104-timing-tests-load-robustness.review.md`
> **Implementation Notes**: `tasks/notes/20260807-0104-timing-tests-load-robustness.notes.md`

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

- Active plan: `plans/plan-20260807-0104-timing-tests-load-robustness.md`
- Sprint contract: `tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md`
- Sprint review: `tasks/reviews/20260807-0104-timing-tests-load-robustness.review.md`
- Implementation notes: `tasks/notes/20260807-0104-timing-tests-load-robustness.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260807-0104-timing-tests-load-robustness.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260807-0104-timing-tests-load-robustness.md`.

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
- Contract file: `tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md`
- Review file: `tasks/reviews/20260807-0104-timing-tests-load-robustness.review.md`
- Implementation notes file: `tasks/notes/20260807-0104-timing-tests-load-robustness.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260807-0104-timing-tests-load-robustness.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260807-0104-timing-tests-load-robustness.md`; after execution revert branch `codex/timing-tests-load-robustness` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260807-0104-timing-tests-load-robustness.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260807-0104-timing-tests-load-robustness.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260807-0104-timing-tests-load-robustness.contract.md`, `tasks/reviews/20260807-0104-timing-tests-load-robustness.review.md`, and `tasks/notes/20260807-0104-timing-tests-load-robustness.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260807-0104-timing-tests-load-robustness.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260807-0104-timing-tests-load-robustness.md`; after execution revert branch `codex/timing-tests-load-robustness` or the explicitly reviewed diff.

## Captured Planning Output

## Problem

Five timing-sensitive tests fail under concurrent machine load and have now blocked four consecutive verification rounds of the hook-entry-single-file-bundle shipment (in-round `bun test` runs 14-42% slower than standalone; retained log `run-20260807T004613-2770-bun-test.log` names all five). Three tests in `tests/continuation-attempt.test.ts` spawn CLI subprocesses and hit bun's default 5000ms per-test timeout at 5029-5052ms; two tests in `tests/unit/closeout-runner-guardrails.test.ts` encode hardcoded wall-clock assumptions (`toBeLessThan(500)` measured 641ms; a `Bun.sleep(100)` race where the competitor entered earlier than the sleep assumed). None touch the bundle's change surface; standalone runs are green (2206/0). Any loaded machine will periodically trip every future contract on these five.

## Decision

Make the five named tests load-robust while preserving each test's guarded invariant. Per class:
- Subprocess-spawning tests: explicit generous per-test timeout (e.g. 30000ms) — the timeout guards against hangs, not performance; 30s still catches a hang while tolerating load.
- `toBeLessThan(500)`: the invariant is "bounded error instead of hanging on pipe close"; widen to a bound that still distinguishes bounded-return from hang (e.g. 5000ms) with the reasoning recorded.
- `Bun.sleep(100)` race: replace the fixed-sleep assumption with synchronization on the observable state the test actually asserts (token retained until the group is drained), so scheduling order cannot flip the result.
If any of the five turns out to encode a product guarantee that genuinely fails under load (not a test artifact), STOP and report it as a product defect instead of widening the assertion.
No production code changes.

## Task Breakdown

- [x] `tests/continuation-attempt.test.ts`: explicit timeouts on the three named tests (no-progress circuit breaker halt; `state next` no-writes fence; byte-identical output fence)
- [x] `tests/unit/closeout-runner-guardrails.test.ts`: bounded-error threshold widened with invariant preserved; sleep-race replaced by state synchronization
- [x] Verification: `bun run check:type`; the two files pass repeatedly (3 consecutive runs); `bash scripts/check-task-sync.sh`

## Verification

`bun run check:type`; `for i in 1 2 3; do bun test tests/continuation-attempt.test.ts tests/unit/closeout-runner-guardrails.test.ts || exit 1; done`; `bash scripts/check-task-sync.sh`. Full suite excluded (these two files are the change surface; the full suite runs in the resumed bundle verification).

## Rollback

Revert the single commit; the five tests return to their load-sensitive form.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `tests/continuation-attempt.test.ts`: explicit timeouts on the three named tests (no-progress circuit breaker halt; `state next` no-writes fence; byte-identical output fence)
- [x] `tests/unit/closeout-runner-guardrails.test.ts`: bounded-error threshold widened with invariant preserved; sleep-race replaced by state synchronization
- [x] Verification: `bun run check:type`; the two files pass repeatedly (3 consecutive runs); `bash scripts/check-task-sync.sh`
