# Plan: Fix initCommandEnv dropping process.env on the npx-cache path

> **Status**: Executing
> **Created**: 20260808-0054
> **Slug**: init-command-env-basedrop
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: test-home-isolation-open-question
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: regression guard RED-to-GREEN plus full bun test
> **Rollback Surface**: single commit; revert restores prior behavior
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260808-0054-init-command-env-basedrop.contract.md`
> **Task Review**: `tasks/reviews/20260808-0054-init-command-env-basedrop.review.md`
> **Implementation Notes**: `tasks/notes/20260808-0054-init-command-env-basedrop.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: test-home-isolation-open-question
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260808-0054-init-command-env-basedrop.md`
- Sprint contract: `tasks/contracts/20260808-0054-init-command-env-basedrop.contract.md`
- Sprint review: `tasks/reviews/20260808-0054-init-command-env-basedrop.review.md`
- Implementation notes: `tasks/notes/20260808-0054-init-command-env-basedrop.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260808-0054-init-command-env-basedrop.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260808-0054-init-command-env-basedrop.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260808-0054-init-command-env-basedrop.md`.

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
- Contract file: `tasks/contracts/20260808-0054-init-command-env-basedrop.contract.md`
- Review file: `tasks/reviews/20260808-0054-init-command-env-basedrop.review.md`
- Implementation notes file: `tasks/notes/20260808-0054-init-command-env-basedrop.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260808-0054-init-command-env-basedrop.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260808-0054-init-command-env-basedrop.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: single commit; revert restores prior behavior
- **Verification boundary**: regression guard RED-to-GREEN plus full bun test
- **Review/acceptance boundary**: `tasks/reviews/20260808-0054-init-command-env-basedrop.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260808-0054-init-command-env-basedrop.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260808-0054-init-command-env-basedrop.contract.md`, `tasks/reviews/20260808-0054-init-command-env-basedrop.review.md`, and `tasks/notes/20260808-0054-init-command-env-basedrop.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260808-0054-init-command-env-basedrop.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: single commit; revert restores prior behavior

## Captured Planning Output

# Fix initCommandEnv dropping process.env on the npx-cache path

## Problem (production bug, found during test-home-isolation)

`src/cli/commands/init.ts:194` `initCommandEnv(sourceRoot, env?)`: for an npx-cache source when the caller passes no `env`, the function returns `{ ...(env ?? {}), AGENTIC_DEV_LINK_INSTALLED_COPIES: "0" }` — a fresh environment holding only that one key. The entire `process.env` (PATH, HOME, REPO_HARNESS_HOME, proxy settings, everything) is silently discarded for the child invocation. Observable consequences: an npx-invoked `init` runs its skill-sync child with an empty environment; any `REPO_HARNESS_HOME` override is lost, which was the one hole the test-home-isolation preload could not defend (init family kept leaking +1 registry entry per run until a test-side workaround).

## Decision

When the caller provides no `env`, base the constructed environment on `process.env` instead of `{}`: `{ ...(env ?? process.env), AGENTIC_DEV_LINK_INSTALLED_COPIES: "0" }`. Callers that do pass `env` keep exact current behavior. Class sweep: search `src/` for the same `...(env ?? {})`-style base-dropping shape and fix or report every sibling (report-only if a sibling's semantics are intentional).

## Root cause evidence plan (bugfix profile)

- Regression guard: a test asserting the npx-cache init child env retains caller/process environment (e.g. a marker variable set in `process.env` is visible in the constructed env / child behavior) — fails on the unfixed code, passes after.
- Pre-fix RED artifact captured before the fix.

## Task Breakdown

- [x] Regression guard test in `tests/cli/init.test.ts` (RED on unfixed code, artifact captured).
- [x] Fix `initCommandEnv` to base on `process.env` when caller env is absent.
- [x] Class sweep for sibling base-dropping shapes in `src/`; fix or report each.
- [x] Full `bun test`, `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run` green.

## Verification

`bun test` (full), `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run`; the regression guard is the acceptance anchor.

## Rollback

Single commit; revert restores prior (buggy) behavior; no persisted-format change.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Regression guard test in `tests/cli/init.test.ts` (RED on unfixed code, artifact captured).
- [x] Fix `initCommandEnv` to base on `process.env` when caller env is absent.
- [x] Class sweep for sibling base-dropping shapes in `src/`; fix or report each.
- [x] Full `bun test`, `bun run check:type`, `bun src/cli/index.ts init --repo . --dry-run` green.
