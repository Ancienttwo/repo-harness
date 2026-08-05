# Plan: Raise verifier helper wrapper timeout above the whole-round budget

> **Status**: Archived
> **Created**: 20260805-2041
> **Slug**: verifier-wrapper-1260s
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260805-2041-verifier-wrapper-1260s.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260805-2041-verifier-wrapper-1260s.md`; after execution revert branch `codex/verifier-wrapper-1260s` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260805-2041-verifier-wrapper-1260s.contract.md`
> **Task Review**: `tasks/reviews/20260805-2041-verifier-wrapper-1260s.review.md`
> **Implementation Notes**: `tasks/notes/20260805-2041-verifier-wrapper-1260s.notes.md`

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

- Active plan: `plans/plan-20260805-2041-verifier-wrapper-1260s.md`
- Sprint contract: `tasks/contracts/20260805-2041-verifier-wrapper-1260s.contract.md`
- Sprint review: `tasks/reviews/20260805-2041-verifier-wrapper-1260s.review.md`
- Implementation notes: `tasks/notes/20260805-2041-verifier-wrapper-1260s.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260805-2041-verifier-wrapper-1260s.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260805-2041-verifier-wrapper-1260s.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260805-2041-verifier-wrapper-1260s.md`.

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
- Contract file: `tasks/contracts/20260805-2041-verifier-wrapper-1260s.contract.md`
- Review file: `tasks/reviews/20260805-2041-verifier-wrapper-1260s.review.md`
- Implementation notes file: `tasks/notes/20260805-2041-verifier-wrapper-1260s.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260805-2041-verifier-wrapper-1260s.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260805-2041-verifier-wrapper-1260s.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260805-2041-verifier-wrapper-1260s.md`; after execution revert branch `codex/verifier-wrapper-1260s` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260805-2041-verifier-wrapper-1260s.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260805-2041-verifier-wrapper-1260s.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260805-2041-verifier-wrapper-1260s.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260805-2041-verifier-wrapper-1260s.contract.md`, `tasks/reviews/20260805-2041-verifier-wrapper-1260s.review.md`, and `tasks/notes/20260805-2041-verifier-wrapper-1260s.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260805-2041-verifier-wrapper-1260s.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260805-2041-verifier-wrapper-1260s.md`; after execution revert branch `codex/verifier-wrapper-1260s` or the explicitly reviewed diff.

## Captured Planning Output

## Problem

`src/cli/runtime/helper-runner.ts:13` wraps verifier helpers (`verify-contract`, `verify-sprint`) in a `VERIFIER_HELPER_TIMEOUT_MS = 720_000` process timeout. The just-merged whole-round verification budget is 1_200_000 ms (`a8b9b73e`), so the outer wrapper now sits BELOW the inner gate: rounds lasting 720-1200s are killed by the wrapper (`process timed out after 720000ms`), which — unlike the inner gate — emits no run snapshot and no `budget_ms` evidence. Observed twice on 2026-08-05 (~21:0x and ~21:1x, ELAPSED 720/721s) blocking the hook-entry-single-file-bundle shipment; ambient-load full round measures >720s while low-load measures ~525s.

## Decision

Raise `VERIFIER_HELPER_TIMEOUT_MS` to `1_260_000` (inner budget 1_200_000 + 60s margin) and sync the two pinned assertions in `tests/unit/closeout-runner-guardrails.test.ts:121-122`. Invariant restored: the outer wrapper is a last-resort hang backstop strictly above the inner whole-round budget, so the evidence-emitting inner gate always fires first. No other timeout constants change (`CLOSEOUT_HELPER_TIMEOUT_MS`, `ORDINARY_HELPER_TIMEOUT_MS` are separate paths with no observed pressure).

## Task Breakdown

- [x] `src/cli/runtime/helper-runner.ts:13`: `720_000` → `1_260_000`
- [x] `tests/unit/closeout-runner-guardrails.test.ts:121-122`: sync both pinned assertions to `1_260_000`
- [x] Verification: `bun run check:type`; `bun test tests/unit/closeout-runner-guardrails.test.ts`; `bash scripts/check-task-sync.sh`

## Verification

`bun run check:type`; `bun test tests/unit/closeout-runner-guardrails.test.ts`; `grep -q '1_260_000' src/cli/runtime/helper-runner.ts`; `bash scripts/check-task-sync.sh`. Full suite intentionally excluded (same rationale as the budget slice: this is the gate machinery itself; the full suite runs in the resumed bundle verification).

## Rollback

Revert the single commit; the wrapper returns to 720_000.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `src/cli/runtime/helper-runner.ts:13`: `720_000` → `1_260_000`
- [x] `tests/unit/closeout-runner-guardrails.test.ts:121-122`: sync both pinned assertions to `1_260_000`
- [x] Verification: `bun run check:type`; `bun test tests/unit/closeout-runner-guardrails.test.ts`; `bash scripts/check-task-sync.sh`
