# Plan: Retain failing verifier command output beyond the round

> **Status**: Executing
> **Created**: 20260807-0014
> **Slug**: verifier-failure-log-retention
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260807-0014-verifier-failure-log-retention.md`; after execution revert branch `codex/verifier-failure-log-retention` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md`
> **Task Review**: `tasks/reviews/20260807-0014-verifier-failure-log-retention.review.md`
> **Implementation Notes**: `tasks/notes/20260807-0014-verifier-failure-log-retention.notes.md`

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

- Active plan: `plans/plan-20260807-0014-verifier-failure-log-retention.md`
- Sprint contract: `tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md`
- Sprint review: `tasks/reviews/20260807-0014-verifier-failure-log-retention.review.md`
- Implementation notes: `tasks/notes/20260807-0014-verifier-failure-log-retention.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260807-0014-verifier-failure-log-retention.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260807-0014-verifier-failure-log-retention.md`.

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
- Contract file: `tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md`
- Review file: `tasks/reviews/20260807-0014-verifier-failure-log-retention.review.md`
- Implementation notes file: `tasks/notes/20260807-0014-verifier-failure-log-retention.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260807-0014-verifier-failure-log-retention.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260807-0014-verifier-failure-log-retention.md`; after execution revert branch `codex/verifier-failure-log-retention` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260807-0014-verifier-failure-log-retention.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260807-0014-verifier-failure-log-retention.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260807-0014-verifier-failure-log-retention.contract.md`, `tasks/reviews/20260807-0014-verifier-failure-log-retention.review.md`, and `tasks/notes/20260807-0014-verifier-failure-log-retention.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260807-0014-verifier-failure-log-retention.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260807-0014-verifier-failure-log-retention.md`; after execution revert branch `codex/verifier-failure-log-retention` or the explicitly reviewed diff.

## Captured Planning Output

## Problem

`scripts/verify-contract.sh` runs every tests_pass/commands_succeed criterion through `run-bounded-verifier-command.ts` with `--log`/`--result` paths under `tmp_dir="$(mktemp -d)"` (:632) which `trap rm -rf EXIT` (:633) destroys when the round ends. Run snapshots and `checks/latest.json` keep only `exit_code`. Consequence observed 2026-08-06/07: two in-round `bun test` exit=1 failures on the hook-entry-single-file-bundle shipment consumed ~25 minutes of verification machine time and produced zero attribution — the failing test cannot be named, and the in-round-slowdown flake hypothesis (in-round runs measure 698-777s vs 611s standalone; bun per-test default timeout 5000ms) cannot be confirmed or refuted.

## Decision

Caller-side retention only: when a bounded criterion run exits nonzero, `verify-contract.sh` copies that criterion's runner log into `.ai/harness/runs/` named by the run snapshot stem plus a criterion slug, before the temp dir evaporates. Successful criteria leave nothing extra. `run-bounded-verifier-command.ts` is untouched (its `--log` contract already captures output; its projection pair stays byte-identical). Both `verify-contract.sh` copies (`scripts/` and `assets/templates/helpers/`) change identically — the helper-projection drift test enforces the pairing. `.ai/harness/runs/` is already gitignored runtime evidence, matching the repo rule that runs/ holds evidence cache.

## Task Breakdown

- [x] `scripts/verify-contract.sh`: persist the failing criterion's runner log to `.ai/harness/runs/<run-snapshot-stem>-<criterion-slug>.log` on nonzero exit (both tests_pass and commands_succeed paths); no retention on success
- [x] Mirror the identical change into `assets/templates/helpers/verify-contract.sh` (byte-identical pair)
- [x] Regression test `tests/unit/verifier-failure-log-retention.test.ts`: fixture contract with one failing command → asserts the retained log exists and contains the command's output; passing fixture → asserts no log retained; red-green run recorded
- [x] Verification: `bun run check:type`; `bun test tests/unit/verifier-failure-log-retention.test.ts tests/unit/helper-projection-drift.test.ts`; `bash scripts/check-task-sync.sh`

## Verification

`bun run check:type`; `bun test tests/unit/verifier-failure-log-retention.test.ts tests/unit/helper-projection-drift.test.ts`; `cmp scripts/verify-contract.sh assets/templates/helpers/verify-contract.sh`; `bash scripts/check-task-sync.sh`. Full suite intentionally excluded (gate-machinery slice; the full suite runs in the resumed bundle verification, which this slice exists to make attributable).

## Rollback

Revert the single commit; logs stop being retained, no other behavior involved.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] `scripts/verify-contract.sh`: persist the failing criterion's runner log to `.ai/harness/runs/<run-snapshot-stem>-<criterion-slug>.log` on nonzero exit (both tests_pass and commands_succeed paths); no retention on success
- [x] Mirror the identical change into `assets/templates/helpers/verify-contract.sh` (byte-identical pair)
- [x] Regression test `tests/unit/verifier-failure-log-retention.test.ts`: fixture contract with one failing command → asserts the retained log exists and contains the command's output; passing fixture → asserts no log retained; red-green run recorded
- [x] Verification: `bun run check:type`; `bun test tests/unit/verifier-failure-log-retention.test.ts tests/unit/helper-projection-drift.test.ts`; `bash scripts/check-task-sync.sh`
