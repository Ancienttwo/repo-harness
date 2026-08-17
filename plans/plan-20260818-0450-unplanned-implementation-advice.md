# Plan: Stop-time advisory for implementation changes with no active plan

> **Status**: Executing
> **Created**: 20260818-0450
> **Slug**: unplanned-implementation-advice
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260818-0450-unplanned-implementation-advice.md`; after execution revert branch `codex/unplanned-implementation-advice` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md`
> **Task Review**: `tasks/reviews/20260818-0450-unplanned-implementation-advice.review.md`
> **Implementation Notes**: `tasks/notes/20260818-0450-unplanned-implementation-advice.notes.md`

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

- Active plan: `plans/plan-20260818-0450-unplanned-implementation-advice.md`
- Sprint contract: `tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md`
- Sprint review: `tasks/reviews/20260818-0450-unplanned-implementation-advice.review.md`
- Implementation notes: `tasks/notes/20260818-0450-unplanned-implementation-advice.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-0450-unplanned-implementation-advice.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-0450-unplanned-implementation-advice.md`.

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
- Contract file: `tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md`
- Review file: `tasks/reviews/20260818-0450-unplanned-implementation-advice.review.md`
- Implementation notes file: `tasks/notes/20260818-0450-unplanned-implementation-advice.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-0450-unplanned-implementation-advice.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260818-0450-unplanned-implementation-advice.md`; after execution revert branch `codex/unplanned-implementation-advice` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260818-0450-unplanned-implementation-advice.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-0450-unplanned-implementation-advice.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-0450-unplanned-implementation-advice.contract.md`, `tasks/reviews/20260818-0450-unplanned-implementation-advice.review.md`, and `tasks/notes/20260818-0450-unplanned-implementation-advice.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-0450-unplanned-implementation-advice.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260818-0450-unplanned-implementation-advice.md`; after execution revert branch `codex/unplanned-implementation-advice` or the explicitly reviewed diff.

## Captured Planning Output

## Goal

At Stop, when the changed set contains implementation-surface paths and no active plan covers them, emit one advisory line and append one durable evidence record. Non-blocking.

## Why

`PlanStatusGuard` (`src/cli/hook/mutation-guard.ts:552`) is the only gate that asserts "implementation changed without an approved plan", and it fires only on the `PreToolUse` `Edit|Write` matcher. A shell write — `cat >> file`, `tee`, `sed -i` — bypasses it entirely; this was hit accidentally on 2026-08-18 while appending a job to `.github/workflows/ci.yml`.

The exposure is narrower than it first appears. Inside a contract worktree the change is already covered: `capture-plan --execute` produces plan and contract together, and `allowed_paths_check` reads `git_changed_files_list` (`scripts/verify-sprint.sh:357`), which is `git diff --name-only` plus `ls-files --others` and therefore indifferent to how the bytes were written. The uncovered case is an implementation change on `main` with no active plan.

A blocking shell-command parser is explicitly rejected: covering redirections, `tee`, `sed -i`, `python -c`, `eval`, and subshells is an unbounded heuristic shadow parser, which this repo's rules forbid, and it would duplicate unsoundly what the diff-derived gate already does soundly.

Advice rather than enforce, per owner decision: no data exists yet on how often this fires on real work, and the repo's own 2026-08-17 lesson is that tightening a gate against imagined receipts designs for the wrong thing.

## Task Breakdown

- [ ] Import the existing exported `isImplementationSurfacePath` (`src/effects/review/diff-fingerprint.ts:399`) into `src/cli/hook/stop-handler.ts`. Do not write a second classifier; `plans/`, `tasks/`, `docs/`, `.ai/`, `.claude/`, `.codex/` and all Markdown are already exempt there.
- [ ] In `runStopHandler`, reuse the `activePlan` already resolved at `:668` and the `changedSet` already computed at `:675`. When `activePlan` is null, collect `changedSet.paths.filter(isImplementationSurfacePath)`.
- [ ] Emit one line into the existing `stderr` accumulator naming the count and the first few paths, plus the `capture-plan` remedy. Never touch `exitCode` or the `decision: block` stdout path.
- [ ] Append one JSONL record to `.ai/harness/runs/unplanned-implementation.jsonl` (ignored runtime evidence, same tree as `hook-events.jsonl`) carrying timestamp, path count, and paths. Reuse `appendFileSync`; introduce no new typed contract and no new telemetry metric, so the `child_processes` completeness problem in `tasks/todos.md` is not repeated.
- [ ] Failure of the evidence append must not affect the Stop result: wrap it the way the sibling side effects at `:692` and `:697` are wrapped.
- [ ] Add `tests/stop-handler-unplanned-implementation.test.ts`: fires with implementation paths and no active plan; silent when an active plan exists; silent when the changed set is workflow-surface only; exit code stays 0 in every case.

## Non-goals

No enforce mode, no policy key, no `PreToolUse.bash` route, no shell-command parsing, no new telemetry metric, no change to the public route tuple.

## Verification

- `bun test tests/stop-handler-unplanned-implementation.test.ts`
- `bun test`
- `bun run check:type`

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Import the existing exported `isImplementationSurfacePath` (`src/effects/review/diff-fingerprint.ts:399`) into `src/cli/hook/stop-handler.ts`. Do not write a second classifier; `plans/`, `tasks/`, `docs/`, `.ai/`, `.claude/`, `.codex/` and all Markdown are already exempt there.
- [ ] In `runStopHandler`, reuse the `activePlan` already resolved at `:668` and the `changedSet` already computed at `:675`. When `activePlan` is null, collect `changedSet.paths.filter(isImplementationSurfacePath)`.
- [ ] Emit one line into the existing `stderr` accumulator naming the count and the first few paths, plus the `capture-plan` remedy. Never touch `exitCode` or the `decision: block` stdout path.
- [ ] Append one JSONL record to `.ai/harness/runs/unplanned-implementation.jsonl` (ignored runtime evidence, same tree as `hook-events.jsonl`) carrying timestamp, path count, and paths. Reuse `appendFileSync`; introduce no new typed contract and no new telemetry metric, so the `child_processes` completeness problem in `tasks/todos.md` is not repeated.
- [ ] Failure of the evidence append must not affect the Stop result: wrap it the way the sibling side effects at `:692` and `:697` are wrapped.
- [ ] Add `tests/stop-handler-unplanned-implementation.test.ts`: fires with implementation paths and no active plan; silent when an active plan exists; silent when the changed set is workflow-surface only; exit code stays 0 in every case.
