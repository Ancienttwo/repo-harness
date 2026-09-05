# Plan: Run context-files scan in check-ci

> **Status**: Executing
> **Created**: 20260906-0338
> **Slug**: context-files-ci-step
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: check-ci syntax, the scan itself, bootstrap tests, integrity checks
> **Rollback Surface**: Revert only codex/context-files-ci-step
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260906-0338-context-files-ci-step.contract.md`
> **Task Review**: `tasks/reviews/20260906-0338-context-files-ci-step.review.md`
> **Implementation Notes**: `tasks/notes/20260906-0338-context-files-ci-step.notes.md`

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

- Active plan: `plans/plan-20260906-0338-context-files-ci-step.md`
- Sprint contract: `tasks/contracts/20260906-0338-context-files-ci-step.contract.md`
- Sprint review: `tasks/reviews/20260906-0338-context-files-ci-step.review.md`
- Implementation notes: `tasks/notes/20260906-0338-context-files-ci-step.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260906-0338-context-files-ci-step.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260906-0338-context-files-ci-step.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260906-0338-context-files-ci-step.md`.

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
- Contract file: `tasks/contracts/20260906-0338-context-files-ci-step.contract.md`
- Review file: `tasks/reviews/20260906-0338-context-files-ci-step.review.md`
- Implementation notes file: `tasks/notes/20260906-0338-context-files-ci-step.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260906-0338-context-files-ci-step.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260906-0338-context-files-ci-step.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert only codex/context-files-ci-step
- **Verification boundary**: check-ci syntax, the scan itself, bootstrap tests, integrity checks
- **Review/acceptance boundary**: `tasks/reviews/20260906-0338-context-files-ci-step.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260906-0338-context-files-ci-step.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260906-0338-context-files-ci-step.contract.md`, `tasks/reviews/20260906-0338-context-files-ci-step.review.md`, and `tasks/notes/20260906-0338-context-files-ci-step.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260906-0338-context-files-ci-step.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert only codex/context-files-ci-step

## Captured Planning Output

## Goal
`scripts/check-context-files.sh` (prompt-injection and secret-exfiltration scan over agent context files) runs as a named `[ci] context files` step inside the workflow-checks block of `scripts/check-ci.sh`, so the security scan no longer depends on an operator remembering `check:context-files`.

## P1 Map
`scripts/check-context-files.sh` is a projected helper (listed in `assets/workflow-contract.v1.json#helpers.scripts`, asserted by `tests/bootstrap-files.test.ts:286`), exposed as `package.json#check:context-files` via `repo-harness run check-context-files`. `scripts/check-ci.sh` is the CI chain; its workflow-checks block calls sibling helpers directly with `bash scripts/<helper>.sh`. `.github/workflows` invokes `bun run check:ci`. On current `main` the scan reports `[ContextScan] SAFE` in under one second.

## P2 Trace
A context file (`CLAUDE.md`, `AGENTS.md`, nested contracts, skill docs) gains an injected instruction or a secret; today nothing in the PR path runs the scan, so it merges. After this change `check-ci.sh` fails at the named step with the scan's own output.

## P3 Decision
Add exactly one line pair (`echo "[ci] context files"` + `bash scripts/check-context-files.sh`) in the workflow-checks block of `scripts/check-ci.sh`, after `bash scripts/check-deploy-sql-order.sh` and before `bash scripts/check-architecture-sync.sh`, matching the sibling invocation style. No new script, no package.json change, no flag. Tradeoff: none material; the scan is sub-second and already a required helper.

## Scope
`scripts/check-ci.sh`; `tests/bootstrap-files.test.ts` only if it asserts the step list; this plan.

## Task Breakdown
- [x] Add the named step to scripts/check-ci.sh in the workflow-checks block.
- [x] Run the verification commands and record outcomes.

## Promotion Gate

- **Merge/PR unit**: one-line CI wiring PR.
- **Rollback surface**: revert the branch.
- **Verification boundary**: `bash -n scripts/check-ci.sh`, the scan itself, `tests/bootstrap-files.test.ts`, integrity checks.
- **Review/acceptance boundary**: gatekeeper diff review.
- **High-risk surface**: none; a false-positive scan would red CI, which is the intended behavior.
- **Why not checklist row**: no active plan owns check-ci.sh wiring; task-sync binding needs a plan artifact.

## Evidence Contract

- **State/progress path**: this plan's Task Breakdown.
- **Verification evidence**: Verification Results below.
- **Evaluator rubric**: `scripts/check-ci.sh` contains the step in the workflow-checks block; `bash scripts/check-context-files.sh` exits 0 on the branch; bootstrap tests pass.
- **Stop condition**: verification commands pass.
- **Rollback surface**: revert only this branch.

## Verification Commands

```bash
bash -n scripts/check-ci.sh
bash scripts/check-context-files.sh
bun test tests/bootstrap-files.test.ts --timeout 60000
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

## Verification Results

| Command | Outcome |
|---------|---------|
| `bash -n scripts/check-ci.sh` | pass (no syntax errors) |
| `bash scripts/check-context-files.sh` | pass — `[ContextScan] SAFE` |
| `bun test tests/bootstrap-files.test.ts --timeout 60000` | pass — 15 pass, 0 fail, 459 expect() |
| `bash scripts/check-deploy-sql-order.sh` | pass — `[deploy-sql] OK` |
| `bash scripts/check-architecture-sync.sh` | pass — blocking=0, projection state=ready |
| `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh` | pass — lite profile resolved, no stale digest |
| `bash scripts/check-task-workflow.sh --strict` | pass — `[workflow] OK` |
| `bun scripts/inspect-project-state.ts --repo . --format text` | pass — no drift signals |
| `bun src/cli/index.ts init --repo . --dry-run` | pass — 0 operations (source checkout owns its surfaces) |

`tests/bootstrap-files.test.ts` needed no change: it asserts the prepare-handoff -> resume -> check-task-workflow ordering, not an exhaustive step list, and the new step sits above that window.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add the named step to scripts/check-ci.sh in the workflow-checks block.
- [x] Run the verification commands and record outcomes.
