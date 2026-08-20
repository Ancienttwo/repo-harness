# Plan: Fail-closed CodeGraph init when enabled

> **Status**: Archived
> **Created**: 20260820-1255
> **Slug**: fail-closed-codegraph-init
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Applied enabled init must prove repository index readiness
> **Rollback Surface**: Init orchestration and CodeGraph readiness result handling
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-1255-fail-closed-codegraph-init.contract.md`
> **Task Review**: `tasks/reviews/20260820-1255-fail-closed-codegraph-init.review.md`
> **Implementation Notes**: `tasks/notes/20260820-1255-fail-closed-codegraph-init.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260820-1255-fail-closed-codegraph-init.md`
- Sprint contract: `tasks/contracts/20260820-1255-fail-closed-codegraph-init.contract.md`
- Sprint review: `tasks/reviews/20260820-1255-fail-closed-codegraph-init.review.md`
- Implementation notes: `tasks/notes/20260820-1255-fail-closed-codegraph-init.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-1255-fail-closed-codegraph-init.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-1255-fail-closed-codegraph-init.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-1255-fail-closed-codegraph-init.md`.

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
- Contract file: `tasks/contracts/20260820-1255-fail-closed-codegraph-init.contract.md`
- Review file: `tasks/reviews/20260820-1255-fail-closed-codegraph-init.review.md`
- Implementation notes file: `tasks/notes/20260820-1255-fail-closed-codegraph-init.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-1255-fail-closed-codegraph-init.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-1255-fail-closed-codegraph-init.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Init orchestration and CodeGraph readiness result handling
- **Verification boundary**: Applied enabled init must prove repository index readiness
- **Review/acceptance boundary**: `tasks/reviews/20260820-1255-fail-closed-codegraph-init.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-1255-fail-closed-codegraph-init.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-1255-fail-closed-codegraph-init.contract.md`, `tasks/reviews/20260820-1255-fail-closed-codegraph-init.review.md`, and `tasks/notes/20260820-1255-fail-closed-codegraph-init.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-1255-fail-closed-codegraph-init.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Init orchestration and CodeGraph readiness result handling

## Captured Planning Output

## Goal

When an applied `repo-harness init` has CodeGraph enabled, report success only if the repository-local index reaches `up-to-date`. A missing CLI, failed initialization/sync, or any non-ready index status must make init fail closed with an actionable diagnostic. Profiles with CodeGraph disabled and `--dry-run` semantics remain unchanged.

Because this work-package touches the CLI command surface, also close the now-triggered Action/help-budget deferred goal before the single final acceptance: group every real `run` helper on the default help surface and pin both the full helper count and rendered line budget without hiding long-tail helpers.

## Architecture / Data Flow

- Entry: `src/cli/commands/init.ts` resolves the install profile and calls `ensureCodegraph()` during applied init.
- Authority: `src/cli/tools/codegraph.ts` owns CodeGraph command execution and typed status projection.
- Output: `runInit()` returns steps and the CLI process derives its exit behavior from thrown/failed initialization.
- Verification: `tests/cli/init.test.ts` exercises applied enabled/disabled paths; `tests/install-profiles.test.ts` guards opt-in profile selection.

## Design Decision

Treat CodeGraph enablement as an explicit operator contract. Once enabled, an unusable index is not a warning or skipped optional enhancement. Keep one status authority in `ensureCodegraph()` and reject its non-`up-to-date` result at the init orchestration boundary; do not add fallback indexing, silently disable CodeGraph, or reinterpret status text in `init.ts`.

## Task Breakdown

- [x] Add red tests for enabled applied init when CodeGraph is missing or returns a non-ready index.
- [x] Make enabled applied init fail closed with an actionable error unless the typed index status is `up-to-date`.
- [x] Preserve disabled-profile and dry-run behavior.
- [x] Remove the fulfilled deferred-goal row from `tasks/todos.md` and synchronize workflow artifacts.
- [x] Add a complete, non-overlapping curated group projection for every `repo-harness run` helper.
- [x] Add tests that cap both the real helper count and rendered `run --help` line count, then remove the fulfilled Action/help-budget Todo row.

## File Changes

- `src/cli/commands/init.ts`
- `src/cli/tools/codegraph.ts` only if the existing typed result cannot express readiness without parsing in the caller
- `tests/cli/init.test.ts`
- `src/cli/commands/run.ts`
- `tests/cli/run.test.ts`
- `tasks/todos.md`
- work-package plan, contract, review, and notes artifacts

## Verification

- `bun test tests/cli/init.test.ts tests/install-profiles.test.ts tests/cli/run.test.ts`
- `bun run check:type`
- `bun src/cli/index.ts init --repo . --dry-run`
- `bash scripts/check-task-sync.sh`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/check-architecture-sync.sh`

## Non-goals

- Making CodeGraph mandatory for profiles that currently disable it.
- Installing a fallback global CodeGraph runtime.
- Changing MCP registration policy or the explicit opt-in contract.
- Accepting multiple semantic status shapes.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add red tests for enabled applied init when CodeGraph is missing or returns a non-ready index.
- [x] Make enabled applied init fail closed with an actionable error unless the typed index status is `up-to-date`.
- [x] Preserve disabled-profile and dry-run behavior.
- [x] Remove the fulfilled deferred-goal row from `tasks/todos.md` and synchronize workflow artifacts.
- [x] Add a complete, non-overlapping curated group projection for every `repo-harness run` helper.
- [x] Add tests that cap both the real helper count and rendered `run --help` line count, then remove the fulfilled Action/help-budget Todo row.
